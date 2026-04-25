import { describe, it, expect } from "vitest";
import {
  formatMailDate,
  formatMailboxDisplay,
  getMailPreview,
  getMailRecipientsDisplay,
  getSenderDisplay,
  getVerificationCode,
  parseMail,
} from "../mail-parser";
import type { ParsedMail, RawMail } from "../api";

describe("getMailPreview", () => {
  it("returns full text if shorter than maxLength", () => {
    const mail: ParsedMail = {
      id: 1,
      text: "Hello world",
      raw: "",
      createdAt: "2024-01-01T00:00:00Z",
    };
    expect(getMailPreview(mail, 100)).toBe("Hello world");
  });

  it("truncates text longer than maxLength", () => {
    const longText = "A".repeat(200);
    const mail: ParsedMail = {
      id: 1,
      text: longText,
      raw: "",
      createdAt: "2024-01-01T00:00:00Z",
    };
    const preview = getMailPreview(mail, 50);
    expect(preview.length).toBeLessThanOrEqual(53); // 50 + "..."
    expect(preview.endsWith("...")).toBe(true);
  });

  it("returns empty string for mail with no text", () => {
    const mail: ParsedMail = {
      id: 1,
      text: "",
      raw: "",
      createdAt: "2024-01-01T00:00:00Z",
    };
    expect(getMailPreview(mail)).toBe("");
  });
});

describe("formatMailDate", () => {
  it("returns empty string for undefined input", () => {
    expect(formatMailDate(undefined)).toBe("");
  });

  it("returns '刚刚' for very recent dates", () => {
    const now = new Date().toISOString();
    expect(formatMailDate(now)).toBe("刚刚");
  });

  it("returns minutes ago for recent dates", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const result = formatMailDate(fiveMinAgo);
    expect(result).toMatch(/\d+ 分钟前/);
  });

  it("returns hours ago for dates within a day", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    const result = formatMailDate(threeHoursAgo);
    expect(result).toMatch(/\d+ 小时前/);
  });

  it("returns days ago for dates within a week", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    const result = formatMailDate(twoDaysAgo);
    expect(result).toMatch(/\d+ 天前/);
  });
});

describe("getSenderDisplay", () => {
  it("returns sender name if available", () => {
    const mail: ParsedMail = {
      id: 1,
      from: { name: "John Doe", address: "john@example.com" },
      raw: "",
      createdAt: "2024-01-01T00:00:00Z",
    };
    expect(getSenderDisplay(mail)).toBe("John Doe");
  });

  it("returns sender address if name not available", () => {
    const mail: ParsedMail = {
      id: 1,
      from: { address: "john@example.com" },
      raw: "",
      createdAt: "2024-01-01T00:00:00Z",
    };
    expect(getSenderDisplay(mail)).toBe("john@example.com");
  });

  it("returns '未知发件人' if no from info", () => {
    const mail: ParsedMail = {
      id: 1,
      raw: "",
      createdAt: "2024-01-01T00:00:00Z",
    };
    expect(getSenderDisplay(mail)).toBe("未知发件人");
  });
});

describe("parseMail", () => {
  it("parses sent-mail JSON payload in v2 format", async () => {
    const rawMail: RawMail = {
      id: 101,
      source: "",
      raw: JSON.stringify({
        version: "v2",
        from_name: "CloudMail",
        to_name: "Alex Chen",
        to_mail: "alex@example.com",
        subject: "验证码",
        is_html: true,
        content: "<p>Your code is <b>246810</b></p>",
      }),
      created_at: "2024-01-01T00:00:00Z",
      address: "noreply@example.com",
    };

    const parsed = await parseMail(rawMail);

    expect(parsed.subject).toBe("验证码");
    expect(parsed.from?.address).toBe("noreply@example.com");
    expect(parsed.from?.name).toBe("CloudMail");
    expect(parsed.to?.[0]?.address).toBe("alex@example.com");
    expect(parsed.to?.[0]?.name).toBe("Alex Chen");
    expect(parsed.html).toContain("246810");
    expect(parsed.text).toContain("246810");
    expect(parsed.ownerAddress).toBe("noreply@example.com");
  });

  it("uses owner address as inbox recipient display when available", async () => {
    const rawMail: RawMail = {
      id: 102,
      source: [
        'From: "John Doe" <john@example.com>',
        "To: inbound@example.com",
        "Subject: Hello",
        "Date: Mon, 1 Jan 2024 00:00:00 +0000",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "hello world",
      ].join("\r\n"),
      created_at: "2024-01-01T00:00:00Z",
      address: "alias@example.com",
    };

    const parsed = await parseMail(rawMail);

    expect(parsed.from?.address).toBe("john@example.com");
    expect(getMailRecipientsDisplay(parsed, { preferOwnerAddress: true })).toBe(
      "alias@example.com"
    );
  });

  it("extracts html/text body from multipart raw mail when mime parser fallback is needed", async () => {
    const rawMail: RawMail = {
      id: 104,
      source: "",
      raw: [
        'DKIM-Signature: v=1; a=rsa-sha256;',
        'From: "Tester" <sender@example.com>',
        "To: inbox@example.com",
        "Subject: HTML Mail",
        "MIME-Version: 1.0",
        'Content-Type: multipart/alternative; boundary="mail-boundary"',
        "",
        "--mail-boundary",
        'Content-Type: text/plain; charset="utf-8"',
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "=E5=93=88=E5=93=88=E5=93=88",
        "--mail-boundary",
        'Content-Type: text/html; charset="utf-8"',
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "<div>=E5=93=88=E5=93=88=E5=93=88</div>",
        "--mail-boundary--",
      ].join("\r\n"),
      created_at: "2024-01-01T00:00:00Z",
      address: "inbox@example.com",
    };

    const parsed = await parseMail(rawMail);

    expect(parsed.subject).toBe("HTML Mail");
    expect(parsed.from?.address).toBe("sender@example.com");
    expect(parsed.text).toContain("哈哈哈");
    expect(parsed.html).toContain("哈哈哈");
  });

  it("decodes MIME encoded-word subject lines", async () => {
    const rawMail: RawMail = {
      id: 105,
      source: [
        'From: "Tester" <sender@example.com>',
        "To: inbox@example.com",
        "Subject: =?UTF-8?B?5ZOI5ZOI5ZOI?=",
        "Date: Mon, 1 Jan 2024 00:00:00 +0000",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "hello",
      ].join("\r\n"),
      raw: "",
      created_at: "2024-01-01T00:00:00Z",
      address: "inbox@example.com",
    };

    const parsed = await parseMail(rawMail);

    expect(parsed.subject).toBe("哈哈哈");
  });
});

describe("mail display helpers", () => {
  it("formats mailbox with both name and address", () => {
    expect(
      formatMailboxDisplay({
        name: "Alex Chen",
        address: "alex@example.com",
      })
    ).toBe("Alex Chen <alex@example.com>");
  });

  it("prefers metadata ai_extract verification code before regex fallback", () => {
    const mail: ParsedMail = {
      id: 103,
      subject: "欢迎登录",
      text: "正文里没有明显验证码",
      raw: "",
      createdAt: "2024-01-01T00:00:00Z",
      metadata: JSON.stringify({
        ai_extract: {
          type: "auth_code",
          result: "913245",
        },
      }),
    };

    expect(getVerificationCode(mail)).toBe("913245");
  });
});
