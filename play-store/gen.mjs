import sharp from 'sharp';
import { promises as fs } from 'node:fs';

const DIR = '/Users/thiago/web/karaoke-live/play-store';

// Play Store app icon — 512×512 from richer SVG
const iconSvg = await fs.readFile(`${DIR}/icon-source.svg`);
await sharp(iconSvg).resize(512, 512).png().toFile(`${DIR}/play-icon-512.png`);
console.log('✓ play-icon-512.png');

// Feature graphic — 1024×500
const fgSvg = await fs.readFile(`${DIR}/feature-graphic-source.svg`);
await sharp(fgSvg).resize(1024, 500).png().toFile(`${DIR}/feature-graphic-1024x500.png`);
console.log('✓ feature-graphic-1024x500.png');
