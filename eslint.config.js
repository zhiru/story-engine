// @ts-check
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  { ignores: ["**/node_modules/**", "**/.expo/**", "**/dist/**", "**/drizzle/**", "apps/mobile/**", "apps/api/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["packages/**/*.ts", "*.config.js"] },
  {
    files: ["*.config.js"],
    languageOptions: { globals: { require: "readonly", module: "writable", __dirname: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  }
);
