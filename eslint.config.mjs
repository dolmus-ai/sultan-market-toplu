import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Bakkal defteri Next 15 döneminde yazıldı; veri yükleme efektleri bu
  // kuralın yeni katı sürümüne takılıyor. Davranışı doğru, birleştirmede
  // koda dokunulmadı — kural yalnızca defter dosyaları için kapalı.
  {
    files: ["src/app/(defter)/**", "src/defter/**"],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
