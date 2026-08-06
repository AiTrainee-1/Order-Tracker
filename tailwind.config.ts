import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Corporate Blue neutral scale — cool navy-gray, matches the
        // Dark Navy Text / Secondary Text / Muted Text / app background spec.
        ink: {
          950: "#0B1526",
          900: "#101828",
          800: "#1D2939",
          700: "#344054",
          600: "#475467",
          500: "#667085",
          400: "#98A2B3",
          300: "#CBD5E1",
          200: "#E4EAF2",
          100: "#EEF2F8",
          50: "#F4F7FC",
        },
        brand: {
          DEFAULT: "#155EEF",
          light: "#2563EB",
          dark: "#0B3FAE",
        },
        status: {
          good: "#16A34A",
          warn: "#F59E0B",
          bad: "#EF4444",
          info: "#06B6D4",
          shortage: "#9333EA",
          rejected: "#DC2626",
          idle: "#98A2B3",
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
        card: "0 1px 2px 0 rgba(16,24,40,0.04), 0 1px 3px 0 rgba(16,24,40,0.06)",
        popover: "0 20px 40px -10px rgba(16,24,40,0.2)",
        glow: "0 0 0 4px rgba(21,94,239,0.12)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #155EEF 0%, #2563EB 100%)",
        "good-gradient": "linear-gradient(135deg, #15803d 0%, #22c55e 100%)",
        "warn-gradient": "linear-gradient(135deg, #b45309 0%, #f59e0b 100%)",
        "bad-gradient": "linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)",
        "dot-grid": "radial-gradient(circle, rgba(16,24,40,0.07) 1px, transparent 1px)",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulseSoft: "pulseSoft 2s ease-in-out infinite",
        floatSlow: "floatSlow 6s ease-in-out infinite",
        fadeInUp: "fadeInUp 0.35s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
