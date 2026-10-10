import { mkdir, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('public', { recursive: true });
await copyFile('index.html', 'public/index.html');
await copyFile('scripts/cloud.js', 'public/cloud.js');
await build({
  entryPoints: ['scripts/identity-client.js'],
  outfile: 'public/identity-client.js',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['es2022'],
  minify: true,
});
