import { describe, expect, it } from "vitest";

import config from "../../app.config";
import packageJson from "../../package.json";

const blockedPermissions = new Set(config.android?.blockedPermissions || []);
const plugins = (config.plugins || []).map((plugin) =>
  Array.isArray(plugin) ? plugin[0] : plugin,
);

describe("Android production security configuration", () => {
  it("disables application data backup for locally managed mailbox credentials", () => {
    expect(config.android?.allowBackup).toBe(false);
  });

  it("blocks permissions that are not used by CloudMail workflows", () => {
    for (const permission of [
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.WAKE_LOCK",
      "com.google.android.c2dm.permission.RECEIVE",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
    ]) {
      expect(blockedPermissions.has(permission), permission).toBe(true);
    }
  });

  it("does not ship unused audio or video native modules", () => {
    expect(plugins).not.toContain("expo-audio");
    expect(plugins).not.toContain("expo-video");
    expect(packageJson.dependencies).not.toHaveProperty("expo-audio");
    expect(packageJson.dependencies).not.toHaveProperty("expo-video");
  });

  it("does not ship an unused notification runtime or request notification access", () => {
    expect(plugins).not.toContain("expo-notifications");
    expect(packageJson.dependencies).not.toHaveProperty("expo-notifications");
    expect(config.android?.permissions || []).not.toContain(
      "POST_NOTIFICATIONS",
    );
  });
});
