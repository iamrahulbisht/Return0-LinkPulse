// Static content for the brand guide: the dark "LinkPulse Frontend" theme. This is a style guide, not analytics.
// Contrast ratios below were computed with the WCAG formula (not estimated).

export interface Swatch {
  name: string;
  hex: string;
  token: string;
  use: string;
  note: string;
  /** Text colour on the swatch. */
  on: string;
  sample: string;
}

export interface SwatchGroup {
  name: string;
  desc: string;
  items: Swatch[];
}

const C = (name: string, hex: string, token: string, use: string, note: string, on: string, sample: string): Swatch => ({ name, hex, token, use, note, on, sample });

export const GROUPS: SwatchGroup[] = [
  {
    name: 'Lime accent',
    desc: 'For actions, focus and live things. About 10% of a screen.',
    items: [
      C('Pulse Lime', '#D4FF00', '--lp-lime', 'Main buttons, active menu item, focus ring, chart line, the pulse in the logo.', 'Black text on it: 18.1 : 1', '#000000', 'Aa Button'),
      C('Lime Hover', '#C4EC00', '--lp-lime-hover', 'Hover and pressed state of lime buttons.', 'Keep black text on it', '#000000', 'Hover'),
      C('Lime Light', '#E6FF66', '--lp-lime-light', 'Lime text on black, link hover, short links in headers.', 'On black: 18.9 : 1', '#000000', 'On dark'),
      C('Lime Tint', '#1C2106', '--lp-lime-tint', 'Tag chips, selected rows, soft highlights.', 'Lime text on it: 14.3 : 1', '#D4FF00', 'Tint'),
    ],
  },
  {
    name: 'Black canvas and surfaces',
    desc: 'The page is black; work sits on near-black cards. About 90% of a screen.',
    items: [
      C('Black', '#000000', '--lp-black', 'Page background of every screen.', 'White on it: 21 : 1', '#FFFFFF', 'Page'),
      C('Panel', '#0A0A0C', '--lp-panel', 'Sidebar and visitor-page frames.', 'Label grey #82828E on it: 5.2 : 1', '#FFFFFF', 'Sidebar'),
      C('Card', '#121214', '--lp-card', 'Cards, tables and panels.', 'White on it: 18.7 : 1', '#FFFFFF', 'Card'),
      C('Raised', '#141416', '--lp-card-2', 'Dialogs, the sign-in card, logo tile.', 'Use a #2A2A32 border for edges', '#FFFFFF', 'Dialog'),
      C('Input', '#1A1A1E', '--lp-input', 'Text inputs, selects, secondary buttons.', 'White on it: 17.3 : 1', '#FFFFFF', 'Input'),
    ],
  },
  {
    name: 'Lines',
    desc: 'Thin borders separate dark areas. Decoration only, never for text.',
    items: [
      C('Line', '#232328', '--lp-border', 'Card borders and dividers.', 'Turns lime on focus or selection', '#FFFFFF', 'Border'),
      C('Line Light', '#2A2A32', '--lp-border-light', 'Input and secondary-button borders.', 'Turns lime on focus, red on errors', '#FFFFFF', 'Input edge'),
    ],
  },
  {
    name: 'Text',
    desc: 'White for what matters, four greys for the rest.',
    items: [
      C('Text', '#FFFFFF', '--lp-text', 'Headings, numbers, main text.', 'On a card: 18.7 : 1', '#000000', 'Heading'),
      C('Text Strong', '#D4D4D8', '--lp-text-2', 'Body text inside cards and tables.', 'On a card: 12.7 : 1', '#000000', 'Body'),
      C('Text Soft', '#A1A1AA', '--lp-text-3', 'Helper text and sub-titles.', 'On a card: 7.3 : 1', '#000000', 'Helper'),
      C('Text Muted', '#8E8E98', '--lp-muted', 'Captions, times, table headings. Lightest grey allowed for text.', 'On a card: 5.8 : 1', '#000000', 'Caption'),
      C('Label', '#82828E', '--lp-label', 'Small section labels in the sidebar.', 'On the panel: 5.2 : 1', '#000000', 'Label'),
    ],
  },
];

export const STATUS = [
  { label: 'Active', fg: '#4ADE80', bg: '#142312', means: 'Link works, human click, check passed', cr: '9.4 : 1' },
  { label: 'Expiring soon', fg: '#FACC15', bg: '#291E0A', means: 'Expired, expiring or near the limit', cr: '10.7 : 1' },
  { label: 'Limit reached', fg: '#FB923C', bg: '#2A1708', means: 'Click limit is full', cr: '7.6 : 1' },
  { label: 'Disabled', fg: '#F87171', bg: '#221717', means: 'Admin takedown, errors, blocked domain', cr: '6.3 : 1' },
  { label: 'Bot · not counted', fg: '#38BDF8', bg: '#0C1A24', means: 'Preview bots and scanners, saved but never counted', cr: '8.2 : 1' },
  { label: 'Admin', fg: '#000000', bg: '#F59E0B', means: 'Admin mode and admin-only counts', cr: '9.8 : 1' },
];

