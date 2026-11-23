import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planRelease } from '../scripts/release-plan.mjs';

const plan = (...messages) => planRelease({
  previousTag: 'v0.2.1', repository: 'GGabrielDev/learnharness-wikipedia',
  commits: messages.map((message, index) => ({ message, sha: String(index + 1).repeat(40), files: [] })),
});

test('Release Please uses the highest severity and generates linked release notes', async () => {
  assert.equal((await plan('fix: use the correct search result')).version, '0.2.2');
  const feature = await plan('fix: handle missing input', 'feat: add article filters');
  assert.equal(feature.version, '0.3.0');
  assert.match(feature.notes, /compare\/v0\.2\.1\.\.\.v0\.3\.0/);
  assert.match(feature.notes, /add article filters/);
  assert.equal((await plan('feat!: replace the attachment API')).version, '1.0.0');
});

test('maintenance-only changes do not release', async () => {
  assert.equal(await plan('docs: describe installation', 'ci: add release workflow'), null);
});
