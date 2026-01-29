import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      colors: {
        // Viholabs brand
        viholab: {
          primary: "#59313c",
          secondary: "#f28444",
          soft1: "#d9c2ba",
          soft2: "#db9d87",
          soft3: "#f8ae4e",
        },

        // Semantic tokens (light theme)
        background: "#FAF8F7",
        surface: "#FFFFFF",
        border: "#E6E1DE",
        muted: "#B8A9A3",
        text: "#2A1D20",
        "text-soft": "#6E5A60",

        // Status
        success: "#4C8B5F",
        warning: "#F8AE4E",
        error: "#C04646",
        info: "#6B8CAE",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "18px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,.04)",
        md: "0 4px 10px rgba(0,0,0,.06)",
      },
    },
  },
  plugins: [],
};

export default config;
