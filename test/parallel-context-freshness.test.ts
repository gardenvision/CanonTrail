import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stringify, parse } from 'yaml';
import { compileContext, applyContextPreview } from '../src/context.js';
import { generateContextIndex } from '../src/indexer.js';
import { validateRepository } from '../src/validator.js';
import { finalizeRepository } from '../src/finalize.js';

const roots: string[]=[];
afterEach(async()=>{for(const r of roots.splice(0)) await rm(r,{recursive:true,force:true});});
const md=(id:string,system='',truth='canonical',body='Stable fixture body.')=>`---\n${stringify({topic_id:id,stand:'2026-09-06',status:'current',truth_level:truth,verification:{state:'reviewed',evidence:[]},read_if_task_touches:[],primary_systems:system?[system]:[],safe_to_edit:['Fixture only.'],do_not_use_instead:[]})}---\n\n# ${id}\n${body}\n`;
async function put(r:string,p:string,s:string){await mkdir(path.dirname(path.join(r,p)),{recursive:true});await writeFile(path.join(r,p),s);}
const lockPath=(id:string)=>`.agent-context/tasks/${id}/context.lock.json`;
async function compile(r:string,id='A',apply=true){return compileContext({root:r,taskId:id,totalTokens:20000,reservedOutputTokens:1000,inputSafetyTokens:256,createdAt:'2026-09-06T00:00:00Z',apply});}
async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'canontrail-parallel-'));roots.push(root);
 await cp(path.resolve('schemas'),path.join(root,'schemas'),{recursive:true});
 await put(root,'.agent-context/config.yaml',stringify({version:1,index_path:'.agent-context/context-index.json',schema_path:'schemas',governed_paths:['.'],exclude_paths:['.git'],require_frontmatter_for_all_markdown:true,require_topic_id_for_canonical:true,allow_missing_references:[]}));
 await put(root,'AGENTS.md',md('instructions'));
 await put(root,'docs/furniture.md',md('furniture','FurnitureSurfacePlacement'));
 await put(root,'docs/tooling.md',md('tooling','EditorCliConnection'));
 await put(root,'docs/unrelated.md',md('unrelated','InvoiceTotalsCalculator'));
 for(const [id,system] of [['A','FurnitureSurfacePlacement'],['B','EditorCliConnection']]){
  await put(root,`.agent-context/tasks/${id}/state.yaml`,stringify({task_id:id,status:'in-progress',objective:`Inspect ${system}.`,acceptance_criteria:[{id:'AC',statement:'Preserve documented contracts.',verification:'Fixture assertion.',status:'pending'}],dependencies:[],file_intents:[],checks:[]}));
  await put(root,`.agent-context/tasks/${id}/brief.md`,md('brief-'+id,'','active-snapshot'));
 }
 await generateContextIndex(root);await compile(root,'A');await compile(root,'B');return root;
}
async function codes(r:string,extra={}){return (await validateRepository(r,extra)).diagnostics.map(d=>d.code);}
async function unchanged(r:string,before:string,id='A'){expect(await readFile(path.join(r,lockPath(id)),'utf8')).toBe(before);}

