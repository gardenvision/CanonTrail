import { rename } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

/** Test setup only: Windows may briefly deny moving a freshly written fixture
 * directory. Never retry the product operation or weaken its security oracle. */
export async function renameFixtureDirectory(source: string, target: string, options: {
  platform?: NodeJS.Platform;
  move?: typeof rename;
  pause?: (milliseconds: number) => Promise<unknown>;
} = {}): Promise<void> {
  const platform = options.platform ?? process.platform;
  const move = options.move ?? rename, pause = options.pause ?? setTimeout;
  const delays = [25, 50, 100, 200, 400];
  for (let attempt = 0; ; attempt++) {
    try { await move(source, target); return; }
    catch (error) {
      if (platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")
          || attempt >= delays.length) throw error;
      await pause(delays[attempt]!);
    }
  }
}
