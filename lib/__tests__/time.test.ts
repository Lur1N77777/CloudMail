import { describe, expect, it } from "vitest";

import {
  formatShanghaiFullDateTime,
  formatShanghaiShortDateTime,
  parseWorkerDate,
} from "../time";

describe("worker time formatting", () => {
  it("treats timezone-less Worker timestamps as UTC", () => {
    expect(formatShanghaiFullDateTime("2026-05-06T15:41:00")).toBe(
      "2026-05-06 23:41:00"
    );
    expect(formatShanghaiShortDateTime("2026-05-06 15:41:00")).toContain("23:41");
  });

  it("keeps explicit timezone timestamps accurate", () => {
    expect(formatShanghaiFullDateTime("2026-05-06T15:41:00Z")).toBe(
      "2026-05-06 23:41:00"
    );
    expect(parseWorkerDate("bad-value")).toBeNull();
  });
});
