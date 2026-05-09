/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          50: "#f5f6f9",
          100: "#e7e9f0",
          200: "#cdd1de",
          300: "#a4abc1",
          400: "#7c84a0",
          500: "#5d6483",
          600: "#474d68",
          700: "#363a51",
          800: "#23263a",
          900: "#15172a",
          950: "#0b0c1a",
        },
        accent: {
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
        },
      },
      keyframes: {
        "fade-in": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "fade-in": "fade-in 280ms ease-out both",
      },
    },
  },
  plugins: [],
};
