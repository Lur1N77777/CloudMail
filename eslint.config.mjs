// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".android-sdk/**",
      ".codex-build-logs/**",
      ".jdk17/**",
      ".expo/**",
      "android/**",
      "ios/**",
    ],
  },
]);
