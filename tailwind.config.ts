import type { Config } from 'tailwindcss';

/**
 * Rental911 brand system.
 * Colors, fonts, and the platform-wide 16px minimum font size are enforced here.
 * See lib/brand.ts for the shared token object referenced in components.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#0C447C',
        gold: '#EF9F27',
        'light-blue': '#B5D4F4',
        'warning-yellow': '#EAB308',
        ink: '#333333',
      },
      fontFamily: {
        // Loaded via next/font/google in app/layout.tsx as CSS variables.
        display: ['var(--font-montserrat)', 'sans-serif'],
        body: ['var(--font-open-sans)', 'sans-serif'],
      },
      fontSize: {
        // Minimum font size is 16px platform-wide — NO exceptions.
        // `xs` and `sm` are intentionally clamped up to 16px so no utility
        // can accidentally render smaller text.
        xs: ['16px', { lineHeight: '1.5rem' }],
        sm: ['16px', { lineHeight: '1.5rem' }],
        base: ['16px', { lineHeight: '1.6rem' }],
        lg: ['18px', { lineHeight: '1.75rem' }],
        xl: ['20px', { lineHeight: '1.75rem' }],
        '2xl': ['24px', { lineHeight: '2rem' }],
        '3xl': ['30px', { lineHeight: '2.25rem' }],
        '4xl': ['36px', { lineHeight: '2.5rem' }],
        '5xl': ['48px', { lineHeight: '1' }],
      },
    },
  },
  plugins: [],
};

export default config;
