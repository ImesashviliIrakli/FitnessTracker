/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt": a new version waits for the user (a toast offers Reload), so an update never reloads mid-workout.
      registerType: "prompt",
      includeAssets: ["favicon.png", "apple-touch-icon.png", "logo-mark.png"],
      manifest: {
        name: "Fittrack",
        short_name: "Fittrack",
        description: "Training, body metrics and goals.",
        theme_color: "#111318",
        background_color: "#111318",
        id: "/",
        scope: "/",
        start_url: "/",
        display: "standalone",
        display_override: ["standalone"],
        orientation: "portrait",
        lang: "en",
        dir: "ltr",
        categories: ["health", "fitness", "sports"],
        shortcuts: [
          { name: "Start workout", short_name: "Workout", url: "/workouts", icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }] },
          { name: "Log weight", short_name: "Weight", url: "/body", icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }] },
          { name: "Daily check-in", short_name: "Check-in", url: "/check-in", icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }] },
        ],
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            // Recently viewed API reads stay available offline.
            urlPattern: ({ url, request }) => request.method === "GET" && url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-get",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    // Dev only: transform the lazily imported pages at server start instead of on first navigation.
    warmup: { clientFiles: ["./src/main.tsx", "./src/pages/*Page.tsx"] },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
