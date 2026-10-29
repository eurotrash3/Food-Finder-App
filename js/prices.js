// Shop price comparison using BasketWatch Ireland (https://basketwatchireland.com) - Aldi, Tesco, SuperValu,
// Dunnes Stores and Lidl. Browsers can't call BasketWatch directly (no CORS, and the API key must stay secret),
// so requests go through a small relay: supabase/functions/prices (see README).

import { PRICES_URL } from './config.js';
import { CHAINS } from './data.js';

const CACHE_KEY = 'food-finder-prices-v2';
const today = () => new Date().toISOString().slice(0, 10);

// Developers can point at a local relay: localStorage.setItem('ff-prices-url', 'http://localhost:8765/bw')
export const pricesUrl = () => localStorage.getItem('ff-prices-url') || PRICES_URL;
export const pricesEnabled = () => Boolean(pricesUrl());

// Better search terms for some list items.
const QUERY = {
  onion: 'brown onions', 'red onion': 'red onions', potato: 'potatoes', carrot: 'carrots', egg: 'eggs',
  'minced beef': 'beef mince', 'chicken breast': 'chicken breast fillets', 'chicken thigh': 'chicken thighs', rice: 'long grain rice',
  tomato: 'tomatoes', 'cherry tomato': 'cherry tomatoes', mushroom: 'mushrooms', 'red pepper': 'red peppers',
  'spring onion': 'spring onions', lemon: 'lemons', lime: 'limes', cheddar: 'cheddar cheese', 'kidney beans': 'red kidney beans',
  'chicken stock': 'chicken stock cubes', 'beef stock': 'beef stock cubes', 'vegetable stock': 'vegetable stock cubes',
  bacon: 'bacon rashers', sausage: 'pork sausages', salmon: 'salmon fillets', prawn: 'prawns', 'king prawn': 'king prawns',
  cream: 'fresh cream', 'tomato purée': 'tomato puree', 'dried oregano': 'oregano', 'worcestershire sauce': 'worcestershire sauce', chicken: 'chicken fillets', beef: 'diced beef', lamb: 'diced lamb',
};

// Words that mean "not the plain ingredient" - skipped unless the ingredient name itself contains them.
const EXCLUDE = ['cooked', 'slice', 'cake', 'microwave', 'savoury', 'pilau', 'fried', 'crisp', 'soup', 'ready', 'meal', 'flavour',
  'seasoned', 'marinated', 'breaded', 'sweet', 'sauce', 'paste', 'heinz', 'dip', 'salad', 'kiev', 'nugget', 'goujon', 'burger',
  'pie', 'spread', 'powder', 'juice', 'oil', 'stuffed', 'glazed', 'smoked', 'pouch', 'snack', 'bar', 'drink', 'pickled', 'dried',
  'roast', 'baby food', 'jelly', 'sweets', 'noodle', 'pizza', 'wrap', 'sandwich', 'tikka', 'curry', 'stir fry', 'kit', 'loops',
  'rings', 'hoops', 'alphabet', 'steam bag', 'ginger ale', 'club', 'beer', 'cordial', 'biscuit', 'shot', 'tea', 'nut', 'conserve', 'jam', 'kombucha',
  'crystallised', 'marmalade', 'syrup', 'rhubarb', 'mushy', 'chutney', 'relish', 'soda', 'lemonade'];
// Whole words only, so "bar" doesn't knock out Barilla, or "pie" a "3 piece" pack.
const EXCLUDE_RE = EXCLUDE.map((x) => [x, new RegExp(`\\b${x}(s|es)?\\b`)]);

const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const stem = (w) => w.replace(/(es|s)$/, '');

function relevant(productName, itemName, query) {
  const p = plain(productName);
  const item = plain(itemName);
  const words = plain(query).split(/[^a-z]+/).filter((w) => w.length > 2 && !['frozen', 'fresh', 'dried', 'cubes'].includes(w));
  if (!words.every((w) => p.includes(stem(w)))) return false;
  return !EXCLUDE_RE.some(([x, re]) => re.test(p) && !item.includes(x) && !plain(query).includes(x));
}

