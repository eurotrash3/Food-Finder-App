import { GOALS, BASES, FOODS, ALLERGENS, DIETS, TIMES, CATEGORIES, STORES, CHAINS } from './data.js';
import { state, save, startNewWeek, resetAll } from './store.js';
import { getRecipe, allCandidates, addFetched, isBuiltIn } from './recipes-index.js';
import { fetchRandomRecipes, fetchByIngredient, normalizeName } from './mealdb.js';
import { buildList, sharedIngredients, portionsFor, scaledIngredient, normName } from './list.js';
import { pricesEnabled, comparePrices, cachedPrices, cachedBrands, clearPriceCache, summarize, cheapestStore,
  searchBrands, brandSaving, recipeCost, storeCosts, priceInBackground, pricesPending, unpriced, checkWatch } from './prices.js';
import { currentPosition, geocode, findShops, directionsUrl, formatKm, loadLeaflet } from './shops.js';
import * as sync from './sync.js';
import { icon } from './icons.js';

// iPhones zoom the page into any form field under 16px (like the small shop pickers) and stay zoomed.
// maximum-scale stops that auto-zoom; iOS still lets people pinch-zoom, so nothing is lost.
if (/iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
  const vp = document.querySelector('meta[name=viewport]');
  vp.content += ', maximum-scale=1';
}

const view = document.getElementById('view');
const nav = document.getElementById('nav');
const steps = document.getElementById('steps');

// ---------- helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const go = (route) => { location.hash = `#/${route}`; };
const euro = (cost) => (cost ? '€'.repeat(cost) : '');
const money = (n) => `€${n.toFixed(2)}`;
const storeOf = (id) => STORES.find((s) => s.id === id) || STORES[0];

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2400);
}

function toggleIn(arr, value) {
  const i = arr.indexOf(value);
  if (i >= 0) arr.splice(i, 1); else arr.push(value);
}

function recipeArt(r, cls = '') {
  if (!r.image) return `<div class="art ${cls}" style="background:${esc(r.color || '#adc178')}">${icon('bowl', 'art-icon')}</div>`;
  const src = cls === 'thumb' ? `${r.image}/preview` : r.image;
  return `<div class="art ${cls}"><img src="${esc(src)}" alt="" loading="lazy" draggable="false"></div>`;
}

// ---------- food matching (likes, dislikes, kitchen) ----------

const foodLabel = (term) => FOODS.find((f) => f.id === term)?.label || term.charAt(0).toUpperCase() + term.slice(1);
const foodWords = (term) => FOODS.find((f) => f.id === term)?.match || [normalizeName(term)].filter(Boolean);
const ingredientNames = (r) => [...new Set(r.ingredients.filter((i) => i.cat !== 'staple').map((i) => normName(i.name)))];

// Ingredient names in recipe `r` that match a liked/disliked/kitchen term.
function matching(r, term) {
  const words = foodWords(term);
  return ingredientNames(r).filter((n) => words.some((w) => n.includes(w)));
}

function kitchenMatches(r, list) {
  const hits = new Set();
  for (const term of list) matching(r, term).forEach((n) => hits.add(n));
  return [...hits];
}

const inKitchen = (name) => [...state.pantry.useUp, ...state.pantry.have].some((t) => foodWords(t).some((w) => name.includes(w)));

// ---------- recipe matching ----------

function allowed(r) {
  if (r.allergens.some((a) => state.allergies.includes(a))) return false;
  const d = state.diets;
  if (d.includes('vegan') && r.diet !== 'vegan') return false;
  if (d.includes('vegetarian') && !['vegan', 'vegetarian'].includes(r.diet)) return false;
  if (d.includes('pescatarian') && r.diet === 'meat') return false;
  if (d.includes('nopork') && r.pork) return false;
  if (state.maxTime && r.time && r.time > state.maxTime) return false;
  if (state.bases.length && !state.bases.includes(r.base)) return false;
  if (state.dislikes.some((t) => matching(r, t).length || r.title.toLowerCase().includes(foodLabel(t).toLowerCase()))) return false;
  return true;
}

const jitter = new Map();
const rand = (id) => { if (!jitter.has(id)) jitter.set(id, Math.random()); return jitter.get(id); };

function plannedNames() {
  const names = new Set();
  for (const id of state.liked) {
    const p = getRecipe(id);
    if (p) ingredientNames(p).forEach((n) => names.add(n));
  }
  return names;
}

// How a recipe fits the week: what it reuses, what's new to buy, what it uses up.
function fit(r, planned = plannedNames()) {
  const names = ingredientNames(r);
  const fromPlan = names.filter((n) => planned.has(n));
  const useUp = kitchenMatches(r, state.pantry.useUp);
  const have = kitchenMatches(r, state.pantry.have).filter((n) => !useUp.includes(n));
  const owned = new Set([...fromPlan, ...useUp, ...have]);
  const toBuy = names.filter((n) => !owned.has(n));
  const liked = state.likes.filter((t) => matching(r, t).length);
  return { fromPlan, useUp, have, toBuy, liked };
}

// Ranking is tuned to save money and food: reuse what you're already buying or already have,
// use up food that's going off, and keep the number of new things to buy low.
function score(r, planned) {
  const f = fit(r, planned);
  let s = rand(r.id) * 1.5;
  for (const goal of state.goals) if (r.tags.includes(goal)) s += 2;
  s += f.fromPlan.length * 4 + f.have.length * 3 + f.useUp.length * 8 + f.liked.length * 5;
  s -= f.toBuy.length * 1.5;
  // Cost on the 1-3 scale: from shop prices when known (€1.25 a portion = 1, €2.50 = 2...), else the estimate.
  const c = realCost(r, state.people);
  const tier = c ? Math.min(3.5, Math.max(0.5, c.perPortion / 1.25)) : (r.cost || 2);
  s += (3 - tier) * (state.goals.includes('money') ? 2.5 : 1.5);
  if (state.goals.includes('quick') && r.time <= 30) s += 2;
  return s;
}

// ---------- recipe cost from shop prices ----------

// The lowest cost from shop prices: the cheapest shop, buying its cheapest options (usually its own brand).
// { total, perPortion, store }, or null until most of the recipe is priced.
function realCost(r, portions) {
  const best = storeCosts(r, portions)[0];
  if (best) return { ...best.cheapest, store: best.store };
  const c = recipeCost(r, portions);
  return c && c.coverage >= 0.75 ? c : null;
}

// short: leave out the shop name.
const costText = (r, portions, short = false) => {
  const c = realCost(r, portions);
  if (!c) return euro(r.cost);
  return `~€${c.perPortion.toFixed(2)}/portion${c.store && !short ? ` at ${storeOf(c.store).short}` : ''}`;
};

// Updated in place by refreshCosts() as prices arrive, so cards and photos aren't redrawn.
function costHtml(r, portions, short = false) {
  const text = costText(r, portions, short);
  return text ? `<span class="cost ${text.startsWith('~') ? 'real' : ''}" data-cost="${esc(r.id)}" data-portions="${portions}"${short ? ' data-short' : ''}>${text}</span>` : '';
}

