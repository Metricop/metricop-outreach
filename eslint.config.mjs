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
    // Deno Edge funkcije (proverava ih `deno check`); čista logika u _shared/logic ostaje pod lintom.
    "supabase/functions/run-cycle/**",
    "supabase/functions/gmail-oauth/**",
    "supabase/functions/_shared/*.ts",
  ]),
]);

export default eslintConfig;
