import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const OUT = '/Users/thiago/web/karaoke-live/play-store/screenshots';
const BASE = 'http://localhost:4200';
const VIEWPORT = { width: 1080, height: 1920 };

await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  locale: 'pt-BR',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  permissions: ['camera'],
});

const page = await ctx.newPage();

async function shot(name, url, waitFor) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  console.log('✓', name);
}

// 1. Landing (logged out)
await shot('01-landing', '/', 'main.landing');

// 2. Login
await shot('02-login', '/login', 'main.login');

// 3. /mobile join screen (logged out lands here; the auth guard redirects to /login,
//    so we render an isolated fake by hitting a `?ssr=mock-join` if the route would normally guard.
//    Workaround: navigate to /mobile and capture the login screen with a different URL.)
// Skipping — already have login.

// 4. Privacy
await shot('03-privacy', '/privacy', 'main.privacy');

// 5. QR scanner (mobile component opens scanner via state — bypass with a mock UI screenshot)
// Build a static HTML preview that mirrors the production styles? Not worth the maintenance.
// We'll let the user capture authenticated screens manually.

await browser.close();
console.log('Done.');
