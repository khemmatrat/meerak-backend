/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary colors for minimalist theme
        white: '#FFFFFF',
        darkSlate: '#0F172A',
        slate600: '#475569',
        // Accent color (Gold/Platinum)
        accent: '#D4AF37', // Golden hue
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        marquee: 'marquee 25s linear infinite',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      borderRadius: {
        '2xl': '1rem', // Consistent rounded-2xl
      },
      lineHeight: {
        '16': '1.6',
      },
      letterSpacing: {
        'tightest': '-0.04em',
      },
      backgroundImage: {
        'golden-silk': 'linear-gradient(135deg, #D4AF37, #F9F295, #B8860B)',
      }
    },
  },
  plugins: [],
}
