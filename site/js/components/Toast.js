import { html, useEffect } from '../deps.js';

export default function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [message]);
  if (!message) return null;
  return html`<div class="toast" role="status">${message}</div>`;
}
