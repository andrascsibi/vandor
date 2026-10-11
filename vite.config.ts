import { defineConfig } from "vite";

// Served at the domain root in dev, under /vandor/ on GitHub Pages.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/vandor/" : "/",
}));
