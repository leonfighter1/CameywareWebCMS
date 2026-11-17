import { defineConfig } from "vitest/config";

export default defineConfig({
  // A fresh database seeded in beforeEach takes longer while every file runs at once.
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000 },
  resolve: { tsconfigPaths: true },
});
