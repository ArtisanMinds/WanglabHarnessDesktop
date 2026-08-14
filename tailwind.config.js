/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0d0d0f",
        panel: "#151518",
        panel2: "#1c1c21",
        line: "#2a2a31",
        ink: "#e8e8ea",
        muted: "#9a9aa3",
        accent: "#4d6bfe",
        accent2: "#6e8bff",
        danger: "#e5484d",
        ok: "#46a758",
      },
      fontFamily: {
        sans: [
          '"Segoe UI"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: ['"Cascadia Code"', '"SF Mono"', "Consolas", '"Courier New"', "monospace"],
      },
    },
  },
  darkMode: "class",
}
