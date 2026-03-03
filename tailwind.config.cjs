module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Noto Sans SC", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        serif: ["Noto Serif SC", "Songti SC", "SimSun", "serif"],
      },
      colors: {
        background: "#FAF8F5",
        foreground: "#2C1810",
        card: "#ffffff",
        primary: "#8B2942",
        "primary-dark": "#6B2033",
        accent: "#C9A227",
        "accent-light": "#E8D48B",
        muted: "#F5F0E8",
        border: "#E8E0D5",
        wine: "#8B2942",
        gold: "#C9A227",
      },
      boxShadow: {
        glow: "0 0 20px rgba(139, 41, 66, 0.25)",
        "glow-gold": "0 0 20px rgba(201, 162, 39, 0.2)",
        soft: "0 4px 20px rgba(44, 24, 16, 0.08)",
        card: "0 1px 3px rgba(44, 24, 16, 0.08), 0 1px 2px rgba(44, 24, 16, 0.04)",
      },
    },
  },
  plugins: [],
};