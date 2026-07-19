/**
 * Rental911 brand tokens — reference these in all components.
 * Colors mirror tailwind.config.ts; fonts are loaded in app/layout.tsx.
 */
export const brand = {
  navy: '#0C447C',
  gold: '#EF9F27',
  lightBlue: '#B5D4F4',
  warningYellow: '#EAB308',
  white: '#FFFFFF',
  text: '#333333',
  fontDisplay: 'Montserrat',
  fontBody: 'Open Sans',
  minFontSize: '16px',
} as const;

/** Hardcoded external CRM link — always visible in the admin sidebar. */
export const GHL_CRM_URL =
  process.env.NEXT_PUBLIC_GHL_CRM_URL || 'https://app.gohighlevel.com';

export type Brand = typeof brand;
