import js from "@eslint/js";
import globals from "globals";

// ESLint's own scope analysis does not count <Tile /> as a use of Tile. These two small rules fill that gap, the same
// job as jsx-uses-vars and jsx-no-undef in eslint-plugin-react, without adding a dependency.
const componentName = (node) => {
  let n = node.name;
  while (n.type === "JSXMemberExpression") n = n.object;
  return n.type === "JSXIdentifier" && /^[A-Z]/.test(n.name) ? n.name : null;   // lower case is an HTML tag
};
const jsx = {
  rules: {
    "uses-vars": {
      meta: { type: "problem", schema: [] },
      create: (context) => ({
        JSXOpeningElement(node) {
          const name = componentName(node);
          if (name) context.sourceCode.markVariableAsUsed(name, node);
        },
      }),
    },
    "no-undef": {
      meta: { type: "problem", schema: [], messages: { undef: "'{{name}}' is not defined." } },
      create: (context) => ({
        JSXOpeningElement(node) {
          const name = componentName(node);
          if (!name) return;
          for (let s = context.sourceCode.getScope(node); s; s = s.upper) if (s.set.has(name)) return;
          context.report({ node: node.name, messageId: "undef", data: { name } });
        },
      }),
    },
  },
};

// The app declares its own status() (recovery in words), which would otherwise pass for window.status.
const browser = { ...globals.browser };
delete browser.status;

// Server side (api, lib, executions, tests) is CommonJS on Node. The files in lib/ that the page also loads set one
// browser global each, through the same wrapper as lib/score.js.
// The app in js/ is JSX that Babel standalone compiles in the browser. The files run as classic scripts in the order
// index.html lists them and share one global scope, so each file names what it takes from earlier files in a
// `/* global */` comment and what it gives to later files in an `/* exported */` comment.
export default [
  { ignores: ["node_modules/", "tmp/", "inputs/", ".vercel/"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "commonjs", globals: globals.node },
  },
  {
    files: ["js/**/*.jsx"],
    plugins: { jsx },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...browser, React: "readonly", ReactDOM: "readonly" },
    },
    rules: {
      "jsx/uses-vars": "error",
      "jsx/no-undef": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],          // `catch {}` means "carry on without it" throughout
    },
  },
];
