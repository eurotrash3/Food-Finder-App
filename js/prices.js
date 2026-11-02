// Shop price comparison using BasketWatch Ireland (https://basketwatchireland.com) - Aldi, Tesco, SuperValu,
// Dunnes Stores and Lidl. Browsers can't call BasketWatch directly (no CORS, and the API key must stay secret),
// so requests go through a small relay: supabase/functions/prices (see README).

import { PRICES_URL } from './config.js';
import { CHAINS } from './data.js';

const CACHE_KEY = 'food-finder-prices-v4'; // v4: adds big-brand prices; v3: cost of the amount needed, not one pack
const today = () => new Date().toISOString().slice(0, 10);

// Developers can point at a local relay: localStorage.setItem('ff-prices-url', 'http://localhost:8765/bw')
export const pricesUrl = () => localStorage.getItem('ff-prices-url') || PRICES_URL;
export const pricesEnabled = () => Boolean(pricesUrl());

// Better search terms for some list items. BasketWatch returns only ~15 products per search, so the wording
// matters; a list searches each term (Irish shops call spring onions "scallions", for example).
const QUERY = {
  onion: 'brown onions', 'red onion': 'red onions', potato: 'potatoes', carrot: 'carrots', egg: 'eggs',
  'minced beef': 'beef mince', 'chicken breast': 'chicken breast fillets', 'chicken thigh': 'chicken thighs', rice: 'long grain rice',
  tomato: 'tomatoes', 'cherry tomato': 'cherry tomatoes', mushroom: 'mushrooms', 'red pepper': 'red peppers',
  'yellow pepper': 'yellow peppers', 'spring onion': ['scallions', 'spring onions'], lemon: 'lemons', lime: 'limes',
  cheddar: 'cheddar cheese', 'kidney beans': 'red kidney beans', 'chicken stock': 'chicken stock cubes',
  'beef stock': 'beef stock cubes', 'vegetable stock': 'vegetable stock cubes', bacon: 'bacon rashers', sausage: 'pork sausages',
  salmon: 'salmon fillets', prawn: 'prawns', 'king prawn': 'king prawns', cream: 'fresh cream',
  'tomato purée': ['tomato puree', 'tomato paste'], 'dried oregano': 'oregano', chicken: 'chicken fillets', beef: 'diced beef',
  lamb: 'diced lamb', sugar: 'caster sugar', cornstarch: 'cornflour', 'bay leaf': 'bay leaves', mint: 'fresh mint',
  parmesan: ['parmesan', 'parmigiano reggiano'], 'black olive': 'black olives', avocado: 'avocados', 'egg yolk': 'eggs',
  'egg white': 'eggs', shrimp: 'prawns', 'green red lentils': 'red lentils', 'cilantro leaves': 'coriander',
  'thai fish sauce': 'fish sauce', hotsauce: 'hot sauce', 'chinese five spice powder': 'five spice', 'dry sherry': 'sherry',
  'shredded monterey jack cheese': 'grated cheddar', 'shredded mexican cheese': 'grated cheddar', 'dry white wine': 'white wine',
  'scotch bonnet': 'chillies', 'harissa spice': 'harissa', 'jerusalem artichoke': 'artichoke',
};

export const queriesFor = (name) => [].concat(QUERY[name] || name.normalize('NFD').replace(/[̀-ͯ]/g, ''));
export const queryFor = (name) => queriesFor(name)[0];

