// Tiny DOM helpers.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const svgNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

export const fmtPct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
export const fmtMs = (x) => (x == null ? '—' : `${Math.round(x)} ms`);
export const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Resolve on the next key press matching `keys` (or click on `clickEl`). Rejects on abort. */
export function waitForKey(keys, { signal, clickEl } = {}) {
  return new Promise((resolve, reject) => {
    const onKey = (e) => {
      // typing into a form (e.g. the Customize panel) must not trigger the key
      if (e.target !== clickEl && e.target?.closest?.('input, select, textarea, button, summary')) return;
      if (keys.includes(e.code)) { e.preventDefault(); done(e); }
    };
    const onClick = (e) => done(e);
    const onAbort = () => { cleanup(); reject(new DOMException('aborted', 'AbortError')); };
    const cleanup = () => {
      window.removeEventListener('keydown', onKey);
      clickEl?.removeEventListener('click', onClick);
      signal?.removeEventListener('abort', onAbort);
    };
    const done = (e) => { cleanup(); resolve(e); };
    window.addEventListener('keydown', onKey);
    clickEl?.addEventListener('click', onClick);
    signal?.addEventListener('abort', onAbort);
    if (signal?.aborted) onAbort();
  });
}

/** Abortable sleep. */
export function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}
