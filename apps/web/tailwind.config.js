/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      "./pages/**/*.{ts,tsx}",
      "./components/**/*.{ts,tsx}",
      "./app/**/*.{ts,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          brand: {
            50:  "#eef7ff",
            100: "#dbedff",
            600: "#2563eb",
            700: "#1d4ed8",
          },
        },
        boxShadow: {
          soft: "0 8px 30px rgba(0,0,0,0.06)",
        },
      },
    },
    plugins: [],
  };
  