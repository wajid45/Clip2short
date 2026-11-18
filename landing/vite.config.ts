import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API = process.env.API_URL ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // The lead form posts to /api/leads; in development that's proxied to the API server.
  server: { port: 3001, strictPort: true, proxy: { "/api": { target: API, xfwd: true } } },
  preview: { port: 3001 },
  ssr: { noExternal: ["@shortlark/shared"] },
});