// Table of what something costs at each shop: cheapest options vs big-name brands.
// rows: [{ store, cheapest: { total }, brand: { total } }], cheapest first.
function costTable(rows) {
  if (!rows.length) return '';
  return `<div class="price-table-wrap"><table class="price-table cost-table">
    <thead><tr><th>Shop</th><th>Cheapest</th><th>Big brands</th></tr></thead>
    <tbody>${rows.map((x, i) => `<tr>
      <td><span class="chain-dot" style="--store:${storeOf(x.store).color}"></span> ${storeOf(x.store).short}</td>
      <td class="${i === 0 ? 'cheapest' : ''}">${money(x.cheapest.total)}</td>
      <td>${money(x.brand.total)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function recipeCostHtml(r, portions) {
  const rows = storeCosts(r, portions);
  if (!rows.length) {
    return pricesEnabled() ? '<p class="hint">Working out what this costs at each shop…</p>' : '';
  }
  return `<p class="hint">For ${portions} portion${portions > 1 ? 's' : ''}. Big brands means named brands instead of the shop's own.</p>
    ${costTable(rows)}`;
}

// The week's meals at each shop that prices all of them.
function weekCosts() {
  const recipes = state.liked.map(getRecipe).filter(Boolean);
  if (!recipes.length) return [];
  const per = recipes.map((r) => storeCosts(r, portionsFor(r.id)));
  if (per.some((rows) => !rows.length)) return [];
  return CHAINS.map((c) => {
    const rows = per.map((list) => list.find((x) => x.store === c.id));
    if (rows.includes(undefined)) return null;
    return { store: c.id, cheapest: { total: rows.reduce((n, x) => n + x.cheapest.total, 0) },
      brand: { total: rows.reduce((n, x) => n + x.brand.total, 0) } };
  }).filter(Boolean).sort((a, b) => a.cheapest.total - b.cheapest.total);
}

function weekCostHtml() {
  const rows = weekCosts();
  if (!rows.length) return '';
  return `<h2>Cost this week</h2>
    ${costTable(rows)}`;
}

function refreshCosts() {
  view.querySelectorAll('[data-cost]').forEach((el) => {
    const r = getRecipe(el.dataset.cost);
    const text = r && costText(r, +el.dataset.portions, 'short' in el.dataset);
    if (text && text !== el.textContent) { el.textContent = text; el.classList.toggle('real', text.startsWith('~')); }
  });
  const status = view.querySelector('#price-status');
  if (status) status.textContent = priceStatus();
  const week = view.querySelector('#week-cost');
  if (week) week.innerHTML = weekCostHtml();
  const rc = view.querySelector('#recipe-costs');
  if (rc) rc.innerHTML = recipeCostHtml(getRecipe(rc.dataset.recipe), +rc.dataset.portions);
}

const priceStatus = () => (pricesPending() > 3 ? `· loading shop prices (${pricesPending()} to go)` : '');

// Price every recipe's ingredients in the background, after the ones on screen, so all cards show a real cost.
const preloadPrices = () => priceInBackground(unpriced(allCandidates()), refreshCosts, { later: true });

// Ask for prices of the ingredients in these recipes (looked up slowly in the background).
const priceRecipes = (recipes) => priceInBackground(unpriced(recipes.filter(Boolean)), refreshCosts);

function deck() {
  const seen = new Set([...state.liked, ...state.passed]);
  const planned = plannedNames();
  return allCandidates()
    .filter((r) => !seen.has(r.id) && allowed(r))
    .map((r) => ({ r, s: score(r, planned) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r);
}

// Pull extra TheMealDB recipes that match what you like, have, or want as a base.
// Automatic top-ups are throttled and give up after a few fruitless tries (e.g. strict filters),
// so the swipe screen never gets stuck re-rendering; "Load more" (force) always tries.
let fetching = false;
let lastFetch = 0;
let fruitless = 0;
async function topUpFromMealDb(force = false) {
  if (fetching || !navigator.onLine) return;
  const before = deck().length;
  if (!force && (before >= 8 || fruitless >= 3 || Date.now() - lastFetch < 15000)) return;
  fetching = true;
  lastFetch = Date.now();
  const terms = [
    ...state.pantry.useUp, ...state.likes, ...state.pantry.have.slice(0, 5),
    ...BASES.filter((b) => state.bases.includes(b.id)).flatMap((b) => b.fetch),
  ].map((t) => (FOODS.find((f) => f.id === t)?.match[0]) || normalizeName(t)).filter(Boolean);
  try {
    const skip = new Set(allCandidates().map((r) => r.id));
    const term = terms[Math.floor(Math.random() * terms.length)];
    let found = term ? await fetchByIngredient(term, { limit: 8, skip }) : [];
    if (found.length < 3) found = found.concat(await fetchRandomRecipes(8));
    addFetched(found);
    preloadPrices();
  } catch { /* offline or API busy - built-ins still work */ }
  fetching = false;
  const after = deck().length;
  fruitless = after > before ? 0 : fruitless + 1;
  // Only redraw if the "no more recipes" screen is showing - otherwise new cards simply join the
  // queue behind the current one (redrawing would reload the photo and make it flash).
  if (currentRoute() === 'swipe' && !dragging && (before === 0 || force)) render();
}

// ---------- shared form bits ----------

function stepper(id, value, min, max) {
  return `<div class="stepper" data-stepper="${id}" data-min="${min}" data-max="${max}">
    <button class="round" data-d="-1" aria-label="Less">−</button>
    <output>${value}</output>
    <button class="round" data-d="1" aria-label="More">+</button>
  </div>`;
}

function bindSteppers(onChange) {
  view.querySelectorAll('[data-stepper]').forEach((el) => {
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const key = el.dataset.stepper;
      const v = Math.min(+el.dataset.max, Math.max(+el.dataset.min, state[key] + +b.dataset.d));
      state[key] = v;
      el.querySelector('output').textContent = v;
      save();
      onChange?.(key, v);
    }));
  });
}

// A list of removable food chips, an "add your own" box and quick-pick suggestions.
// `get()` returns the array to edit; `cls` colours the chips.
function foodPicker(id, items, suggestions, { placeholder, cls = 'on' }) {
  const extra = items.filter((t) => !suggestions.some((s) => s.id === t));
  return `
    <div class="food-picker" data-picker="${id}">
      <div class="chips">
        ${suggestions.map((s) => `<button class="chip ${items.includes(s.id) ? cls : ''}" data-food="${esc(s.id)}">${esc(s.label)}</button>`).join('')}
        ${extra.map((t) => `<button class="chip ${cls}" data-food="${esc(t)}">${esc(t)} ✕</button>`).join('')}
      </div>
      <form class="add-item small" data-add="${id}">
        <input class="input" name="food" placeholder="${esc(placeholder)}" autocomplete="off">
        <button class="btn" type="submit">Add</button>
      </form>
    </div>`;
}

function bindFoodPicker(id, getList, rerender, { exclusive } = {}) {
  const root = view.querySelector(`[data-picker="${id}"]`);
  root.querySelectorAll('[data-food]').forEach((b) => b.addEventListener('click', () => {
    const list = getList();
    toggleIn(list, b.dataset.food);
    if (exclusive) { const other = exclusive(); const i = other.indexOf(b.dataset.food); if (i >= 0) other.splice(i, 1); }
    save(); rerender();
  }));
  root.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const list = getList();
    for (const raw of e.target.food.value.split(',')) {
      const t = raw.trim().toLowerCase();
      if (t && !list.includes(t)) list.push(t);
    }
    save(); rerender();
    view.querySelector(`[data-add="${id}"] input`)?.focus();
  });
}

// ---------- onboarding: goals → cooking → base → limits → kitchen ----------

function goalsScreen() {
  view.innerHTML = `
    <section class="screen">
      <h1>What are you hoping to do this week?</h1>
      <p class="sub">Pick as many as you like. Recipes that reuse ingredients are always ranked first, to save money and food.</p>
      <div class="option-grid">
        ${GOALS.map((g) => `
          <button class="option ${state.goals.includes(g.id) ? 'on' : ''}" data-goal="${g.id}">
            <span class="option-icon">${icon(g.icon)}</span>
            <span class="option-label">${g.label}</span>
            <span class="option-hint">${g.hint}</span>
          </button>`).join('')}
      </div>
      <div class="actions"><button class="btn primary big" id="next">Next</button></div>
    </section>`;
  view.querySelectorAll('[data-goal]').forEach((b) => b.addEventListener('click', () => {
    toggleIn(state.goals, b.dataset.goal); b.classList.toggle('on'); save();
  }));
  view.querySelector('#next').addEventListener('click', () => go('cook'));
}

function cookScreen() {
  view.innerHTML = `
    <section class="screen">
      <h1>How many times do you want to cook next week?</h1>
      <p class="sub">Count each cooking session. A big batch of soup counts once.</p>
      <div class="card-block center">
        ${stepper('cookCount', state.cookCount, 1, 14)}
        <div class="chips center">
          ${[3, 5, 7].map((n) => `<button class="chip ${state.cookCount === n ? 'on' : ''}" data-n="${n}">${n} times</button>`).join('')}
        </div>
      </div>
      <h2>How many people are you cooking for?</h2>
      <div class="card-block center">${stepper('people', state.people, 1, 10)}</div>
      <div class="actions">
        <button class="btn ghost" id="back">Back</button>
        <button class="btn primary big" id="next">Next</button>
      </div>
    </section>`;
  bindSteppers((key) => key === 'cookCount' && cookScreen());
  view.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => { state.cookCount = +b.dataset.n; save(); cookScreen(); }));
  view.querySelector('#back').addEventListener('click', () => go('goals'));
  view.querySelector('#next').addEventListener('click', () => go('base'));
}

function baseScreen() {
  view.innerHTML = `
    <section class="screen">
      <h1>What do you want your meals built around?</h1>
      <p class="sub">Pick one or more main staples, or leave them all off for anything. Sticking to one or two staples means fewer half-used packets.</p>
      <div class="option-grid">
        ${BASES.map((b) => `
          <button class="option ${state.bases.includes(b.id) ? 'on' : ''}" data-base="${b.id}">
            <span class="option-icon">${icon(b.icon)}</span>
            <span class="option-label">${b.label}</span>
          </button>`).join('')}
      </div>
      <p class="hint">${state.bases.length ? '' : 'Nothing picked, so you\'ll see every kind of meal.'}</p>
      <div class="actions">
        <button class="btn ghost" id="back">Back</button>
        <button class="btn primary big" id="next">Next</button>
      </div>
    </section>`;
  view.querySelectorAll('[data-base]').forEach((b) => b.addEventListener('click', () => {
    toggleIn(state.bases, b.dataset.base); save(); baseScreen();
  }));
  view.querySelector('#back').addEventListener('click', () => go('cook'));
  view.querySelector('#next').addEventListener('click', () => go('limits'));
}

