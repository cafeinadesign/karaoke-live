import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = '/Users/thiago/web/karaoke-live/play-store';
const MOCKUPS = `${ROOT}/mockups`;
const OUT = `${ROOT}/screenshots`;

const SHOTS = [
  ['01-landing', '01-landing.html'],
  ['02-host', '02-host.html'],
  ['03-guest', '03-guest.html'],
  ['04-yourturn', '04-yourturn.html'],
  ['05-share', '05-share.html'],
];

// Fresh screenshots dir.
if (existsSync(OUT)) await fs.rm(OUT, { recursive: true });
await fs.mkdir(OUT, { recursive: true });

// Real QR for the share-sheet mockup.
await QRCode.toFile(`${MOCKUPS}/qr.png`, 'https://karaoke-live.app.br/mobile/K3M9P2', {
  margin: 1,
  width: 600,
  color: { dark: '#0f0f0fff', light: '#ffffffff' },
  errorCorrectionLevel: 'M',
});
console.log('✓ qr.png');

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

for (const [name, file] of SHOTS) {
  const url = pathToFileURL(path.join(MOCKUPS, file)).href;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('✓', `${name}.png`);
}

await browser.close();
console.log('Done — 5 screenshots in play-store/screenshots/');