// "Barilla Spaghetti (500 g)" -> 500; "Potatoes 2Kg" -> 2000; null if unknown.
function packGrams(text) {
  const m = plain(text || '').match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|ltr|litre)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return ['kg', 'l', 'ltr', 'litre'].includes(m[2]) ? n * 1000 : n;
}

// For each store, pick the cheapest relevant product that covers `needGrams` (or the best-value one if none do).
function pickPerStore(data, item) {
  const out = {};
  for (const chain of CHAINS) {
    const options = [];
    for (const match of data?.matches || []) {
      const p = match.stores?.[chain.id];
      if (!p || p.price == null || !relevant(p.name || match.display_name, item.name, item.query)) continue;
      options.push({ ...p, grams: packGrams(p.name) || packGrams(match.pack) });
    }
    if (!options.length) { out[chain.id] = null; continue; }
    const need = item.needGrams;
    const covering = need ? options.filter((o) => o.grams && o.grams >= need) : [];
    const pool = covering.length ? covering : options;
    pool.sort((a, b) => a.price - b.price);
    const best = pool[0];
    out[chain.id] = { price: best.price, member: best.clubcard_price, name: best.name, url: best.url, image: best.image_url,
      offer: best.offer_text, date: best.scrape_date };
  }
  return out;
}

// ---------- brand check: own-brand vs named brands ----------

// Supermarkets' own labels, including their value and premium sub-brands.
const OWN_LABEL = /^(|unbranded|loose|own[- ]?brand|tesco|dunnes|dunnes stores|supervalu|aldi|lidl|everyday essentials|specially selected|deluxe|signature tastes|finest|simply better|simply|free from|batts|ready, set.*cook!?|daily basics|hearty food co.?|grower's harvest|stockwell & co.?|ms molly's|h. ?w. nevill's|creamfields|exquisite|oakhurst|golden sun|my family favourites|crownfield|combino|freshona|four seasons|baresa|harvest basket|snackrite|cucina|chef select|vemondo|milbona|pilos|solevita|baker street|essential|value)$/i;

// Unit price normalised to per kg / per litre ("3.85 per 100G" -> 38.50 per kg) so everything sorts fairly.
function perUnit(p) {
  if (p.unit_price == null || !p.unit_basis) return null;
  const m = p.unit_basis.trim().toLowerCase().match(/^(\d*)\s*([a-z]+)$/);
  if (!m) return null;
  const n = Number(m[1] || 1);
  const unit = m[2];
  if (unit === 'g') return { value: (p.unit_price * 1000) / n, basis: 'kg' };
  if (unit === 'ml') return { value: (p.unit_price * 1000) / n, basis: 'l' };
  if (unit === 'kg' || unit === 'l') return { value: p.unit_price / n, basis: unit };
  return { value: p.unit_price / n, basis: unit }; // "each", "sheet"...
}

// Every relevant product in the comparison, with the cheapest store for each, sorted by price per kg/litre.
export function brandOptions(data, item) {
  const out = [];
  for (const match of data?.matches || []) {
    if (!relevant(match.display_name || '', item.name, item.query)) continue;
    let best = null;
    const stores = [];
    for (const chain of CHAINS) {
      const p = match.stores?.[chain.id];
      if (!p || p.price == null) continue;
      stores.push(chain.id);
      const u = perUnit(p);
      if (!best || (u && (!best.unit || u.value < best.unit.value)) || (!u && !best.unit && p.price < best.price)) {
        best = { store: chain.id, price: p.price, unit: u, url: p.url };
      }
    }
    if (!best) continue;
    const brand = match.brand || '';
    out.push({ brand, own: OWN_LABEL.test(brand.trim()), name: match.display_name, pack: match.pack || '', stores, ...best });
  }
  const byValue = (a, b) => (a.unit?.value ?? Infinity) - (b.unit?.value ?? Infinity) || a.price - b.price;
  out.sort(byValue);
  // Keep a mix: the best-value own-brand options and the best-value named brands.
  return [...out.filter((o) => o.own).slice(0, 5), ...out.filter((o) => !o.own).slice(0, 7)].sort(byValue);
}

// Cheapest own-brand vs cheapest named brand, compared per kg/litre when both have a unit price.
export function brandSaving(options) {
  const own = options.find((o) => o.own && o.unit);
  const named = options.find((o) => !o.own && o.unit && o.unit.basis === own?.unit.basis);
  if (!own || !named || named.unit.value <= own.unit.value) return null;
  return { own, named, pct: Math.round((1 - own.unit.value / named.unit.value) * 100) };
}

export async function searchBrands(query) {
  const data = await lookup(query);
  return brandOptions(data, { name: query, query });
}

function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (c?.date === today()) return { brands: {}, ...c };
  } catch { /* ignore */ }
  return { date: today(), results: {}, brands: {} };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// BasketWatch rate-limits bursts (429 + Retry-After); wait and try again a couple of times.
