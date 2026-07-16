import { describe, expect, it } from "vitest";

import { describeConnectionError } from "../connection-diagnostics";

function apiError(status: number, path: string, message = `HTTP ${status}`) {
  return Object.assign(new Error(message), { status, path });
}

describe("connection diagnostics", () => {
  it("identifies a site-password rejection while loading public settings", () => {
    expect(
      describeConnectionError(apiError(401, "/open_api/settings"), "settings")
    ).toMatchObject({ code: "site_password_rejected", title: "站点密码未通过" });
  });

  it("identifies an administrator-password rejection after settings succeed", () => {
    expect(
      describeConnectionError(apiError(401, "/admin/statistics"), "admin")
    ).toMatchObject({ code: "admin_password_rejected", title: "管理员密码未通过" });
  });

  it("reports unsupported backend routes separately from bad credentials", () => {
    expect(
      describeConnectionError(apiError(404, "/open_api/admin_login"), "admin")
    ).toMatchObject({ code: "unsupported_backend" });
  });

  it("classifies timeouts, upstream failures, and unreachable Workers", () => {
    expect(
      describeConnectionError(new Error("网络请求超时，请检查 Worker 地址"), "settings").code
    ).toBe("network_timeout");
    expect(describeConnectionError(apiError(503, "/open_api/settings"), "settings").code).toBe(
      "worker_error"
    );
    expect(describeConnectionError(new Error("Network request failed"), "settings").code).toBe(
      "network_unreachable"
    );
  });
});
