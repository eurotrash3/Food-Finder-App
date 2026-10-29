// Cloud settings. Leave these empty to keep everything on this device only.
// See README.md for how to set each one up.

// Cloud sync with Google sign-in ("Turning on sync"). The anon key is safe to publish:
// Row Level Security in supabase/schema.sql makes sure each user can only see their own data.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Shop price comparison ("Turning on shop prices"): the URL of the deployed supabase/functions/prices
// relay, e.g. 'https://abcdefgh.supabase.co/functions/v1/prices'.
export const PRICES_URL = 'https://rcbmhtktjsntxboomjsi.supabase.co/functions/v1/prices';