async function lookup(query, tries = 3) {
  const res = await fetch(`${pricesUrl()}?q=${encodeURIComponent(query)}`);
  if (res.status === 429 && tries > 1) {
    await wait(Math.min(20, Number(res.headers.get('Retry-After')) || 10) * 1000);
    return lookup(query, tries - 1);
  }
  if (!res.ok) throw new Error(`Price lookup failed (${res.status})`);
  return res.json();
}

// items: [{ key, name, needGrams }]. Results are cached for the day; returns how many lookups failed
// (those aren't cached, so running it again retries just them).
export async function comparePrices(items, onProgress = () => {}) {
  const cache = loadCache();
  const todo = items.filter((it) => !(it.key in cache.results));
  let done = items.length - todo.length;
  let failed = 0;
  onProgress(done, items.length);
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const it = queue.shift();
      try {
        const query = QUERY[it.name] || it.name;
        const data = await lookup(query);
        cache.results[it.key] = pickPerStore(data, { ...it, query });
        cache.brands[it.key] = brandOptions(data, { ...it, query });
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch {
        failed++;
      }
      onProgress(++done, items.length);
    }
  };
  await Promise.all([worker(), worker()]);
  return { failed };
}

export function cachedPrices(items) {
  const cache = loadCache();
  if (!items.every((it) => it.key in cache.results)) return null;
  return Object.fromEntries(items.map((it) => [it.key, cache.results[it.key]]));
}

export function cachedBrands(items) {
  const cache = loadCache();
  return Object.fromEntries(items.map((it) => [it.key, cache.brands[it.key] || []]));
}

export function clearPriceCache() {
  localStorage.removeItem(CACHE_KEY);
}

// Totals per store, plus the "cheapest mix" if you split the shop.
export function summarize(items, results) {
  const totals = Object.fromEntries(CHAINS.map((c) => [c.id, { total: 0, found: 0 }]));
  let mix = 0;
  let mixFound = 0;
  for (const it of items) {
    const r = results[it.key];
    if (!r) continue;
    let min = null;
    for (const c of CHAINS) {
      const p = r[c.id];
      if (!p) continue;
      totals[c.id].total += p.price;
      totals[c.id].found += 1;
      if (min == null || p.price < min) min = p.price;
    }
    if (min != null) { mix += min; mixFound += 1; }
  }
  // Best single shop: lowest total among shops that stock nearly everything we could price.
  const maxFound = Math.max(...Object.values(totals).map((t) => t.found));
  const fair = CHAINS.filter((c) => maxFound && totals[c.id].found >= maxFound * 0.8);
  const best = fair.sort((a, b) => totals[a.id].total - totals[b.id].total)[0]?.id || null;
  return { totals, best, mix, mixFound, maxFound };
}

export const cheapestStore = (r) => {
  if (!r) return null;
  let best = null;
  for (const c of CHAINS) if (r[c.id] && (!best || r[c.id].price < r[best].price)) best = c.id;
  return best;
};
