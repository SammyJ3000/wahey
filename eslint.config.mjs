import js from "@eslint/js";
import globals from "globals";

// Lints the server side (api, lib, executions, tests). index.html is not linted: its React code is
// compiled in the browser by Babel standalone, so there is no source file for ESLint to read.
export default [
  { ignores: ["node_modules/", "tmp/", "inputs/", ".vercel/"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "commonjs", globals: globals.node },
  },
];
