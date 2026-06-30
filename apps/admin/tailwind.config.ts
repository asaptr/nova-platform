import type { Config } from 'tailwindcss'
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-bg)',
        card: 'var(--color-card)',
        border: 'var(--color-border)',
        primary: 'var(--color-text-primary)',
        muted: 'var(--color-text-muted)',
        accent: 'var(--color-accent)',
      },
    },
  },
  plugins: [],
}
export default config
