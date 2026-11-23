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
  let definition, accepted, rows, closeDialog;
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
    ui: {
      openDialog(props) {
        const content = document.createElement('div');
        document.body.append(content);
        const disposeRows = props.content(content, controller.signal);
        const dispose = () => { disposeRows(); content.remove(); };
        closeDialog = () => { props.onClose(); dispose(); };
        return { dispose };
      },
      mountSettingsRows(_, schema) {
        rows = schema.rows;
        return { update(value) { rows = value.rows; }, dispose() { rows = undefined; } };
      },
    },
    registerSubmissionInterceptor(value) { definition = value; return () => { definition = undefined; }; },
    async call(operation, payload) {
      calls++;
      assert.equal(operation, 'attach');
      assert.equal(payload.text, input.content.text);
      assert.deepEqual([payload.min, payload.max, payload.split], [1, 3, true]);
      return { paths };
    },
  });
  t.after(() => { cleanup(); dom.window.close(); Object.assign(globalThis, previous); });
  return {
    input, paths, turn, cleanup, window,
    get option() { return document.querySelector('.lh-wikipedia-menu-item'); },
    open() { this.option.click(); },
    close() { closeDialog(); },
    arm() { this.open(); this.row('enabled').onChange(true); this.close(); },
    row(key) { return rows?.find(row => row.key === key); },
    get anchor() { return document.querySelector('button[data-testid="attach-files"]'); },
    get calls() { return calls; },
    accept() { accepted(); },
    setRoute(next) { route = next; },
  };
}

test('native options are opt-in; original attachments are preserved and only acceptance disarms', async t => {
  const f = fixture(t);
  assert.equal(f.option.textContent, 'Wikipedia…');
  f.open();
  assert.equal(f.row('enabled').value, false);
  assert.equal(f.row('split').value, true);
  assert.equal(await f.turn(), undefined);
  assert.equal(f.calls, 0);
  f.row('enabled').onChange(true);
  assert.equal(f.row('enabled').value, true);
  f.close();
  assert.ok(f.anchor.hasAttribute('data-learnharness-wikipedia-armed'));
  const prepared = await f.turn();
  assert.equal(prepared.content.text, `${f.input.content.text}\n\n\`${f.paths[0]}\`\n\`\`${f.paths[1]}\`\``);
  assert.equal(f.option.dataset.enabled, 'true');
  f.accept();
  assert.equal(f.option.dataset.enabled, 'false');
  f.cleanup();
  assert.equal(f.option, null);
  assert.equal(f.anchor.hasAttribute('data-learnharness-wikipedia-armed'), false);
  assert.equal(document.querySelectorAll('button[role="menuitem"]').length, 2);
});

test('home selection carries across a native submit only into a fresh opening and does not leak to other chats', async t => {
  const f = fixture(t, '/');
  f.arm();
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
  f.arm();
  document.querySelector('[data-file-path-input]').dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  f.window.sessionStorage.setItem('lh.openingPrompt.chat_a', JSON.stringify({ text: f.input.content.text, attempted: true }));
  f.setRoute('/chat/chat_a');
  assert.equal(await f.turn('chat_a', [{ role: 'assistant' }]), undefined);
  assert.equal(f.calls, 0);
});
