import { readFile } from "node:fs/promises";
import path from "node:path";

type PackageScripts = Record<string, string>;

const COMMAND_TAIL = String.raw`(?:\s*$|\s+(?:\.{1,2}(?:[\\/]\S*)?|--\S+|[A-Za-z]:[\\/]\S*|[\\/]\S+|"[^"]+"|'[^']+')(?:\s+.*)?$)`;
const DIRECT_COMMANDS = [
  new RegExp(String.raw`^(?:npx(?:\s+--yes)?\s+)?canontrail(?:\.cmd)?\s+finalize${COMMAND_TAIL}`, "i"),
  new RegExp(String.raw`^(?:npm|pnpm|bun)\s+run\s+canontrail\s+--\s+finalize${COMMAND_TAIL}`, "i"),
  new RegExp(String.raw`^yarn\s+(?:run\s+)?canontrail\s+finalize${COMMAND_TAIL}`, "i"),
  new RegExp(
    String.raw`^(?:node|tsx)\s+(?:"[^"]*(?:dist[\\/]cli\.js|src[\\/]cli\.ts)"|'[^']*(?:dist[\\/]cli\.js|src[\\/]cli\.ts)'|\S*(?:dist[\\/]cli\.js|src[\\/]cli\.ts))\s+finalize${COMMAND_TAIL}`,
    "i",
  ),
];

function commandSegments(value: string): string[] {
  return value
    .split(/\r?\n|&&|\|\||;/)
    .map((entry) => entry.trim().replace(/^(?:[-*]\s+|\$\s+|>\s+)/, "").replace(/^`+|`+$/g, "").trim())
    .filter(Boolean);
}

function packageScriptInvocations(value: string): string[] {
  const scripts: string[] = [];
  for (const segment of commandSegments(value)) {
    const match = /^(?:npm|pnpm|bun)\s+run\s+([A-Za-z0-9:._-]+)(?:\s|$)/i.exec(segment)
      ?? /^yarn\s+(?:run\s+)?([A-Za-z0-9:._-]+)(?:\s|$)/i.exec(segment);
    if (match?.[1]) scripts.push(match[1]);
  }
  return scripts;
}

export function invokesCanonTrailFinalize(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return commandSegments(value).some((segment) => DIRECT_COMMANDS.some((pattern) => pattern.test(segment)));
}

async function loadPackageScripts(root: string): Promise<PackageScripts> {
  try {
    const value: unknown = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    const scripts = (value as { scripts?: unknown }).scripts;
    if (typeof scripts !== "object" || scripts === null || Array.isArray(scripts)) return {};
    return Object.fromEntries(
      Object.entries(scripts).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

export async function taskCheckInvokesCanonTrailFinalize(root: string, value: unknown): Promise<boolean> {
  if (invokesCanonTrailFinalize(value)) return true;
  if (typeof value !== "string") return false;
  const scripts = await loadPackageScripts(root);
  const pending = packageScriptInvocations(value);
  const visited = new Set<string>();
  while (pending.length > 0) {
    const scriptName = pending.shift()!;
    if (visited.has(scriptName)) continue;
    visited.add(scriptName);
    const command = scripts[scriptName];
    if (!command) continue;
    if (invokesCanonTrailFinalize(command)) return true;
    pending.push(...packageScriptInvocations(command));
  }
  return false;
}
