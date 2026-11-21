export const gbp = (n) => `£${Number(n).toLocaleString('en-GB')}`;

export function priceLabel(item) {
  switch (item.mode) {
    case 'fixed':
      return gbp(item.asking_price ?? 0);
    case 'offers':
      return item.asking_price ? `Offers · ask ${gbp(item.asking_price)}` : 'Make an offer';
    default:
      return 'Free';
  }
}

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** "2026-11-29" → "Sun 29 Nov" */
export function fmtDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function todayIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** Newest first, gone items sink to the bottom. */
export function sortForGrid(items) {
  return [...items].sort((a, b) => {
    const ga = a.status === 'gone' ? 1 : 0;
    const gb = b.status === 'gone' ? 1 : 0;
    if (ga !== gb) return ga - gb;
    return b.created_at.localeCompare(a.created_at);
  });
}

export function itemLink(id) {
  return `${location.href.split('#')[0]}#/item/${id}`;
}

export const digitsOnly = (s, max = 6) => s.replace(/\D/g, '').slice(0, max);
