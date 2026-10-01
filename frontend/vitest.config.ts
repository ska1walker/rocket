import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Wie Next: JSX ohne `import React` (lib/symbole.tsx, von Tests mitgeladen).
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
  },
});
