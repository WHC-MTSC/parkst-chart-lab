import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist');
const publicFiles = [
  'AOA_매매차트.html', 'index.html', 'trainer.html',
  'chart.css', 'trainer.css', 'chart.js', 'trainer.js',
  'lightweight-charts.js', 'position-labels.js', 'training-data.js',
  'simulator.js', 'comparison.js', 'data_validation.json',
  'LICENSE-lightweight-charts.txt', 'NOTICE-lightweight-charts.txt',
];
const dataFiles = await readdir(join(root, 'data'), { withFileTypes: true });
for (const entry of dataFiles) {
  if (!entry.isFile() || !entry.name.endsWith('.js')) {
    throw new Error(`Unexpected data asset: ${entry.name}`);
  }
  publicFiles.push(`data/${entry.name}`);
}
if (publicFiles.length > 20000) throw new Error('Cloudflare Free file limit exceeded.');
let bytes = 0;
for (const relative of publicFiles) {
  const info = await stat(join(root, relative));
  if (info.size > 25 * 1024 * 1024) throw new Error(`Asset exceeds 25 MiB: ${relative}`);
  bytes += info.size;
}

// Only this project's generated dist directory is replaced.
if (resolve(output) !== resolve(root, 'dist') || dirname(output) !== root) {
  throw new Error('Invalid build output directory.');
}
await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'data'), { recursive: true });
for (const relative of publicFiles) {
  const source = join(root, relative);
  const target = join(output, relative);
  if (relative.endsWith('.html')) {
    // GitHub entry pages can point assets to Cloudflare. Cloudflare builds
    // use their own origin so preview deployments remain self-contained.
    const html = (await readFile(source, 'utf8'))
      .replace(/<base data-cloudflare-assets href="https:\/\/[^"<>]+\/">/g, '');
    const oldHostCheck = "location.hostname==='whc-mtsc.github.io'";
    if (!html.includes(oldHostCheck)) throw new Error(`Missing host check: ${relative}`);
    const newHostCheck = "(location.hostname==='whc-mtsc.github.io'||location.hostname.endsWith('.workers.dev'))";
    await writeFile(target, html.replace(oldHostCheck, newHostCheck));
  } else {
    await cp(source, target);
  }
}
console.log(`Cloudflare assets ready: ${publicFiles.length} files, ${(bytes / 1e6).toFixed(1)} MB.`);
