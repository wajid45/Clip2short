/** Timecode helpers shared by client and server. */

export function formatTimecode(totalSeconds: number | null | undefined, withTenths = false): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return "--:--";
  const neg = totalSeconds < 0;
  let s = Math.abs(totalSeconds);
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const whole = Math.floor(s);
  const tenths = Math.floor((s - whole) * 10);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const base = `${h > 0 ? `${h}:` : ""}${mm}:${String(whole).padStart(2, "0")}`;
  return `${neg ? "-" : ""}${base}${withTenths ? `.${tenths}` : ""}`;
}

/** Parses "1:02:03.5", "02:03", "123.4", "1h2m3s" into seconds. Returns null if invalid. */
export function parseTimecode(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const hms = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/i.exec(t);
  if (hms && (hms[1] || hms[2] || hms[3])) {
    return Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
  }
  const parts = t.replace(",", ".").split(":");
  if (parts.length > 3 || parts.some((p) => p === "" || isNaN(Number(p)))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "·";
  const r = Math.round(sec);
  if (r < 60) return `${r}s`;
  const h = Math.floor(r / 3600);
  const m = Math.floor((r % 3600) / 60);
  const s = r % 60;
  if (h > 0) return `${h}h ${m}m`;
  return s ? `${m}m ${s}s` : `${m}m`;
}
