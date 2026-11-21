import { html, useEffect } from './deps.js';
import { isConfigured } from './lib/config.js';
import { navigate, usePath } from './router.js';
import Home from './pages/Home.js';
import ItemPage from './pages/ItemPage.js';
import AdminRoutes from './admin/AdminRoutes.js';

export default function App() {
  const path = usePath();
  const itemMatch = path.match(/^\/item\/([^/]+)$/);
  const isAdmin = path === '/admin' || path.startsWith('/admin/');
  const known = path === '/' || itemMatch || isAdmin;

  useEffect(() => {
    if (!known) navigate('/');
  }, [known]);

  if (!isConfigured) {
    return html`<div class="wrap">
      <div class="empty">
        Not set up yet: fill in <code>site/config.js</code> with your Supabase URL, anon key and admin email.
      </div>
    </div>`;
  }
  if (itemMatch) return html`<${ItemPage} key=${itemMatch[1]} id=${decodeURIComponent(itemMatch[1])} />`;
  if (isAdmin) return html`<${AdminRoutes} path=${path} />`;
  return html`<${Home} />`;
}
