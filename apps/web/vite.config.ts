import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { devApi } from "./dev-api";

export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi(mode)],
  server: { port: 5173 },
}));
