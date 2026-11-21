import { html, useCallback, useEffect, useState } from '../deps.js';
import Carousel from '../components/Carousel.js';
import PriceBadge from '../components/PriceBadge.js';
import RequestSheet from '../components/RequestSheet.js';
import { OWNER_NAME } from '../lib/config.js';
import { gbp, itemLink, priceLabel } from '../lib/format.js';
import { ITEM_SELECT, sortedPhotos, supabase } from '../lib/supabase.js';
import { href } from '../router.js';

function ctaLabel(item) {
  if (item.status === 'reserved') return 'Join the backup list';
  if (item.mode === 'fixed') return `I'll take it for ${gbp(item.asking_price ?? 0)}`;
  if (item.mode === 'offers') return 'Make an offer';
  return "I'd love this";
}

export default function ItemPage({ id }) {
  const [item, setItem] = useState(undefined); // undefined = loading, null = not found
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const [itemRes, statsRes] = await Promise.all([
      supabase.from('items').select(ITEM_SELECT).eq('id', id).neq('status', 'hidden').maybeSingle(),
      supabase.rpc('public_item_stats', { p_item_id: id }),
    ]);
    if (itemRes.error) return setError(true);
    setItem(itemRes.data ?? null);
    setStats(Array.isArray(statsRes.data) ? statsRes.data[0] ?? null : null);
  }, [id]);

  useEffect(() => {
    window.scrollTo(0, 0);
    load();
  }, [load]);

  useEffect(() => {
    if (item) document.title = `${item.title} · ${OWNER_NAME}'s clear-out`;
  }, [item]);

  const share = async () => {
    const url = itemLink(item.id);
    if (navigator.share) {
      try {
        await navigator.share({ title: item.title, text: `${item.title} (${priceLabel(item)})`, url });
      } catch {
        /* cancelled */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  const back = html`<a class="back" href=${href('/')}>← Back to everything</a>`;

  if (error)
    return html`<div class="wrap">${back}
      <div class="empty">
        Couldn't load this one. Try again in a sec.
        <div><button class="btn" onClick=${load}>Try again</button></div>
      </div>
    </div>`;
  if (item === undefined) return html`<div class="wrap">${back}<div class="empty">Loading…</div></div>`;
  if (item === null)
    return html`<div class="wrap">${back}<div class="empty">Hmm, can't find that one. It may have been taken down.</div></div>`;

  const gone = item.status === 'gone';
  const count = stats?.request_count ?? 0;

  return html`<div class="wrap">
    ${back}
    <article class="item">
      <${Carousel} photos=${sortedPhotos(item)} alt=${item.title} emoji=${item.mode === 'free' ? '🎁' : '📦'} />
      <div class="info">
        <h1>${item.title}</h1>
        <${PriceBadge} item=${item} />

        ${gone && html`<div class="banner">This one's found a new home 🏡</div>`}
        ${item.status === 'reserved' &&
        html`<div class="banner reserved">
          Reserved for someone, but plans change. Join the backup list and I'll message you if it falls through.
        </div>`}

        ${!gone && item.mode === 'offers' &&
        html`<p class="stat">
          ${stats?.top_offer
            ? html`Top offer so far: <strong>${gbp(stats.top_offer)}</strong>`
            : 'No offers yet, be the first'}
        </p>`}
        ${!gone && count > 0 &&
        html`<p class="stat muted">${count} ${count === 1 ? 'person has' : 'people have'} asked</p>`}

        ${item.description && html`<p class="desc">${item.description}</p>`}

        <div class="actions">
          ${!gone && html`<button class="btn big" onClick=${() => setSheetOpen(true)}>${ctaLabel(item)}</button>`}
          <button class="btn ghost" onClick=${share}>${copied ? 'Link copied ✓' : 'Share'}</button>
        </div>
      </div>
    </article>

    ${sheetOpen &&
    html`<${RequestSheet}
      item=${item}
      onClose=${() => {
        setSheetOpen(false);
        load();
      }}
    />`}
  </div>`;
}
