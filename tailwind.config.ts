import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0a0a0a",
          900: "#111111",
          800: "#1f1f1f",
          700: "#333333",
          600: "#4d4d4d",
          500: "#6b6b6b",
          400: "#8f8f8f",
          300: "#b8b8b8",
          200: "#dcdcdc",
          100: "#eeeeee",
          50: "#f7f7f7",
        },
        accent: {
          DEFAULT: "#111111",
        },
        status: {
          good: "#16a34a",
          warn: "#d97706",
          bad: "#dc2626",
          idle: "#9ca3af",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(0,0,0,0.04), 0 1px 3px 0 rgba(0,0,0,0.06)",
        popover: "0 10px 30px -5px rgba(0,0,0,0.15)",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        pulseSoft: "pulseSoft 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
