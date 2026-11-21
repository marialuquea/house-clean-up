const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (s) => EMAIL_RE.test(s.trim());
export const phoneDigits = (s) => s.replace(/\D/g, '');
export const isPhone = (s) => !isEmail(s) && /^[\d\s()+-]+$/.test(s.trim()) && phoneDigits(s).length >= 7;
export const isValidContact = (s) => isEmail(s) || isPhone(s);

/**
 * wa.me needs full international format without "+".
 * UK numbers typed as 07… become 447…; 00… prefixes are stripped.
 */
export function toWhatsAppNumber(raw) {
  const trimmed = raw.trim();
  const d = phoneDigits(trimmed);
  if (trimmed.startsWith('+')) return d;
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return '44' + d.slice(1);
  return d;
}

export const whatsAppLink = (number, message) => `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

/** Link to message a buyer: WhatsApp for phone numbers, mailto for emails. */
export function contactLink(contact, message, subject) {
  if (isEmail(contact)) {
    return {
      kind: 'email',
      href: `mailto:${contact.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
    };
  }
  return { kind: 'whatsapp', href: whatsAppLink(toWhatsAppNumber(contact), message) };
}
