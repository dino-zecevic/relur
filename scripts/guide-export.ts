/**
 * Writes the Guide for the web (spec §6.12): one Markdown file per page,
 * index.json and the screenshots in images/, for a reader on any platform.
 * With --archive also `<displayName>-guide.tar.gz` of that folder, which the
 * release attaches (spec §15.4).
 *
 *   npm run guide:export [-- --out=<dir>] [-- --archive]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BRAND } from '../src/shared/brand';
import { exportGuide, GUIDE_DIR, readPages } from './lib/guide-export';

const root = path.resolve(import.meta.dirname, '..');
const outArg = process.argv.find((a) => a.startsWith('--out='))?.slice('--out='.length);
const out = path.resolve(outArg ?? path.join(root, 'dist', 'guide'));
const archive = process.argv.includes('--archive');

const pages = readPages();
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const result = exportGuide(pages, version);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'images'), { recursive: true });
for (const [file, text] of Object.entries(result.files))
  fs.writeFileSync(path.join(out, file), text);
for (const image of result.images) {
  fs.copyFileSync(path.join(GUIDE_DIR, 'images', image), path.join(out, 'images', image));
}
const pageCount = result.index.sections.reduce((n, s) => n + s.pages.length, 0);
console.log(`The Guide for the web: ${pageCount} pages, ${result.images.length} images in ${out}`);

if (archive) {
  const file = path.join(path.dirname(out), `${BRAND.displayName}-guide.tar.gz`);
  execFileSync('tar', ['-czf', file, '-C', path.dirname(out), path.basename(out)]);
  console.log(`Archive: ${file} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
}
