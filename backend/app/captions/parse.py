"""Caption format parsers. Every parser returns sorted, cleaned segments in seconds."""

from __future__ import annotations

import html
import json
import math
import re
from typing import TypedDict


class Segment(TypedDict):
    start: float
    end: float
    text: str


_ENTITIES = {"amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'", "nbsp": " ", "#39": "'"}


def decode_entities(s: str) -> str:
    s = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), s)
    s = re.sub(r"&#x([0-9a-f]+);", lambda m: chr(int(m.group(1), 16)), s, flags=re.I)
    return re.sub(r"&([a-z#0-9]+);", lambda m: _ENTITIES.get(m.group(1).lower(), m.group(0)), s, flags=re.I)


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", decode_entities(re.sub(r"<[^>]+>", "", text))).strip()


def _num(v: float) -> float | int:
    """Keeps whole numbers as ints so stored JSON matches the previous backend (e.g. 12, not 12.0)."""
    return int(v) if float(v).is_integer() else v


def normalize(segments: list[Segment]) -> list[Segment]:
    out: list[Segment] = []
    for s in segments:
        start = max(0.0, float(s["start"]))
        if not math.isfinite(start):
            continue
        text = _clean(s["text"])
        if not text:
            continue
        out.append({"start": start, "end": max(start, float(s["end"])), "text": text})
    out.sort(key=lambda s: s["start"])
    # Remove exact duplicates that rolling auto-captions produce.
    dedup: list[Segment] = []
    for s in out:
        if dedup and dedup[-1]["text"] == s["text"] and abs(dedup[-1]["start"] - s["start"]) < 0.05:
            continue
        dedup.append(s)
    # Clamp overlaps so every segment ends before the next starts.
    for i in range(len(dedup) - 1):
        if dedup[i]["end"] > dedup[i + 1]["start"]:
            dedup[i]["end"] = dedup[i + 1]["start"]
        if dedup[i]["end"] <= dedup[i]["start"]:
            dedup[i]["end"] = dedup[i]["start"] + 0.5
    return [{"start": _num(s["start"]), "end": _num(s["end"]), "text": s["text"]} for s in dedup]  # type: ignore[typeddict-item]


def parse_json3(body: str) -> list[Segment]:
    """YouTube json3 timedtext."""
    data = json.loads(body)
    segs: list[Segment] = []
    for ev in data.get("events") or []:
        if not ev.get("segs") or ev.get("tStartMs") is None:
            continue
        text = "".join(s.get("utf8", "") for s in ev["segs"])
        if not text.strip() or text == "\n":
            continue
        start = ev["tStartMs"] / 1000
        segs.append({"start": start, "end": start + (ev.get("dDurationMs") or 2000) / 1000, "text": text})
    return normalize(segs)


def parse_timed_text_xml(body: str) -> list[Segment]:
    """YouTube srv1 (<text start dur>) and srv3 (<p t d>) XML."""
    segs: list[Segment] = []
    for m in re.finditer(r"<p\s+([^>]*)>([\s\S]*?)</p>", body):
        t = re.search(r'\bt="(\d+)"', m.group(1))
        d = re.search(r'\bd="(\d+)"', m.group(1))
        if not t:
            continue
        start = int(t.group(1)) / 1000
        segs.append({"start": start, "end": start + int(d.group(1) if d else 2000) / 1000, "text": m.group(2)})
    if segs:
        return normalize(segs)
    for m in re.finditer(r"<text\s+([^>]*)>([\s\S]*?)</text>", body):
        s = re.search(r'\bstart="([\d.]+)"', m.group(1))
        d = re.search(r'\bdur="([\d.]+)"', m.group(1))
        if not s:
            continue
        start = float(s.group(1))
        segs.append({"start": start, "end": start + float(d.group(1) if d else 2), "text": decode_entities(m.group(2))})
    return normalize(segs)


def _ts_to_sec(ts: str) -> float:
    total = 0.0
    for p in ts.strip().replace(",", ".").split(":"):
        total = total * 60 + float(p)
    return total


_CUE = re.compile(r"^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})")


def parse_vtt_or_srt(body: str) -> list[Segment]:
    """WebVTT and SRT."""
    lines = body.replace("\r", "").split("\n")
    segs: list[Segment] = []
    i = 0
    while i < len(lines):
        m = _CUE.match(lines[i])
        if not m:
            i += 1
            continue
        text: list[str] = []
        j = i + 1
        while j < len(lines) and lines[j].strip() != "" and not _CUE.match(lines[j]):
            text.append(lines[j])
            j += 1
        segs.append({"start": _ts_to_sec(m.group(1)), "end": _ts_to_sec(m.group(2)), "text": " ".join(text)})
        i = j
    return normalize(segs)


_LINE_TS = re.compile(r"^\s*[\[(]?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?)[\])]?\s*[-–—:]?\s*(.*)$")


def parse_pasted_transcript(text: str, duration_sec: float | None) -> tuple[list[Segment], bool]:
    """Pasted transcripts: SRT/VTT, or lines starting with a timestamp ("0:12 text", "[00:01:05] text").

    Returns (segments, timed). Without timestamps, placement is estimated from word count.
    """
    body = text.strip()
    if "-->" in body:
        segs = parse_vtt_or_srt(body)
        if segs:
            return segs, True

    lines = [ln.strip() for ln in re.split(r"\r?\n", body) if ln.strip()]
    timed: list[Segment] = []
    pending: float | None = None
    for line in lines:
        m = _LINE_TS.match(line)
        if m:
            start = _ts_to_sec(m.group(1))
            if m.group(2):
                timed.append({"start": start, "end": start, "text": m.group(2)})
            else:
                pending = start  # timestamp on its own line (YouTube "Show transcript" copy)
        elif pending is not None:
            timed.append({"start": pending, "end": pending, "text": line})
            pending = None
        elif timed:
            timed[-1]["text"] += f" {line}"
    if len(timed) >= max(3, len(lines) * 0.3):
        for i, seg in enumerate(timed):
            nxt = timed[i + 1]["start"] if i + 1 < len(timed) else None
            seg["end"] = nxt if nxt is not None else min(seg["start"] + 6, duration_sec if duration_sec is not None else seg["start"] + 6)
        return normalize(timed), True

    return estimate_timing(body, duration_sec), False


def estimate_timing(text: str, duration_sec: float | None) -> list[Segment]:
    """Spreads untimed text across the video by word count. Without a duration, assumes 150 words per minute."""
    sentences = [c for s in re.split(r"(?<=[.!?…])\s+", re.sub(r"\s+", " ", text)) for c in _chunk_words(s, 28) if c]
    total_words = sum(len(s.split(" ")) for s in sentences) or 1
    total = duration_sec if duration_sec and duration_sec > 0 else total_words / 150 * 60
    per_word = total / total_words
    t = 0.0
    segs: list[Segment] = []
    for s in sentences:
        d = len(s.split(" ")) * per_word
        segs.append({"start": t, "end": t + d, "text": s})
        t += d
    return normalize(segs)


def _chunk_words(s: str, size: int) -> list[str]:
    words = s.split(" ")
    if len(words) <= size:
        return [s]
    return [" ".join(words[i : i + size]) for i in range(0, len(words), size)]


def transcript_text(segments: list[Segment], start: float, end: float) -> str:
    return re.sub(r"\s+", " ", " ".join(s["text"] for s in segments if s["end"] > start and s["start"] < end)).strip()


def unescape(s: str) -> str:
    return html.unescape(s)
