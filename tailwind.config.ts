import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        dark: {
          bg: "#0d1117",
          sidebar: "#161b22",
          input: "#1c2128",
          border: "#30363d",
          hover: "#21262d",
          text: "#e6edf3",
          muted: "#8b949e",
          accent: "#58a6ff",
        },
        light: {
          bg: "#ffffff",
          sidebar: "#f6f8fa",
          input: "#f0f2f5",
          border: "#d0d7de",
          hover: "#eaeef2",
          text: "#1f2328",
          muted: "#656d76",
          accent: "#0969da",
        },
      },
    },
  },
  plugins: [],
};

export default config;
