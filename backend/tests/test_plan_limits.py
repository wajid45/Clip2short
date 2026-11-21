"""Plan limits from pricing.json are enforced by the API, not just shown on the pricing page."""

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import app
from app.models import User
from app.plans import get_plan

PW = "violet tram harbour"


def account(email: str) -> TestClient:
    c = TestClient(app)
    assert c.post("/api/auth/signup", json={"name": "Clipper", "email": email, "password": PW}).status_code == 200
    return c


def test_plan_table_matches_the_pricing_page():
    ids = ("creator", "pro", "studio")
    plans = [get_plan(x) for x in ids]
    assert [(p["price"], p["monthlyCredits"]) for p in plans] == [(49, 550), (99, 1200), (199, 2550)]
    limits = [p["limits"] for p in plans]
    assert [x["scheduledPosts"] for x in limits] == [5, 10, 30]
    assert [x["maxVideoMinutes"] for x in limits] == [120, 180, None]
    assert [x["captions"] for x in limits] == [False, True, True]
    assert [x["posting"] for x in limits] == [True, True, True]
    assert [x["scheduling"] for x in limits] == [False, True, True]
    assert [x["postAnalytics"] for x in limits] == [False, False, True]


def test_credit_packs_need_a_monthly_plan():
    c = account("packs-gate@test.dev")
    r = c.post("/api/billing/credits", json={"pack": "pack-100"})
    assert r.status_code == 403 and r.json()["code"] == "plan_required"
    assert c.post("/api/billing/dev-activate", json={"plan": "creator"}).status_code == 200
    assert c.post("/api/billing/credits", json={"pack": "pack-100"}).status_code == 200


def test_analytics_per_post_is_studio_only():
    c = account("analytics-gate@test.dev")
    c.post("/api/billing/dev-activate", json={"plan": "pro"})
    r = c.get("/api/page/analytics")
    assert r.status_code == 402 and r.json()["code"] == "plan_feature"
    assert c.post("/api/analytics/refresh").json()["refreshed"] == 0
    c.post("/api/billing/dev-activate", json={"plan": "studio"})
    assert c.get("/api/page/analytics").status_code == 200


def test_posting_needs_a_plan_and_scheduling_needs_pro():
    from app.auth import has_feature

    c = account("posting-gate@test.dev")  # free trial: no posting
    r = c.post("/api/posts/does-not-exist")
    assert r.status_code == 402 and r.json()["code"] == "plan_feature"
    for plan, schedules in (("creator", False), ("pro", True), ("studio", True)):
        c.post("/api/billing/dev-activate", json={"plan": plan})
        with SessionLocal() as db:
            u = db.query(User).filter_by(email="posting-gate@test.dev").one()
            assert has_feature(u, "posting") and has_feature(u, "scheduling") is schedules


def test_networks_follow_the_plan():
    from app.auth import network_allowed

    nets = [get_plan(x)["limits"]["networks"] for x in ("creator", "pro", "studio")]
    assert nets == [["youtube"], ["youtube", "facebook"], ["youtube", "facebook", "instagram"]]
    c = account("networks-gate@test.dev")  # free: 6 trial credits, YouTube only
    with SessionLocal() as db:
        u = db.query(User).filter_by(email="networks-gate@test.dev").one()
        assert network_allowed(u, "youtube") and not network_allowed(u, "facebook") and not network_allowed(u, "instagram")
    page = c.get("/api/page/accounts").json()
    allowed = {p["id"]: (p["allowed"], p["planNeeded"]) for p in page["platforms"]}
    assert allowed["youtube"] == (True, None)
    assert allowed["facebook"] == (False, "Pro")
    assert allowed["instagram"] == (False, "Studio")
    c.post("/api/billing/dev-activate", json={"plan": "pro"})
    allowed = {p["id"]: p["allowed"] for p in c.get("/api/page/accounts").json()["platforms"]}
    assert allowed["facebook"] and not allowed["instagram"]


def test_sports_and_film_engines_are_pro_and_up():
    engines = [get_plan(x)["limits"]["engines"] for x in ("creator", "pro", "studio")]
    assert engines[0] == ["podcast", "gaming", "other"]
    assert all({"podcast", "gaming", "movies", "sports", "other"} == set(e) for e in engines[1:])
    c = account("engine-gate@test.dev")
    c.post("/api/billing/dev-activate", json={"plan": "creator"})
    assert c.get("/api/page/videos").json()["engines"] == ["podcast", "gaming", "other"]
    r = c.post("/api/videos", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "category": "sports"})
    assert r.status_code == 402 and r.json()["code"] == "plan_feature"
