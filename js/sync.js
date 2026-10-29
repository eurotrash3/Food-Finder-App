// Optional cloud sync via Supabase + Google sign-in. Does nothing until js/config.js is filled in.
// The whole app state is stored as one JSON row per user; the newest copy wins.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { state, onSave, replaceState } from './store.js';

let client = null;
let user = null;
let pushTimer = null;
let onChange = () => {};

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const currentUser = () => user;

export async function initSync(changed) {
  onChange = changed;
  if (!isConfigured()) return;
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: 'pkce', detectSessionInUrl: true } });
  } catch (err) {
    console.warn('Could not load Supabase - staying offline', err);
    return;
  }
  client.auth.onAuthStateChange((_event, session) => {
    const next = session?.user ?? null;
    const signedIn = next && next.id !== user?.id;
    user = next;
    // Remove the ?code= left behind by the Google redirect.
    if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash);
    if (signedIn) pull();
    onChange();
  });
  onSave(() => {
    if (!user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1500);
  });
}

async function pull() {
  const { data, error } = await client.from('user_state').select('data').eq('user_id', user.id).maybeSingle();
  if (error) return console.warn('Sync pull failed', error);
  if (data?.data && (data.data.updatedAt || 0) > (state.updatedAt || 0)) {
    replaceState(data.data);
    onChange();
  } else {
    push();
  }
}

async function push() {
  if (!client || !user) return;
  const { error } = await client.from('user_state')
    .upsert({ user_id: user.id, data: state, updated_at: new Date().toISOString() });
  if (error) console.warn('Sync push failed', error);
}

export async function signIn() {
  if (!client) return;
  await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname },
  });
}

export async function signOut() {
  if (!client) return;
  await client.auth.signOut();
  user = null;
  onChange();
}
