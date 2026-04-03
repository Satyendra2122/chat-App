/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        whatsapp: {
          green: "#00a884",
          light: "#dcf8c6",
          bg: "#efeae2",
          gray: "#f0f2f5"
        }
      }
    },
  },
  plugins: [],
}