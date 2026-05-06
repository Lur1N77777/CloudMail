const WORKER_TIMESTAMP_WITH_TZ = /(Z|[+-]\d{2}:?\d{2})$/i;
const WORKER_TIMESTAMP_LIKE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

export const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

export function parseWorkerDate(value?: string | null): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Cloudflare/D1 style timestamps are often UTC but may omit the trailing Z.
  // Treat timezone-less Worker timestamps as UTC to avoid an 8-hour Shanghai offset.
  const normalized =
    WORKER_TIMESTAMP_LIKE.test(raw) && !WORKER_TIMESTAMP_WITH_TZ.test(raw)
      ? `${raw.replace(" ", "T")}Z`
      : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatShanghaiTime(date: Date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatShanghaiShortDateTime(value?: string | null) {
  const date = parseWorkerDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatShanghaiFullDateTime(value?: string | null) {
  const date = parseWorkerDate(value);
  if (!date) return "—";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export function formatShanghaiRelativeDate(value?: string | null): string {
  if (!value) return "";
  const date = parseWorkerDate(value);
  if (!date) return String(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  }).format(date);
}
