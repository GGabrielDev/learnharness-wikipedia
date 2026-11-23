import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { activate } from '../src/main.mjs';

function fixture(t, initialRoute = '/chat/chat_a') {
  const dom = new JSDOM(`<main data-attachment-composer><form><div data-file-path-input data-empty="false">Teach me about topology</div><button type="button" data-testid="attach-files" aria-expanded="true">Attach files</button></form></main>
    <div data-testid="attachment-popup" role="menu"><button role="menuitem">Files</button><button role="menuitem">Folder</button></div>`, { url: 'https://localhost/' });
  const { window } = dom;
  const previous = { document: globalThis.document, MutationObserver: globalThis.MutationObserver, window: globalThis.window };
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.MutationObserver = window.MutationObserver;
  let route = initialRoute;
  let definition, accepted;
  let calls = 0;
  const controller = new AbortController();
  const input = { type: 'text', content: { text: 'Teach me about topology `/home/me/notes.pdf`', images: [] } };
  const paths = ['/home/me/Wikipedia - Topology (13).md', '/home/me/v`2/Wikipedia - Manifold (14).md'];
  function turn(sessionId = 'chat_a', messages = []) {
    accepted = undefined;
    return definition.intercept(input, { signal: controller.signal, sessionId, messages, onAccepted(next) { accepted = next; } });
  }
  const cleanup = activate({
    signal: controller.signal, app: { pathname: () => route },
    registerSubmissionInterceptor(value) { definition = value; return () => { definition = undefined; }; },
    async call(operation, payload) {
      calls++;
      assert.equal(operation, 'attach');
      assert.equal(payload.text, input.content.text);
      return { paths };
    },
  });
  t.after(() => { cleanup(); dom.window.close(); Object.assign(globalThis, previous); });
  return {
    input, paths, turn, cleanup, window,
    get checkbox() { return document.querySelector('button[role="menuitemcheckbox"]'); },
    get anchor() { return document.querySelector('button[data-testid="attach-files"]'); },
    get calls() { return calls; },
    accept() { accepted(); },
    setRoute(next) { route = next; },
  };
}

test('paperclip checkbox is opt-in; original attachments are preserved and only acceptance disarms', async t => {
  const f = fixture(t);
  assert.equal(f.checkbox.textContent, 'Wikipedia');
  assert.equal(f.checkbox.getAttribute('aria-checked'), 'false');
  assert.equal(await f.turn(), undefined);
  assert.equal(f.calls, 0);
  f.checkbox.click();
  assert.equal(f.checkbox.getAttribute('aria-checked'), 'true');
  assert.ok(f.anchor.hasAttribute('data-learnharness-wikipedia-armed'));
  const prepared = await f.turn();
  assert.equal(prepared.content.text, `${f.input.content.text}\n\n\`${f.paths[0]}\`\n\`\`${f.paths[1]}\`\``);
  assert.equal(f.checkbox.getAttribute('aria-checked'), 'true');
  f.accept();
  assert.equal(f.checkbox.getAttribute('aria-checked'), 'false');
  f.cleanup();
  assert.equal(f.checkbox, null);
  assert.equal(f.anchor.hasAttribute('data-learnharness-wikipedia-armed'), false);
  assert.equal(document.querySelectorAll('button[role="menuitem"]').length, 2);
});

test('home selection carries across a native submit only into a fresh opening and does not leak to other chats', async t => {
  const f = fixture(t, '/');
  f.checkbox.click();
  document.querySelector('form').dispatchEvent(new f.window.Event('submit', { bubbles: true }));
  f.window.sessionStorage.setItem('lh.openingPrompt.chat_a', JSON.stringify({ text: f.input.content.text, attempted: true }));
  f.setRoute('/chat/chat_a');
  assert.ok((await f.turn()).content.text.includes('Wikipedia'));
  f.setRoute('/chat/chat_b');
  assert.equal(await f.turn('chat_b'), undefined);
  assert.equal(f.calls, 1);
});

test('an unrelated existing chat cannot consume an armed opening', async t => {
  const f = fixture(t, '/');
  f.checkbox.click();
  document.querySelector('[data-file-path-input]').dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  f.window.sessionStorage.setItem('lh.openingPrompt.chat_a', JSON.stringify({ text: f.input.content.text, attempted: true }));
  f.setRoute('/chat/chat_a');
  assert.equal(await f.turn('chat_a', [{ role: 'assistant' }]), undefined);
  assert.equal(f.calls, 0);
});