// Words that mean "not the plain ingredient" - skipped unless the ingredient name or search itself contains them.
const EXCLUDE = ['cooked', 'slice', 'cake', 'microwave', 'savoury', 'pilau', 'fried', 'crisp', 'soup', 'ready', 'meal', 'flavour',
  'seasoned', 'marinated', 'breaded', 'sweet', 'sauce', 'paste', 'heinz', 'dip', 'salad', 'kiev', 'nugget', 'goujon', 'burger',
  'pie', 'spread', 'powder', 'juice', 'oil', 'stuffed', 'glazed', 'smoked', 'pouch', 'snack', 'bar', 'drink', 'pickled', 'dried',
  'roast', 'baby food', 'jelly', 'sweets', 'noodle', 'pizza', 'wrap', 'sandwich', 'tikka', 'curry', 'stir fry', 'kit', 'loops',
  'rings', 'hoops', 'alphabet', 'steam bag', 'ginger ale', 'club', 'beer', 'cordial', 'biscuit', 'shot', 'tea', 'nut', 'conserve', 'jam', 'kombucha',
  'crystallised', 'marmalade', 'syrup', 'rhubarb', 'mushy', 'chutney', 'relish', 'soda', 'lemonade',
  // flavoured versions ("chopped tomatoes with garlic", "lemon & pepper chicken", "honey & soy")
  'with', 'lemon', 'garlic', 'chilli', 'honey', 'bbq', 'piri', 'peri', 'cajun', 'tandoori', 'teriyaki', 'fajita', 'sticky',
  'spicy', 'crushed', 'naan', 'cous', 'buttery', 'me up', 'move over', 'taste of', 'dairy free', 'barista', 'alpro',
  // other foods that share a word ("kidney beans in chilli", "olives & feta", "spring onion sausages")
  'bean', 'pesto', 'battered', 'sausage', 'olive', 'cocktail', 'chocolate', 'gum', 'polo', 'mentos',
  'seasoning', 'con carne', 'spice mix',
  // not food
  'diffuser', 'candle', 'wax', 'floss', 'baby powder', 'shampoo', 'soap', 'shower', 'air freshener', 'mouthwash', 'toothpaste', 'dental'];
// Whole words only, so "bar" doesn't knock out Barilla, or "pie" a "3 piece" pack.
const wordRe = (x) => new RegExp(`(^|[^a-z])${x}(s|es)?($|[^a-z])`);
const EXCLUDE_RE = EXCLUDE.map((x) => [x, wordRe(x)]);

// Extra exclusions for single items, where a word is only wrong for that item.
const ITEM_EXCLUDE = { coriander: ['ground', 'seed', 'rice'], parsley: ['dried'], basil: ['dried'], cheddar: ['mozzarella'],
  tomato: ['cherry', 'plum', 'sun'], ginger: ['ground', 'sliced', 'stem'], mint: ['sauce', 'jelly', 'roll', 'tube'] };
// Words in the general list that are fine for an item ("chopped tomatoes in tomato juice").
const ITEM_ALLOW = { 'chopped tomatoes': ['juice'] };

const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/-/g, ' ');
const stem = (w) => w.replace(/(es|s)$/, '');
// "leaves" also matches "leaf".
const hasWord = (p, w) => p.includes(stem(w)) || (w.endsWith('ves') && p.includes(`${w.slice(0, -3)}f`));

function relevant(productName, itemName, query) {
  const p = plain(productName);
  const item = plain(itemName);
  const queries = [].concat(query).map(plain);
  const fits = queries.some((q) => q.split(/[^a-z]+/)
    .filter((w) => w.length > 2 && !['frozen', 'fresh', 'dried', 'cubes'].includes(w))
    .every((w) => hasWord(p, w)));
  if (!fits) return false;
  const allowed = (x) => item.includes(x) || queries.some((q) => q.includes(x)) || (ITEM_ALLOW[itemName] || []).includes(x);
  if (EXCLUDE_RE.some(([x, re]) => re.test(p) && !allowed(x))) return false;
  return !(ITEM_EXCLUDE[itemName] || []).some((x) => wordRe(x).test(p));
}

// "Barilla Spaghetti (500 g)" -> 500; "Potatoes 2Kg" -> 2000; null if unknown.
function packGrams(text) {
  const m = plain(text || '').match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|ltr|litre)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return ['kg', 'l', 'ltr', 'litre'].includes(m[2]) ? n * 1000 : n;
}

