/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
        'brand-soft': 'rgb(var(--brand-soft) / <alpha-value>)',
        blush: 'rgb(var(--blush) / <alpha-value>)',
        ok: 'rgb(var(--ok) / <alpha-value>)',
        bad: 'rgb(var(--bad) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
        display: ['Nunito', '"Be Vietnam Pro"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(58 29 22 / 0.04), 0 4px 16px -4px rgb(58 29 22 / 0.08)',
        lift: '0 2px 4px rgb(58 29 22 / 0.06), 0 16px 32px -8px rgb(58 29 22 / 0.18)',
        pop: '0 24px 64px -12px rgb(30 15 10 / 0.35)',
      },
      keyframes: {
        'fade-up': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        'pop-in': { from: { opacity: 0, transform: 'scale(.96)' }, to: { opacity: 1, transform: 'none' } },
        stripes: { from: { backgroundPosition: '0 0' }, to: { backgroundPosition: '28px 0' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        'pop-in': 'pop-in .2s ease-out both',
        stripes: 'stripes .8s linear infinite',
        float: 'float 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
