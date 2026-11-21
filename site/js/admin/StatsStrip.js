import { html } from '../deps.js';
import { gbp } from '../lib/format.js';

export default function StatsStrip({ items, requests }) {
  const listed = items.filter((i) => i.status !== 'hidden').length;
  const reserved = items.filter((i) => i.status === 'reserved').length;
  const gone = items.filter((i) => i.status === 'gone').length;
  const agreed = requests.filter((r) => r.status === 'accepted').reduce((sum, r) => sum + (r.final_amount ?? 0), 0);
  return html`<p class="stats-strip">${listed} listed · ${reserved} reserved · ${gone} gone · ${gbp(agreed)} agreed</p>`;
}
