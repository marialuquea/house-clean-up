import { html, useEffect, useRef, useState } from '../deps.js';
import Toast from '../components/Toast.js';
import { MAX_PHOTOS, PHOTO_BUCKET } from '../lib/config.js';
import { digitsOnly } from '../lib/format.js';
import { compressImage, extFor } from '../lib/image.js';
import { ITEM_SELECT, photoUrl, sortedPhotos, supabase } from '../lib/supabase.js';
import { href, navigate } from '../router.js';

// A photo slot is either already in storage ({kind:'existing', path}) or picked on this
// device ({kind:'new', file, preview, status: idle|uploading|done|error, path?}).

const MODES = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'offers', label: 'Offers' },
  { value: 'free', label: 'Free' },
];

const uid = () => crypto.randomUUID();
const toInt = (s) => (s.trim() ? Number(s) : null);

export default function ItemForm({ id }) {
  const editing = Boolean(id);

  const [loaded, setLoaded] = useState(!editing);
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('offers');
  const [asking, setAsking] = useState('');
  const [original, setOriginal] = useState('');
  const [description, setDescription] = useState('');
  const [showDesc, setShowDesc] = useState(false);
  const [slots, setSlots] = useState([]);
  const [removedPaths, setRemovedPaths] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const newItemId = useRef(null);
  const fileInput = useRef(null);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  // Load existing item when editing
  useEffect(() => {
    if (!id) return;
    supabase
      .from('items')
      .select(ITEM_SELECT)
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return setFormError("Couldn't load this item.");
        setTitle(data.title);
        setMode(data.mode);
        setAsking(data.asking_price ? String(data.asking_price) : '');
        setOriginal(data.original_price ? String(data.original_price) : '');
        setDescription(data.description ?? '');
        setShowDesc(Boolean(data.description));
        setSlots(sortedPhotos(data).map((p) => ({ key: uid(), kind: 'existing', path: p.path })));
        setLoaded(true);
      });
  }, [id]);

  // Free preview object URLs on unmount
  useEffect(() => () => slotsRef.current.forEach((s) => s.kind === 'new' && URL.revokeObjectURL(s.preview)), []);

  const patchSlot = (key, patch) =>
    setSlots((prev) => prev.map((s) => (s.key === key && s.kind === 'new' ? { ...s, ...patch } : s)));

  const addFiles = (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const room = MAX_PHOTOS - slots.length;
    if (files.length > room) setToast(`Max ${MAX_PHOTOS} photos`);
    const added = files.slice(0, room).map((file) => ({
      key: uid(),
      kind: 'new',
      file,
      preview: URL.createObjectURL(file),
      status: 'idle',
    }));
    setSlots([...slots, ...added]);
  };

  const removeSlot = (key) => {
    const s = slots.find((x) => x.key === key);
    if (!s) return;
    if (s.kind === 'new') {
      URL.revokeObjectURL(s.preview);
      // Already uploaded on a failed attempt: delete it so it doesn't sit orphaned in storage.
      if (s.path) supabase.storage.from(PHOTO_BUCKET).remove([s.path]);
    } else {
      setRemovedPaths((p) => [...p, s.path]);
    }
    setSlots(slots.filter((x) => x.key !== key));
  };

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= slots.length) return;
    const next = [...slots];
    [next[i], next[j]] = [next[j], next[i]];
    setSlots(next);
  };

  const validate = () => {
    const e = {};
    if (!title.trim()) e.title = 'Give it a name';
    if (mode === 'fixed' && !(Number(asking) > 0)) e.asking = 'Fixed price needs a price';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const resetForNext = () => {
    slotsRef.current.forEach((s) => s.kind === 'new' && URL.revokeObjectURL(s.preview));
    setTitle('');
    setAsking('');
    setOriginal('');
    setDescription('');
    setShowDesc(false);
    setSlots([]);
    setRemovedPaths([]);
    setErrors({});
    setFormError('');
    newItemId.current = null;
    // mode is kept on purpose, for listing several similar things in a row
  };

  const uploadSlot = async (s, itemId) => {
    if (s.status === 'done' && s.path) return s.path;
    patchSlot(s.key, { status: 'uploading' });
    try {
      const blob = await compressImage(s.file);
      const path = `${itemId}/${uid()}.${extFor(blob)}`;
      const { error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
      if (error) throw error;
      patchSlot(s.key, { status: 'done', path });
      return path;
    } catch {
      patchSlot(s.key, { status: 'error' });
      return null;
    }
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    setFormError('');

    if (!id && !newItemId.current) newItemId.current = uid();
    const itemId = id ?? newItemId.current;

    // 1. Upload all photos in parallel. The item is saved only if every upload succeeded.
    const paths = await Promise.all(slots.map((s) => (s.kind === 'existing' ? s.path : uploadSlot(s, itemId))));
    if (paths.some((p) => p === null)) {
      setBusy(false);
      setFormError('Some photos failed to upload. Tap Retry on them, or "Post it" again.');
      return;
    }

    // 2. Save the item
    const row = {
      title: title.trim(),
      mode,
      asking_price: mode === 'free' ? null : toInt(asking),
      original_price: toInt(original),
      description: description.trim() || null,
    };
    const { error: itemErr } = editing
      ? await supabase.from('items').update(row).eq('id', itemId)
      : await supabase.from('items').insert({ id: itemId, ...row });
    if (itemErr) {
      setBusy(false);
      setFormError(`Couldn't save: ${itemErr.message}`);
      return;
    }

    // 3. Replace photo rows in their new order (first = cover)
    let { error: photoErr } = await supabase.from('item_photos').delete().eq('item_id', itemId);
    if (!photoErr && paths.length) {
      ({ error: photoErr } = await supabase
        .from('item_photos')
        .insert(paths.map((path, position) => ({ item_id: itemId, path, position }))));
    }
    if (photoErr) {
      setBusy(false);
      setFormError(`Saved, but the photos didn't attach: ${photoErr.message}. Tap save again.`);
      return;
    }

    if (removedPaths.length) await supabase.storage.from(PHOTO_BUCKET).remove(removedPaths);
    setBusy(false);

    if (editing) {
      navigate(`/admin/item/${itemId}`);
    } else {
      resetForNext();
      setToast('Posted ✨');
      window.scrollTo(0, 0);
    }
  };

  const newSlots = slots.filter((s) => s.kind === 'new');
  const uploadedCount = newSlots.filter((s) => s.status === 'done').length;

  if (!loaded) return html`<div class="wrap narrow"><div class="empty">${formError || 'Loading…'}</div></div>`;

  const moneyInput = (inputId, value, set) => html`<div class="money">
    <span>£</span>
    <input id=${inputId} inputmode="numeric" pattern="[0-9]*" value=${value}
      onInput=${(e) => set((e.target.value = digitsOnly(e.target.value)))} />
  </div>`;

  const originalField = html`<div class="field">
    <label for="i-original">Original price <span class="help">(optional)</span></label>
    ${moneyInput('i-original', original, setOriginal)}
  </div>`;

  return html`<div class="wrap narrow">
    <a class="back" href=${href(editing ? `/admin/item/${id}` : '/admin')}>← ${editing ? 'Back to item' : 'Back to admin'}</a>
    <h1 class="page-title">${editing ? 'Edit item' : 'Add item'}</h1>

    <form onSubmit=${submit} novalidate class="item-form">
      <div class="photo-grid">
        ${slots.map(
          (s, i) => html`<div key=${s.key} class=${`photo-slot ${s.kind === 'new' ? s.status : ''}`}>
            <img src=${s.kind === 'new' ? s.preview : photoUrl(s.path)} alt=${`Photo ${i + 1}`} />
            ${i === 0 && html`<span class="cover-tag">Cover</span>`}
            ${s.status === 'uploading' && html`<span class="slot-state">⏳</span>`}
            ${s.status === 'done' && html`<span class="slot-state">✓</span>`}
            ${s.status === 'error' &&
            html`<button type="button" class="slot-retry" onClick=${() => submit()}>Retry</button>`}
            <div class="slot-tools">
              <button type="button" aria-label="Move left" disabled=${i === 0 || busy} onClick=${() => move(i, -1)}>←</button>
              <button type="button" aria-label="Remove photo" disabled=${busy} onClick=${() => removeSlot(s.key)}>✕</button>
              <button type="button" aria-label="Move right" disabled=${i === slots.length - 1 || busy}
                onClick=${() => move(i, 1)}>→</button>
            </div>
          </div>`,
        )}
        ${slots.length < MAX_PHOTOS &&
        html`<button type="button" class="photo-add" disabled=${busy} onClick=${() => fileInput.current?.click()}>
          <span>📸</span>${slots.length ? 'Add more' : 'Add photos'}
          <small>${slots.length}/${MAX_PHOTOS}</small>
        </button>`}
        <input ref=${fileInput} type="file" accept="image/*" multiple hidden onChange=${addFiles} />
      </div>

      <div class="field">
        <label for="i-title">Title</label>
        <input id="i-title" maxlength="60" value=${title} placeholder="e.g. Grey 3-seater sofa"
          autocapitalize="sentences" onInput=${(e) => setTitle(e.target.value)} />
        ${errors.title && html`<span class="err">${errors.title}</span>`}
      </div>

      <div class="field">
        <span class="label">How are you selling it?</span>
        <div class="mode-chips" role="radiogroup" aria-label="Price mode">
          ${MODES.map(
            (m) => html`<button key=${m.value} type="button" role="radio" aria-checked=${mode === m.value}
              class=${`mode-chip ${m.value} ${mode === m.value ? 'on' : ''}`} onClick=${() => setMode(m.value)}>
              ${m.label}
            </button>`,
          )}
        </div>
      </div>

      ${mode !== 'free'
        ? html`<div class="two-col">
            <div class="field">
              <label for="i-asking">Asking price${mode === 'offers' && html`<span class="help"> (optional)</span>`}</label>
              ${moneyInput('i-asking', asking, setAsking)}
              ${errors.asking && html`<span class="err">${errors.asking}</span>`}
            </div>
            ${originalField}
          </div>`
        : originalField}

      ${showDesc
        ? html`<div class="field">
            <label for="i-desc">Description</label>
            <textarea id="i-desc" maxlength="500" value=${description} placeholder="Condition, size, collection notes…"
              onInput=${(e) => setDescription(e.target.value)}></textarea>
            <span class="help">${description.length}/500</span>
          </div>`
        : html`<button type="button" class="link add-desc" onClick=${() => setShowDesc(true)}>+ Add description</button>`}

      ${busy && newSlots.length > 0 &&
      html`<div class="progress" aria-label="Upload progress">
        <div style=${{ width: `${(uploadedCount / newSlots.length) * 100}%` }}></div>
        <span>Uploading ${uploadedCount}/${newSlots.length}</span>
      </div>`}
      ${formError && html`<p class="err" role="alert">${formError}</p>`}

      <button class="btn big block" disabled=${busy}>${busy ? 'Posting…' : editing ? 'Save' : 'Post it'}</button>
    </form>

    <${Toast} message=${toast} onDone=${() => setToast(null)} />
  </div>`;
}
