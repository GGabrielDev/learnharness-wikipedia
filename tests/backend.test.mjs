import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import backend from '../src/backend.cjs';

const message = (text, stopReason = 'stop') => ({ stopReason, content: [{ type: 'text', text }] });
const pages = (...items) => Response.json({ query: { pages: items } });

test('model queries are bounded, normalized and deduplicated', () => {
  assert.deepEqual(backend.parseQueries(message('```json\n["  Plate tectonics ", "PLATE TECTONICS", "Earth mantle"]\n```')), ['Plate tectonics', 'Earth mantle']);
  assert.throws(() => backend.parseQueries(message('[]', 'length')), /did not finish/);
  assert.throws(() => backend.parseQueries(message('["a", "b", "c", "d"]')), /valid/);
  assert.equal(backend.removeFileReferences('Compare `/home/learner/file.pdf` and ``C:\\school\\file `v2`.md`` using `C++`'), 'Compare   and   using `C++`');
});

test('backend uses the Cheap model and writes a native reference file with article attribution', async t => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'wiki-plugin-test-'));
  t.after(() => rm(dataDirectory, { recursive: true, force: true }));
  const queries = [];
  const ctx = {
    manifest: { version: '0.1.0' }, signal: new AbortController().signal, dataDirectory,
    registerInstructions(value) { assert.ok(value.agents.includes('teacher')); },
    handle(id, handler) { assert.equal(id, 'attach'); this.attach = handler; },
    inference: {
      catalog: async () => ({ slots: { cheap: { model: { provider: 'example', id: 'cheap' } } } }),
      async complete(req) {
        assert.equal(req.purpose, 'user');
        assert.deepEqual(req.model, { provider: 'example', id: 'cheap' });
        assert.equal(req.context.messages[0].content, 'Explain tectonics');
        return message('["Plate tectonics", "Earth plates"]');
      },
    },
  };
  backend.activate(ctx, async (url, options) => {
    assert.equal(url.origin, 'https://en.wikipedia.org');
    assert.equal(url.pathname, '/w/api.php');
    assert.match(options.headers['User-Agent'], /LearnHarnessWikipedia\/0\.1\.0/);
    const params = url.searchParams;
    if (params.has('gsrsearch')) {
      queries.push(params.get('gsrsearch'));
      return pages({ ns: 0, pageid: 100, index: 4 }, { ns: 0, pageid: 12, index: 0, pageprops: { disambiguation: '' } }, { ns: 0, pageid: 1, index: 2 });
    }
    assert.equal(params.get('pageids'), '1');
    assert.equal(params.get('explaintext'), '1');
    assert.equal(params.has('exintro'), false);
    queries.push('article');
    return pages({ pageid: 1, title: 'Plate tectonics', lastrevid: 43, extract: 'Article text. '.repeat(12_000) + 'Final paragraph.' });
  });
  const result = await ctx.attach({ text: 'Explain tectonics `/home/learner/notes.pdf`' });
  assert.deepEqual(queries, ['Plate tectonics', 'article', 'Earth plates']);
  assert.equal(result.paths.length, 1);
  assert.ok(result.paths[0].startsWith(join(dataDirectory, 'sources', 'lookup-')));
  const document = await readFile(result.paths[0], 'utf8');
  assert.match(document, /# Plate tectonics\b/);
  assert.match(document, /en\.wikipedia\.org\/\?curid=1/);
  assert.match(document, /oldid=43/);
  assert.match(document, /CC BY-SA 4\.0/);
  assert.ok(Buffer.byteLength(document) > 150_000);
  assert.ok(document.endsWith('Final paragraph.\n'));
});

test('the client honors throttling and skips missing extracts', async () => {
  let now = 100_000;
  let calls = 0;
  const client = backend.createWikipediaClient({ userAgent: 'test', now: () => now, fetcher: async url => {
    calls++;
    if (calls === 1) return new Response(null, { status: 429, headers: { 'Retry-After': '15' } });
    if (url.searchParams.has('generator')) return pages({ ns: 0, pageid: 4, index: 1 }, { ns: 0, pageid: 5, index: 2 });
    if (url.searchParams.get('pageids') === '4') return pages();
    return pages({ pageid: 5, title: 'Matched', extract: 'Some text' });
  }});
  await assert.rejects(client.articles(['search']), /throttling/);
  now += 14_999;
  await assert.rejects(client.articles(['search']), /throttling/);
  assert.equal(calls, 1);
  now += 1;
  assert.equal((await client.articles(['search']))[0].title, 'Matched');
  assert.equal(calls, 4);
});
