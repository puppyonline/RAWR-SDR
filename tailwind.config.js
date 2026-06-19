/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#0a0a0f',
          1: '#12121a',
          2: '#1a1a26',
          3: '#222232',
          4: '#2a2a3c',
        },
        accent: {
          DEFAULT: '#6366f1',
          dim: '#4f46e5',
          bright: '#818cf8',
          glow: 'rgba(99, 102, 241, 0.15)',
        },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        muted: '#64748b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(99, 102, 241, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)' },
        },
      },
    },
  },
  plugins: [],
};
