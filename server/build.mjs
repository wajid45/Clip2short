// Bundles the API into dist/index.js. Prisma and ffmpeg-static stay external:
// both resolve native binaries next to their own package files at runtime.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  external: ["@prisma/client", ".prisma/client", "ffmpeg-static"],
  alias: { "@server": "./src" },
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
});
