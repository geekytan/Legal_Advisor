/**
 * wxochat.js — programmatic driver for the embedded watsonx Orchestrate chat widget.
 *
 * The WxO widget renders directly into #wxo-root in our DOM (no iframe), so we can
 * drive it like any other element: open the launcher, find the TipTap editor input,
 * inject text as <p> blocks (plain textContent collapses newlines), and click send.
 *
 * The selectors target the widget's current markup with fallbacks; if a widget
 * upgrade breaks them, sendMessage() throws a friendly error instead of silently
 * failing — the caller can then fall back to copying the prompt for manual paste.
 */

const WxoChat = (() => {
  const ROOT_SEL       = '#wxo-root';
  const INPUT_SEL      = '[aria-label="Type something..."], .ProseMirror';
  const LAUNCHER_SEL   = '.chatButton, [class*="chatButton"]';
  const SEND_SEL       = '.chat-bar__send-button';
  const MAX_CHAT_CHARS = 8000;

  function _q(sel, root) {
    return (root || document).querySelector(sel);
  }

  function _waitFor(sel, root, timeoutMs) {
    return new Promise(resolve => {
      const found = _q(sel, root);
      if (found) return resolve(found);
      const deadline = Date.now() + timeoutMs;
      const t = setInterval(() => {
        const el = _q(sel, root);
        if (el || Date.now() > deadline) {
          clearInterval(t);
          resolve(el || null);
        }
      }, 200);
    });
  }

  // Wait until the send button exists AND is enabled (React enables it once the
  // input has content).
  function _waitForEnabled(sel, root, timeoutMs) {
    return new Promise(resolve => {
      const deadline = Date.now() + timeoutMs;
      (function poll() {
        const btn = _q(sel, root);
        if (btn && !btn.disabled) return resolve(btn);
        if (Date.now() > deadline) return resolve(null);
        setTimeout(poll, 150);
      })();
    });
  }

  // Inject plain text into the TipTap contenteditable as <p> blocks so newlines
  // survive (ProseMirror collapses newlines when set via plain textContent).
  // Uses the native innerHTML setter so React/ProseMirror state stays in sync.
  function _injectText(el, text) {
    const setHtml = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML').set;
    const html = text
      .split(/\n+/)
      .map(line => `<p>${String(line).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
      .join('');
    setHtml.call(el, html);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Send a message through the embedded chat widget.
   * Opens the launcher first if the conversation isn't visible.
   * Resolves once the message has been handed to the agent.
   * Throws a descriptive Error if any part of the widget is unreachable.
   */
  async function sendMessage(text) {
    const root = _q(ROOT_SEL);
    if (!root) throw new Error('chat widget not found');

    let input = _q(INPUT_SEL, root);
    if (!input) {
      const launcher = _q(LAUNCHER_SEL, root);
      if (!launcher) throw new Error('chat launcher not found');
      launcher.click();
      input = await _waitFor(INPUT_SEL, root, 8000);
      if (!input) throw new Error('chat input did not appear');
    }

    _injectText(input, text);

    const sendBtn = await _waitForEnabled(SEND_SEL, root, 3000);
    if (!sendBtn) throw new Error('chat send button not ready');
    sendBtn.click();
    return true;
  }

  return { sendMessage, MAX_CHAT_CHARS };
})();
