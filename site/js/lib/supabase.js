import { createClient } from '../deps.js';
import { PHOTO_BUCKET, SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from './config.js';

export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'http://localhost:54321',
  isConfigured ? SUPABASE_ANON_KEY : 'missing-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
);

export function photoUrl(path) {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export const ITEM_SELECT = '*, item_photos(id, path, position)';

export function sortedPhotos(item) {
  return [...(item.item_photos ?? [])].sort((a, b) => a.position - b.position);
}
