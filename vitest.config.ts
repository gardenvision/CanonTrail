import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // CLI integration tests spawn real node/CLI processes (some via tsx). On slow
    // filesystems and cold caches the default 5s per-test timeout is too tight,
    // so the suite uses a generous ceiling instead of flaking.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
