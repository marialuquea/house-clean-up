import { html } from '../deps.js';
import { useSession } from '../lib/useSession.js';
import Login from './Login.js';
import Dashboard from './Dashboard.js';
import ItemForm from './ItemForm.js';
import AdminItem from './AdminItem.js';

export default function AdminRoutes({ path }) {
  const session = useSession();
  if (session === undefined) return html`<div class="wrap"><div class="empty">Loading…</div></div>`;
  if (!session) return html`<${Login} />`;

  if (path === '/admin/new') return html`<${ItemForm} key="new" />`;
  let m = path.match(/^\/admin\/item\/([^/]+)\/edit$/);
  if (m) return html`<${ItemForm} key=${`edit-${m[1]}`} id=${m[1]} />`;
  m = path.match(/^\/admin\/item\/([^/]+)$/);
  if (m) return html`<${AdminItem} key=${m[1]} id=${m[1]} />`;
  return html`<${Dashboard} />`;
}
