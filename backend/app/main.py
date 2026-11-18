"""Shortlark API (FastAPI).

The web app and the API share one origin: in development Vite proxies /api here; in production
this app also serves the built web app (web/dist), so the session cookie stays first-party.
The landing site is a separate origin and may only call the public lead endpoint.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles

from . import background
from .config import REPO_DIR, settings
from .http import AppJSONResponse, HttpError, error_body, json_response
from .routes import account, billing, clips, pages, posts, videos
from .scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO, format="[%(name)s] %(levelname)s %(message)s")
log = logging.getLogger("shortlark")


@asynccontextmanager
async def lifespan(_: FastAPI):
    start_scheduler()
    log.info("Shortlark API ready on port %s", settings.port)
    yield
    stop_scheduler()
    background.shutdown()


app = FastAPI(
    title="Shortlark API",
    version="3.0.0",
    lifespan=lifespan,
    default_response_class=AppJSONResponse,
    # Interactive docs in development only; production doesn't advertise the API surface.
    docs_url=None if settings.is_prod else "/api/docs",
    redoc_url=None,
    openapi_url=None if settings.is_prod else "/api/openapi.json",
)


# The marketing site lives on its own origin and only needs the public lead-capture endpoint.
class LeadsOnlyCORS(CORSMiddleware):
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"] == "/api/leads":
            return await super().__call__(scope, receive, send)
        return await self.app(scope, receive, send)


app.add_middleware(LeadsOnlyCORS, allow_origins=[settings.landing_url], allow_methods=["POST"], allow_headers=["content-type"], max_age=86400)


@app.exception_handler(HttpError)
async def http_error(_: Request, err: HttpError):
    return json_response(error_body(err), err.status)


@app.exception_handler(RequestValidationError)
async def invalid_request(_: Request, err: RequestValidationError):
    # The only framework-level validation is JSON decoding of the body.
    return json_response({"error": "Request body must be JSON."}, 400)


@app.exception_handler(StarletteHTTPException)
async def starlette_error(request: Request, err: StarletteHTTPException):
    if request.url.path.startswith("/api"):
        return json_response({"error": "Not found." if err.status_code == 404 else str(err.detail)}, err.status_code)
    return Response(str(err.detail), status_code=err.status_code)


@app.exception_handler(Exception)
async def unhandled(_: Request, err: Exception):
    log.exception("unhandled error", exc_info=err)
    return json_response({"error": "Something went wrong on our side. Please try again."}, 500)


@app.get("/api/health")
def health():
    return {"ok": True}


for module in (account, billing, videos, clips, posts):
    app.include_router(module.router)
app.include_router(pages.router)


@app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
def api_not_found(rest: str):
    return json_response({"error": "Not found."}, 404)


# In production, serve the built web app (single-page app: unknown paths get index.html).
_web_dist = Path(settings.web_dist) if settings.web_dist else REPO_DIR / "web" / "dist"
if (_web_dist / "index.html").exists():

    class _Assets(StaticFiles):
        async def get_response(self, path: str, scope):
            res = await super().get_response(path, scope)
            res.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return res

    if (_web_dist / "assets").is_dir():
        app.mount("/assets", _Assets(directory=_web_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        file = (_web_dist / path).resolve()
        if path and file.is_file() and _web_dist.resolve() in file.parents:
            return FileResponse(file)
        return FileResponse(_web_dist / "index.html", headers={"Cache-Control": "no-cache"})
