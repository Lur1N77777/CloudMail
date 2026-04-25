import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

vi.mock("react-native", () => ({
  Linking: {
    openURL: vi.fn(),
  },
  Platform: {
    OS: "ios",
  },
}));

let buildMailDownloadPayload: typeof import("../mail-download").buildMailDownloadPayload;

beforeAll(async () => {
  ({ buildMailDownloadPayload } = await import("../mail-download"));
});

describe("buildMailDownloadPayload", () => {
  it("uses the subject as the html filename and preserves html content", () => {
    const payload = buildMailDownloadPayload({
      id: 1,
      subject: 'OpenAI / Verify: Code?',
      html: "<div><h1>Hello</h1><script>alert(1)</script></div>",
      text: "",
      raw: "",
    });

    expect(payload.filename).toBe("OpenAI Verify Code.html");
    expect(payload.extension).toBe("html");
    expect(payload.content).toContain("<h1>Hello</h1>");
    expect(payload.content).not.toContain("<script>");
  });

  it("falls back to plain text when html is missing", () => {
    const payload = buildMailDownloadPayload({
      id: 7,
      subject: "",
      html: "",
      text: "Your verification code is 123456",
      raw: "",
    });

    expect(payload.filename).toBe("mail-7.txt");
    expect(payload.extension).toBe("txt");
    expect(payload.content).toBe("Your verification code is 123456");
  });
});
