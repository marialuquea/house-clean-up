import { html, useRef, useState } from '../deps.js';
import { photoUrl } from '../lib/supabase.js';

export default function Carousel({ photos, alt, emoji }) {
  const [index, setIndex] = useState(0);
  const ref = useRef(null);

  const onScroll = () => {
    const el = ref.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };
  const goTo = (i) => ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: 'smooth' });

  return html`<div class="carousel">
    <div class="slides" ref=${ref} onScroll=${onScroll}>
      ${photos.length
        ? photos.map(
            (p, i) =>
              html`<img key=${p.path} src=${photoUrl(p.path)} alt=${`${alt}, photo ${i + 1}`} loading=${i ? 'lazy' : 'eager'} />`,
          )
        : html`<div class="placeholder" aria-hidden="true">${emoji}</div>`}
    </div>
    ${photos.length > 1 &&
    html`<div class="dots">
      ${photos.map(
        (p, i) =>
          html`<button key=${p.path} type="button" class=${i === index ? 'on' : ''} aria-label=${`Photo ${i + 1}`} onClick=${() => goTo(i)}></button>`,
      )}
    </div>`}
  </div>`;
}
