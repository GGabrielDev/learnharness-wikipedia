import { execFileSync } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const file = path => new URL(path, root);
const stat = async url => lstat(url).catch(error => {
  if (error.code !== 'ENOENT') throw error;
});

const manifest = JSON.parse(await readFile(file('manifest.json'), 'utf8'));
let version = process.env.RELEASE_VERSION;
if (version === undefined) {
  try {
    const tag = execFileSync('git', ['describe', '--exact-match', '--tags', '--match', 'v[0-9]*'], { cwd: fileURLToPath(root), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (/^v\d+\.\d+\.\d+$/.test(tag)) version = tag.slice(1);
  } catch { /* Untagged or source-only checkout: use the committed manifest. */ }
}
if (version !== undefined) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('RELEASE_VERSION must be a stable version number.');
  manifest.version = version;
}

// Do not follow a symlink or replace live plugin state.
const dist = file('dist');
const existing = await stat(dist);
if (existing && !existing.isDirectory()) throw new Error('dist must be a real directory.');
if (await stat(file('dist/data'))) throw new Error('Move dist/data out of dist before building.');
await rm(dist, { recursive: true, force: true });
await mkdir(dist);
await writeFile(file('dist/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
for (const [input, output] of [
  ['LICENSE', 'LICENSE'],
  ['src/main.mjs', 'main.js'], ['src/backend.cjs', 'backend.cjs'], ['src/styles.css', 'styles.css'],
]) await copyFile(file(input), file(`dist/${output}`));
