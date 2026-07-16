import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import config from "../../app.config";
import easJson from "../../eas.json";
import packageJson from "../../package.json";

describe("production release configuration", () => {
  it("uses the next public version and unique native build number", () => {
    expect(config.version).toBe("1.1.3");
    expect(packageJson.version).toBe(config.version);
    expect(config.android?.versionCode).toBe(17);
    expect(config.ios?.buildNumber).toBe("17");
  });

  it("builds the production Android artifact as an app bundle", () => {
    expect(easJson.build.production.android.buildType).toBe("app-bundle");
    expect(easJson.build.production.distribution).toBe("store");
    expect(easJson.build.production.env.EXPO_NO_DOTENV).toBe("1");
    expect(easJson.build.production.env.NODE_ENV).toBe("production");
  });

  it("keeps local secrets and signing material out of EAS uploads", () => {
    const easIgnore = readFileSync(resolve(".easignore"), "utf8");
    for (const pattern of [
      ".env",
      ".env.*",
      "!.env.example",
      "*.jks",
      "*.keystore",
      "credentials.json",
      "google-services.json",
    ]) {
      expect(easIgnore).toContain(pattern);
    }
  });

  it("publishes privacy and terms documents at stable public URLs", () => {
    expect(existsSync(resolve("docs/PRIVACY.md"))).toBe(true);
    expect(existsSync(resolve("docs/TERMS.md"))).toBe(true);
    expect(config.extra?.privacyPolicyUrl).toMatch(/^https:\/\//);
    expect(config.extra?.termsOfServiceUrl).toMatch(/^https:\/\//);
  });
});