function limitsScreen() {
  view.innerHTML = `
    <section class="screen">
      <h1>Any limitations or allergies?</h1>
      <p class="sub">We'll hide any recipe that doesn't fit, and look for ones with food you love.</p>
      <h2>Allergies &amp; intolerances</h2>
      <div class="chips">
        ${ALLERGENS.map((a) => `<button class="chip ${state.allergies.includes(a.id) ? 'on warn' : ''}" data-allergy="${a.id}">${a.label}</button>`).join('')}
      </div>
      <h2>I like… <small>recipes with these come first</small></h2>
      ${foodPicker('likes', state.likes, FOODS, { placeholder: 'Add a food you love, e.g. halloumi' })}
      <h2>I don't like… <small>recipes with these are hidden</small></h2>
      ${foodPicker('dislikes', state.dislikes, FOODS, { placeholder: 'Add a food you don\'t eat, e.g. olives', cls: 'on warn' })}
      <h2>Diet</h2>
      <div class="chips">
        ${DIETS.map((d) => `<button class="chip ${state.diets.includes(d.id) ? 'on' : ''}" data-diet="${d.id}">${d.label}</button>`).join('')}
      </div>
      <h2>Max cooking time</h2>
      <div class="chips">
        ${TIMES.map((t) => `<button class="chip ${state.maxTime === t.value ? 'on' : ''}" data-time="${t.value}">${t.label}</button>`).join('')}
      </div>
      <div class="actions">
        <button class="btn ghost" id="back">Back</button>
        <button class="btn primary big" id="next">Next</button>
      </div>
    </section>`;
  const keepScroll = () => { const y = window.scrollY; limitsScreen(); window.scrollTo(0, y); };
  view.querySelectorAll('[data-allergy]').forEach((b) => b.addEventListener('click', () => {
    toggleIn(state.allergies, b.dataset.allergy); save(); keepScroll();
  }));
  bindFoodPicker('likes', () => state.likes, keepScroll, { exclusive: () => state.dislikes });
  bindFoodPicker('dislikes', () => state.dislikes, keepScroll, { exclusive: () => state.likes });
  view.querySelectorAll('[data-diet]').forEach((b) => b.addEventListener('click', () => { toggleIn(state.diets, b.dataset.diet); save(); keepScroll(); }));
  view.querySelectorAll('[data-time]').forEach((b) => b.addEventListener('click', () => { state.maxTime = +b.dataset.time; save(); keepScroll(); }));
  view.querySelector('#back').addEventListener('click', () => go('base'));
  view.querySelector('#next').addEventListener('click', () => go('kitchen'));
}

// ---------- my kitchen (current groceries) ----------

const USE_UP_SUGGESTIONS = ['spinach', 'mushroom', 'peppers', 'broccoli', 'carrot', 'potato', 'tomato', 'courgette', 'chicken',
  'minced beef', 'egg', 'milk', 'cream', 'cheese', 'lemon', 'coriander', 'banana', 'bread'].map((x) => ({ id: x, label: foodLabel(x) }));
const HAVE_SUGGESTIONS = ['rice', 'pasta', 'spaghetti', 'potato', 'onion', 'garlic', 'egg', 'milk', 'butter', 'cheddar', 'plain flour',
  'chopped tomatoes', 'tomato purée', 'chicken stock', 'vegetable stock', 'soy sauce', 'coconut milk', 'kidney beans', 'chickpeas',
  'frozen peas', 'paprika', 'cumin', 'curry powder', 'honey', 'sugar'].map((x) => ({ id: x, label: x }));

function kitchenScreen() {
  const onboarding = !state.onboarded || isPlanning();
  view.innerHTML = `
    <section class="screen">
      <h1>${onboarding ? 'What\'s in your kitchen?' : 'My kitchen'}</h1>
      <p class="sub">Recipes using these come first, and they come off your list.</p>
      <div class="card-block kitchen-card useup">
        <h2>Use these up <small>${state.pantry.useUp.length}</small></h2>
        <p class="hint">Food that needs using soon.</p>
        ${foodPicker('useUp', state.pantry.useUp, USE_UP_SUGGESTIONS, { placeholder: 'e.g. half a bag of spinach', cls: 'on amber' })}
      </div>
      <div class="card-block kitchen-card">
        <h2>Everything I have <small>${state.pantry.have.length}</small></h2>
        <p class="hint">Fridge, freezer and cupboards.</p>
        ${foodPicker('have', state.pantry.have, HAVE_SUGGESTIONS, { placeholder: 'e.g. rice, onions, chopped tomatoes' })}
      </div>
      <div class="actions">
        ${onboarding ? '<button class="btn ghost" id="back">Back</button>' : '<button class="btn ghost" id="clear">Clear both lists</button>'}
        <button class="btn primary big" id="next">${onboarding ? 'Start swiping' : 'Find recipes that use these'}</button>
      </div>
    </section>`;
  const keepScroll = () => { const y = window.scrollY; kitchenScreen(); window.scrollTo(0, y); };
  bindFoodPicker('useUp', () => state.pantry.useUp, keepScroll);
  bindFoodPicker('have', () => state.pantry.have, keepScroll);
  view.querySelector('#back')?.addEventListener('click', () => go('limits'));
  view.querySelector('#clear')?.addEventListener('click', () => {
    if (confirm('Empty both kitchen lists?')) { state.pantry = { useUp: [], have: [] }; save(); kitchenScreen(); }
  });
  view.querySelector('#next').addEventListener('click', () => { state.onboarded = true; save(); go('swipe'); });
}

// ---------- swipe screen ----------

let dragging = false;

function cardHtml(r, top, planned) {
  const f = fit(r, planned);
  const meta = [
    r.time ? `~${r.time} min` : '',
    costHtml(r, state.people),
    r.diet !== 'meat' ? `${r.diet}` : '',
  ].filter(Boolean);
  // One short line on why this card fits: food to use up, food you have, food shared with your week, likes.
  const why = [
    f.useUp.length ? `Uses up your ${esc(f.useUp.slice(0, 2).join(', '))}` : '',
    f.have.length ? `${f.have.length} thing${f.have.length > 1 ? 's' : ''} you have` : '',
    f.fromPlan.length ? `${f.fromPlan.length} shared with your week` : '',
    f.liked.length ? `has ${esc(f.liked.slice(0, 2).map((t) => foodLabel(t).toLowerCase()).join(', '))}` : '',
  ].filter(Boolean);
  return `
    <article class="swipe-card ${top ? 'top' : 'next'}" data-id="${esc(r.id)}">
      ${recipeArt(r)}
      <div class="stamp like">YUM</div>
      <div class="stamp nope">NOPE</div>
      <div class="buy-count" title="New things to buy">${f.toBuy.length} new to buy</div>
      <div class="card-body">
        <h2>${esc(r.title)}</h2>
        <div class="meta">${meta.map((m) => `<span>${m}</span>`).join('')}</div>
        ${why.length ? `<div class="badge ${f.useUp.length ? 'useup' : 'have'}">${why.join(' · ')}</div>` : ''}
      </div>
    </article>`;
}

// Summary of what the deck is tuned for, shown above the cards. Tapping it re-opens the questions.
function prefsBar() {
  const chip = (cls, text) => `<span class="pref ${cls}">${esc(text)}</span>`;
  const chips = [
    ...GOALS.filter((g) => state.goals.includes(g.id)).map((g) => chip('goal', g.label)),
    ...BASES.filter((b) => state.bases.includes(b.id)).map((b) => chip('base', b.label)),
    ...ALLERGENS.filter((a) => state.allergies.includes(a.id)).map((a) => chip('allergy', `No ${a.label.toLowerCase()}`)),
    ...DIETS.filter((d) => state.diets.includes(d.id)).map((d) => chip('diet', `${d.label}`)),
    ...state.likes.map((t) => chip('like', `Likes ${foodLabel(t).toLowerCase()}`)),
    ...state.dislikes.map((t) => chip('dislike', `No ${foodLabel(t).toLowerCase()}`)),
    ...(state.pantry.useUp.length ? [chip('useup', `Use up ${state.pantry.useUp.length}`)] : []),
  ];
  // On phones the chips sit on one line that scrolls sideways, so the card still fits the screen.
  return `
    <div class="prefs-bar">
      <div class="prefs-chips">${chips.length ? chips.join('') : '<span class="pref">No focus set yet, so you\'re seeing a bit of everything</span>'}</div>
      <button class="prefs-edit" id="prefs" aria-label="Change your focus, allergies and likes">Edit ›</button>
    </div>`;
}

function swipeScreen() {
  const cards = deck();
  const planned = plannedNames();
  const picked = state.liked.length;
  const target = state.cookCount;
  view.innerHTML = `
    <section class="screen swipe-screen">
      ${prefsBar()}
      <div class="progress">
        <div class="progress-text"><strong>${picked}</strong> of ${target} meals picked <small class="price-status" id="price-status">${priceStatus()}</small></div>
        <div class="bar"><span style="width:${Math.min(100, (picked / target) * 100)}%"></span></div>
      </div>
      <div class="deck">
        ${cards.length
          ? cards.slice(0, 2).reverse().map((r, idx, arr) => cardHtml(r, idx === arr.length - 1, planned)).join('')
          : `<div class="empty">

              <h2>${fetching ? 'Finding more recipes…' : 'You\'ve seen every matching recipe'}</h2>
              <p>Load more, or loosen your staples, likes and limits in Settings.</p>
              <button class="btn primary" id="more">Load more recipes</button>
              ${state.passed.length ? '<button class="btn ghost" id="again">Show recipes I passed on</button>' : ''}
            </div>`}
      </div>
      ${cards.length ? `
      <div class="swipe-buttons">
        <button class="round big nope" id="nope" aria-label="Pass">✕</button>
        <button class="round info" id="info" aria-label="See recipe">i</button>
        <button class="round big like" id="like" aria-label="Like">♥</button>
      </div>
      ${state.liked.length + state.passed.length < 3 ? '<p class="hint center">Swipe right to add to your week, or left to pass. Tap a card to see the recipe.</p>' : ''}` : ''}
    </section>`;

  view.querySelector('#prefs').addEventListener('click', startPlanning);
  if (!cards.length) {
    view.querySelector('#more').addEventListener('click', (e) => { e.target.textContent = 'Loading…'; topUpFromMealDb(true); });
    view.querySelector('#again')?.addEventListener('click', () => { state.passed = []; save(); render(); });
    topUpFromMealDb(); // throttled, so an empty deck can't loop
    return;
  }
  const top = view.querySelector('.swipe-card.top');
  setupDrag(top, (like) => decide(top.dataset.id, like));
  view.querySelector('#nope').addEventListener('click', () => flyOut(top, false, () => decide(top.dataset.id, false)));
  view.querySelector('#like').addEventListener('click', () => flyOut(top, true, () => decide(top.dataset.id, true)));
  view.querySelector('#info').addEventListener('click', () => go(`recipe/${top.dataset.id}`));
  topUpFromMealDb();
  priceRecipes([...cards.slice(0, 4), ...state.liked.map(getRecipe)]);
}

