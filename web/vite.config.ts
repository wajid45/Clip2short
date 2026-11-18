import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API = process.env.API_URL ?? "http://localhost:4000";

// The web app talks to the API on the same origin: in development Vite proxies /api to the
// Express server; in production the Express server serves this build.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 3000,
    strictPort: true,
    proxy: { "/api": { target: API, changeOrigin: false, xfwd: true } },
  },
  preview: { port: 3000, proxy: { "/api": { target: API, xfwd: true } } },
  build: { sourcemap: true },
});
