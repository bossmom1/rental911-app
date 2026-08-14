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

/** Manual login shortcut for Christine — separate from the AFC backend automation (lib/afc.ts). */
export const AFC_HOME_CLUB_URL =
  process.env.NEXT_PUBLIC_AFC_HOME_CLUB_URL || 'https://afchomeclub.com/realtor/invoice';

/** Meta Business Suite quick-access link — marketing hub for Rental911 Facebook/Instagram. */
export const META_BUSINESS_SUITE_URL =
  process.env.NEXT_PUBLIC_META_BUSINESS_SUITE_URL || 'https://business.facebook.com/latest/home';

export type Brand = typeof brand;
