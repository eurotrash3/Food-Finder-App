// App state, saved in localStorage. sync.js mirrors it to Supabase when signed in.

const KEY = 'food-finder-v1';

const defaults = () => ({
  version: 1,
  onboarded: false,
  goals: [],
  cookCount: 4,
  people: 2,
  allergies: [],
  diets: [],
  dislikes: '',
  maxTime: 0,
  liked: [],        // recipe ids, in the order they were picked
  passed: [],
  portions: {},     // recipe id -> portions to cook
  extRecipes: {},   // TheMealDB recipes that were liked, kept so they survive reloads
  items: {},        // shopping list item key -> { checked, store }
  custom: [],       // [{ id, name }] items added by hand
  listGroup: 'aisle',
  updatedAt: 0,
});

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === 'object') return { ...defaults(), ...raw };
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
  Object.assign(state, defaults(), next);
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
