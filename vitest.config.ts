import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [["test/**/*.test.tsx", "jsdom"]],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
