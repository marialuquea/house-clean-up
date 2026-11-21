import { html, useEffect, useState } from '../deps.js';
import Sheet from './Sheet.js';
import { PAGE_LOADED_AT } from '../lib/config.js';
import { isValidContact } from '../lib/contact.js';
import { digitsOnly, fmtDate, gbp, todayIso } from '../lib/format.js';
import { loadLocal, saveLocal } from '../lib/storage.js';
import { supabase } from '../lib/supabase.js';
import { buyerToOwnerMessage, ownerWhatsAppLink } from '../lib/whatsapp.js';
import { href } from '../router.js';

const BUYER_KEY = 'clearout:buyer';
const BOT_DELAY_MS = 3000;

export default function RequestSheet({ item, onClose }) {
  const [saved] = useState(() => loadLocal(BUYER_KEY, {}));
  const [name, setName] = useState(saved.name ?? '');
  const [contact, setContact] = useState(saved.contact ?? '');
  const [amount, setAmount] = useState('');
  const [dates, setDates] = useState([]);
  const [note, setNote] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [ready, setReady] = useState(Date.now() - PAGE_LOADED_AT > BOT_DELAY_MS);

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setReady(true), BOT_DELAY_MS - (Date.now() - PAGE_LOADED_AT));
    return () => clearTimeout(t);
  }, [ready]);

  const isOffer = item.mode === 'offers';
  const backup = item.status === 'reserved';

  const addDate = (e) => {
    const v = e.target.value;
    if (v && !dates.includes(v)) setDates([...dates, v].sort());
    e.target.value = '';
  };

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = 'What should I call you?';
    if (!isValidContact(contact)) e.contact = 'Pop in a WhatsApp number or an email so I can reach you.';
    if (isOffer && !(Number(amount) > 0)) e.amount = 'Your offer in whole pounds, e.g. 35.';
    if (!dates.length) e.dates = 'Add at least one day you could pick it up.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!ready || busy || !validate()) return;
    const details = {
      name: name.trim(),
      contact: contact.trim(),
      amount: isOffer ? Number(amount) : item.mode === 'fixed' ? item.asking_price : null,
      dates,
      note: note.trim(),
    };
    if (honeypot) return setSent(details); // bots get a fake success

    setBusy(true);
    setSubmitError('');
    const { error } = await supabase.from('requests').insert({
      item_id: item.id,
      name: details.name,
      contact: details.contact,
      amount: details.amount,
      note: details.note || null,
      pickup_dates: details.dates,
    });
    setBusy(false);
    if (error) {
      setSubmitError(
        error.message.includes('no longer available')
          ? "Ah, this one's just gone. Have a look at the rest!"
          : "Couldn't send that. Check your connection and try again.",
      );
      return;
    }
    saveLocal(BUYER_KEY, { name: details.name, contact: details.contact });
    setSent(details);
  };

  if (sent) {
    const msg = buyerToOwnerMessage(item, sent);
    return html`<${Sheet} title="Request sent" onClose=${onClose}>
      <h2>Got it! 🤞</h2>
      <p class="sub">I'll message you if it's yours. Fingers crossed!</p>
      <p class="sub">Want to make sure I see it quickly? Send me a WhatsApp with your details, it's all written for you:</p>
      <div class="preview">${msg}</div>
      <div class="actions">
        <a class="btn wa big" href=${ownerWhatsAppLink(msg)} target="_blank" rel="noopener noreferrer">Send me a WhatsApp</a>
        <a class="btn ghost" href=${href('/')}>Back to everything</a>
      </div>
    <//>`;
  }

  const sub =
    item.mode === 'fixed'
      ? `${gbp(item.asking_price ?? 0)}, no haggling needed.`
      : item.mode === 'free'
        ? 'Free to a good home.'
        : item.asking_price
          ? `Asking ${gbp(item.asking_price)}, but make me an offer.`
          : 'Name your price.';

  const err = (k) => errors[k] && html`<span class="err">${errors[k]}</span>`;
  // Hide a field's error as soon as it's edited
  const clear = (k) => errors[k] && setErrors({ ...errors, [k]: undefined });

  return html`<${Sheet} title=${item.title} onClose=${onClose}>
    <form onSubmit=${submit} novalidate>
      <h2>${backup ? `Backup list: ${item.title}` : item.title}</h2>
      <p class="sub">${sub}</p>

      <div class="field">
        <label for="r-name">Name</label>
        <input id="r-name" autocomplete="name" maxlength="60" value=${name} onInput=${(e) => (setName(e.target.value), clear('name'))} />
        ${err('name')}
      </div>

      <div class="field">
        <label for="r-contact">WhatsApp number or email</label>
        <input id="r-contact" autocomplete="tel" inputmode="email" maxlength="100" value=${contact} onInput=${(e) => (setContact(e.target.value), clear('contact'))} />
        ${err('contact')}
      </div>

      ${isOffer &&
      html`<div class="field">
        <label for="r-amount">Your offer</label>
        <div class="money">
          <span>£</span>
          <input
            id="r-amount"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="off"
            placeholder=${item.asking_price ? String(item.asking_price) : ''}
            value=${amount}
            onInput=${(e) => (setAmount((e.target.value = digitsOnly(e.target.value))), clear('amount'))}
          />
        </div>
        <span class="help">Your max price. I'll be in touch if it's yours.</span>
        ${err('amount')}
      </div>`}

      <div class="field">
        <label for="r-date">When can you pick it up?</label>
        <input id="r-date" type="date" min=${todayIso()} onChange=${(e) => (addDate(e), clear('dates'))} />
        ${dates.length > 0 &&
        html`<div class="chips">
          ${dates.map(
            (d) => html`<button key=${d} type="button" class="chip" aria-label=${`Remove ${fmtDate(d)}`}
              onClick=${() => setDates(dates.filter((x) => x !== d))}>${fmtDate(d)} <b>✕</b></button>`,
          )}
        </div>`}
        <span class="help">Pick a date, then pick another. Add every day that works for you.</span>
        ${err('dates')}
      </div>

      <div class="field">
        <label for="r-note">Anything I should know? <span class="help">(optional)</span></label>
        <textarea id="r-note" maxlength="300" placeholder="e.g. when you can collect, if you'll bring a van"
          value=${note} onInput=${(e) => setNote(e.target.value)}></textarea>
      </div>

      <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"
        value=${honeypot} onInput=${(e) => setHoneypot(e.target.value)} />

      ${submitError && html`<p class="err" role="alert">${submitError}</p>`}

      <div class="actions">
        <button type="submit" class="btn big" disabled=${!ready || busy}>
          ${busy ? 'Sending…' : backup ? 'Join the backup list' : isOffer ? 'Send my offer' : 'Send request'}
        </button>
        <button type="button" class="btn ghost" onClick=${onClose}>Cancel</button>
      </div>
    </form>
  <//>`;
}
