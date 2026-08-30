import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { colors: { canvas: "#F7F3EC", surface: "#FFFDFC", petrol: "#123844", sand: "#D7B483", "pale-blue": "#DCE8EB", ink: "#17282E", muted: "#70787A" }, borderRadius: { card: "22px" }, boxShadow: { soft: "0 8px 28px rgba(23,40,46,.06)" } } },
  plugins: [],
} satisfies Config;
