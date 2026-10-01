import { TextDecoder as ExpoTextDecoder } from "expo/src/winter/TextDecoder";
import PostalMime from "postal-mime";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getMailBodyText, parseMail, parseMailBatch } from "../mail-parser";
import type { RawMail } from "../api";

const nativeTextDecoder = globalThis.TextDecoder;
const encodings = [
  { charset: "UTF-8", hex: "e4b8ade69687f09f9880", text: "中文😀" },
  { charset: "GBK", hex: "d6d0cec4", text: "中文" },
  { charset: "gb2312", hex: "d6d0cec4", text: "中文" },
  { charset: "GB18030", hex: "d6d0cec495328236", text: "中文𠀀" },
  { charset: "Big5", hex: "a4a4a4e5", text: "中文" },
];

function makeMail(
  fixture: (typeof encodings)[number],
  transferEncoding: "base64" | "quoted-printable",
): RawMail {
  const bytes = Buffer.from(fixture.hex, "hex");
  const encode = (content: Buffer) =>
    transferEncoding === "base64"
      ? content.toString("base64")
      : Array.from(
          content,
          (byte) => `=${byte.toString(16).padStart(2, "0")}`,
        ).join("");

  return {
    id: 17,
    source: "",
    created_at: "2026-09-09T00:00:00Z",
    raw: [
      `From: =?${fixture.charset}?B?${bytes.toString("base64")}?= <sender@example.com>`,
      "To: inbox@example.com",
      `Subject: =?${fixture.charset}?B?${bytes.toString("base64")}?=`,
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="outer"',
      "",
      "--outer",
      'Content-Type: multipart/alternative; boundary="body"',
      "",
      "--body",
      `Content-Type: text/plain; charset="${fixture.charset}"`,
      `Content-Transfer-Encoding: ${transferEncoding}`,
      "",
      encode(bytes),
      "--body",
      `Content-Type: text/html; charset="${fixture.charset}"`,
      `Content-Transfer-Encoding: ${transferEncoding}`,
      "",
      encode(Buffer.concat([Buffer.from("<p>"), bytes, Buffer.from("</p>")])),
      "--body--",
      "--outer",
      "Content-Type: application/octet-stream",
      `Content-Disposition: attachment; filename="=?${fixture.charset}?B?${bytes.toString("base64")}?=.bin"`,
      "Content-Transfer-Encoding: base64",
      "",
      "AAH+/w==",
      "--outer--",
    ].join("\r\n"),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each([
  { runtime: "Node/browser", decoder: nativeTextDecoder },
  { runtime: "Expo UTF-8-only", decoder: ExpoTextDecoder },
])("mail character encodings on $runtime", ({ decoder }) => {
  it.each(encodings)(
    "decodes $charset in both body views and headers",
    async (fixture) => {
      vi.stubGlobal("TextDecoder", decoder);

      for (const transferEncoding of ["base64", "quoted-printable"] as const) {
        const parsed = await parseMail(makeMail(fixture, transferEncoding));

        expect(parsed.subject).toBe(fixture.text);
        expect(parsed.from?.name).toBe(fixture.text);
        expect(getMailBodyText(parsed)).toBe(fixture.text);
        expect(parsed.html?.trim()).toBe(`<p>${fixture.text}</p>`);
      expect(parsed.attachments).toHaveLength(1);
      expect(parsed.attachments![0].filename).toBe(`${fixture.text}.bin`);
        expect(new Uint8Array(parsed.attachments![0].content!)).toEqual(
          new Uint8Array([0, 1, 254, 255]),
        );
      }
    },
  );

  it.each(encodings)(
    "decodes $charset when PostalMime fails",
    async (fixture) => {
      vi.stubGlobal("TextDecoder", decoder);
      vi.spyOn(PostalMime.prototype, "parse").mockRejectedValue(
        new Error("MIME parser unavailable"),
      );

      for (const transferEncoding of ["base64", "quoted-printable"] as const) {
        const parsed = await parseMail(makeMail(fixture, transferEncoding));

        expect(parsed.subject).toBe(fixture.text);
        expect(parsed.from?.name).toBe(fixture.text);
        expect(getMailBodyText(parsed)).toBe(fixture.text);
        expect(parsed.html).toBe(`<p>${fixture.text}</p>`);
      }
    },
  );
});

it("retains the native decoder when it already supports legacy charsets", async () => {
  await parseMail(makeMail(encodings[1], "base64"));
  expect(globalThis.TextDecoder).toBe(nativeTextDecoder);
});

it("decodes mixed charsets concurrently on Expo", async () => {
  vi.stubGlobal("TextDecoder", ExpoTextDecoder);
  const parsed = await parseMailBatch(
    encodings.map((fixture) => makeMail(fixture, "base64")),
  );
  expect(parsed.map(getMailBodyText)).toEqual(
    encodings.map((fixture) => fixture.text),
  );
});

it("keeps PostalMime's unknown charset fallback usable on Expo", async () => {
  vi.stubGlobal("TextDecoder", ExpoTextDecoder);
  const parsed = await parseMail(
    makeMail(
      { charset: "unknown-charset", hex: "636166e9", text: "café" },
      "base64",
    ),
  );
  expect(parsed.subject).toBe("café");
  expect(getMailBodyText(parsed)).toBe("café");
});
