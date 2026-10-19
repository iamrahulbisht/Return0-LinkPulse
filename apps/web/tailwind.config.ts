import type { Config } from 'tailwindcss';

// LinkPulse dark theme (new UI reference: "LinkPulse Frontend").
// Black page, near-black cards, lime (#D4FF00) for actions, focus and live things.
// Token NAMES are kept stable so components did not change shape; only the values moved to the dark palette:
//   ground = page, surface = cards/inputs, subtle = quiet boxes, ink = darkest panels (sidebar),
//   fg = main text, text-2/3/4 = softer text, accent = lime.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          50: '#1C2106', // lime tint (chips, icon boxes, selected rows)
          300: '#E6FF66', // lime text on black
          400: '#D4FF00', // primary buttons (black text), focus ring, active nav
          600: '#D4FF00', // chart lines, progress bars
          700: '#D4FF00', // text links
          800: '#E6FF66', // link hover
        },
        ink: { DEFAULT: '#0A0A0C', 2: '#0E0E10', 3: '#141416', 4: '#1E1E24' },
        surface: '#121214',
        field: '#1A1A1E',
        ground: '#000000',
        subtle: '#17171B',
        fg: '#FFFFFF',
        line: { DEFAULT: '#232328', strong: '#2A2A32', soft: '#1E1E24' },
        text: { DEFAULT: '#FFFFFF', 2: '#D4D4D8', 3: '#A1A1AA', 4: '#8E8E98' },
        ondark: { 2: '#B9B9C3', 3: '#8E8E98', 4: '#82828E' }, // 4 = section labels, kept ≥ 4.5:1 on the panel
        ok: { DEFAULT: '#4ADE80', bg: '#142312', line: '#22501A' },
        warn: { DEFAULT: '#FACC15', bg: '#291E0A', line: '#523D14' },
        limit: { DEFAULT: '#FB923C', bg: '#2A1708', line: '#5A3110' },
        danger: { DEFAULT: '#F87171', bg: '#221717', line: '#4A1C1C', solid: '#DC2626' },
        bot: { DEFAULT: '#38BDF8', bg: '#0C1A24', line: '#173447' },
        admin: '#F59E0B',
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"Outfit"', 'sans-serif'],
        brand: ['"Outfit"', '"Space Grotesk"', 'sans-serif'],
        zentry: ['"Zentry"', '"Space Grotesk"', 'sans-serif'],
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      borderRadius: { chip: '8px', input: '12px', card: '16px' },
      minHeight: { touch: '44px' },
      keyframes: {
        lpPing: { '0%': { transform: 'scale(1)', opacity: '.75' }, '100%': { transform: 'scale(2.8)', opacity: '0' } },
        lpIn: { from: { background: 'rgba(212,255,0,.12)' }, to: { background: 'transparent' } },
      },
      animation: { ping: 'lpPing 1.8s ease-out infinite', rowin: 'lpIn 2.4s ease-out' },
    },
  },
  plugins: [],
} satisfies Config;