export const TYPE_SCALE: { style: string; sample: string; spec: string; cls: string }[] = [
  { style: 'Wordmark', sample: 'LINKPULSE', spec: 'Zentry · 34 / 1.1 / 900', cls: 'font-zentry text-[30px] sm:text-[34px] font-black leading-[1.1] tracking-[-0.02em]' },
  { style: 'Display', sample: 'Every click', spec: 'Space Grotesk · 56 / 1.0 / 700', cls: 'font-display text-[36px] sm:text-[48px] font-bold tracking-tight leading-none' },
  { style: 'Page title', sample: 'Dashboard', spec: 'Space Grotesk · 28–32 / 1.1 / 700', cls: 'font-display text-[30px] font-bold tracking-tight' },
  { style: 'Card title', sample: 'Clicks over time', spec: 'Space Grotesk · 19 / 1.2 / 700', cls: 'font-display text-[19px] font-bold tracking-tight' },
  { style: 'Body', sample: 'Bots are saved but never counted.', spec: 'Inter · 14.5–16 / 1.6 / 400', cls: 'text-[15px] leading-[1.6]' },
  { style: 'Label', sample: 'Destination URL', spec: 'Inter · 13.5–14 / 1.4 / 600', cls: 'text-[14px] font-semibold text-text-3' },
  { style: 'Button', sample: 'New link', spec: 'Outfit · 15 / 1 / 700', cls: 'font-brand text-[15px] font-bold' },
  { style: 'Overline', sample: 'Live checks', spec: 'Inter · 11.5–13 / caps / 700 / +wider', cls: 'text-[12px] font-bold uppercase tracking-wider text-text-4' },
  { style: 'Short link', sample: 'lp.in/innovista26', spec: 'JetBrains Mono · 15–30 / 1.3 / 600', cls: 'font-mono text-[18px] font-semibold text-accent-400' },
];

export const CSS_VARS = `:root {
  color-scheme: dark;

  /* Canvas and surfaces */
  --lp-black: #000000;
  --lp-panel: #0A0A0C;
  --lp-card: #121214;
  --lp-card-2: #141416;
  --lp-input: #1A1A1E;
  --lp-border: #232328;
  --lp-border-light: #2A2A32;

  /* Lime accent */
  --lp-lime: #D4FF00;
  --lp-lime-hover: #C4EC00;
  --lp-lime-light: #E6FF66;
  --lp-lime-tint: #1C2106;

  /* Text */
  --lp-text: #FFFFFF;
  --lp-text-2: #D4D4D8;
  --lp-text-3: #A1A1AA;
  --lp-muted: #8E8E98;
  --lp-placeholder: #82828F;

  /* Status: text / background */
  --lp-ok: #4ADE80;      --lp-ok-bg: #142312;
  --lp-warn: #FACC15;    --lp-warn-bg: #291E0A;
  --lp-limit: #FB923C;   --lp-limit-bg: #2A1708;
  --lp-danger: #F87171;  --lp-danger-bg: #221717;
  --lp-bot: #38BDF8;     --lp-bot-bg: #0C1A24;
  --lp-admin: #F59E0B;

  /* Type, shape */
  --lp-font-display: 'Space Grotesk', 'Outfit', sans-serif;
  --lp-font-body: 'Inter', -apple-system, sans-serif;
  --lp-font-button: 'Outfit', 'Space Grotesk', sans-serif;
  --lp-font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --lp-font-wordmark: 'Zentry', 'Space Grotesk', sans-serif;
  --lp-radius-input: 12px;
  --lp-radius-card: 16px;
  --lp-touch: 44px;
}`;

export const TAILWIND = `// tailwind.config.ts (excerpt)
export default {
  theme: {
    extend: {
      colors: {
        accent: { 50: '#1C2106', 300: '#E6FF66', 400: '#D4FF00' },
        ink: { DEFAULT: '#0A0A0C', 3: '#141416', 4: '#1E1E24' },
        ground: '#000000', surface: '#121214', field: '#1A1A1E',
        line: { DEFAULT: '#232328', strong: '#2A2A32' },
        text: { DEFAULT: '#FFFFFF', 2: '#D4D4D8', 3: '#A1A1AA', 4: '#8E8E98' },
        ok: { DEFAULT: '#4ADE80', bg: '#142312' },
        warn: { DEFAULT: '#FACC15', bg: '#291E0A' },
        limit: { DEFAULT: '#FB923C', bg: '#2A1708' },
        danger: { DEFAULT: '#F87171', bg: '#221717', solid: '#DC2626' },
        bot: { DEFAULT: '#38BDF8', bg: '#0C1A24' },
        admin: '#F59E0B',
      },
      fontFamily: {
        display: ['Space Grotesk', 'Outfit', 'sans-serif'],
        brand: ['Outfit', 'Space Grotesk', 'sans-serif'],
        zentry: ['Zentry', 'Space Grotesk', 'sans-serif'],
        sans: ['Inter', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: { chip: '8px', input: '12px', card: '16px' },
    },
  },
};`;

export const LOGO_SVG =
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="#141416" stroke="#2A2A32"/><path d="M7 16h4l2.7-6.5 5.3 13 2.7-6.5H25" fill="none" stroke="#D4FF00" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The pulse path of the mark (32 × 32), shared by the logo drawings on the page. */
export const PULSE = 'M7 16h4l2.7-6.5 5.3 13 2.7-6.5H25';