// "Garlic 4 Pack" / "3EACH" / "(3 Piece)" / "6 x" -> 4 / 3 / 3 / 6 pieces; null if not a counted pack.
function packPieces(text) {
  const m = plain(text || '').match(/(\d+)\s*(?:x\s*)?(?:pack|pk|each|piece|pcs)\b|\b(\d+)\s*x\b/);
  return m ? Number(m[1] || m[2]) : null;
}

// Roughly what one piece weighs, to price loose produce sold by the kg and to turn grams into pieces.
const PIECE_GRAMS = { onion: 150, 'red onion': 150, shallot: 40, carrot: 100, potato: 200, 'sweet potato': 250, parsnip: 150,
  lemon: 100, lime: 70, orange: 150, apple: 150, banana: 120, tomato: 100, 'red pepper': 160, 'yellow pepper': 160,
  'green pepper': 160, courgette: 250, aubergine: 300, cucumber: 300, avocado: 170, celery: 40, 'spring onion': 15, leek: 200,
  chilli: 10, 'red chilli': 10, 'green chilli': 10, egg: 60, mushroom: 20, garlic: 50, ginger: 30, broccoli: 350, cauliflower: 600 };

// Sold in bunches or heads, with roughly this many of what recipes count (spring onions, celery sticks).
const PER_BUNCH = { 'spring onion': 8, celery: 8 };

// What the recipes need: { grams, count } (either may be null). Garlic cloves become bulbs; spring onions bunches.
function needOf(item) {
  const piece = PIECE_GRAMS[item.name];
  let count = item.needCount || null;
  if (item.needCloves) count = (count || 0) + Math.ceil(item.needCloves / 10);
  let grams = item.needGrams || null;
  if (!grams && count && piece) grams = count * piece;
  if (!count && grams && piece) count = Math.ceil(grams / piece);
  if (count && PER_BUNCH[item.name]) count = Math.ceil(count / PER_BUNCH[item.name]);
  return { grams, count };
}

const MAX_PACKS = 5;

// What it costs to buy what's needed of one product: loose produce by the piece or by weight, otherwise
// enough packs to cover the amount (e.g. 2 tins for 800 g). Returns { cost, note }.
function costOf(p, match, item, need) {
  const name = plain(p.name || match.display_name || '');
  const basis = plain(p.unit_basis || '').replace(/\s+/g, '');
  const grams = packGrams(p.name) || packGrams(match.pack);
  const pieces = packPieces(p.name) || packPieces(match.pack);
  const loose = /\bloose\b/.test(name) || /^1?each$/.test(plain(match.pack || '').replace(/\s+/g, ''));
  const perKg = basis === '1kg' || basis === 'kg';
  const qty = (n) => Math.max(1, Math.min(MAX_PACKS, n));

  // Loose, priced per kg (the price is for 1 kg): pay for the weight needed, at least one piece.
  if (loose && perKg && p.unit_price && Math.abs(p.price - p.unit_price) < 0.01) {
    const g = need.grams || PIECE_GRAMS[item.name];
    if (!g) return { cost: p.price, note: 'per kg' };
    const kg = Math.max(g, PIECE_GRAMS[item.name] || 0) / 1000;
    return { cost: p.unit_price * kg, note: `~${Math.round(kg * 1000)} g at €${p.unit_price.toFixed(2)}/kg` };
  }
  // Sold one at a time (loose carrots at €0.14 each, "Lemons Each").
  if ((loose && !grams && (pieces || 1) === 1) || (basis.endsWith('each') && !grams && !pieces)) {
    const n = qty(need.count || 1);
    return { cost: p.price * n, note: n > 1 ? `${n} × €${p.price.toFixed(2)}` : '' };
  }
  // Stock cubes and gravy granules make far more than their weight - one pack is enough.
  if (/\b(cube|pot|granule)s?\b/.test(name)) return { cost: p.price, note: '' };
  if (grams && need.grams) {
    const n = qty(Math.ceil(need.grams / grams - 0.1)); // 10% leeway: a 390 g tin does for 400 g
    return { cost: p.price * n, note: n > 1 ? `${n} packs` : '' };
  }
  if (pieces && need.count) {
    const n = qty(Math.ceil(need.count / pieces));
    return { cost: p.price * n, note: n > 1 ? `${n} packs` : '' };
  }
  return { cost: p.price, note: '' };
}

