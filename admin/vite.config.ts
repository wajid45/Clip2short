import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API = process.env.API_URL ?? "http://localhost:4000";

// The admin portal is its own origin (admin.<domain> in production). In development Vite proxies
// /api to the API server, so the portal session cookie stays first-party.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 3002,
    strictPort: true,
    proxy: { "/api": { target: API, changeOrigin: false, xfwd: true } },
  },
  preview: { port: 3002, proxy: { "/api": { target: API, xfwd: true } } },
});
