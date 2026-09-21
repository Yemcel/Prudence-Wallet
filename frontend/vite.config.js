import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/favicon.png", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Prudence Wallet",
        short_name: "Prudence",
        description: "Every source, one honest picture of your spending.",
        theme_color: "#1C2430",
        background_color: "#F6F4EF",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      // autoUpdate + this workbox setting means a new deploy replaces the
      // cached app on next load instead of getting stuck on a stale build --
      // exactly the kind of silent-staleness this app already hit once
      // today with a plain browser cache.
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
