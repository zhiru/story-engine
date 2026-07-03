import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    envFile: ".env",
    // Run test files serially to avoid DB deadlocks from concurrent resetDb() calls
    fileParallelism: false,
  },
});
