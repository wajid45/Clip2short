// Writes the server-rendered landing page into dist/index.html so search engines and
// link previews get the full content without running JavaScript.
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const template = await readFile(`${root}dist/index.html`, "utf8");
const { render } = await import(pathToFileURL(`${root}dist-ssr/entry-server.js`).href);

const html = render();
if (!template.includes("<!--app-html-->")) throw new Error("index.html is missing the <!--app-html--> placeholder");
await writeFile(`${root}dist/index.html`, template.replace("<!--app-html-->", html));
await rm(`${root}dist-ssr`, { recursive: true, force: true });
console.log(`[prerender] dist/index.html written (${Math.round(html.length / 1024)} KB of markup)`);
