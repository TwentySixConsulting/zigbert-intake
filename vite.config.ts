import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Served from a GitHub Pages project path, so assets need the repo prefix in a
// production build and a bare root in dev.
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  base: command === "build" ? "/zigbert-intake/" : "/",
}));