// For each store, the relevant product that's cheapest for the amount the recipes need.
export function pickPerStore(data, item) {
  const need = needOf(item);
  const out = {};
  for (const chain of CHAINS) {
    let best = null;
    let brand = null; // cheapest big-name brand, for the "big brands" comparison
    for (const match of data?.matches || []) {
      const p = match.stores?.[chain.id];
      if (!p || p.price == null || !relevant(p.name || match.display_name, item.name, item.query)) continue;
      const c = costOf(p, match, item, need);
      if (!best || c.cost < best.cost) best = { ...c, p };
      if (!OWN_LABEL.test((match.brand || '').trim()) && (!brand || c.cost < brand.cost)) brand = { ...c, p };
    }
    if (!best) { out[chain.id] = null; continue; }
    const { p } = best;
    const b = brand || best; // nothing branded (loose veg): same as the cheapest
    out[chain.id] = { price: Math.round(best.cost * 100) / 100, each: p.price, note: best.note, member: p.clubcard_price,
      name: p.name, url: p.url, image: p.image_url, offer: p.offer_text, date: p.scrape_date,
      brandPrice: Math.round(b.cost * 100) / 100, brandName: b.p.name };
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

// Products from one or more searches, without duplicates.
export function mergeResults(results) {
  const seen = new Set();
  const matches = results.flatMap((d) => d?.matches || []).filter((m) => {
    const id = m.match_id || m.display_name;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { matches };
}

// items: [{ key, name, needGrams, needCount, needCloves }]. Results are cached for the day; returns how many lookups failed
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
        const query = queriesFor(it.name);
        const data = mergeResults(await Promise.all(query.map((q) => lookup(q))));
        cache.results[it.key] = pickPerStore(data, { ...it, query });
        cache.brands[it.key] = brandOptions(data, { ...it, query });
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        saveUnitPrice(it.name, unitPriceOf(data, { ...it, query }));
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
  const totals = Object.fromEntries(CHAINS.map((c) => [c.id, { total: 0, brand: 0, found: 0 }]));
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
      totals[c.id].brand += p.brandPrice ?? p.price;
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

// ---------- recipe costs ----------
// Each ingredient's price per gram (and per piece, and for a typical pack) is learned from BasketWatch a little at a
// time and kept for a week, so cards can show "~€1.85 a portion" instead of a €/€€/€€€ guess.

const UNIT_KEY = 'food-finder-unitprices-v2'; // v2: prices per shop, cheapest and big-brand
const UNIT_TTL = 7 * 24 * 3600 * 1000;
const FAILED_TTL = 24 * 3600 * 1000;
// Rough grams for kitchen measures.
const MEASURE_GRAMS = { g: 1, ml: 1, tsp: 4, tbsp: 13, cup: 200, tin: 400, clove: 5 };
const PIECE_GRAMS_EXTRA = { 'chicken breast': 150, 'chicken thigh': 120, sausage: 57, bacon: 25, 'salmon fillet': 120,
  'cod fillet': 120, 'pork chop': 180, 'lamb chop': 100, tortilla: 40, 'pitta bread': 60, 'king prawn': 15, prawn: 10,
  'cherry tomato': 15, 'egg yolk': 60, 'lamb kidney': 60, shallot: 40, 'egg white': 60, 'bay leaf': 0.2, thyme: 1, rosemary: 1, 'kaffir lime leaves': 0.2, 'lime leaf': 0.2 };

function loadUnits() {
  try {
    const all = JSON.parse(localStorage.getItem(UNIT_KEY)) || {};
    const now = Date.now();
    for (const [k, v] of Object.entries(all)) if (now - v.at > (v.perG || v.perPiece || v.pack ? UNIT_TTL : FAILED_TTL)) delete all[k];
    return all;
  } catch { return {}; }
}
let units = null;
const unitCache = () => (units ||= loadUnits());

// Saved with the search terms used, so changing a term (e.g. "egg yolk" -> "eggs") looks the price up again.
const termsOf = (name) => queriesFor(name).join('|');
const known = (name) => unitCache()[name]?.q === termsOf(name);

export function saveUnitPrice(name, up) {
  unitCache()[name] = { ...up, q: termsOf(name), at: Date.now() };
  localStorage.setItem(UNIT_KEY, JSON.stringify(units));
}

// An ingredient's prices: per gram, per piece and per pack.
//  - s[shop].c: the cheapest at that shop (usually its own brand), s[shop].b: the cheapest big-name brand there
//  - perG/perPiece/pack: an all-shops estimate (the second-cheapest shop, so one odd match can't make a recipe
//    look too cheap), used for ingredients a shop doesn't stock
export function unitPriceOf(data, item) {
  const s = {};
  const all = { g: [], pc: [], pk: [] };
  const lower = (a, b) => (a == null ? b : b == null ? a : Math.min(a, b));
  for (const chain of CHAINS) {
    const c = [null, null, null];
    const b = [null, null, null];
    for (const match of data?.matches || []) {
      const p = match.stores?.[chain.id];
      if (!p || p.price == null || !relevant(p.name || match.display_name, item.name, item.query)) continue;
      const u = perUnit(p);
      const grams = packGrams(p.name) || packGrams(match.pack);
      const pieces = packPieces(p.name) || packPieces(match.pack);
      const pg = u && (u.basis === 'kg' || u.basis === 'l') ? u.value / 1000 : grams ? p.price / grams : null;
      const each = u?.basis === 'each' ? u.value : pieces ? p.price / pieces : null;
      const vals = [pg, each, p.price];
      for (let i = 0; i < 3; i++) c[i] = lower(c[i], vals[i]);
      if (!OWN_LABEL.test((match.brand || '').trim())) for (let i = 0; i < 3; i++) b[i] = lower(b[i], vals[i]);
    }
    if (c[2] == null) continue;
    s[chain.id] = { c, b: b[2] == null ? null : b };
    if (c[0]) all.g.push(c[0]);
    if (c[1]) all.pc.push(c[1]);
    all.pk.push(c[2]);
  }
  const pick = (a) => (a.length ? a.sort((x, y) => x - y)[Math.min(1, a.length - 1)] : null);
  return { perG: pick(all.g), perPiece: pick(all.pc), pack: pick(all.pk), s };
}

// Prices to use for an ingredient: the all-shops estimate, or one shop's cheapest / big-brand price.
// null if unknown, or if `mode.store` doesn't stock it.
function pricesFor(name, mode) {
  const up = known(name) && unitCache()[name];
  if (!up || !mode) return up || null;
  const s = up.s?.[mode.store];
  if (!s) return null;
  const [perG, perPiece, pack] = (mode.brand && s.b) || s.c; // no big brand (loose veg): same as cheapest
  return { perG, perPiece, pack };
}

// What one recipe ingredient costs at `factor` × the recipe's amounts (only the part used). null if unknown.
// `mode` = { store, brand } prices it at one shop; leave it out for the all-shops estimate.
export function ingredientCost(ing, factor, mode) {
  const up = pricesFor(ing.name, mode);
  if (!up) return null;
  const qty = ing.qty * factor;
  if (!ing.unit) { // counted: "2 onions", "1 bunch coriander"
    const pg = PIECE_GRAMS[ing.name] || PIECE_GRAMS_EXTRA[ing.name];
    if (pg && up.perG) return qty * pg * up.perG;
    if (up.perPiece) return qty * up.perPiece;
    return up.pack; // "1 bunch coriander", "3 sprigs": assume one pack covers it
  }
  let grams = qty * (MEASURE_GRAMS[ing.unit] ?? NaN);
  if (Number.isNaN(grams)) return null;
  if (/stock$/.test(ing.name) && ['ml', 'cup'].includes(ing.unit)) grams /= 50; // a 10 g cube makes 500 ml
  if (up.perG) return grams * up.perG;
  return null;
}

const costed = (r) => r.ingredients.filter((i) => i.cat !== 'staple' && i.qty > 0);

// { total, perPortion, coverage, stocked } for `portions` portions, or null if prices are off.
//  coverage: share of the recipe (by weight) with any price; 0 if a meat or fish is unpriced (usually most of the cost)
//  stocked: with `mode.store`, the share that shop sells; the rest is filled in with the all-shops estimate
export function recipeCost(r, portions, mode) {
  if (!pricesEnabled()) return null;
  const list = costed(r);
  if (!list.length) return null;
  const factor = portions / (r.serves || 4);
  let total = 0.15 * portions; // oil, salt, pepper and the like
  let all = 0;
  let priced = 0;
  let atStore = 0;
  let mainMissing = false;
  for (const ing of list) {
    const grams = ing.unit ? ing.qty * (MEASURE_GRAMS[ing.unit] || 5)
      : ing.qty * (PIECE_GRAMS[ing.name] || PIECE_GRAMS_EXTRA[ing.name] || 50);
    all += grams;
    let c = mode ? ingredientCost(ing, factor, mode) : null;
    if (c != null) atStore += grams;
    else c = ingredientCost(ing, factor);
    if (c != null) { total += c; priced += grams; } else if (ing.cat === 'meat' || ing.cat === 'fish') mainMissing = true;
  }
  return { total, perPortion: total / portions, coverage: mainMissing || !all ? 0 : priced / all,
    stocked: mode && all ? atStore / all : 1 };
}

// Cost at each shop: its cheapest options, and with big-name brands. Only shops that sell most of the recipe
// (70%+ by weight), cheapest first. [] until the recipe is priced.
export function storeCosts(r, portions) {
  const any = recipeCost(r, portions);
  if (!any || any.coverage < 0.75) return [];
  return CHAINS.map((chain) => ({
    store: chain.id,
    cheapest: recipeCost(r, portions, { store: chain.id }),
    brand: recipeCost(r, portions, { store: chain.id, brand: true }),
  })).filter((x) => x.cheapest.stocked >= 0.7).sort((a, b) => a.cheapest.total - b.cheapest.total);
}

// Ingredients of these recipes that have no price yet.
export const unpriced = (recipes) => [...new Set(recipes.flatMap(costed).map((i) => i.name))].filter((n) => !known(n));

// If nothing matches "feather blade beef" or "sherry vinegar", a simpler search for its last word ("beef",
// "vinegar") gives a fair estimate. Not for words that mean nothing alone ("lasagne sheet" -> "sheet").
const VAGUE = ['sheet', 'leaf', 'leaves', 'powder', 'sauce', 'paste', 'fillet', 'breast', 'seed', 'seeds', 'stock', 'juice',
  'oil', 'piece', 'pieces', 'mix', 'frai', 'cheese', 'flakes', 'zest'];
export function fallbackName(name) {
  const words = name.split(' ');
  const last = words[words.length - 1];
  return words.length > 1 && last.length > 3 && !VAGUE.includes(last) ? last : null;
}

// Learns an ingredient's prices. `fetchData(query)` returns BasketWatch results (the relay, or saved files in tests).
export async function priceIngredient(name, fetchData) {
  const tryName = async (n) => {
    const query = queriesFor(n);
    const data = mergeResults(await Promise.all(query.map(fetchData)));
    return { up: unitPriceOf(data, { name: n, query }), searches: query.length };
  };
  let { up, searches } = await tryName(name);
  const simpler = fallbackName(name);
  if (!up.perG && !up.perPiece && !up.pack && simpler) {
    const more = await tryName(simpler);
    up = more.up;
    searches += more.searches;
  }
  saveUnitPrice(name, up);
  return searches;
}

// Background pricing: looks up one ingredient every few seconds (BasketWatch rate-limits bursts) while the
// app is open, then calls `onPriced(name)`. Newer requests go to the front of the queue; `later` ones
// (preloading every recipe) go to the back.
const pending = [];
let pricing = false;
export function priceInBackground(names, onPriced, { later = false } = {}) {
  if (!pricesEnabled()) return;
  for (const n of later ? names : [...names].reverse()) {
    const i = pending.indexOf(n);
    if (i >= 0) { if (later) continue; pending.splice(i, 1); }
    if (known(n)) continue;
    if (later) pending.push(n); else pending.unshift(n);
  }
  priceInBackground.onPriced = onPriced;
  if (!pricing) runPricing();
}

// How many ingredients are still waiting to be priced.
export const pricesPending = () => pending.length;

async function runPricing() {
  pricing = true;
  while (pending.length) {
    if (document.hidden || !navigator.onLine) { await wait(5000); continue; }
    const name = pending.shift();
    if (known(name)) continue;
    try {
      const searches = await priceIngredient(name, (q) => lookup(q, 2));
      priceInBackground.onPriced?.(name);
      await wait(2500 * searches);
    } catch {
      failures[name] = (failures[name] || 0) + 1;
      if (failures[name] < 3) pending.push(name); // try again later
      else saveUnitPrice(name, { perG: null, perPiece: null, pack: null }); // give up for a day
      await wait(60000);
    }
  }
  pricing = false;
}
const failures = {};

// ---------- price watch ----------

// The cheapest relevant product by price per kg / litre / each (in the most common basis), and any on offer.
function bestValue(data, item) {
  const all = [];
  for (const match of data?.matches || []) {
    for (const chain of CHAINS) {
      const p = match.stores?.[chain.id];
      if (!p || p.price == null || !relevant(p.name || match.display_name, item.name, item.query)) continue;
      const u = perUnit(p);
      if (u) all.push({ value: u.value, basis: u.basis, price: p.price, store: chain.id, product: p.name, url: p.url, offer: p.offer_text || '' });
    }
  }
  if (!all.length) return null;
  const counts = {};
  for (const x of all) counts[x.basis] = (counts[x.basis] || 0) + 1;
  const basis = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const same = all.filter((x) => x.basis === basis).sort((a, b) => a.value - b.value);
  // Only offers that make a product (nearly) the cheapest way to buy it - not "save €0.44" on a pricey brand.
  return { best: same[0], offers: same.filter((x) => x.offer && x.value <= same[0].value * 1.1) };
}

// Checks each watched item, one at a time. Returns { log, alerts }: the new cheapest prices, and items that
// are at least 10% cheaper than at the last check (per kg/l/each) or on special offer.
export async function checkWatch(names, previous, onProgress = () => {}) {
  const log = {};
  const alerts = [];
  let done = 0;
  for (const name of names) {
    const query = queriesFor(name);
    try {
      const data = mergeResults(await Promise.all(query.map((q) => lookup(q))));
      saveUnitPrice(name, unitPriceOf(data, { name, query }));
      const v = bestValue(data, { name, query });
      if (v) {
        const now = { ...v.best, at: Date.now() };
        log[name] = now;
        const was = previous[name];
        if (was && was.basis === now.basis && now.value <= was.value * 0.9) {
          alerts.push({ name, store: now.store, price: now.price, value: now.value, was: was.value, basis: now.basis,
            pct: Math.round((1 - now.value / was.value) * 100), product: now.product, url: now.url, offer: now.offer });
        } else if (v.offers.length) {
          const o = v.offers.sort((a, b) => a.value - b.value)[0];
          alerts.push({ name, store: o.store, price: o.price, value: o.value, basis: o.basis, product: o.product, url: o.url, offer: o.offer });
        }
      }
    } catch { /* keep the old price; checked again next time */ }
    onProgress(++done, names.length);
    if (done < names.length) await wait(3000 * query.length);
  }
  return { log, alerts };
}
