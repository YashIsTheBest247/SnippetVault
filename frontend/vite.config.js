import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During dev, proxy /api calls to the FastAPI server on :8000 so the browser
// talks to a single origin (no CORS surprises) and the API base never has to
// be hard-coded in the frontend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
