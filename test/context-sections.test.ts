import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { compileContext, applyContextPreview, computeContextLockHash, serializeContextLock, type ContextLock } from "../src/context.js";
import { parseContextSections, selectContextSection, validateLockedSection } from "../src/context-sections.js";
import { generateContextIndex, sha256 } from "../src/indexer.js";
import { validateRepository, validateResumePacketAt } from "../src/validator.js";
import { inspectTaskContext } from "../src/context-inspection.js";
import { createHandoff } from "../src/handoff.js";
import { createResumePacket } from "../src/resume.js";

const roots: string[] = [], taskId = "T-SECTIONS", createdAt = "2026-09-07T20:00:00Z";
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5 }); });
function md(topic: string, body: string, routes: string[] = []) {
  return `---\n${stringify({topic_id:topic,stand:"2026-09-07",status:"current",truth_level:"canonical",verification:{state:"reviewed",evidence:[]},read_if_task_touches:routes,primary_systems:[],safe_to_edit:["Fixture only"],do_not_use_instead:[]})}---\n\n${body}\n`;
}
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "ct-sections-")); roots.push(root);
  await cp(path.resolve("schemas"), path.join(root,"schemas"), {recursive:true});
  const dir = path.join(root,".agent-context/tasks",taskId); await mkdir(dir,{recursive:true}); await mkdir(path.join(root,"src")); await mkdir(path.join(root,"docs"));
  await writeFile(path.join(root,".agent-context/config.yaml"),stringify({version:1,index_path:".agent-context/context-index.json",schema_path:"schemas",governed_paths:["."],exclude_paths:[".git"],require_frontmatter_for_all_markdown:true,require_topic_id_for_canonical:true,allow_missing_references:[]}));
  await writeFile(path.join(root,"AGENTS.md"),md("rules","# Governing rules"));
  const bytes = Buffer.from("large preamble " + "x".repeat(9000) + "\r\nexport const useful = '🌱';\r\nlast line\n");
  await writeFile(path.join(root,"src/large.ts"),bytes);
  const state = {task_id:taskId,status:"in-progress",objective:"Inspect a bounded parser",acceptance_criteria:[{id:"AC",statement:"Exact bytes",verification:"fixture",status:"pending"}],dependencies:[],file_intents:["src/large.ts"],required_context_sources:[] as string[],context_sections:[{path:"src/large.ts",from:2,to:2,content_hash:sha256(bytes)}],checks:[]};
  const statePath=path.join(dir,"state.yaml"), output=path.join(dir,"context.lock.json");
  const save=async()=>{await writeFile(statePath,stringify(state));await generateContextIndex(root);};await save();
  return {root,dir,bytes,state,statePath,output,save};
}
const compile=(root:string, extra={})=>compileContext({root,taskId,createdAt,totalTokens:20000,reservedOutputTokens:0,inputSafetyTokens:0,...extra});
async function writeLock(file:string,lock:ContextLock) {const {lock_hash:_,...payload}=lock;lock.lock_hash=computeContextLockHash(payload);await writeFile(file,serializeContextLock(lock));}

