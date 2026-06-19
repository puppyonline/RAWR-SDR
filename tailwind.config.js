/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark neutrals
        bg: {
          DEFAULT: '#09090b',
          raised: '#111114',
          card: '#16161a',
          hover: '#1c1c22',
          border: '#27272a',
        },
        // Accent palette
        brand: {
          DEFAULT: '#3b82f6',
          dim: '#2563eb',
          bright: '#60a5fa',
          glow: 'rgba(59, 130, 246, 0.12)',
        },
        // Semantic
        live: '#22c55e',
        warn: '#f59e0b',
        danger: '#ef4444',
        muted: '#71717a',
        // Section accents
        radio: '#8b5cf6',
        tv: '#06b6d4',
        aviation: '#f97316',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      animation: {
        'pulse-live': 'pulse-live 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-live': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [],
};
