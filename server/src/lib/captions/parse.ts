/** Caption format parsers. Every parser returns sorted, cleaned segments in seconds. */

export interface Segment {
  start: number;
  end: number;
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z#0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function clean(text: string): string {
  return decodeEntities(text.replace(/<[^>]+>/g, ""))
    .replace(/\[(?:music|applause|laughter|♪+)\]/gi, (m) => m) // keep sound cues, they help the model
    .replace(/\s+/g, " ")
    .trim();
}

export function normalize(segments: Segment[]): Segment[] {
  const out = segments
    .map((s) => ({ start: Math.max(0, s.start), end: Math.max(s.start, s.end), text: clean(s.text) }))
    .filter((s) => s.text.length > 0 && Number.isFinite(s.start))
    .sort((a, b) => a.start - b.start);
  // Remove exact duplicates that rolling auto-captions produce.
  const dedup: Segment[] = [];
  for (const s of out) {
    const prev = dedup[dedup.length - 1];
    if (prev && prev.text === s.text && Math.abs(prev.start - s.start) < 0.05) continue;
    dedup.push(s);
  }
  // Clamp overlaps so every segment ends before the next starts.
  for (let i = 0; i < dedup.length - 1; i++) {
    if (dedup[i].end > dedup[i + 1].start) dedup[i].end = dedup[i + 1].start;
    if (dedup[i].end <= dedup[i].start) dedup[i].end = dedup[i].start + 0.5;
  }
  return dedup;
}

/** YouTube json3 timedtext. */
export function parseJson3(body: string): Segment[] {
  const data = JSON.parse(body) as {
    events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }>; aAppend?: number }>;
  };
  const segs: Segment[] = [];
  for (const ev of data.events ?? []) {
    if (!ev.segs || ev.tStartMs == null) continue;
    const text = ev.segs.map((s) => s.utf8 ?? "").join("");
    if (!text.trim() || text === "\n") continue;
    const start = ev.tStartMs / 1000;
    segs.push({ start, end: start + (ev.dDurationMs ?? 2000) / 1000, text });
  }
  return normalize(segs);
}

/** YouTube srv1 (<text start dur>) and srv3 (<p t d>) XML. */
export function parseTimedTextXml(body: string): Segment[] {
  const segs: Segment[] = [];
  const srv3 = /<p\s+([^>]*)>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = srv3.exec(body))) {
    const t = /\bt="(\d+)"/.exec(m[1]);
    const d = /\bd="(\d+)"/.exec(m[1]);
    if (!t) continue;
    const start = Number(t[1]) / 1000;
    segs.push({ start, end: start + Number(d?.[1] ?? 2000) / 1000, text: m[2] });
  }
  if (segs.length) return normalize(segs);
  const srv1 = /<text\s+([^>]*)>([\s\S]*?)<\/text>/g;
  while ((m = srv1.exec(body))) {
    const s = /\bstart="([\d.]+)"/.exec(m[1]);
    const d = /\bdur="([\d.]+)"/.exec(m[1]);
    if (!s) continue;
    const start = Number(s[1]);
    segs.push({ start, end: start + Number(d?.[1] ?? 2), text: decodeEntities(m[2]) });
  }
  return normalize(segs);
}

function tsToSec(ts: string): number {
  const parts = ts.trim().replace(",", ".").split(":").map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** WebVTT and SRT. */
export function parseVttOrSrt(body: string): Segment[] {
  const lines = body.replace(/\r/g, "").split("\n");
  const segs: Segment[] = [];
  const cue = /^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;
  for (let i = 0; i < lines.length; i++) {
    const m = cue.exec(lines[i]);
    if (!m) continue;
    const text: string[] = [];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== "" && !cue.test(lines[j])) text.push(lines[j++]);
    segs.push({ start: tsToSec(m[1]), end: tsToSec(m[2]), text: text.join(" ") });
    i = j - 1;
  }
  return normalize(segs);
}

/**
 * Pasted transcripts. Recognises SRT/VTT, or lines starting with a timestamp
 * ("0:12 text", "[00:01:05] text", "1:02:03 - text"). Returns timed=false when
 * no timestamps were found; callers then estimate placement.
 */
export function parsePastedTranscript(input: string, durationSec: number | null): { segments: Segment[]; timed: boolean } {
  const body = input.trim();
  if (/-->/.test(body)) {
    const segs = parseVttOrSrt(body);
    if (segs.length) return { segments: segs, timed: true };
  }

  const lineTs = /^\s*[\[(]?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?)[\])]?\s*[-–—:]?\s*(.*)$/;
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const timed: Segment[] = [];
  let pendingStart: number | null = null;
  for (const line of lines) {
    const m = lineTs.exec(line);
    if (m) {
      const start = tsToSec(m[1]);
      if (m[2]) timed.push({ start, end: start, text: m[2] });
      else pendingStart = start; // timestamp on its own line (YouTube "Show transcript" copy)
    } else if (pendingStart != null) {
      timed.push({ start: pendingStart, end: pendingStart, text: line });
      pendingStart = null;
    } else if (timed.length) {
      timed[timed.length - 1].text += ` ${line}`;
    }
  }
  if (timed.length >= Math.max(3, lines.length * 0.3)) {
    for (let i = 0; i < timed.length; i++) {
      const next = timed[i + 1]?.start;
      timed[i].end = next ?? Math.min(timed[i].start + 6, durationSec ?? timed[i].start + 6);
    }
    return { segments: normalize(timed), timed: true };
  }

  return { segments: estimateTiming(body, durationSec), timed: false };
}

/**
 * Spreads untimed text across the video by word count (speech is roughly uniform).
 * Without a known duration we assume 150 words per minute.
 */
export function estimateTiming(text: string, durationSec: number | null): Segment[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/)
    .flatMap((s) => chunkWords(s, 28))
    .filter(Boolean);
  const totalWords = sentences.reduce((n, s) => n + s.split(" ").length, 0) || 1;
  const total = durationSec && durationSec > 0 ? durationSec : (totalWords / 150) * 60;
  const perWord = total / totalWords;
  let t = 0;
  return normalize(
    sentences.map((s) => {
      const d = s.split(" ").length * perWord;
      const seg = { start: t, end: t + d, text: s };
      t += d;
      return seg;
    }),
  );
}

function chunkWords(s: string, max: number): string[] {
  const words = s.split(" ");
  if (words.length <= max) return [s];
  const out: string[] = [];
  for (let i = 0; i < words.length; i += max) out.push(words.slice(i, i + max).join(" "));
  return out;
}

export function transcriptText(segments: Segment[], from: number, to: number): string {
  return segments
    .filter((s) => s.end > from && s.start < to)
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
