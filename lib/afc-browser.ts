import { chromium, type Page } from 'playwright-core';
import sparticuzChromium from '@sparticuz/chromium';

/**
 * Headless-browser helper for AFC Home Club automation (lib/afc.ts).
 * Uses @sparticuz/chromium's serverless-optimized Chromium build + playwright-core
 * (no bundled browser binary of its own) — the standard combo for running a real
 * browser inside a Vercel/Lambda serverless function without exceeding deployment
 * package size limits.
 *
 * KNOWN LIMITATION: @sparticuz/chromium ships a Linux binary built for the
 * Lambda/Vercel serverless runtime. It will NOT launch on a local Windows or
 * macOS dev machine — there is no local-dev fallback here by design (this
 * automation can't be end-to-end tested until the real AFC form selectors are
 * confirmed anyway, see lib/afc.ts). Testing requires an actual Vercel
 * deployment (or a Linux environment) once selectors are filled in.
 */
export async function withAfcBrowser<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const executablePath = await sparticuzChromium.executablePath();
  const browser = await chromium.launch({
    executablePath,
    args: sparticuzChromium.args,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    return await fn(page);
  } finally {
    await browser.close();
  }
}
