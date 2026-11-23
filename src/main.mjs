// LearnHarness 0.7.0 compatibility adapter: the public SDK has no paperclip
// contribution point. Only the menu widget uses host DOM selectors.
const ANCHOR = 'button[data-testid="attach-files"]';
const MENU = '[data-testid="attachment-popup"][role="menu"]';
const COMPOSER = '[data-attachment-composer]';
const ARMED = 'data-learnharness-wikipedia-armed';
const OPENING_DRAFT = path => path === '/' || path === '/chat/new';
const CHAT_ROUTE = /^\/chat\/([^/]+)$/;

function hasNativeOpening(route) {
  const id = CHAT_ROUTE.exec(route)?.[1];
  if (!id) return false;
  try {
    // Only inherit the toggle when the host has written a same-tab handoff.
    const entry = JSON.parse(window.sessionStorage.getItem(`lh.openingPrompt.${id}`));
    return typeof entry?.text === 'string' && Boolean(entry.text.trim()) && typeof entry.attempted === 'boolean';
  } catch {
    return false;
  }
}

function quotePath(path) {
  if (typeof path !== 'string' || !(/^(?:\/|~\/|[a-z]:[\\/]|\\\\)/i.test(path)) || /[\x00-\x1f\x7f-\x9f\u2028\u2029]/u.test(path)) {
    throw new Error('Wikipedia did not return a valid attachment path.');
  }
  const width = Math.max(1, ...Array.from(path.matchAll(/`+/g), match => match[0].length + 1));
  const fence = '`'.repeat(width);
  const pad = path.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${path}${pad}${fence}`;
}

export function activate(ctx) {
  let armed;
  let lastRoute = ctx.app.pathname();
  let item;
  let marked;

  function syncRoute() {
    const route = ctx.app.pathname();
    if (route !== lastRoute) {
      const launchAge = Date.now() - (armed?.launchedAt ?? 0);
      if (armed?.route === lastRoute && OPENING_DRAFT(lastRoute) && launchAge < 120_000 && !OPENING_DRAFT(route) && hasNativeOpening(route)) {
        // Tentative handoff; only a fresh session's opening submission may use it.
        armed.route = route;
        armed.opening = true;
      } else {
        armed = undefined;
      }
      lastRoute = route;
    }
    return route;
  }

  function recordLaunch(event) {
    const route = syncRoute();
    if (!armed || armed.route !== route || !OPENING_DRAFT(route)) return;
    // Home handles unmodified Enter itself, rather than dispatching submit.
    const composer = event.target?.closest?.(COMPOSER);
    if (composer !== armed.composer) return;
    if (event.type === 'submit' || (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.target.closest('[data-file-path-input]'))) {
      const draft = composer.querySelector('[data-file-path-input]');
      if (draft?.getAttribute('data-empty') === 'false') armed.launchedAt = Date.now();
    }
  }

  function reconcile() {
    if (ctx.signal.aborted) return;
    const route = syncRoute();
    const anchors = [...document.querySelectorAll(`${COMPOSER} ${ANCHOR}:not([aria-disabled="true"])`)];
    const anchor = anchors.find(button => button.getAttribute('aria-expanded') === 'true');
    const selectedAnchor = armed?.route === route ? anchors.find(button => !OPENING_DRAFT(route) || button.closest(COMPOSER) === armed.composer) : undefined;
    if (marked !== selectedAnchor) {
      marked?.removeAttribute(ARMED);
      selectedAnchor?.setAttribute(ARMED, '');
      marked = selectedAnchor;
    }
    const menus = document.querySelectorAll(MENU);
    const menu = anchor && menus.length === 1 ? menus[0] : undefined;
    if (!menu || menu.querySelectorAll('button[role="menuitem"]').length !== 2) {
      item?.remove();
      return;
    }
    if (item?.parentElement !== menu) {
      item?.remove();
      item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitemcheckbox');
      item.className = 'lh-wikipedia-menu-item';
      item.textContent = 'Wikipedia';
      item.title = 'Look up Wikipedia articles for your next message. Search terms go to Wikipedia.';
      item.addEventListener('click', () => {
        const current = syncRoute();
        const composer = anchor.closest(COMPOSER);
        if (current !== route || !composer || !anchor.isConnected || anchor.getAttribute('aria-expanded') !== 'true') return;
        if (armed?.route === route) armed = undefined;
        else armed = { route, composer };
        reconcile();
      });
      menu.append(item);
    }
    const checked = String(armed?.route === route);
    if (item.getAttribute('aria-checked') !== checked) item.setAttribute('aria-checked', checked);
  }

  const unregister = ctx.registerSubmissionInterceptor({
    id: 'wikipedia-attachment',
    async intercept(input, context) {
      if (input.type !== 'text' || !input.content.text.trim()) return;
      const route = syncRoute();
      const selection = armed;
      if (!selection || selection.route !== route || CHAT_ROUTE.exec(route)?.[1] !== context.sessionId) return;
      if (selection.opening && context.messages.some(message => message.role === 'user' || message.role === 'assistant')) {
        armed = undefined;
        reconcile();
        return;
      }
      context.signal.throwIfAborted();
      const result = await ctx.call('attach', { text: input.content.text });
      context.signal.throwIfAborted();
      if (armed !== selection || syncRoute() !== route) throw new Error('Wikipedia was toggled off. Send again without it.');
      if (!Array.isArray(result?.paths) || !result.paths.length) throw new Error('Wikipedia did not return any attachment paths.');
      const references = result.paths.map(quotePath).join('\n');
      context.onAccepted(() => {
        if (armed === selection) { armed = undefined; reconcile(); }
      });
      return { ...input, content: { ...input.content, text: `${input.content.text}\n\n${references}` } };
    },
  });

  const observer = new MutationObserver(reconcile);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });
  document.addEventListener('submit', recordLaunch, true);
  document.addEventListener('keydown', recordLaunch, true);
  reconcile();
  return () => {
    observer.disconnect();
    document.removeEventListener('submit', recordLaunch, true);
    document.removeEventListener('keydown', recordLaunch, true);
    unregister();
    item?.remove();
    marked?.removeAttribute(ARMED);
    armed = undefined;
  };
}
