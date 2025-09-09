const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development", // disable PWA in dev
  runtimeCaching: [
    {
      // ✅ Avoid caching POST API routes (e.g., face detection, registration)
      urlPattern: /^\/api\/.*$/i,
      handler: "NetworkOnly",
      method: "POST",
    },
    {
      urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 31536000,
        },
      },
    },
    {
      urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "jsdelivr",
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 31536000,
        },
      },
    },
    {
      urlPattern: /^\/$/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "start-url",
        expiration: {
          maxEntries: 1,
          maxAgeSeconds: 86400,
        },
      },
    },
    {
      urlPattern: /^.*$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "general-cache",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 86400,
        },
      },
    },
  ],
});

module.exports = withPWA({
  // 🛠 Fix for face-api.js fs import error in client-side code
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
      };
    }
    return config;
  },
});
