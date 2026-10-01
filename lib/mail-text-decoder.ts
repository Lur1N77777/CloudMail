import { TextDecoder as FullTextDecoder } from "@kayahr/text-encoding";

let checkedDecoder: typeof globalThis.TextDecoder | undefined;

export function ensureMailTextDecoder(): void {
  if (checkedDecoder && checkedDecoder === globalThis.TextDecoder) return;

  try {
    const decoded = new globalThis.TextDecoder("gb18030").decode(
      new Uint8Array([0xd6, 0xd0, 0xce, 0xc4, 0x95, 0x32, 0x82, 0x36]),
    );
    if (decoded !== "中文𠀀") throw new Error("Incomplete charset support");
  } catch {
    // Expo's native decoder is UTF-8-only. PostalMime also uses the global
    // decoder, so install this once rather than swapping it during async parses.
    globalThis.TextDecoder = FullTextDecoder;
  }

  checkedDecoder = globalThis.TextDecoder;
}
