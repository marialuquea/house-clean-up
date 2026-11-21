export { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL } from '../../config.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config.js';

export const OWNER_NAME = 'Maria';
/** Maria's WhatsApp, international format without "+" (for wa.me links). */
export const OWNER_WHATSAPP = '447599973293';
export const MAX_PHOTOS = 5;
export const PHOTO_BUCKET = 'photos';

export const isConfigured =
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) && !SUPABASE_URL.includes('YOUR-PROJECT');

/** Used to delay the request submit button for bots (3s after page load). */
export const PAGE_LOADED_AT = Date.now();
