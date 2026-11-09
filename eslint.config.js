import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // The game changes only through dispatch(move) (#409); applyMutation is a test seam.
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts", "src/**/*.harness.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          property: "applyMutation",
          message: "Change the game with dispatch(move) (#409).",
        },
      ],
    },
  },
  prettier,
);
