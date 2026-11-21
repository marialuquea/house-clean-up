import { OWNER_NAME, OWNER_WHATSAPP } from './config.js';
import { whatsAppLink } from './contact.js';
import { fmtDate, gbp, itemLink } from './format.js';

/** Pre-written message from a buyer to Maria, with everything she needs. */
export function buyerToOwnerMessage(item, r) {
  const backup = item.status === 'reserved';
  const lines = [
    `Hi ${OWNER_NAME}! 👋 ${backup ? "I've joined the backup list for" : "I've just asked for"} the *${item.title}* on your clear-out.`,
    '',
    `*Name:* ${r.name}`,
    `*Contact:* ${r.contact}`,
  ];
  if (item.mode === 'fixed') lines.push(`*Price:* ${gbp(item.asking_price ?? 0)} (asking price)`);
  if (item.mode === 'offers')
    lines.push(`*My offer:* ${gbp(r.amount ?? 0)}${item.asking_price ? ` (asking ${gbp(item.asking_price)})` : ''}`);
  if (item.mode === 'free') lines.push('*Price:* Free 🎁');
  if (r.dates.length) lines.push(`*I can pick it up:* ${r.dates.map(fmtDate).join(', ')}`);
  if (r.note) lines.push(`*Note:* ${r.note}`);
  lines.push('', itemLink(item.id));
  return lines.join('\n');
}

export const ownerWhatsAppLink = (message) => whatsAppLink(OWNER_WHATSAPP, message);

/** Message from Maria to a buyer when picking them. */
export const ownerToBuyerMessage = (name, title) =>
  `Hi ${name}! It's ${OWNER_NAME} about the ${title} — it's yours if you still want it 🙂`;
