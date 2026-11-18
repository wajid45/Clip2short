import fs from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { env } from "./lib/env";
import { apiRouter } from "./api";
import { pageRouter } from "./page-routes";
import { startScheduler } from "./scheduler";

const app = express();
app.disable("x-powered-by");
if (env.trustProxy) app.set("trust proxy", true);

// The marketing site lives on its own origin and only needs the public lead-capture endpoint.
app.use("/api/leads", cors({ origin: [env.landingUrl], methods: ["POST"], maxAge: 86400 }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Handlers read the body themselves (JSON, raw Stripe payloads, upload chunks), so keep it raw.
app.use("/api", express.raw({ type: () => true, limit: "16mb" }));
app.use("/api/page", pageRouter);
app.use("/api", apiRouter);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found." });
});

// In production the API also serves the built web app, so both share one origin and one session cookie.
const webDist = env.webDist ?? path.resolve(process.cwd(), "../web/dist");
if (fs.existsSync(path.join(webDist, "index.html"))) {
  app.use(
    express.static(webDist, {
      index: false,
      setHeaders(res, file) {
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );
  app.get("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(webDist, "index.html"));
  });
}

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  void _next;
  const status = typeof err?.status === "number" ? err.status : 500;
  if (status >= 500) console.error("[server] unhandled error", err);
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.status(status).json({ error: status === 413 ? "That upload is too large." : status >= 500 ? "Something went wrong on our side. Please try again." : "Bad request." });
};
app.use(onError);

app.listen(env.port, () => {
  console.log(`[server] Shortlark API listening on http://localhost:${env.port}`);
  void startScheduler();
});
