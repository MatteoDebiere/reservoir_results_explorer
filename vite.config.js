import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/reservoir_results_explorer/",
  build: {
    sourcemap: false,
  },
});
