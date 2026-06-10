import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'ui-sans-serif', 'system-ui', '-apple-system',
          'BlinkMacSystemFont', '"Segoe UI"', 'Roboto',
          '"Helvetica Neue"', 'Arial', 'sans-serif',
        ],
        mono: [
          'ui-monospace', 'SFMono-Regular', 'Menlo',
          'Monaco', '"Courier New"', 'monospace',
        ],
      },
      colors: {
        taime: {
          50:  '#f0f4ff',
          100: '#dce7ff',
          200: '#c5d6ff',
          300: '#93b0ff',
          400: '#5479ff',
          500: '#2f5cf5',
          600: '#1D4ED8',
          700: '#1e40af',
          900: '#0f1a3d',
        },
      },
    },
  },
  plugins: [],
}

export default config
