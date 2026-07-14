module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Roboto Mono", "ui-monospace", "monospace"],
      },
      colors: {
        charcoal: {
          950: "#0c0d0f",
          900: "#141619",
          800: "#1c1f24",
          700: "#252a30",
          600: "#2f353d",
        },
        deep: "#121212",
        gold: {
          DEFAULT: "#D4AF37",
          light: "#F9E29C",
          dark: "#B8860B",
        },
        platinum: {
          light: "#E2E2E2",
          mid: "#C0C0C0",
          dark: "#7E7E7E",
          /* Royal Deep Purple & Electric Violet (theme) */
          royal: "#1A0B2E",
          violet: "#9D50BB",
          deep: "#6E48AA",
        },
        silver: {
          chrome: "#94a3b8",
          slate: "#0f172a",
        },
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      boxShadow: {
        "platinum-glow": "0 0 24px rgba(226, 226, 226, 0.25), 0 0 48px rgba(192, 192, 192, 0.15)",
        "card-dark": "0 4px 24px rgba(0,0,0,0.2), 0 0 1px rgba(255,255,255,0.05)",
        "gold-badge": "0 4px 15px rgba(212, 175, 55, 0.3)",
        "gold-glow": "0 0 8px rgba(212, 175, 55, 0.5)",
      },
      textShadow: {
        "gold-glow": "0 0 8px rgba(212, 175, 55, 0.5)",
      },
    },
  },
  plugins: [],
}