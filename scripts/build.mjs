import { copyFile, lstat, mkdir, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const file = path => new URL(path, root);
const stat = async url => lstat(url).catch(error => {
  if (error.code !== 'ENOENT') throw error;
});

// Do not follow a symlink or replace live plugin state.
const dist = file('dist');
const existing = await stat(dist);
if (existing && !existing.isDirectory()) throw new Error('dist must be a real directory.');
if (await stat(file('dist/data'))) throw new Error('Move dist/data out of dist before building.');
await rm(dist, { recursive: true, force: true });
await mkdir(dist);
for (const [input, output] of [
  ['manifest.json', 'manifest.json'], ['LICENSE', 'LICENSE'],
  ['src/main.mjs', 'main.js'], ['src/backend.cjs', 'backend.cjs'], ['src/styles.css', 'styles.css'],
]) await copyFile(file(input), file(`dist/${output}`));
