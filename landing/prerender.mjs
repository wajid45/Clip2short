// Writes every page of the marketing site as static HTML (dist/<path>/index.html, plus 404.html)
// so search engines and link previews get full content without running JavaScript. Also writes
// sitemap.xml and robots.txt, a canonical URL per page, and structured data (JSON-LD).
//
// SITE_URL is the public origin of the landing site, e.g. https://clip2short.com (no trailing slash).
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const SITE = (process.env.SITE_URL || "https://clip2short.com").replace(/\/$/, "");
if (!process.env.SITE_URL) console.warn(`[prerender] SITE_URL not set; using ${SITE} for canonical links and the sitemap`);

const template = await readFile(`${root}dist/index.html`, "utf8");
const { render, ROUTES, NOT_FOUND, structuredData } = await import(pathToFileURL(`${root}dist-ssr/entry-server.js`).href);
if (!template.includes("<!--app-html-->")) throw new Error("index.html is missing the <!--app-html--> placeholder");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const url = (path) => (path === "/" ? `${SITE}/` : `${SITE}${path}`);

function page(route, { canonical = true } = {}) {
  const ld = structuredData(route.path, SITE);
  const head = [
    canonical ? `<link rel="canonical" href="${esc(url(route.path))}" />` : `<meta name="robots" content="noindex" />`,
    canonical ? `<meta property="og:url" content="${esc(url(route.path))}" />` : "",
    ...ld.map((obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`),
  ]
    .filter(Boolean)
    .join("\n    ");
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(route.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(route.description)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(route.title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(route.description)}$2`)
    .replace(/(<meta property="og:image" content=")\/og\.png(")/, `$1${SITE}/og.png$2`)
    .replace("</head>", `    ${head}\n  </head>`)
    .replace("<!--app-html-->", render(route.path));
}

for (const route of ROUTES) {
  const dir = route.path === "/" ? `${root}dist` : `${root}dist${route.path}`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/index.html`, page(route));
}
await writeFile(`${root}dist/404.html`, page(NOT_FOUND, { canonical: false }));

const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ROUTES.map((r) => `  <url><loc>${esc(url(r.path))}</loc><lastmod>${today}</lastmod><priority>${(r.path === "/" ? 1 : (r.priority ?? 0.5)).toFixed(1)}</priority></url>`).join("\n")}
</urlset>
`;
await writeFile(`${root}dist/sitemap.xml`, sitemap);
await writeFile(`${root}dist/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

await rm(`${root}dist-ssr`, { recursive: true, force: true });
console.log(`[prerender] ${ROUTES.length} pages + 404.html, sitemap.xml and robots.txt written for ${SITE}`);