function flyOut(card, like, done) {
  card.style.transition = 'transform .35s ease-out, opacity .35s';
  card.style.transform = `translate(${like ? 600 : -600}px, 40px) rotate(${like ? 30 : -30}deg)`;
  card.style.opacity = '0';
  card.querySelector(like ? '.stamp.like' : '.stamp.nope').style.opacity = 1;
  setTimeout(done, 300);
}

// The card has `touch-action: pan-y`, so on phones an up/down drag scrolls the page (the browser then
// sends pointercancel) and a sideways drag moves the card. A quick flick counts as a swipe too.
function setupDrag(card, decideFn) {
  let startX = 0, startY = 0, dx = 0, dy = 0, lastX = 0, lastT = 0, speed = 0, active = false;
  const like = card.querySelector('.stamp.like');
  const nope = card.querySelector('.stamp.nope');
  const reset = () => {
    card.style.transition = 'transform .25s';
    card.style.transform = '';
    like.style.opacity = nope.style.opacity = 0;
  };
  card.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    active = true; dragging = true; startX = lastX = e.clientX; startY = e.clientY; dx = dy = speed = 0; lastT = e.timeStamp;
    card.setPointerCapture(e.pointerId);
    card.style.transition = 'none';
  });
  card.addEventListener('pointermove', (e) => {
    if (!active) return;
    dx = e.clientX - startX; dy = e.clientY - startY;
    if (e.timeStamp > lastT) speed = (e.clientX - lastX) / (e.timeStamp - lastT); // px per ms
    lastX = e.clientX; lastT = e.timeStamp;
    card.style.transform = `translate(${dx}px, ${dy * 0.3}px) rotate(${dx / 18}deg)`;
    like.style.opacity = Math.max(0, Math.min(1, dx / 100));
    nope.style.opacity = Math.max(0, Math.min(1, -dx / 100));
  });
  card.addEventListener('pointerup', () => {
    if (!active) return;
    active = false; dragging = false;
    const flick = Math.abs(dx) > 40 && Math.abs(speed) > 0.5 && Math.sign(speed) === Math.sign(dx);
    if (Math.abs(dx) > 100 || flick) {
      navigator.vibrate?.(12);
      return flyOut(card, dx > 0, () => decideFn(dx > 0));
    }
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return go(`recipe/${card.dataset.id}`);
    reset();
  });
  card.addEventListener('pointercancel', () => { // the page started scrolling
    if (!active) return;
    active = false; dragging = false;
    reset();
  });
}

function decide(id, like) {
  const r = getRecipe(id);
  if (!r) return;
  if (like) {
    if (!state.liked.includes(id)) state.liked.push(id);
    if (!isBuiltIn(id)) state.extRecipes[id] = r; // keep fetched recipes so they survive a reload
  } else if (!state.passed.includes(id)) {
    state.passed.push(id);
  }
  save();
  render();
  if (like && state.liked.length === state.cookCount) showDoneModal();
}

