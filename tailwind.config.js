/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c1410",
        cream: "#f3eee7",
        paper: "#fffdfb",
        ember: "#e4572e",
        leaf: "#1f7a4d",
        line: "#eadfd4",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
        display: ["var(--font-display)", "serif"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(28,20,16,0.04), 0 12px 32px -18px rgba(28,20,16,0.35)",
      },
    },
  },
  plugins: [],
};
