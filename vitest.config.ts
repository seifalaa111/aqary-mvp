import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // `server-only` is a build-time guard for the React Server Components
    // boundary. Under test it has nothing to guard, so it is stubbed out.
    alias: [{ find: /^server-only$/, replacement: fileURLToPath(new URL("./tests/server-only-shim.ts", import.meta.url)) }],
    conditions: ["react-server", "node", "import", "default"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    // Integration tests hit the real database and must not run in parallel.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    setupFiles: ["tests/setup.ts"],
  },
});