function showDoneModal() {
  const shared = sharedIngredients().length;
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-card">

      <h2>Your week is planned!</h2>
      <p>You picked ${state.cookCount} meals.${shared ? ` ${shared} ingredients are shared between them, so less goes to waste.` : ''}</p>
      <button class="btn primary big" id="m-list">See my shopping list</button>
      <button class="btn ghost" id="m-keep">Keep swiping</button>
    </div>`;
  modal.hidden = false;
  modal.querySelector('#m-list').addEventListener('click', () => { modal.hidden = true; go('list'); });
  modal.querySelector('#m-keep').addEventListener('click', () => { modal.hidden = true; });
}

// ---------- recipe detail ----------

function ingredientRows(r, factor) {
  return r.ingredients.map((x) => scaledIngredient(x, factor)).map((x) => {
    const have = x.cat !== 'staple' && inKitchen(normName(x.name));
    return `<li class="${have ? 'have' : ''}"><span>${esc(x.name)}${have ? ' <small>✓ in your kitchen</small>' : ''}</span><span class="amt">${esc(x.amount)}</span></li>`;
  }).join('');
}

function recipeScreen(id) {
  const r = getRecipe(id);
  if (!r) { go('swipe'); return; }
  const inPlan = state.liked.includes(id);
  const portions = inPlan ? portionsFor(id) : state.people;
  const factor = portions / (r.serves || 4);
  const allergenLabels = ALLERGENS.filter((a) => r.allergens.includes(a.id)).map((a) => a.label);
  view.innerHTML = `
    <section class="screen recipe">
      <button class="btn ghost back" id="back">‹ Back</button>
      ${recipeArt(r, 'hero')}
      <h1>${esc(r.title)}</h1>
      ${r.desc ? `<p class="sub">${esc(r.desc)}</p>` : ''}
      <div class="meta">
        ${r.time ? `<span>~${r.time} min</span>` : ''}
        ${costHtml(r, portions)}
        <span>${portions} portion${portions > 1 ? 's' : ''}</span>
      </div>
      ${allergenLabels.length ? `<p class="allergens">May contain ${allergenLabels.join(', ').toLowerCase()}. Check the labels.</p>` : ''}
      <h2>Cost by shop</h2>
      <div id="recipe-costs" data-recipe="${esc(r.id)}" data-portions="${portions}">${recipeCostHtml(r, portions)}</div>
      <h2>Ingredients</h2>
      <ul class="ingredients">${ingredientRows(r, factor)}</ul>
      <h2>Method</h2>
      <ol class="method">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      ${r.sourceUrl ? `<p class="hint">Recipe from <a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">${esc(r.source)}</a>.</p>` : ''}
      <div class="actions sticky">
        ${inPlan
          ? '<button class="btn danger" id="toggle">Remove from my week</button>'
          : '<button class="btn primary big" id="toggle">♥ Add to my week</button>'}
      </div>
    </section>`;
  priceRecipes([r]);
  view.querySelector('#back').addEventListener('click', () => (history.length > 1 ? history.back() : go('swipe')));
  view.querySelector('#toggle').addEventListener('click', () => {
    if (inPlan) {
      state.liked = state.liked.filter((x) => x !== id);
      delete state.portions[id];
      save(); toast('Removed from your week'); recipeScreen(id);
    } else {
      state.passed = state.passed.filter((x) => x !== id);
      decide(id, true); toast('Added to your week'); go('plan');
    }
  });
}

// ---------- plan ----------

function planScreen() {
  const recipes = state.liked.map(getRecipe).filter(Boolean);
  const shared = sharedIngredients();
  view.innerHTML = `
    <section class="screen">
      <h1>My week</h1>
      <p class="sub">${recipes.length} of ${state.cookCount} meals picked · cooking for ${state.people}</p>
      ${shared.length ? `<div class="badge reuse block"><strong>${shared.length}</strong> shared between meals: ${esc(shared.slice(0, 6).map((s) => s.name).join(', '))}${shared.length > 6 ? '…' : ''}</div>` : ''}
      ${recipes.length ? `<ul class="plan-list">
        ${recipes.map((r) => `
          <li class="plan-item">
            <a href="#/recipe/${esc(r.id)}" class="plan-link">
              ${recipeArt(r, 'thumb')}
              <span><strong>${esc(r.title)}</strong><small>${[r.time ? `~${r.time} min` : '', costHtml(r, portionsFor(r.id), true)].filter(Boolean).join(' · ')}</small></span>
            </a>
            <div class="portions" data-id="${esc(r.id)}">
              <button class="round sm" data-d="-1" aria-label="Fewer portions">−</button>
              <span>${portionsFor(r.id)}<small>portions</small></span>
              <button class="round sm" data-d="1" aria-label="More portions">+</button>
            </div>
            <button class="remove" data-remove="${esc(r.id)}" aria-label="Remove">✕</button>
          </li>`).join('')}
      </ul>` : '<div class="empty"><p>No meals yet. Go and swipe some!</p></div>'}
      <div id="week-cost">${weekCostHtml()}</div>
      <div class="actions">
        <button class="btn ghost" id="swipe">${recipes.length < state.cookCount ? 'Find more meals' : 'Keep swiping'}</button>
        ${recipes.length ? '<button class="btn primary big" id="list">Shopping list</button>' : ''}
      </div>
      <p class="center"><button class="btn ghost sm" id="new-week">Start a new week</button></p>
    </section>`;
  priceRecipes(recipes);
  view.querySelector('#new-week').addEventListener('click', () => {
    if (!state.liked.length || confirm('Clear this week\'s meals and shopping list, and answer the questions again?')) {
      startNewWeek(); clearPriceCache(); startPlanning();
    }
  });
  view.querySelectorAll('.portions').forEach((el) => el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const id = el.dataset.id;
    state.portions[id] = Math.max(1, Math.min(20, portionsFor(id) + +b.dataset.d));
    save(); planScreen();
  })));
  view.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
    state.liked = state.liked.filter((x) => x !== b.dataset.remove);
    delete state.portions[b.dataset.remove];
    save(); planScreen();
  }));
  view.querySelector('#swipe').addEventListener('click', () => go('swipe'));
  view.querySelector('#list')?.addEventListener('click', () => go('list'));
}

// ---------- shopping list ----------

const OWNED = { id: 'owned', label: 'Already in your kitchen' };

// The extras at the end of the list fold away until tapped; they stay open across redraws.
const openFolds = new Set();
const fold = (id, title, body) => `
  <details class="fold" data-fold="${id}" ${openFolds.has(id) ? 'open' : ''}>
    <summary><h2 class="section-title">${title}</h2></summary>
    ${body}
  </details>`;

// The shop picker only shows when the list is grouped by shop; by aisle, a chosen shop is a small label.
function listItemHtml(it, byStore) {
  const store = storeOf(it.store);
  const canPick = it.cat !== 'staple' && !it.owned;
  return `
    <li class="shop-item ${it.checked ? 'done' : ''}" data-key="${esc(it.key)}">
      <label class="check">
        <input type="checkbox" ${it.checked ? 'checked' : ''}>
        <span class="tick"></span>
        <span class="item-text">
          <span class="item-name">${esc(it.name)}</span>
          ${it.amount ? `<span class="item-amt">${esc(it.amount)}</span>` : ''}
          ${canPick && !byStore && it.store ? `<span class="item-store" style="--store:${store.color}">${store.short}</span>` : ''}
        </span>
      </label>
      ${it.from.length ? `
      <span class="info-wrap">
        <button class="info-i" type="button" aria-label="Recipes that use ${esc(it.name)}">i</button>
        <span class="tip" role="tooltip"><strong>Used in:</strong>${it.from.map((t) => `<span>• ${esc(t)}</span>`).join('')}</span>
      </span>` : ''}
      ${!canPick || !byStore ? '' : `
      <select class="store-pick" style="--store:${store.color}" aria-label="Shop for ${esc(it.name)}">
        ${STORES.map((s) => `<option value="${s.id}" ${s.id === it.store ? 'selected' : ''}>${s.short}</option>`).join('')}
      </select>`}
      ${it.custom ? `<button class="remove" data-custom="${esc(it.id)}" aria-label="Remove">✕</button>` : ''}
    </li>`;
}

function listScreen() {
  const items = buildList();
  items.forEach((it) => { it.owned = !it.custom && it.cat !== 'staple' && inKitchen(it.key); });
  const toBuy = items.filter((it) => !it.owned);
  const byStore = state.listGroup === 'store';
  const groups = byStore
    ? STORES.map((s) => ({ id: s.id, label: s.label, items: toBuy.filter((it) => it.store === s.id && it.cat !== 'staple') }))
      .concat([{ id: 'staple', label: 'Check you have', items: toBuy.filter((it) => it.cat === 'staple') }])
    : CATEGORIES.map((c) => ({ ...c, items: toBuy.filter((it) => it.cat === c.id) }));
  groups.push({ ...OWNED, items: items.filter((it) => it.owned) });
  const left = toBuy.filter((it) => !it.checked && it.cat !== 'staple').length;
  const recipes = state.liked.map(getRecipe).filter(Boolean);

  view.innerHTML = `
    <section class="screen">
      <h1>Shopping list</h1>
      <p class="sub">${items.length ? `${left} item${left === 1 ? '' : 's'} left to get` : 'Your list is empty. Pick some meals first.'}</p>
      ${alertBanner()}
      <div class="list-tools">
        <div class="segmented">
          <button class="${byStore ? '' : 'on'}" data-group="aisle">By aisle</button>
          <button class="${byStore ? 'on' : ''}" data-group="store">By shop</button>
        </div>
        <span><a class="btn ghost sm" href="#/deals">Watch</a><button class="btn ghost sm" id="share">Share</button></span>
      </div>
      <form class="add-item" id="add">
        <input class="input" name="item" placeholder="Add something else, e.g. toilet roll" autocomplete="off">
        <button class="btn primary" type="submit">Add</button>
      </form>
      ${groups.filter((g) => g.items.length).map((g) => `
        <h2 class="group-title">${esc(g.label)} <small>${g.items.length}</small></h2>
        ${g.id === 'owned' ? '<p class="hint">In your <a href="#/kitchen">kitchen</a> already.</p>' : ''}
        <ul class="shop-list">${g.items.map((it) => listItemHtml(it, byStore)).join('')}</ul>`).join('')}
      ${items.some((it) => it.checked) ? '<div class="actions"><button class="btn ghost" id="clear">Untick everything</button></div>' : ''}
      ${toBuy.length ? `<section class="price-section" id="prices">${priceSectionHtml(toBuy)}</section>` : ''}
      ${toBuy.length && pricesEnabled() ? fold('brands', 'Brand check', `<section class="brand-section" id="brands">${brandSectionHtml(toBuy)}</section>`) : ''}
      ${toBuy.length ? fold('delivery', 'Delivery calculator', `<section class="delivery-section" id="delivery">${deliveryHtml(toBuy)}</section>`) : ''}
      ${recipes.length ? fold('howto', 'How to cook your meals', recipes.map((r) => `
          <details class="howto">
            <summary>${recipeArt(r, 'thumb')}<span><strong>${esc(r.title)}</strong><small>${portionsFor(r.id)} portions${r.time ? ` · ~${r.time} min` : ''}</small></span></summary>
            <h3>Ingredients</h3>
            <ul class="ingredients">${ingredientRows(r, portionsFor(r.id) / (r.serves || 4))}</ul>
            <h3>Method</h3>
            <ol class="method">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
          </details>`).join('')) : ''}
    </section>`;
  view.querySelectorAll('details.fold').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) openFolds.add(d.dataset.fold); else openFolds.delete(d.dataset.fold);
  }));

  const setItem = (key, patch) => { state.items[key] = { ...state.items[key], ...patch }; save(); };
  view.querySelectorAll('.shop-item').forEach((li) => {
    li.querySelector('input[type=checkbox]').addEventListener('change', (e) => {
      setItem(li.dataset.key, { checked: e.target.checked });
      if (e.target.checked) markBought(items.find((it) => it.key === li.dataset.key));
      li.classList.toggle('done', e.target.checked);
    });
    li.querySelector('.store-pick')?.addEventListener('change', (e) => { setItem(li.dataset.key, { store: e.target.value }); listScreen(); });
  });
  // "i" tooltips open on tap (phones can't hover); tapping anywhere else closes them.
  view.querySelectorAll('.info-i').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const wrap = b.parentElement;
    const open = !wrap.classList.contains('open');
    view.querySelectorAll('.info-wrap.open').forEach((w) => w.classList.remove('open'));
    wrap.classList.toggle('open', open);
    b.setAttribute('aria-expanded', open);
  }));
  view.querySelectorAll('[data-custom]').forEach((b) => b.addEventListener('click', () => {
    state.custom = state.custom.filter((c) => c.id !== b.dataset.custom);
    delete state.items[`custom:${b.dataset.custom}`];
    save(); listScreen();
  }));
  view.querySelectorAll('[data-group]').forEach((b) => b.addEventListener('click', () => { state.listGroup = b.dataset.group; save(); listScreen(); }));
  view.querySelector('#add').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = e.target.item.value.trim();
    if (!name) return;
    state.custom.push({ id: Date.now().toString(36), name });
    save(); listScreen();
    view.querySelector('#add input').focus();
  });
  view.querySelector('#clear')?.addEventListener('click', () => {
    for (const k of Object.keys(state.items)) state.items[k].checked = false;
    save(); listScreen();
  });
  view.querySelector('#share').addEventListener('click', () => shareList(toBuy));
  bindPriceSection(toBuy);
  bindBrandSection(toBuy);
  bindDelivery(toBuy);
}

async function shareList(items) {
  const lines = items.filter((it) => !it.checked).map((it) => {
    const store = it.store ? ` [${storeOf(it.store).short}]` : '';
    return `☐ ${it.name}${it.amount ? ` (${it.amount})` : ''}${store}`;
  });
  const text = `Shopping list\n\n${lines.join('\n')}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Shopping list', text });
    else { await navigator.clipboard.writeText(text); toast('List copied to clipboard'); }
  } catch { /* share cancelled */ }
}

// ---------- price comparison (end of the shopping list) ----------

const priceable = (items) => items.filter((it) => it.cat !== 'staple');

