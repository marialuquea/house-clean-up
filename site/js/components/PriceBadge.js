import { html } from '../deps.js';
import { gbp, priceLabel } from '../lib/format.js';

export default function PriceBadge({ item }) {
  return html`<div class="price-row">
    <span class=${`badge ${item.mode === 'free' ? 'free' : ''}`}>${priceLabel(item)}</span>
    ${item.original_price ? html`<s class="was">${gbp(item.original_price)}</s>` : null}
  </div>`;
}
