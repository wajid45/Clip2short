from datetime import UTC, datetime

import pytest

from app.ai.clipper import AiClip, finalize_clips, target_clip_count
from app.captions.parse import parse_json3, parse_pasted_transcript, parse_timed_text_xml, parse_vtt_or_srt, transcript_text
from app.http import iso
from app.plans import analysis_cost
from app.security import decrypt, encrypt
from app.video.source import SourceError, is_private_host, parse_video_url, timestamp_url


@pytest.mark.parametrize(
    ("url", "platform", "external"),
    [
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "youtube", "dQw4w9WgXcQ"),
        ("https://youtu.be/dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ"),
        ("https://youtube.com/shorts/dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ"),
        ("https://vimeo.com/123456789/abcdef1234", "vimeo", "123456789:abcdef1234"),
        ("https://player.vimeo.com/video/123456789?h=abcdef12", "vimeo", "123456789:abcdef12"),
        ("https://cdn.example.com/talk.mp4", "direct", None),
    ],
)
def test_parse_video_url(url, platform, external):
    p = parse_video_url(url)
    assert (p.platform, p.externalId) == (platform, external)


@pytest.mark.parametrize(
    "url", ["not a link", "ftp://x.com/a.mp4", "https://youtube.com/watch?v=short", "http://192.168.1.4/a.mp4", "https://example.com/page"]
)
def test_parse_video_url_rejects(url):
    with pytest.raises(SourceError):
        parse_video_url(url)


def test_private_hosts():
    assert is_private_host("localhost") and is_private_host("10.0.0.1") and is_private_host("172.20.1.1") and is_private_host("[::1]")
    assert not is_private_host("example.com") and not is_private_host("172.32.0.1")


def test_timestamp_urls():
    assert timestamp_url("youtube", "", "abc", 75.9) == "https://youtu.be/abc?t=75"
    assert timestamp_url("vimeo", "https://vimeo.com/1", "1", 3725) == "https://vimeo.com/1#t=1h2m5s"
    assert timestamp_url("direct", "https://x/a.mp4", None, 12) == "https://x/a.mp4#t=12"


def test_caption_formats():
    vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nHello <b>there</b> &amp; welcome\n\n00:00:03.000 --> 00:00:05.000\nSecond line\n"
    segs = parse_vtt_or_srt(vtt)
    assert segs[0] == {"start": 1, "end": 3, "text": "Hello there & welcome"}  # overlap clamped
    j3 = '{"events":[{"tStartMs":0,"dDurationMs":1500,"segs":[{"utf8":"hi"}]},{"tStartMs":1500,"segs":[{"utf8":"\\n"}]}]}'
    assert parse_json3(j3) == [{"start": 0, "end": 1.5, "text": "hi"}]
    xml = '<transcript><text start="1.5" dur="2">a &#39;quote&#39;</text></transcript>'
    assert parse_timed_text_xml(xml)[0]["text"] == "a 'quote'"


def test_pasted_transcripts():
    timed, ok = parse_pasted_transcript("0:00 one\n0:05 two\n0:10 three\n0:15 four", 30)
    assert ok and [s["start"] for s in timed] == [0, 5, 10, 15] and timed[-1]["end"] == 21
    plain, ok = parse_pasted_transcript("Just words. " * 40, 120)
    assert not ok and plain[0]["start"] == 0 and plain[-1]["end"] <= 120.01
    assert transcript_text(timed, 6, 11) == "two three"


def test_finalize_clips_extends_short_and_drops_weak_and_overlapping():
    segs = [{"start": i * 5, "end": i * 5 + 5, "text": f"line {i}"} for i in range(40)]

    def clip(s, e, score):
        return AiClip(
            start_segment=s,
            end_segment=e,
            title="T",
            hook="h",
            caption="c",
            hashtags=["#a b"],
            category="story",
            score_hook=90,
            score_self_contained=90,
            score_payoff=90,
            score_quotability=90,
            score=score,
            reason="r",
        )

    out = finalize_clips([clip(2, 2, 80), clip(2, 4, 70), clip(10, 12, 40), clip(20, 23, 95)], segs)
    assert [c.score for c in out] == [95, 80]  # weak (<50) and overlapping clips removed, best first
    assert out[1].endSec - out[1].startSec >= 12  # a 5s pick is extended to the minimum length
    assert out[0].hashtags == "ab"
    assert target_clip_count(3600, 0) == 15


def test_costs_dates_and_crypto():
    assert analysis_cost(30, False) == 1 and analysis_cost(121, False) == 3 and analysis_cost(7200, True) == 30
    assert iso(datetime(2026, 11, 17, 12, 45, 0, 123456, tzinfo=UTC)) == "2026-11-17T12:45:00.123Z"
    assert decrypt(encrypt("secret token")) == "secret token"