function priceSectionHtml(items) {
  const header = '<h2 class="section-title">Price comparison</h2>';
  if (!pricesEnabled()) {
    return `${header}
      <div class="card-block">
        <p>Compare what this list costs at <strong>Tesco, Dunnes, SuperValu, Aldi and Lidl</strong> using live prices from BasketWatch Ireland.</p>
        <p class="hint">Price comparison isn't switched on yet. It needs a small free relay set up in Supabase (see "Turning on shop prices" in the README).</p>
      </div>`;
  }
  const list = priceable(items);
  const results = cachedPrices(list);
  if (!results) {
    return `${header}
      <div class="card-block center">
        <p>See what these ${list.length} items cost at each chain today.</p>
        <button class="btn primary" id="compare">Compare prices</button>
        <div class="price-progress" hidden><div class="bar"><span></span></div><small></small></div>
      </div>`;
  }
  const sum = summarize(list, results);
  const nearestKm = (id) => (state.nearest[id] != null ? `<small>${formatKm(state.nearest[id])}</small>` : '');
  const ranked = CHAINS.filter((c) => sum.totals[c.id].found).sort((a, b) => sum.totals[a.id].total - sum.totals[b.id].total);
  return `${header}
    <div class="store-totals">
      ${ranked.map((c) => {
        const t = sum.totals[c.id];
        return `<div class="store-total ${c.id === sum.best ? 'best' : ''}" style="--store:${c.color}">
          <span class="store-name">${c.short}</span>
          <strong>${money(t.total)}</strong>
          <small>${t.found} of ${list.length} items</small>
          ${t.brand - t.total >= 0.1 ? `<small class="brand-total">Big brands ${money(t.brand)}</small>` : ''}
          ${nearestKm(c.id)}
          ${c.id === sum.best ? '<span class="best-tag">Best value</span>' : ''}
        </div>`;
      }).join('')}
    </div>
    ${sum.mixFound ? `<p class="mix">Cheapest if you split your shop: <strong>${money(sum.mix)}</strong> for ${sum.mixFound} items.</p>` : ''}
    <div class="price-table-wrap">
      <table class="price-table">
        <thead><tr><th>Item</th>${CHAINS.map((c) => `<th style="--store:${c.color}">${c.short}</th>`).join('')}</tr></thead>
        <tbody>
          ${list.map((it) => {
            const r = results[it.key];
            const cheapest = cheapestStore(r);
            return `<tr><td>${esc(it.name)}</td>${CHAINS.map((c) => {
              const p = r?.[c.id];
              if (!p) return '<td class="na">–</td>';
              const title = `${p.name}${p.note ? ` · ${p.note}` : ''}${p.offer ? ` · ${p.offer}` : ''}${p.member ? ` · member price €${p.member}` : ''}`;
              return `<td class="${c.id === cheapest ? 'cheapest' : ''}"><a href="${esc(p.url)}" target="_blank" rel="noopener" title="${esc(title)}">${money(p.price)}${p.note ? `<small>${esc(p.note)}</small>` : ''}</a></td>`;
            }).join('')}</tr>`;
          }).join('')}
        </tbody>
        <tfoot><tr><th>Total</th>${CHAINS.map((c) => `<th>${sum.totals[c.id].found ? money(sum.totals[c.id].total) : '–'}</th>`).join('')}</tr></tfoot>
      </table>
    </div>
    <div class="actions">
      <button class="btn ghost sm" id="refresh-prices">Refresh prices</button>
      <button class="btn primary" id="flag-cheapest">Flag items with the cheapest shop</button>
    </div>
    <p class="hint">Online prices from <a href="https://basketwatchireland.com" target="_blank" rel="noopener">BasketWatch Ireland</a>, for the amounts your meals need. Tap a price to see the product.${Object.keys(state.nearest).length ? '' : ' <a href="#/shops">Find your nearest shops</a> to see distances.'}</p>`;
}

function bindPriceSection(items) {
  const list = priceable(items);
  view.querySelector('#compare')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    const prog = view.querySelector('.price-progress');
    prog.hidden = false;
    const { failed } = await comparePrices(list, (done, total) => {
      prog.querySelector('span').style.width = `${(done / total) * 100}%`;
      prog.querySelector('small').textContent = `Checking prices… ${done} of ${total}`;
    });
    if (failed) toast(`${failed} price${failed > 1 ? 's' : ''} couldn't load. Tap Compare again in a minute.`);
    rerenderPrices(items);
  });
  view.querySelector('#refresh-prices')?.addEventListener('click', () => { clearPriceCache(); rerenderPrices(items); });
  view.querySelector('#flag-cheapest')?.addEventListener('click', () => {
    const results = cachedPrices(list) || {};
    let n = 0;
    for (const it of list) {
      const best = cheapestStore(results[it.key]);
      if (best) { state.items[it.key] = { ...state.items[it.key], store: best }; n++; }
    }
    state.listGroup = 'store';
    save(); toast(`Flagged ${n} items with their cheapest shop`); listScreen();
  });
}

function rerenderPrices(items) {
  const section = view.querySelector('#prices');
  if (!section) return;
  section.innerHTML = priceSectionHtml(items);
  bindPriceSection(items);
  const brands = view.querySelector('#brands');
  if (brands) { brands.innerHTML = brandSectionHtml(items); bindBrandSection(items); }
  const delivery = view.querySelector('#delivery');
  if (delivery) { delivery.innerHTML = deliveryHtml(items); bindDelivery(items); }
}

// ---------- brand check: own-brand vs big brands ----------

