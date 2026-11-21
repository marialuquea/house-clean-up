import { html, useCallback, useEffect, useState } from '../deps.js';
import ItemCard, { SkeletonCard } from '../components/ItemCard.js';
import { OWNER_NAME } from '../lib/config.js';
import { sortForGrid } from '../lib/format.js';
import { ITEM_SELECT, supabase } from '../lib/supabase.js';

export default function Home() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    setItems(null);
    const { data, error } = await supabase
      .from('items')
      .select(ITEM_SELECT)
      .neq('status', 'hidden')
      .order('created_at', { ascending: false });
    if (error) return setError(true);
    setItems(sortForGrid(data));
  }, []);

  useEffect(() => {
    document.title = `${OWNER_NAME}'s clear-out`;
    load();
  }, [load]);

  let body;
  if (error) {
    body = html`<div class="empty">
      Couldn't load the goodies. Try again in a sec.
      <div><button class="btn" onClick=${load}>Try again</button></div>
    </div>`;
  } else if (!items) {
    body = html`<div class="grid">${Array.from({ length: 6 }, (_, i) => html`<${SkeletonCard} key=${i} />`)}</div>`;
  } else if (!items.some((i) => i.status !== 'gone')) {
    body = html`<div class="empty">All gone! Thanks everyone 💛</div>`;
  } else {
    body = html`<div class="grid">${items.map((it) => html`<${ItemCard} key=${it.id} item=${it} />`)}</div>`;
  }

  return html`<div class="wrap">
    <header class="hero">
      <h1>${OWNER_NAME}'s clear-out</h1>
      <p>Everything must go (to a good home). Tap anything you like.</p>
    </header>
    ${body}
  </div>`;
}