describe("exact context sections",()=>{
  it.each(["a\nb\nc\n","a\r\nb\r\nc\r\n","a\rb\rc\r","a\nb\nc","\ufeffa\n🌱\nb\n"])("preserves bytes and line boundaries for %j",text=>{
    const bytes=Buffer.from(text);const lines=text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)!.filter(Boolean);
    expect(selectContextSection(bytes,2,2)).toEqual(Buffer.from(lines[1]!));
    expect(selectContextSection(bytes,1,lines.length)).toEqual(bytes);
    expect(()=>selectContextSection(bytes,1,lines.length+1)).toThrow(/exceeds/);
  });
  it.each([Buffer.from([0xff]),Buffer.from("a\0b"),Buffer.alloc(8*1024*1024+1)])("rejects invalid/oversized text %#",bytes=>{expect(()=>selectContextSection(bytes,1,1)).toThrow();});
  it.each([[0,1],[2,1],[1.5,2],[1,NaN],[1,Infinity]])("rejects invalid bounds %s %s",(from,to)=>{expect(()=>selectContextSection(Buffer.from("a\nb"),from!,to!)).toThrow();});
  it.each([null,{},[{path:"../outside.ts",from:1,to:1,content_hash:"sha256:"+"a".repeat(64)}],[{path:"src/a.ts",from:2,to:1,content_hash:"sha256:"+"a".repeat(64)}],[{path:"a.ts",from:1,to:1,content_hash:"bad"}]])("rejects malformed persistent input %#",value=>{expect(()=>parseContextSections(value)).toThrow();});
  it("counts selected bytes only, applies previews and validates actual partial locks",async()=>{
    const f=await fixture(), partial=await compile(f.root);const source=partial.lock.sources.find(s=>s.path==="src/large.ts")!;
    expect(source.line_ranges).toEqual([[2,2]]);expect(source.content_hash).toBe(sha256(f.bytes));
    const expected=Buffer.from("export const useful = '🌱';\r\n");expect(source.selection_hash).toBe(sha256(expected));expect(source.estimated_tokens).toBe(Math.ceil(expected.length/4));
    const preview=path.join(f.root,"preview.json");await writeFile(preview,JSON.stringify(partial));await applyContextPreview({root:f.root,previewPath:preview});
    expect((await validateRepository(f.root)).diagnostics.filter(d=>d.severity==="error")).toEqual([]);
    expect((await inspectTaskContext({root:f.root,taskId})).sources.find(s=>s.path==="src/large.ts")?.detail).toContain("2..2");
    f.state.context_sections=[];await f.save();const whole=await compile(f.root);expect(whole.lock.budget.estimated_input_tokens-partial.lock.budget.estimated_input_tokens).toBeGreaterThan(2000);
  });
  it("fails below the exact required section budget without dropping a mandatory section",async()=>{
    const f=await fixture(), r=await compile(f.root);const total=r.lock.budget.estimated_input_tokens;
    expect((await compile(f.root,{totalTokens:total})).lock.budget.estimated_input_tokens).toBe(total);
    await expect(compile(f.root,{totalTokens:total-1})).rejects.toThrow(/required context/);
  });
  it.each(["explicit","persistent","instructions","canonical","control"])("cannot narrow %s whole inputs",async kind=>{
    const f=await fixture();let extra={};
    if(kind==="explicit")extra={includePaths:["src/large.ts"]};
    if(kind==="persistent")f.state.required_context_sources=["src/large.ts"];
    if(kind==="instructions")f.state.context_sections[0]!.path="AGENTS.md";
    if(kind==="control")f.state.context_sections[0]!.path=`.agent-context/tasks/${taskId}/state.yaml`;
    if(kind==="canonical"){await writeFile(path.join(f.root,"docs/parser.md"),md("parser","# Parser",["bounded parser"]));f.state.context_sections[0]!.path="docs/parser.md";}
    await f.save();await expect(compile(f.root,extra)).rejects.toThrow(/Cannot narrow|cannot be sectioned/);
  });
  it("rejects drift outside the section both during compile and saved preview apply",async()=>{
    const f=await fixture(), r=await compile(f.root), preview=path.join(f.root,"preview.json");await writeFile(preview,JSON.stringify(r));
    await writeFile(path.join(f.root,"src/large.ts"),Buffer.concat([f.bytes,Buffer.from("changed outside\n")]));
    await expect(compile(f.root)).rejects.toThrow(/section source changed/);await expect(applyContextPreview({root:f.root,previewPath:preview})).rejects.toThrow(/source changed/);
  });
  it.each(["selection-hash","tokens","range","unrequested","stripped"])("rejects consistently self-rehashed %s tampering",async kind=>{
    const f=await fixture(), r=await compile(f.root,{apply:true}), source=r.lock.sources.find(s=>s.line_ranges)!;
    if(kind==="selection-hash")source.selection_hash="sha256:"+"0".repeat(64);
    if(kind==="tokens")source.estimated_tokens++;
    if(kind==="range")source.line_ranges=[[2,99999]];
    if(kind==="stripped"){delete source.line_ranges;delete source.selection_hash;}
    if(kind==="unrequested"){f.state.context_sections=[];await f.save();const stateSource=r.lock.sources.find(s=>s.path.endsWith("state.yaml"))!;stateSource.content_hash=sha256(await readFile(f.statePath));}
    await writeLock(f.output,r.lock);const errors=(await validateRepository(f.root)).diagnostics.filter(d=>d.severity==="error");expect(errors.some(d=>d.code==="LOCK009"||d.code==="LOCK008")).toBe(true);
  });
  it("does not rewrite or re-read historical partial lock sources after closure",async()=>{
    const f=await fixture();f.state.status="superseded";await f.save();await compile(f.root,{apply:true});const before=await readFile(f.output);
    await writeFile(path.join(f.root,"src/large.ts"),"new source\n");expect((await validateRepository(f.root)).diagnostics.filter(d=>d.severity==="error")).toEqual([]);expect(await readFile(f.output)).toEqual(before);
  });
  it.each(["context-lock","task-state"])("refuses old %s schema on apply without changing it",async name=>{
    const f=await fixture(), schemaPath=path.join(f.root,"schemas",name+".schema.json"), schema=JSON.parse(await readFile(schemaPath,"utf8"));
    if(name==="context-lock")delete schema.properties.sources.items.properties.selection_hash;else delete schema.properties.context_sections;
    const before=JSON.stringify(schema);await writeFile(schemaPath,before);await expect(compile(f.root,{apply:true})).rejects.toThrow(/does not support context sections/);expect(await readFile(schemaPath,"utf8")).toBe(before);
  });
  it("preserves sections across a fresh handoff/resume and detects subsequent source drift",async()=>{
    const f=await fixture(), git=promisify(execFile);for(const args of [["init"],["config","user.name","Fixture"],["config","user.email","fixture@example.invalid"],["add","."],["commit","-m","fixture"]])await git("git",args,{cwd:f.root,windowsHide:true});
    await compile(f.root,{apply:true});await writeFile(path.join(f.dir,"input.yaml"),stringify({next_safe_action:"Check the exact parser section bytes before changing the parser implementation.",uncommitted_summary:"Fixture task artifacts only."}));
    const handoff=await createHandoff({root:f.root,taskId,sourceSessionId:"source",inputPath:`.agent-context/tasks/${taskId}/input.yaml`,createdAt,apply:true});
    const archivedBefore=await readFile(path.join(f.root,handoff.handoff.source_context_lock_path));await generateContextIndex(f.root);
    const resumed=await createResumePacket({root:f.root,taskId,receivingSessionId:"receiver",createdAt,totalTokens:30000,reservedOutputTokens:0,inputSafetyTokens:0,apply:true});
    expect(resumed.packet.bootstrap_instruction).toContain("line_ranges");const receiving=JSON.parse(await readFile(path.join(f.root,resumed.packet.receiving_context_lock_path),"utf8"));expect(receiving.sources.find((s:{path:string})=>s.path==="src/large.ts").line_ranges).toEqual([[2,2]]);
    expect((await validateResumePacketAt(f.root,resumed.packet_path)).diagnostics.filter(d=>d.severity==="error")).toEqual([]);
    expect(await readFile(path.join(f.root,handoff.handoff.source_context_lock_path))).toEqual(archivedBefore);
    await writeFile(path.join(f.root,"src/large.ts"),"drift\n");expect((await validateResumePacketAt(f.root,resumed.packet_path)).diagnostics.some(d=>d.code==="RESUME008")).toBe(true);
  });
  it("requires selection hash whenever ranges exist",()=>{expect(()=>validateLockedSection({line_ranges:[[1,1]],estimated_tokens:1})).toThrow();});
  it("rejects a stripped partial preview even when its remaining self-hash is consistent",async()=>{
    const f=await fixture(),r=await compile(f.root),s=r.lock.sources.find(s=>s.line_ranges)!;delete s.line_ranges;delete s.selection_hash;
    const {lock_hash:_,...payload}=r.lock;r.lock.lock_hash=computeContextLockHash(payload);
    const file=path.join(f.root,"stripped.json");await writeFile(file,JSON.stringify(r));
    await expect(applyContextPreview({root:f.root,previewPath:file})).rejects.toThrow(/does not satisfy task context/);
    await expect(readFile(f.output)).rejects.toThrow();
  });
  it("reproduces the worked example and its two separate identities",async()=>{
    const bytes=await readFile("examples/context-sections/source.txt");const example=JSON.parse(await readFile("examples/context-sections/selection.json","utf8"));
    const input=parseContextSections(example.task_state_fields.context_sections)[0]!;
    expect(input.content_hash).toBe(sha256(bytes));expect(example.lock_source_fields.content_hash).toBe(sha256(bytes));
    validateLockedSection(example.lock_source_fields,bytes);
    expect(example.lock_source_fields.estimated_tokens).toBeLessThan(example.whole_source_estimated_tokens);
  });
});
