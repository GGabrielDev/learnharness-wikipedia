import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseConventionalCommits } from 'release-please/build/src/commit.js';
import { DefaultChangelogNotes } from 'release-please/build/src/changelog-notes/default.js';
import { DefaultVersioningStrategy } from 'release-please/build/src/versioning-strategies/default.js';
import { Version } from 'release-please/build/src/version.js';

const sections = [
  { type: 'feat', section: 'Features' }, { type: 'feature', section: 'Features' },
  { type: 'fix', section: 'Bug Fixes' }, { type: 'perf', section: 'Performance Improvements' },
  { type: 'revert', section: 'Reverts' },
];
const stableTag = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

export async function planRelease({ previousTag, commits, repository }) {
  if (!stableTag.test(previousTag)) throw new Error('A reachable stable release tag is required.');
  const changes = parseConventionalCommits(commits).filter(commit => commit.breaking || sections.some(section => section.type === commit.type));
  if (!changes.length) return null;
  const previous = Version.parse(previousTag.slice(1));
  const next = new DefaultVersioningStrategy().bump(previous, changes);
  const version = next.toString();
  const delta = (next.major - previous.major) || (next.minor - previous.minor) || (next.patch - previous.patch);
  if (!stableTag.test(`v${version}`) || delta <= 0) {
    throw new Error(`Invalid release progression: ${previousTag} → v${version}`);
  }
  const [owner, name] = repository.split('/');
  const notes = await new DefaultChangelogNotes().buildNotes(changes, { version, owner, repository: name, previousTag, currentTag: `v${version}`, changelogSections: sections });
  return { version, notes };
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

async function main() {
  const sha = git('rev-parse', 'HEAD').trim();
  const previousTag = git('tag', '--merged', sha, '--sort=-version:refname').split('\n').find(tag => stableTag.test(tag));
  if (!previousTag) throw new Error('No previous stable tag found; check out the full history.');
  const fields = git('log', '-z', '--format=%H%x00%B', `${previousTag}..${sha}`).split('\0');
  const commits = [];
  for (let index = 0; index + 1 < fields.length; index += 2) commits.push({ sha: fields[index], message: fields[index + 1].trim(), files: [] });
  const release = await planRelease({ previousTag, commits, repository: process.env.GITHUB_REPOSITORY ?? 'GGabrielDev/learnharness-wikipedia' });
  if (!release) {
    console.log(`No releasable commits since ${previousTag}.`);
    return;
  }
  console.log(`${previousTag} → v${release.version} (${sha})`);
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync('release-notes.md', `${release.notes}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${release.version}\nsha=${sha}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