describe('parallel context freshness',()=>{
 it('lets both unchanged task locks survive a third task, including strict task validation',async()=>{
  const r=await fixture(),a=await readFile(path.join(r,lockPath('A')),'utf8'),b=await readFile(path.join(r,lockPath('B')),'utf8');
  await put(r,'docs/peer-report.md',md('peer-report','','active-snapshot'));await generateContextIndex(r);
  expect(await codes(r)).toEqual([]);expect(await codes(r,{strictContextLockTaskId:'A'})).toEqual([]);
  expect((await finalizeRepository({root:r})).ok).toBe(true);
  await unchanged(r,a);await unchanged(r,b,'B');
 });
 it.each(['edit','remove'])('allows %s of an unrelated unselected canonical document',async action=>{
  const r=await fixture();if(action==='edit')await put(r,'docs/unrelated.md',md('unrelated','InvoiceTotalsCalculator','canonical','Changed invoice body.'));else await rm(path.join(r,'docs/unrelated.md'));
  await generateContextIndex(r);expect(await codes(r)).toEqual([]);
 });
 it('rejects a new required canonical owner even when every selected hash is unchanged',async()=>{
  const r=await fixture(),before=await readFile(path.join(r,lockPath('A')),'utf8');
  await put(r,'docs/new-owner.md',md('new-owner','FurnitureSurfacePlacement'));await generateContextIndex(r);
  const result=await validateRepository(r);expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'LOCK008',path:lockPath('A'),detail:expect.stringContaining('docs/new-owner.md')}));
  expect(result.diagnostics.some(d=>d.path===lockPath('B'))).toBe(false);await unchanged(r,before);
  await compile(r,'A');expect(await codes(r)).toEqual([]);
 });
 it('detects newly relevant metadata on a previously unselected document',async()=>{
  const r=await fixture();await put(r,'docs/unrelated.md',md('unrelated','FurnitureSurfacePlacement'));await generateContextIndex(r);expect(await codes(r)).toContain('LOCK008');
 });
 it('detects a promoted formerly unrouted draft',async()=>{
  const r=await fixture();await put(r,'docs/future.md',md('future','FurnitureSurfacePlacement','draft'));await generateContextIndex(r);await compile(r);
  await put(r,'docs/future.md',md('future','FurnitureSurfacePlacement'));await generateContextIndex(r);expect(await codes(r)).toContain('LOCK008');
 });
 it.each(['design-target','draft'])('does not make a new %s a mandatory source',async truth=>{
  const r=await fixture();await put(r,'docs/future.md',md('future','FurnitureSurfacePlacement',truth));await generateContextIndex(r);expect(await codes(r)).toEqual([]);
 });
 it('does not make a weak canonical fragment mandatory',async()=>{
  const r=await fixture();await put(r,'docs/future.md',md('future','Furniture'));await generateContextIndex(r);expect(await codes(r)).toEqual([]);
 });
 it.each(['AGENTS.md','docs/furniture.md','.agent-context/tasks/A/state.yaml'])('still rejects changed selected bytes in %s',async p=>{
  const r=await fixture();await put(r,p,(await readFile(path.join(r,p),'utf8'))+'\n');await generateContextIndex(r);expect(await codes(r)).toContain('LOCK004');
 });
 it('keeps selected-source deletion strict',async()=>{
  const r=await fixture();await rm(path.join(r,'docs/furniture.md'));await generateContextIndex(r);expect(await codes(r)).toContain('LOCK003');
 });
 it('does not accept an unrefreshed current index',async()=>{
  const r=await fixture();await put(r,'docs/report.md',md('report','','active-snapshot'));expect(await codes(r)).toContain('INDEX003');
 });
 it('does not use a forged root hash as a compatibility proof, even with checkIndex disabled',async()=>{
  const r=await fixture(),p=path.join(r,'.agent-context/context-index.json'),index=JSON.parse(await readFile(p,'utf8'));
  index.root_hash='sha256:'+'0'.repeat(64);await writeFile(p,JSON.stringify(index));expect(await codes(r,{checkIndex:false})).toContain('LOCK008');
 });
 it('rejects lost governance of an automatically routed selected document',async()=>{
  const r=await fixture(),p=path.join(r,'.agent-context/config.yaml'),config=parse(await readFile(p,'utf8'));config.exclude_paths.push('docs/furniture.md');await writeFile(p,stringify(config));await generateContextIndex(r);expect(await codes(r)).toContain('LOCK008');
 });
 it('retains lock self-hash protection',async()=>{
  const r=await fixture(),p=path.join(r,lockPath('A')),lock=JSON.parse(await readFile(p,'utf8'));lock.sources[0].selection_reason='tampered';await writeFile(p,JSON.stringify(lock));await put(r,'docs/report.md',md('report','','active-snapshot'));await generateContextIndex(r);expect(await codes(r)).toContain('LOCK007');
 });
 it('keeps historical locks historical while the explicitly finalized task remains strict',async()=>{
  const r=await fixture(),p=path.join(r,'.agent-context/tasks/A/state.yaml'),state=parse(await readFile(p,'utf8'));state.status='done';state.acceptance_criteria[0].status='pass';state.checks=[{id:'CHECK',command_or_observation:'Fixture assertion',status:'pass',evidence_refs:['.agent-context/tasks/A/brief.md']}];await writeFile(p,stringify(state));await compile(r);const old=await readFile(path.join(r,lockPath('A')),'utf8');
  await put(r,'docs/new-owner.md',md('new-owner','FurnitureSurfacePlacement'));await generateContextIndex(r);
  expect(await codes(r)).toEqual([]);expect(await codes(r,{strictContextLockTaskId:'A'})).toContain('LOCK008');await unchanged(r,old);
 });
 it('keeps exact saved-preview apply strict across even unrelated index drift',async()=>{
  const r=await fixture(),preview=await compile(r,'A',false),before=await readFile(path.join(r,lockPath('A')),'utf8');await put(r,'preview.json',JSON.stringify(preview));await put(r,'docs/report.md',md('report','','active-snapshot'));await generateContextIndex(r);
  await expect(applyContextPreview({root:r,previewPath:'preview.json'})).rejects.toThrow(/stale context index/);await unchanged(r,before);
 });

 it('detects a new natural-language required routing entry',async()=>{
  const r=await fixture();await put(r,'docs/contract.md',md('contract').replace('read_if_task_touches: []','read_if_task_touches: [furniture placement]'));await generateContextIndex(r);expect(await codes(r)).toContain('LOCK008');
 });
 it('rejects a missing index rather than treating it as an unrelated change',async()=>{
  const r=await fixture();await rm(path.join(r,'.agent-context/context-index.json'));expect(await codes(r)).toContain('LOCK008');
 });
 it('rejects a missing current task state during compatibility assessment',async()=>{
  const r=await fixture();await rm(path.join(r,'.agent-context/tasks/A/state.yaml'));await put(r,'docs/report.md',md('report','','active-snapshot'));await generateContextIndex(r);expect(await codes(r)).toContain('LOCK008');
 });
 it('rejects changed selected authority even when the selected bytes stay equal',async()=>{
  const r=await fixture(),configPath=path.join(r,'.agent-context/config.yaml'),config=parse(await readFile(configPath,'utf8'));
  config.governed_paths=['.agent-context','AGENTS.md'];await writeFile(configPath,stringify(config));
  const statePath=path.join(r,'.agent-context/tasks/A/state.yaml'),state=parse(await readFile(statePath,'utf8'));state.required_context_sources=['docs/furniture.md'];await writeFile(statePath,stringify(state));await generateContextIndex(r);await compile(r);
  config.governed_paths=['.'];await writeFile(configPath,stringify(config));await generateContextIndex(r);
  const result=await validateRepository(r);expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'LOCK008',path:lockPath('A'),detail:expect.stringContaining('authority changed')}));
 });
 it('preserves the historical selector authority of unchanged cited task evidence',async()=>{
  const r=await fixture(),evidence='.agent-context/tasks/A/evidence/result.md';
  await put(r,evidence,md('evidence','','active-snapshot'));
  const p=path.join(r,'.agent-context/tasks/A/state.yaml'),state=parse(await readFile(p,'utf8'));
  state.checks=[{id:'CHECK',command_or_observation:'Inspect fixture evidence',status:'pass',evidence_refs:[evidence]}];await writeFile(p,stringify(state));
  await generateContextIndex(r);const compiled=await compile(r);expect(compiled.lock.sources.find(s=>s.path===evidence)?.truth_level).toBe('historical');
  const before=await readFile(path.join(r,lockPath('A')),'utf8');await put(r,'docs/report.md',md('report','','active-snapshot'));await generateContextIndex(r);
  expect(await codes(r)).toEqual([]);await unchanged(r,before);
 });
 it('finalizes each completed task after unrelated index changes without refreshing its peer',async()=>{
  const r=await fixture();
  for(const id of ['A','B']){
   const base='.agent-context/tasks/'+id,brief=base+'/brief.md',sp=path.join(r,base+'/state.yaml'),state=parse(await readFile(sp,'utf8'));
   state.status='verified';state.acceptance_criteria[0].status='pass';state.checks=[{id:'CHECK',command_or_observation:'Synthetic fixture verification',status:'pass',evidence_refs:[brief]}];await writeFile(sp,stringify(state));
   await put(r,brief,md('brief-'+id,'','active-snapshot').replace('status: current','status: completed'));
   await put(r,base+'/change.yaml',stringify({version:1,change_id:'CHG-'+id,revision:1,title:'Parallel completion fixture',status:'verified',risk:'low',author:'fixture',canonical_source:'AGENTS.md',decision_rationale:'Synthetic completion fixture, no production change.',documentation_structure:{decision:'no-feature-document-change',rationale:'No feature change in fixture.',feature_documents:[]},acceptance_cases:[{id:'AC',given:'Two independent fixture tasks.',expected:'Independent completion.',failure_or_uncertainty:'Gate remains explicit.',counterexample:'Shared source drift is not ignored.',oracle:'Deterministic test assertion.',status:'pass',evidence_refs:[brief]}],impacts:['requirement','data-contracts','domain-logic','tests-reference-cases','example-data','ui-api','documentation','diagrams-visuals','terminology','operations-compatibility'].map(area=>({area,decision:'not-affected',rationale:'Synthetic fixture only.',evidence_refs:[]})),verification:{checks:[{name:'Fixture check',status:'pass',evidence_refs:[brief]}],terminology_search:{status:'not-applicable',terms:[],evidence_refs:[]},visual_review:{applicable:false,status:'not-applicable',evidence_refs:[]},unverifiable_items:[]},independent_review:{status:'not-required',reviewer:null,findings:[],evidence_refs:[],waiver:null},external_evidence:[],supersedes:[],superseded_by:null,updated_at:'2026-09-06T00:00:00Z'}));
  }
  await generateContextIndex(r);await compile(r,'A');await compile(r,'B');
  const a=await readFile(path.join(r,lockPath('A')),'utf8'),b=await readFile(path.join(r,lockPath('B')),'utf8');
  await put(r,'docs/report.md',md('report','','active-snapshot'));await generateContextIndex(r);
  for(const taskId of ['A','B']){const report=await finalizeRepository({root:r,taskId,failOnWarnings:true,asOf:'2026-09-06'});expect(report,JSON.stringify(report)).toMatchObject({ok:true});}
  await unchanged(r,a);await unchanged(r,b,'B');
 });

});
