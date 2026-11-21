"""The customer's Overview page and the bulk ZIP download of clips."""

import io
import zipfile

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import app
from app.models import Clip, User, Video

PW = "violet tram harbour"


def account(email: str) -> tuple[TestClient, str]:
    c = TestClient(app)
    assert c.post("/api/auth/signup", json={"name": "Clipper", "email": email, "password": PW}).status_code == 200
    with SessionLocal() as db:
        return c, db.query(User).filter_by(email=email).one().id


def make_clips(uid: str) -> tuple[str, str]:
    with SessionLocal() as db:
        file_video = Video(userId=uid, platform="direct", sourceUrl="https://cdn.example.com/stream.mp4", title="Stream")
        yt_video = Video(userId=uid, platform="youtube", sourceUrl="https://youtube.com/watch?v=x", title="VOD")
        db.add_all([file_video, yt_video])
        db.flush()
        a = Clip(userId=uid, videoId=file_video.id, title="Clutch escape", startSec=10, endSec=40, score=92)
        b = Clip(userId=uid, videoId=yt_video.id, title="Chat called it", startSec=5, endSec=30, score=80)
        db.add_all([a, b])
        db.commit()
        return a.id, b.id


def test_overview_shows_the_customers_own_numbers():
    c, uid = account("overview@test.dev")
    make_clips(uid)
    d = c.get("/api/page/overview").json()
    assert d["credits"] >= 1 and d["clipsTotal"] == 2 and d["videosTotal"] == 2
    assert len(d["creditsByDay"]) == 30 and len(d["clipsByDay"]) == 30
    assert [t["title"] for t in d["topClips"]] == ["Clutch escape", "Chat called it"]
    assert TestClient(app).get("/api/page/overview").status_code == 401


class FakeCut:
    returncode = 0

    def communicate(self, timeout=None):
        return b"\x00\x00\x00\x18ftypmp42fake-mp4", b""


def test_zip_has_the_file_clips_and_lists_the_rest(monkeypatch):
    monkeypatch.setattr("app.routes.clips.spawn_cut", lambda url, a, b, vertical: FakeCut())
    monkeypatch.setattr("app.routes.clips.assert_public_url", lambda url: None)
    c, uid = account("zipper@test.dev")
    file_clip, yt_clip = make_clips(uid)
    r = c.get(f"/api/clips/zip?ids={file_clip},{yt_clip}&format=vertical")
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert sorted(z.namelist()) == ["clutch-escape-vertical.mp4", "skipped.txt"]
    assert "Chat called it" in z.read("skipped.txt").decode() and "Youtube" in z.read("skipped.txt").decode()

    # Only YouTube clips: nothing to download, said plainly.
    assert c.get(f"/api/clips/zip?ids={yt_clip}").status_code == 409
    # Someone else's clips are never included.
    other, _ = account("not-the-owner@test.dev")
    assert other.get(f"/api/clips/zip?ids={file_clip}").status_code == 404
    assert c.get("/api/clips/zip?ids=" + ",".join(["x"] * 21)).status_code == 400
