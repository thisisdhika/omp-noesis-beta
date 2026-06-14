import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
        "src/domains/belief/": { statements: 85, branches: 85 },
        "src/domains/learning/": { statements: 85, branches: 85 },
        "src/domains/commitment/": { statements: 80, branches: 80 },
        "src/domains/inference/": { statements: 80, branches: 80 },
        "src/domains/attention/": { statements: 80, branches: 80 },
        "src/hooks/": { statements: 70, branches: 70 },
        "src/tools/": { statements: 70, branches: 70 },
        "src/infrastructure/": { statements: 70, branches: 70 },
      },
    },
  },
});
