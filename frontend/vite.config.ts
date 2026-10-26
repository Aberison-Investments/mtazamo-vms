import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on 0.0.0.0 so the container port maps out
    port: 5173,
    strictPort: true,
    // Allow ngrok tunnel hostnames through Vite's host check so the public
    // URL isn't rejected with "Blocked request. This host is not allowed."
    allowedHosts: [".ngrok-free.app", ".ngrok.app", ".ngrok.io"],
    proxy: {
      // Proxy all /api requests to the backend container using the Docker
      // service name so this works inside compose networking.
      "/api": {
        target: "http://backend:4000",
        changeOrigin: true,
      },
    },
  },
});
