import { html, useCallback, useEffect, useState } from '../deps.js';
import PriceBadge from '../components/PriceBadge.js';
import { ITEM_SELECT, photoUrl, sortedPhotos, supabase } from '../lib/supabase.js';
import { href } from '../router.js';
import StatsStrip from './StatsStrip.js';

const STATUS_LABEL = { available: 'Available', reserved: 'Reserved', gone: 'Gone', hidden: 'Hidden' };

export default function Dashboard() {
  const [items, setItems] = useState(null);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [itemsRes, reqRes] = await Promise.all([
      supabase.from('items').select(ITEM_SELECT).order('created_at', { ascending: false }),
      supabase.from('requests').select('item_id, status, final_amount'),
    ]);
    if (itemsRes.error || reqRes.error) return setError("Couldn't load. Refresh to try again.");
    setItems(itemsRes.data);
    setRequests(reqRes.data);
  }, []);

  useEffect(() => {
    document.title = 'Admin · clear-out';
    load();
  }, [load]);

  const pendingFor = (id) => requests.filter((r) => r.item_id === id && r.status === 'pending').length;
  const activeFor = (id) => requests.filter((r) => r.item_id === id && r.status !== 'declined').length;

  const sorted = items
    ? [...items].sort((a, b) => {
        const pa = pendingFor(a.id) > 0 ? 0 : 1;
        const pb = pendingFor(b.id) > 0 ? 0 : 1;
        if (pa !== pb) return pa - pb;
        const ga = a.status === 'gone' ? 1 : 0;
        const gb = b.status === 'gone' ? 1 : 0;
        if (ga !== gb) return ga - gb;
        return b.created_at.localeCompare(a.created_at);
      })
    : null;

  return html`<div class="wrap">
    <header class="admin-head">
      <h1>Your clear-out</h1>
      <div class="row">
        <a href=${href('/')} class="link">View site</a>
        <button class="link" onClick=${() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </header>

    ${items && html`<${StatsStrip} items=${items} requests=${requests} />`}

    <a href=${href('/admin/new')} class="btn big block">+ Add item</a>

    ${error && html`<p class="err">${error}</p>`}
    ${!sorted && !error && html`<div class="empty">Loading…</div>`}
    ${sorted && sorted.length === 0 && html`<div class="empty">Nothing listed yet. Snap your first thing! 📸</div>`}

    <ul class="admin-list">
      ${sorted?.map((it) => {
        const cover = sortedPhotos(it)[0];
        const pending = pendingFor(it.id);
        const total = activeFor(it.id);
        return html`<li key=${it.id}>
          <a href=${href(`/admin/item/${it.id}`)} class=${`admin-row ${it.status}`}>
            <div class="mini-thumb">
              ${cover ? html`<img src=${photoUrl(cover.path)} alt="" loading="lazy" />` : html`<span>📦</span>`}
            </div>
            <div class="grow">
              <strong>${it.title}</strong>
              <${PriceBadge} item=${it} />
            </div>
            <div class="right">
              <span class=${`pill ${it.status}`}>${STATUS_LABEL[it.status]}</span>
              ${pending > 0
                ? html`<span class="count new">${pending} new</span>`
                : total > 0
                  ? html`<span class="count">${total}</span>`
                  : null}
            </div>
          </a>
        </li>`;
      })}
    </ul>
  </div>`;
}
