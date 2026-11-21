import { html, useCallback, useEffect, useState } from '../deps.js';
import PriceBadge from '../components/PriceBadge.js';
import { PHOTO_BUCKET } from '../lib/config.js';
import { contactLink } from '../lib/contact.js';
import { digitsOnly, fmtDate, gbp, timeAgo } from '../lib/format.js';
import { ITEM_SELECT, photoUrl, sortedPhotos, supabase } from '../lib/supabase.js';
import { ownerToBuyerMessage } from '../lib/whatsapp.js';
import { href, navigate } from '../router.js';

const STATUS_LABEL = { pending: 'New', accepted: 'Accepted', backup: 'Backup', declined: 'Declined' };

/** Offers by amount (high first), otherwise first come first served. Accepted on top, declined at the bottom. */
function sortRequests(item, reqs) {
  const rank = (r) => (r.status === 'accepted' ? 0 : r.status === 'declined' ? 2 : 1);
  return [...reqs].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (item.mode === 'offers' && (b.amount ?? 0) !== (a.amount ?? 0)) return (b.amount ?? 0) - (a.amount ?? 0);
    return a.created_at.localeCompare(b.created_at);
  });
}

export default function AdminItem({ id }) {
  const [item, setItem] = useState(undefined);
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [finals, setFinals] = useState({});

  const load = useCallback(async () => {
    const [itemRes, reqRes] = await Promise.all([
      supabase.from('items').select(ITEM_SELECT).eq('id', id).maybeSingle(),
      supabase.from('requests').select('*').eq('item_id', id),
    ]);
    if (itemRes.error || reqRes.error) return setError("Couldn't load. Try again.");
    setItem(itemRes.data ?? null);
    setRequests(reqRes.data);
    setFinals(Object.fromEntries(reqRes.data.map((r) => [r.id, r.final_amount != null ? String(r.final_amount) : ''])));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    const { error } = await fn();
    if (error) setError(error.message);
    await load();
    setBusy(false);
  };

  const back = html`<a class="back" href=${href('/admin')}>← Back to admin</a>`;
  if (item === undefined) return html`<div class="wrap narrow">${back}<div class="empty">${error || 'Loading…'}</div></div>`;
  if (item === null) return html`<div class="wrap narrow">${back}<div class="empty">Item not found.</div></div>`;

  const sorted = sortRequests(item, requests);
  const nextUp = item.status === 'available' ? sorted.find((r) => r.status === 'pending') : undefined;
  const cover = sortedPhotos(item)[0];

  const accept = (r) => run(() => supabase.rpc('admin_accept_request', { p_request_id: r.id }));
  const decline = (r) => run(() => supabase.from('requests').update({ status: 'declined' }).eq('id', r.id));
  const markGone = () =>
    run(() => supabase.from('items').update({ status: 'gone', gone_at: new Date().toISOString() }).eq('id', item.id));
  const fellThrough = () => run(() => supabase.rpc('admin_fell_through', { p_item_id: item.id }));
  const toggleHidden = () =>
    run(() =>
      supabase.from('items').update({ status: item.status === 'hidden' ? 'available' : 'hidden' }).eq('id', item.id),
    );
  const backToAvailable = () =>
    run(() => supabase.from('items').update({ status: 'available', gone_at: null }).eq('id', item.id));
  const saveFinal = (r) => {
    const v = (finals[r.id] ?? '').trim();
    const n = v ? Number(v) : null;
    if (n === r.final_amount) return;
    run(() => supabase.from('requests').update({ final_amount: n }).eq('id', r.id));
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${item.title}" and all its requests? This can't be undone.`)) return;
    setBusy(true);
    const paths = item.item_photos.map((p) => p.path);
    if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths);
    const { error } = await supabase.from('items').delete().eq('id', item.id);
    setBusy(false);
    if (error) return setError(error.message);
    navigate('/admin');
  };

  return html`<div class="wrap narrow">
    ${back}
    <section class="admin-item-head">
      <div class="mini-thumb big">${cover ? html`<img src=${photoUrl(cover.path)} alt="" />` : html`<span>📦</span>`}</div>
      <div class="grow">
        <h1>${item.title}</h1>
        <${PriceBadge} item=${item} />
        <span class=${`pill ${item.status}`}>${item.status}</span>
      </div>
    </section>

    <div class="btn-row">
      ${item.status === 'reserved' &&
      html`<button class="btn" disabled=${busy} onClick=${markGone}>Mark as gone 👋</button>
        <button class="btn ghost" disabled=${busy} onClick=${fellThrough}>Fell through</button>`}
      ${item.status === 'gone' &&
      html`<button class="btn ghost" disabled=${busy} onClick=${backToAvailable}>Undo: back to available</button>`}
      <a class="btn ghost" href=${href(`/admin/item/${item.id}/edit`)}>Edit</a>
      ${item.status !== 'reserved' &&
      html`<button class="btn ghost" disabled=${busy} onClick=${toggleHidden}>
        ${item.status === 'hidden' ? 'Unhide' : 'Hide'}
      </button>`}
      <a class="btn ghost" href=${href(`/item/${item.id}`)}>View</a>
      <button class="btn ghost danger" disabled=${busy} onClick=${remove}>Delete</button>
    </div>

    ${error && html`<p class="err" role="alert">${error}</p>`}

    <h2 class="section-title">Requests (${requests.filter((r) => r.status !== 'declined').length})</h2>
    ${sorted.length === 0 && html`<p class="muted">No requests yet. Share the link around!</p>`}

    <ul class="requests">
      ${sorted.map((r) => {
        const link = contactLink(r.contact, ownerToBuyerMessage(r.name, item.title), `${item.title} from the clear-out`);
        const wiped = r.contact === '(removed)';
        const isNext = nextUp?.id === r.id;
        return html`<li key=${r.id} class=${`request ${r.status} ${isNext ? 'next' : ''}`}>
          <div class="req-top">
            <strong>${r.name}</strong>
            ${r.amount != null && html`<span class="amount">${gbp(r.amount)}</span>`}
            <span class=${`pill ${r.status}`}>${STATUS_LABEL[r.status]}</span>
            ${isNext && html`<span class="pill next">Next up</span>`}
          </div>
          <div class="req-meta">${r.contact} · ${timeAgo(r.created_at)}</div>
          ${r.pickup_dates?.length > 0 && html`<div class="req-dates">📅 ${r.pickup_dates.map(fmtDate).join(', ')}</div>`}
          ${r.note && html`<p class="req-note">“${r.note}”</p>`}

          ${r.status === 'accepted' &&
          html`<div class="final">
            <label for=${`final-${r.id}`}>Agreed price</label>
            <div class="money small">
              <span>£</span>
              <input id=${`final-${r.id}`} inputmode="numeric" value=${finals[r.id] ?? ''}
                onInput=${(e) => setFinals({ ...finals, [r.id]: (e.target.value = digitsOnly(e.target.value)) })}
                onBlur=${() => saveFinal(r)} />
            </div>
          </div>`}

          ${!wiped &&
          html`<div class="btn-row small">
            <a class=${`btn ${link.kind === 'whatsapp' ? 'wa' : 'ghost'}`} href=${link.href} target="_blank"
              rel="noopener noreferrer">${link.kind === 'whatsapp' ? 'WhatsApp' : 'Email'}</a>
            ${r.status !== 'accepted' && item.status !== 'gone' &&
            html`<button class="btn" disabled=${busy} onClick=${() => accept(r)}>Accept</button>`}
            ${(r.status === 'pending' || r.status === 'backup') &&
            html`<button class="btn ghost" disabled=${busy} onClick=${() => decline(r)}>Decline</button>`}
          </div>`}
        </li>`;
      })}
    </ul>
  </div>`;
}
