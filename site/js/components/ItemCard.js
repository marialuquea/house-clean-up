import { html } from '../deps.js';
import { href } from '../router.js';
import { photoUrl, sortedPhotos } from '../lib/supabase.js';
import PriceBadge from './PriceBadge.js';

export default function ItemCard({ item }) {
  const cover = sortedPhotos(item)[0];
  const gone = item.status === 'gone';
  return html`<a class=${`card ${gone ? 'gone' : ''}`} href=${href(`/item/${item.id}`)}>
    <div class="thumb">
      ${cover
        ? html`<img src=${photoUrl(cover.path)} alt="" loading="lazy" decoding="async" />`
        : html`<div class="placeholder" aria-hidden="true">${item.mode === 'free' ? '🎁' : '📦'}</div>`}
      ${item.status === 'reserved' && html`<span class="ribbon">Reserved (backups welcome)</span>`}
      ${gone && html`<span class="ribbon gone">Gone 👋</span>`}
    </div>
    <div class="body">
      <h2>${item.title}</h2>
      <${PriceBadge} item=${item} />
    </div>
  </a>`;
}

export function SkeletonCard() {
  return html`<div class="card skeleton" aria-hidden="true">
    <div class="thumb"></div>
    <div class="body"><div class="sk-line"></div><div class="sk-line short"></div></div>
  </div>`;
}
