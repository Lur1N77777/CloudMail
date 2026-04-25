export function normalizeMailboxPrefix(value?: string) {
  return (value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/^\.+|\.+$/g, "");
}

export function buildMailboxName(baseName: string, prefix?: string) {
  const cleanName = (baseName || "").trim();
  const cleanPrefix = normalizeMailboxPrefix(prefix);

  if (!cleanName) return "";
  return cleanPrefix ? `${cleanPrefix}.${cleanName}` : cleanName;
}
