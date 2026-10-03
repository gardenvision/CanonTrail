import { expect, it } from "vitest";
import { renameFixtureDirectory } from "./fixture-rename.js";

it("retries only the identical Windows fixture setup after a temporary access error", async () => {
  const calls: string[][] = [], delays: number[] = [];
  await renameFixtureDirectory("synthetic-source", "synthetic-target", {
    platform: "win32",
    move: async (source, target) => {
      calls.push([String(source), String(target)]);
      if (calls.length === 1) throw Object.assign(new Error("fixture busy"), { code: "EPERM" });
    },
    pause: async delay => { delays.push(delay); },
  });
  expect(calls).toEqual([["synthetic-source", "synthetic-target"], ["synthetic-source", "synthetic-target"]]);
  expect(delays).toEqual([25]);
});

it("fails with the original persistent error after a bounded fixture-only retry", async () => {
  const error = Object.assign(new Error("persistent fixture access denial"), { code: "EPERM" });
  let calls = 0; const delays: number[] = [];
  await expect(renameFixtureDirectory("synthetic-source", "synthetic-target", {
    platform: "win32", move: async () => { calls++; throw error; },
    pause: async delay => { delays.push(delay); },
  })).rejects.toBe(error);
  expect(calls).toBe(6); expect(delays).toEqual([25, 50, 100, 200, 400]);
});

it.each([["linux", "EPERM"], ["win32", "EXDEV"]] as const)("does not retry %s / %s fixture errors", async (platform, code) => {
  const error = Object.assign(new Error("not a transient Windows fixture error"), { code });
  let calls = 0, pauses = 0;
  await expect(renameFixtureDirectory("synthetic-source", "synthetic-target", {
    platform, move: async () => { calls++; throw error; }, pause: async () => { pauses++; },
  })).rejects.toBe(error);
  expect(calls).toBe(1); expect(pauses).toBe(0);
});
