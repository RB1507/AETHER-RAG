import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Electron main/preload are CommonJS (Node context); require() is correct
    // there and the TS web ruleset does not apply.
    "electron/**",
  ]),
  {
    rules: {
      // SSR hydration mount-guards (`setIsMounted(true)` in an empty-dep effect)
      // are the canonical Next.js pattern; this rule is a false positive for
      // them, so treat it as a hint rather than a blocking error.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
