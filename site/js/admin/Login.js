import { html, useState } from '../deps.js';
import { ADMIN_EMAIL } from '../lib/config.js';
import { supabase } from '../lib/supabase.js';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password });
    setBusy(false);
    if (error) setError('Nope, try again');
  };

  return html`<div class="wrap narrow">
    <form class="login" onSubmit=${submit}>
      <h1>Admin 🔑</h1>
      <div class="field">
        <label for="pw">Password</label>
        <input id="pw" type="password" autocomplete="current-password" value=${password}
          onInput=${(e) => setPassword(e.target.value)} autofocus />
        ${error && html`<span class="err" role="alert">${error}</span>`}
      </div>
      <button class="btn big" disabled=${busy || !password}>${busy ? 'Checking…' : 'Let me in'}</button>
    </form>
  </div>`;
}
