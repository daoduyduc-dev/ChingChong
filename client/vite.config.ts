import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
const proxy = {
  "/api": "http://127.0.0.1:3002",
  "/socket.io": { target: "http://127.0.0.1:3002", ws: true },
};
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      manifest: {
        name: "Kỳ Viện · Cờ tướng",
        short_name: "Kỳ Viện",
        theme_color: "#174a3c",
        background_color: "#f6f2e9",
        display: "standalone",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/socket.io/],
        maximumFileSizeToCacheInBytes: 5000000,
      },
    }),
  ],
  server: {
    port: 5174,
    proxy,
  },
  preview: { port: 5174, strictPort: true, proxy },
});