const unitText = (u) => (u ? `${money(u.value)}/${u.basis}` : '');
const brandName = (b) => (b || 'Brand').toLowerCase().replace(/(^|[\s'-])\S/g, (c) => c.toUpperCase());

function brandRows(options) {
  return `<table class="price-table brand-table">
    <thead><tr><th>Product</th><th>Cheapest at</th><th>Price</th><th>Per kg/l</th></tr></thead>
    <tbody>${options.map((o, i) => `<tr class="${i === 0 ? 'cheapest-row' : ''}">
      <td>${o.own ? '<span class="own-tag">Own-brand</span> ' : `<span class="brand-tag">${esc(brandName(o.brand))}</span> `}${esc(o.name)}</td>
      <td><span class="chain-dot" style="--store:${storeOf(o.store).color}"></span> ${storeOf(o.store).short}</td>
      <td><a href="${esc(o.url)}" target="_blank" rel="noopener">${money(o.price)}</a></td>
      <td>${unitText(o.unit) || '–'}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function savingText(options) {
  const s = brandSaving(options);
  return s ? `Own-brand ${unitText(s.own.unit)} vs ${esc(brandName(s.named.brand))} ${unitText(s.named.unit)}: <strong>save ${s.pct}%</strong>` : '';
}

function brandSectionHtml(items) {
  if (!pricesEnabled()) return '';
  const list = priceable(items);
  const brands = cachedPrices(list) ? cachedBrands(list) : null;
  const rows = brands ? list.filter((it) => (brands[it.key] || []).length > 1) : [];
  return `
    <p class="hint">Own-brand vs big brands (Barilla, Green Giant, Heinz…), compared per kg or litre so pack sizes are fair.</p>
    <form class="add-item" id="brand-search">
      <input class="input" name="q" placeholder="Check any product, e.g. frozen sweetcorn" autocomplete="off">
      <button class="btn primary" type="submit">Check</button>
    </form>
    <div id="brand-result"></div>
    ${brands ? rows.map((it) => `
      <details class="howto brand-item">
        <summary><span><strong>${esc(it.name)}</strong><small>${savingText(brands[it.key]) || `${brands[it.key].length} options`}</small></span></summary>
        <div class="price-table-wrap">${brandRows(brands[it.key])}</div>
      </details>`).join('') : '<p class="hint">Run the price comparison above to see brand options for everything on your list.</p>'}`;
}

function bindBrandSection(items) {
  const form = view.querySelector('#brand-search');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    const out = view.querySelector('#brand-result');
    if (!q) return;
    out.innerHTML = '<p class="hint">Checking brands…</p>';
    try {
      const options = await searchBrands(q);
      out.innerHTML = options.length
        ? `<div class="card-block brand-result"><h3>${esc(q)}</h3>${savingText(options) ? `<p class="saving">${savingText(options)}</p>` : ''}<div class="price-table-wrap">${brandRows(options)}</div></div>`
        : `<p class="hint">No products found for "${esc(q)}". Try a simpler name, e.g. "peas".</p>`;
    } catch {
      out.innerHTML = '<p class="error">Couldn\'t check prices right now. Try again in a minute.</p>';
    }
  });
}

// ---------- delivery calculator (end of the shopping list) ----------

function numberInput(field, value, { step = 0.5, chain = '' } = {}) {
  return `<input class="num" type="number" inputmode="decimal" min="0" step="${step}" data-field="${field}" data-chain="${chain}"
    value="${value ?? ''}" placeholder="–">`;
}

function deliveryHtml(items) {
  const d = state.delivery;
  const list = priceable(items);
  const results = pricesEnabled() ? cachedPrices(list) : null;
  const sum = results ? summarize(list, results) : null;
  const meals = state.liked.length;
  const portions = state.liked.reduce((n, id) => n + portionsFor(id), 0);

  // What the groceries cost: best single shop from the price comparison, or your own estimate.
  const basketGuess = d.basketGuess ?? 60;
  const home = sum?.best ? sum.totals[sum.best].total : basketGuess;
  const food = portions * d.takeawayMeal;
  const takeaway = food + food * (d.servicePct / 100) + meals * (d.appFee + d.tip);
  const saved = takeaway - home;

  const rows = CHAINS.map((c) => {
    const basket = sum ? (sum.totals[c.id].found ? sum.totals[c.id].total : null) : basketGuess;
    const fee = d.fees[c.id];
    const delivered = basket != null && fee != null ? basket + fee : null;
    const km = state.nearest[c.id];
    const inStore = basket != null && km != null ? basket + km * 2 * d.perKm : null;
    return { c, basket, fee, delivered, km, inStore };
  });
  const options = rows.flatMap((r) => [
    r.delivered != null && { label: `${r.c.short} delivered`, cost: r.delivered },
    r.inStore != null && { label: `${r.c.short} in store`, cost: r.inStore },
  ]).filter(Boolean).sort((a, b) => a.cost - b.cost);
  const cheapest = options[0];

  return `
    <div class="card-block calc">
      <h3>Cook it yourself vs. order takeaway</h3>
      <p class="hint">What your ${meals} meal${meals === 1 ? '' : 's'} (${portions} portions) would cost on Uber Eats, Deliveroo, Just Eat or DoorDash/Wolt. Change the numbers to match what you usually pay.</p>
      <div class="calc-grid">
        <label>Takeaway main, per person ${numberInput('takeawayMeal', d.takeawayMeal)}</label>
        <label>Delivery fee, per order ${numberInput('appFee', d.appFee, { step: 0.1 })}</label>
        <label>Service fee % ${numberInput('servicePct', d.servicePct, { step: 1 })}</label>
        <label>Tip, per order ${numberInput('tip', d.tip)}</label>
        ${sum?.best ? '' : `<label>Your grocery bill ${numberInput('basketGuess', basketGuess, { step: 1 })}</label>`}
      </div>
      <div class="versus">
        <div><small>Takeaway</small><strong>${money(takeaway)}</strong><small>${money(portions ? takeaway / portions : 0)} a portion</small></div>
        <div class="vs">vs</div>
        <div class="home"><small>Cooking at home${sum?.best ? ` (${storeOf(sum.best).short})` : ''}</small><strong>${money(home)}</strong><small>${money(portions ? home / portions : 0)} a portion</small></div>
      </div>
      ${meals ? `<p class="saving ${saved > 0 ? '' : 'neg'}">${saved > 0
        ? `Cooking saves you about <strong>${money(saved)}</strong> this week (${money(saved * 52)} a year).`
        : 'Takeaway works out cheaper with these numbers. Check your estimates!'}</p>` : '<p class="hint">Pick some meals to compare.</p>'}
    </div>

    <div class="card-block calc">
      <h3>Grocery delivery vs. going to the shop</h3>
      <p class="hint">Enter each chain's delivery fee for your slot (leave it blank if they don't deliver to you). Driving costs ${numberInput('perKm', d.perKm, { step: 0.05 })} € per km, there and back.</p>
      <div class="price-table-wrap">
        <table class="price-table calc-table">
          <thead><tr><th>Shop</th><th>Basket</th><th>Delivery fee</th><th>Delivered</th><th>In store</th></tr></thead>
          <tbody>
            ${rows.map((r) => `<tr>
              <td><span class="chain-dot" style="--store:${r.c.color}"></span> ${r.c.short}</td>
              <td>${r.basket != null ? money(r.basket) : '–'}</td>
              <td>${numberInput('fee', r.fee, { chain: r.c.id })}</td>
              <td class="${cheapest && r.delivered === cheapest.cost ? 'cheapest' : ''}">${r.delivered != null ? money(r.delivered) : '–'}</td>
              <td class="${cheapest && r.inStore === cheapest.cost ? 'cheapest' : ''}">${r.inStore != null ? `${money(r.inStore)}<small>${formatKm(r.km)}</small>` : '–'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${cheapest ? `<p class="saving">Cheapest way to get your shopping: <strong>${esc(cheapest.label)}</strong> at ${money(cheapest.cost)}.</p>` : ''}
      <p class="hint">${sum ? '' : 'Run the price comparison above to fill in each shop\'s basket. '}${Object.keys(state.nearest).length ? '' : '<a href="#/shops">Find your nearest shops</a> to work out the in-store driving cost. '}Fees vary, so check when you order.</p>
    </div>`;
}

function bindDelivery(items) {
  const section = view.querySelector('#delivery');
  if (!section) return;
  section.querySelectorAll('input[data-field]').forEach((input) => input.addEventListener('change', () => {
    const v = input.value === '' ? null : Math.max(0, Number(input.value));
    if (input.dataset.field === 'fee') state.delivery.fees[input.dataset.chain] = v;
    else state.delivery[input.dataset.field] = v ?? 0;
    save();
    section.innerHTML = deliveryHtml(items);
    bindDelivery(items);
  }));
}

// ---------- nearest shops ----------

let shopCache = null; // { key, shops }

function shopsScreen() {
  const loc = state.location;
  view.innerHTML = `
    <section class="screen">
      <h1>Nearest shops</h1>
      <p class="sub">How far your nearest Tesco, Dunnes, SuperValu, Aldi and Lidl are.</p>
      <div class="card-block">
        <button class="btn primary" id="locate">Use my location</button>
        <form class="add-item" id="place">
          <input class="input" name="q" placeholder="Or type a town or Eircode" autocomplete="off" value="">
          <button class="btn" type="submit">Search</button>
        </form>
        ${loc ? `<p class="hint">Showing shops near <strong>${esc(loc.label || 'your location')}</strong>.</p>` : ''}
      </div>
      <div id="shop-results">${loc ? '<p class="hint center">Finding shops…</p>' : ''}</div>
      <p class="hint">Shop locations from <a href="https://www.openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap</a> contributors. Distances are in a straight line.</p>
    </section>`;
  const setLoc = async (getPos) => {
    const out = view.querySelector('#shop-results');
    out.innerHTML = '<p class="hint center">Finding shops…</p>';
    try {
      const pos = await getPos();
      state.location = { lat: +pos.lat.toFixed(4), lon: +pos.lon.toFixed(4), label: pos.label };
      save();
      shopsScreen();
    } catch (err) {
      out.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    }
  };
  view.querySelector('#locate').addEventListener('click', () => setLoc(currentPosition));
  view.querySelector('#place').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (q) setLoc(() => geocode(q));
  });
  if (loc) showShops(loc);
}

async function showShops(loc) {
  const out = view.querySelector('#shop-results');
  const key = `${loc.lat},${loc.lon}`;
  try {
    if (shopCache?.key !== key) shopCache = { key, shops: await findShops(loc) };
  } catch (err) {
    out.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    return;
  }
  if (currentRoute() !== 'shops') return;
  const { shops } = shopCache;
  const nearest = {};
  for (const c of CHAINS) {
    const s = shops.find((x) => x.chain === c.id);
    if (s) nearest[c.id] = +s.km.toFixed(2);
  }
  state.nearest = nearest;
  save();
  out.innerHTML = `
    <div id="map" class="map"></div>
    <ul class="shop-cards">
      ${CHAINS.map((c) => {
        const s = shops.find((x) => x.chain === c.id);
        return `<li class="shop-card" style="--store:${c.color}">
          <span class="chain-dot"></span>
          <div class="shop-info">
            <strong>${c.label}</strong>
            ${s ? `<small>${esc(s.name)}${s.address ? ` · ${esc(s.address)}` : ''}</small>` : '<small>None within 15 km</small>'}
          </div>
          ${s ? `<span class="km">${formatKm(s.km)}</span><a class="btn sm" href="${directionsUrl(s)}" target="_blank" rel="noopener">Directions</a>` : ''}
        </li>`;
      }).join('')}
    </ul>`;
  try {
    const L = await loadLeaflet();
    if (!document.getElementById('map')) return;
    // On phones one finger scrolls the page; pinch to zoom the map, tap the dots for details.
    const map = L.map('map', { scrollWheelZoom: false, dragging: !L.Browser.mobile }).setView([loc.lat, loc.lon], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    L.circleMarker([loc.lat, loc.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#ef476f', fillOpacity: 1 })
      .addTo(map).bindPopup('You are here');
    const bounds = [[loc.lat, loc.lon]];
    for (const s of shops.slice(0, 40)) {
      const c = CHAINS.find((x) => x.id === s.chain);
      L.circleMarker([s.lat, s.lon], { radius: 7, color: '#fff', weight: 2, fillColor: c.color, fillOpacity: 0.95 })
        .addTo(map).bindPopup(`<strong>${esc(s.name)}</strong><br>${formatKm(s.km)} away<br><a href="${directionsUrl(s)}" target="_blank" rel="noopener">Directions</a>`);
    }
    for (const c of CHAINS) {
      const s = shops.find((x) => x.chain === c.id);
      if (s) bounds.push([s.lat, s.lon]);
    }
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] });
  } catch {
    document.getElementById('map')?.remove();
  }
}

// ---------- price watch ----------

const WEEK = 7 * 24 * 3600 * 1000;
const isoDay = () => new Date().toISOString().slice(0, 10);

// Ticking an item off the list counts as buying it (once per shopping trip, i.e. at most every 5 days).
function markBought(it) {
  if (!it || it.custom || it.cat === 'staple') return;
  const b = state.bought[it.key] || { count: 0, last: '' };
  if (!b.last || Date.now() - Date.parse(b.last) >= 5 * 24 * 3600 * 1000) b.count += 1;
  b.last = isoDay();
  state.bought[it.key] = b;
  save();
}

// Items bought on two or more trips, plus any added by hand (at most 15, to go easy on the price service).
function watchedNames() {
  const often = Object.entries(state.bought)
    .filter(([n, b]) => b.count >= 2 && !state.unwatch.includes(n))
    .sort((a, b) => b[1].count - a[1].count)
    .map(([n]) => n);
  return [...new Set([...state.watch, ...often])].slice(0, 15);
}

let watching = null; // progress text while a check runs

async function runWatchCheck() {
  const names = watchedNames();
  if (watching || !names.length || !pricesEnabled()) return;
  watching = 'Checking prices…';
  const { log, alerts } = await checkWatch(names, state.priceLog, (done, total) => {
    watching = `Checking prices… ${done} of ${total}`;
    const el = view.querySelector('#watch-progress');
    if (el) el.textContent = watching;
  });
  watching = null;
  state.priceLog = { ...state.priceLog, ...log };
  state.alerts = alerts;
  state.watchCheckedAt = Date.now();
  save();
  if (['deals', 'list'].includes(currentRoute())) render();
  else if (alerts.length) toast(`${alerts.length} price drop${alerts.length > 1 ? 's' : ''} on things you buy - see your list`);
}

function autoCheckWatch() {
  if (Date.now() - state.watchCheckedAt > WEEK - 24 * 3600 * 1000) runWatchCheck();
}

const perText = (x) => `${money(x.value)}/${x.basis}`;

function alertHtml(a) {
  const store = storeOf(a.store);
  const what = a.pct
    ? `<strong>${a.pct}% cheaper</strong> than last check (${perText(a)}, was ${money(a.was)}/${a.basis})`
    : `<strong>On offer:</strong> ${esc(a.offer)}`;
  return `<li class="alert-item">
    <span class="chain-dot" style="--store:${store.color}"></span>
    <span class="alert-text"><strong>${esc(foodLabel(a.name))}</strong>: ${money(a.price)} at ${store.short} - ${what}
      <a href="${esc(a.url)}" target="_blank" rel="noopener"><small>${esc(a.product)}</small></a></span>
  </li>`;
}

function alertBanner() {
  if (!state.alerts.length || !pricesEnabled()) return '';
  const n = state.alerts.length;
  return `<a class="badge alert-banner block" href="#/deals">${n} thing${n > 1 ? 's' : ''} you buy ${n > 1 ? 'are' : 'is'} cheaper or on offer this week ›</a>`;
}

function dealsScreen() {
  const names = watchedNames();
  const checked = state.watchCheckedAt ? new Date(state.watchCheckedAt).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'short' }) : '';
  view.innerHTML = `
    <section class="screen">
      <h1>Price watch</h1>
      <p class="sub">Once a week, when you open the app, we re-check the prices of things you buy often and show what's cheaper or on special offer. Anything you tick off your shopping list on two shopping trips is watched automatically.</p>
      ${pricesEnabled() ? '' : '<p class="error">Shop prices aren\'t switched on, so the price watch can\'t run.</p>'}
      ${state.alerts.length ? `<h2>This week</h2><ul class="alert-list">${state.alerts.map(alertHtml).join('')}</ul>` : ''}
      <h2>Watching <small>${names.length}</small></h2>
      <div class="card-block">
        ${names.length ? `<div class="chips">${names.map((n) => {
          const p = state.priceLog[n];
          return `<button class="chip on" data-unwatch="${esc(n)}" title="Stop watching">${esc(foodLabel(n))}${p ? ` · ${perText(p)} ${storeOf(p.store).short}` : ''} ✕</button>`;
        }).join('')}</div>` : '<p class="hint">Nothing yet. Add things you buy every week, or tick items off your shopping list as you shop.</p>'}
        <form class="add-item small" id="watch-add">
          <input class="input" name="food" placeholder="e.g. milk, butter, coffee" autocomplete="off">
          <button class="btn" type="submit">Watch</button>
        </form>
      </div>
      <div class="actions">
        <span class="hint" id="watch-progress">${watching || (checked ? `Last checked ${checked}` : 'Not checked yet')}</span>
        <button class="btn primary" id="watch-now" ${watching || !names.length || !pricesEnabled() ? 'disabled' : ''}>Check now</button>
      </div>
      <p class="hint">Alerts show here and on your shopping list when you open the app. The first check records today's prices, so price drops show from the second week (special offers show straight away). Notifications to your phone while the app is closed need a server, and come with cloud sync later.</p>
    </section>`;
  view.querySelectorAll('[data-unwatch]').forEach((b) => b.addEventListener('click', () => {
    const n = b.dataset.unwatch;
    if (state.watch.includes(n)) state.watch = state.watch.filter((x) => x !== n);
    else state.unwatch.push(n);
    state.alerts = state.alerts.filter((a) => a.name !== n);
    save(); dealsScreen();
  }));
  view.querySelector('#watch-add').addEventListener('submit', (e) => {
    e.preventDefault();
    for (const raw of e.target.food.value.split(',')) {
      const n = normalizeName(raw.trim().toLowerCase()) || raw.trim().toLowerCase();
      if (!n) continue;
      if (!state.watch.includes(n)) state.watch.push(n);
      state.unwatch = state.unwatch.filter((x) => x !== n);
    }
    save(); dealsScreen();
  });
  view.querySelector('#watch-now').addEventListener('click', (e) => {
    e.target.disabled = true;
    state.watchCheckedAt = 0;
    runWatchCheck();
    view.querySelector('#watch-progress').textContent = watching || 'Checking prices…';
  });
}

// ---------- settings ----------

function settingsScreen() {
  const user = sync.currentUser();
  const names = (ids, list) => list.filter((x) => ids.includes(x.id)).map((x) => x.label).join(', ');
  const goals = names(state.goals, GOALS) || 'None';
  const bases = names(state.bases, BASES) || 'Anything';
  const limits = [
    ...ALLERGENS.filter((a) => state.allergies.includes(a.id)).map((a) => `no ${a.label.toLowerCase()}`),
    ...DIETS.filter((d) => state.diets.includes(d.id)).map((d) => d.label.toLowerCase()),
    ...state.dislikes.map((d) => `no ${foodLabel(d).toLowerCase()}`),
  ].join(', ') || 'None';
  view.innerHTML = `
    <section class="screen">
      <h1>Settings</h1>
      <h2>Account &amp; sync</h2>
      <div class="card-block">
        ${!sync.isConfigured()
          ? '<p>Your data is saved on this device. Cloud sync with Google sign-in can be turned on later (see the README).</p>'
          : user
            ? `<p>Signed in as <strong>${esc(user.email)}</strong>. Your plan syncs across devices.</p><button class="btn ghost" id="signout">Sign out</button>`
            : '<p>Sign in to sync your list and plan across your devices.</p><button class="btn google" id="signin"><span>G</span> Sign in with Google</button>'}
      </div>
      <h2>Your preferences</h2>
      <div class="card-block settings-rows">
        <a href="#/goals" class="row"><span>Goals</span><span class="val">${esc(goals)} ›</span></a>
        <a href="#/cook" class="row"><span>Cooking</span><span class="val">${state.cookCount}× for ${state.people} ›</span></a>
        <a href="#/base" class="row"><span>Main staples</span><span class="val">${esc(bases)} ›</span></a>
        <a href="#/limits" class="row"><span>Likes &amp; limits</span><span class="val">${esc(limits)} ›</span></a>
        <a href="#/kitchen" class="row"><span>My kitchen</span><span class="val">${state.pantry.useUp.length + state.pantry.have.length} items ›</span></a>
        <a href="#/deals" class="row"><span>Price watch</span><span class="val">${watchedNames().length} items ›</span></a>
      </div>
      <h2>Start over</h2>
      <div class="card-block">
        <button class="btn primary" id="week">Start a new week</button>
        <p class="hint">Clears your meals and list, then asks your questions again. Your kitchen is kept.</p>
        <button class="btn danger" id="reset">Reset everything</button>
      </div>
      <p class="hint center">Recipes and photos from <a href="https://www.themealdb.com" target="_blank" rel="noopener">TheMealDB</a>. Prices from <a href="https://basketwatchireland.com" target="_blank" rel="noopener">BasketWatch Ireland</a>. Maps © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>.</p>
    </section>`;
  view.querySelector('#signin')?.addEventListener('click', () => sync.signIn());
  view.querySelector('#signout')?.addEventListener('click', () => sync.signOut());
  view.querySelector('#week').addEventListener('click', () => {
    if (confirm('Clear this week\'s meals and shopping list?')) { startNewWeek(); clearPriceCache(); startPlanning(); }
  });
  view.querySelector('#reset').addEventListener('click', () => {
    if (confirm('Delete all your data and start from scratch?')) { resetAll(); clearPriceCache(); go('goals'); }
  });
}

// ---------- router ----------

const ONBOARDING = ['goals', 'cook', 'base', 'limits', 'kitchen'];
const currentRoute = () => location.hash.replace(/^#\/?/, '').split('/')[0] || '';

// "Planning" walks back through the question pages (focus, cooking, staples, allergies & likes, kitchen)
// before swiping, like the first run. Kept in sessionStorage so a refresh mid-way doesn't lose it.
const isPlanning = () => sessionStorage.getItem('ff-planning') === '1';
function startPlanning() {
  sessionStorage.setItem('ff-planning', '1');
  go('goals');
}
const stopPlanning = () => sessionStorage.removeItem('ff-planning');

function render() {
  const [route, param] = location.hash.replace(/^#\/?/, '').split('/');
  if (!route) return go(state.onboarded ? 'swipe' : 'goals');
  if (!state.onboarded && !ONBOARDING.includes(route) && route !== 'settings') return go('goals');
  if (isPlanning() && !ONBOARDING.includes(route)) stopPlanning(); // left the questions part-way

  const inOnboarding = (!state.onboarded || isPlanning()) && ONBOARDING.includes(route);
  steps.hidden = !inOnboarding;
  nav.hidden = inOnboarding;
  document.getElementById('gear').hidden = inOnboarding;
  if (inOnboarding) {
    const idx = ONBOARDING.indexOf(route);
    steps.innerHTML = [...ONBOARDING, 'swipe'].map((_, i) => `<span class="${i <= idx ? 'on' : ''}"></span>`).join('');
  }
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#/${route}`));
  const count = nav.querySelector('.count');
  count.textContent = state.liked.length;
  count.hidden = !state.liked.length;

  const screens = { goals: goalsScreen, cook: cookScreen, base: baseScreen, limits: limitsScreen, kitchen: kitchenScreen,
    swipe: swipeScreen, plan: planScreen, list: listScreen, shops: shopsScreen, settings: settingsScreen,
    deals: dealsScreen, recipe: () => recipeScreen(decodeURIComponent(param || '')) };
  (screens[route] || (() => go('swipe')))();
  if (route !== 'swipe') window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => {
  if (currentRoute() === 'swipe') fruitless = 0; // filters may have changed - allow fresh top-ups
  render();
});
document.addEventListener('click', () => {
  document.querySelectorAll('.info-wrap.open').forEach((w) => w.classList.remove('open'));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.info-wrap.open').forEach((w) => w.classList.remove('open'));
  if (currentRoute() !== 'swipe' || e.target.matches('input')) return;
  if (e.key === 'ArrowRight') view.querySelector('#like')?.click();
  if (e.key === 'ArrowLeft') view.querySelector('#nope')?.click();
});

render();
setTimeout(autoCheckWatch, 3000); // weekly price watch, once the first screen is up
setTimeout(preloadPrices, 1500);
sync.initSync(render);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js');
}
