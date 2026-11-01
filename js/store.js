// App state, saved in localStorage. sync.js mirrors it to Supabase when signed in.

const KEY = 'food-finder-v1';

const defaults = () => ({
  version: 1,
  onboarded: false,
  goals: [],
  cookCount: 4,
  people: 2,
  bases: [],        // main staples to focus on (pasta, rice...) - empty = any
  allergies: [],
  likes: [],        // FOODS ids or free text, e.g. ['chicken', 'halloumi']
  dislikes: [],
  diets: [],
  maxTime: 0,
  liked: [],        // recipe ids, in the order they were picked
  passed: [],
  portions: {},     // recipe id -> portions to cook
  extRecipes: {},   // TheMealDB recipes that were liked, kept so they survive reloads
  items: {},        // shopping list item key -> { checked, store }
  custom: [],       // [{ id, name }] items added by hand
  listGroup: 'aisle',
  pantry: { useUp: [], have: [] }, // "My kitchen": food to use up soon, and everything else in stock
  location: null,   // { lat, lon, label } last used for the shop finder
  nearest: {},      // chain id -> km to the nearest shop
  // Delivery calculator - your own estimates (fees vary by area, time slot and promotions).
  delivery: {
    takeawayMeal: 16,   // € per person for a takeaway main
    appFee: 3.5,        // € delivery fee per order on Uber Eats / Deliveroo / Just Eat / DoorDash
    servicePct: 12,     // % service fee on the food
    tip: 1,             // € tip per order
    perKm: 0.25,        // € per km driving to the shop (fuel + wear)
    fees: { tesco: 6, dunnes: 6, supervalu: 6, aldi: null, lidl: null }, // grocery delivery fee, null = not used
  },
  // Price watch: what you buy often (ticked off the list), plus items you chose to watch.
  bought: {},       // ingredient name -> { count, last: 'YYYY-MM-DD' }
  watch: [],        // names added by hand
  unwatch: [],      // often-bought names you don't want watched
  priceLog: {},     // name -> { value, basis, price, store, name, url, at } cheapest per kg/l/each at the last check
  alerts: [],       // [{ name, store, price, was, pct, offer, url, product }] from the last check
  watchCheckedAt: 0,
  updatedAt: 0,
});

// Bring data saved by older versions up to date.
function migrate(s) {
  s.pantry = { useUp: [], have: [], ...s.pantry };
  const d = defaults().delivery;
  s.delivery = { ...d, ...s.delivery, fees: { ...d.fees, ...s.delivery?.fees } };
  if (typeof s.dislikes === 'string') s.dislikes = s.dislikes.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  // The first version's built-in recipes were replaced by TheMealDB ones; drop picks that no longer exist.
  s.liked = s.liked.filter((id) => id.startsWith('mdb-'));
  s.passed = s.passed.filter((id) => id.startsWith('mdb-'));
  return s;
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === 'object') return migrate({ ...defaults(), ...raw });
  } catch { /* corrupt or missing - start fresh */ }
  return defaults();
}

export const state = load();

const listeners = new Set();
export const onSave = (fn) => listeners.add(fn);

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function save() {
  state.updatedAt = Date.now();
  persist();
  listeners.forEach((fn) => fn(state));
}

// Replace everything (used when pulling newer data from the cloud).
export function replaceState(next) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, migrate({ ...defaults(), ...next }));
  persist();
}

export function startNewWeek() {
  Object.assign(state, { liked: [], passed: [], portions: {}, extRecipes: {}, items: {}, custom: [] });
  save();
}

export function resetAll() {
  replaceState(defaults());
  save();
}
