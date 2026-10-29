import { GOALS, ALLERGENS, DIETS, TIMES, CATEGORIES, STORES } from './data.js';
import { state, save, startNewWeek, resetAll } from './store.js';
import { getRecipe, allCandidates, addFetched } from './recipes-index.js';
import { fetchRandomRecipes } from './mealdb.js';
import { buildList, sharedIngredients, portionsFor, scaledIngredient, normName } from './list.js';
import * as sync from './sync.js';

const view = document.getElementById('view');
const nav = document.getElementById('nav');
const steps = document.getElementById('steps');

// ---------- helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const go = (route) => { location.hash = `#/${route}`; };
const euro = (cost) => (cost ? '€'.repeat(cost) : '');

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

function toggleIn(arr, value) {
  const i = arr.indexOf(value);
  if (i >= 0) arr.splice(i, 1); else arr.push(value);
}

function recipeArt(r, cls = '') {
  return r.image
    ? `<div class="art ${cls}" style="background:${esc(r.color)}"><img src="${esc(r.image)}" alt="" loading="lazy" draggable="false"></div>`
    : `<div class="art ${cls}" style="background:linear-gradient(135deg, ${esc(r.color)}, ${esc(r.color)}99)"><span>${r.emoji}</span></div>`;
}

// ---------- recipe matching ----------

function allowed(r) {
  if (r.allergens.some((a) => state.allergies.includes(a))) return false;
  const d = state.diets;
  if (d.includes('vegan') && r.diet !== 'vegan') return false;
  if (d.includes('vegetarian') && !['vegan', 'vegetarian'].includes(r.diet)) return false;
  if (d.includes('pescatarian') && r.diet === 'meat') return false;
  if (d.includes('nopork') && r.pork) return false;
  if (state.maxTime && r.time && r.time > state.maxTime) return false;
  const dislikes = state.dislikes.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const text = (r.title + ' ' + r.ingredients.map((x) => x.name).join(' ')).toLowerCase();
  if (dislikes.some((w) => text.includes(w))) return false;
  return true;
}

const jitter = new Map();
const rand = (id) => { if (!jitter.has(id)) jitter.set(id, Math.random()); return jitter.get(id); };

// Ingredients already on the list (excluding staples) that this recipe would reuse.
function overlapWithPicked(r) {
  const picked = new Set();
  for (const id of state.liked) {
    const p = getRecipe(id);
    p?.ingredients.forEach((x) => x.cat !== 'staple' && picked.add(normName(x.name)));
  }
  return r.ingredients.filter((x) => x.cat !== 'staple' && picked.has(normName(x.name))).map((x) => x.name);
}

function score(r) {
  const g = state.goals;
  let s = rand(r.id) * 3;
  for (const goal of g) if (r.tags.includes(goal)) s += 3;
  if (g.includes('money') && r.cost === 1) s += 2;
  if (g.includes('quick') && r.time && r.time <= 30) s += 2;
  if (r.source) s += 1.5; // keep TheMealDB cards mixed in with the built-ins
  s += overlapWithPicked(r).length * (g.includes('waste') ? 2 : 1);
  return s;
}

function deck() {
  const seen = new Set([...state.liked, ...state.passed]);
  return allCandidates().filter((r) => !seen.has(r.id) && allowed(r)).sort((a, b) => score(b) - score(a));
}

let fetching = false;
async function topUpFromMealDb(force = false) {
  if (fetching || !navigator.onLine) return;
  if (!force && deck().filter((r) => r.source).length >= 4) return;
  fetching = true;
  try {
    addFetched(await fetchRandomRecipes(10));
  } catch { /* offline or API down - built-ins still work */ }
  fetching = false;
  if (currentRoute() === 'swipe' && !dragging) render();
}

// ---------- onboarding screens ----------

function goalsScreen() {
  view.innerHTML = `
    <section class="screen">
      <h1>What are you hoping to do this week?</h1>
      <p class="sub">Pick as many as you like. We'll use them to suggest recipes.</p>
      <div class="option-grid">
        ${GOALS.map((g) => `
          <button class="option ${state.goals.includes(g.id) ? 'on' : ''}" data-goal="${g.id}">
            <span class="option-emoji">${g.emoji}</span>
            <span class="option-label">${g.label}</span>
            <span class="option-hint">${g.hint}</span>
          </button>`).join('')}
      </div>
      <div class="actions"><button class="btn primary big" id="next">Next</button></div>
    </section>`;
  view.querySelectorAll('[data-goal]').forEach((b) => b.addEventListener('click', () => {
    toggleIn(state.goals, b.dataset.goal);
    b.classList.toggle('on');
    save();
  }));
  view.querySelector('#next').addEventListener('click', () => go('cook'));
}

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
  view.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => {
    state.cookCount = +b.dataset.n; save(); cookScreen();
  }));
  view.querySelector('#back').addEventListener('click', () => go('goals'));
  view.querySelector('#next').addEventListener('click', () => go('limits'));
}

function limitsScreen() {
  view.innerHTML = `
    <section class="screen">
      <h1>Any limitations or allergies?</h1>
      <p class="sub">We'll hide any recipe that doesn't fit.</p>
      <h2>Allergies &amp; intolerances</h2>
      <div class="chips">
        ${ALLERGENS.map((a) => `<button class="chip ${state.allergies.includes(a.id) ? 'on warn' : ''}" data-allergy="${a.id}">${a.label}</button>`).join('')}
      </div>
      <h2>Diet</h2>
      <div class="chips">
        ${DIETS.map((d) => `<button class="chip ${state.diets.includes(d.id) ? 'on' : ''}" data-diet="${d.id}">${d.label}</button>`).join('')}
      </div>
      <h2>Max cooking time</h2>
      <div class="chips">
        ${TIMES.map((t) => `<button class="chip ${state.maxTime === t.value ? 'on' : ''}" data-time="${t.value}">${t.label}</button>`).join('')}
      </div>
      <h2>Foods you don't like</h2>
      <input class="input" id="dislikes" placeholder="e.g. mushrooms, coriander, olives" value="${esc(state.dislikes)}">
      <p class="hint">Separate with commas.</p>
      <div class="actions">
        <button class="btn ghost" id="back">Back</button>
        <button class="btn primary big" id="next">Start swiping 🔥</button>
      </div>
    </section>`;
  view.querySelectorAll('[data-allergy]').forEach((b) => b.addEventListener('click', () => {
    toggleIn(state.allergies, b.dataset.allergy); b.classList.toggle('on'); b.classList.toggle('warn'); save();
  }));
  view.querySelectorAll('[data-diet]').forEach((b) => b.addEventListener('click', () => {
    toggleIn(state.diets, b.dataset.diet); b.classList.toggle('on'); save();
  }));
  view.querySelectorAll('[data-time]').forEach((b) => b.addEventListener('click', () => {
    state.maxTime = +b.dataset.time; save(); limitsScreen();
  }));
  view.querySelector('#dislikes').addEventListener('input', (e) => { state.dislikes = e.target.value; save(); });
  view.querySelector('#back').addEventListener('click', () => go('cook'));
  view.querySelector('#next').addEventListener('click', () => { state.onboarded = true; save(); go('swipe'); });
}

// ---------- swipe screen ----------

let dragging = false;

function cardHtml(r, top) {
  const overlap = overlapWithPicked(r);
  const meta = [
    r.time ? `⏱ ${r.time} min` : '',
    r.cost ? `<span class="cost">${euro(r.cost)}</span>` : '',
    r.diet !== 'meat' ? `🌱 ${r.diet}` : '',
  ].filter(Boolean);
  const goalTags = GOALS.filter((g) => r.tags.includes(g.id)).slice(0, 3);
  return `
    <article class="swipe-card ${top ? 'top' : 'next'}" data-id="${esc(r.id)}">
      ${recipeArt(r)}
      <div class="stamp like">YUM</div>
      <div class="stamp nope">NOPE</div>
      <div class="card-body">
        <h2>${esc(r.title)}</h2>
        <p>${esc(r.desc)}</p>
        <div class="meta">${meta.map((m) => `<span>${m}</span>`).join('')}</div>
        <div class="tags">
          ${goalTags.map((g) => `<span class="tag">${g.emoji} ${g.label}</span>`).join('')}
          ${r.source ? '<span class="tag muted">TheMealDB</span>' : ''}
        </div>
        ${overlap.length ? `<div class="overlap">♻️ Reuses ${overlap.length} ingredient${overlap.length > 1 ? 's' : ''} from your plan: ${esc(overlap.slice(0, 3).join(', '))}</div>` : ''}
      </div>
    </article>`;
}

function swipeScreen() {
  const cards = deck();
  const picked = state.liked.length;
  const target = state.cookCount;
  view.innerHTML = `
    <section class="screen swipe-screen">
      <div class="progress">
        <div class="progress-text"><strong>${picked}</strong> of ${target} meals picked</div>
        <div class="bar"><span style="width:${Math.min(100, (picked / target) * 100)}%"></span></div>
      </div>
      <div class="deck">
        ${cards.length
          ? cards.slice(0, 2).reverse().map((r, idx, arr) => cardHtml(r, idx === arr.length - 1)).join('')
          : `<div class="empty">
              <div class="big-emoji">🍽️</div>
              <h2>You've seen every recipe</h2>
              <p>Load more from TheMealDB, or loosen your filters in Settings.</p>
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
      <p class="hint center">Swipe right to add to your week, or left to pass. Tap a card to see the recipe.</p>` : ''}
    </section>`;

  if (!cards.length) {
    view.querySelector('#more').addEventListener('click', (e) => { e.target.textContent = 'Loading…'; topUpFromMealDb(true); });
    view.querySelector('#again')?.addEventListener('click', () => { state.passed = []; save(); render(); });
    return;
  }
  const top = view.querySelector('.swipe-card.top');
  setupDrag(top, (like) => decide(top.dataset.id, like));
  view.querySelector('#nope').addEventListener('click', () => flyOut(top, false, () => decide(top.dataset.id, false)));
  view.querySelector('#like').addEventListener('click', () => flyOut(top, true, () => decide(top.dataset.id, true)));
  view.querySelector('#info').addEventListener('click', () => go(`recipe/${top.dataset.id}`));
  topUpFromMealDb();
}

function flyOut(card, like, done) {
  card.style.transition = 'transform .35s ease-out, opacity .35s';
  card.style.transform = `translate(${like ? 600 : -600}px, 40px) rotate(${like ? 30 : -30}deg)`;
  card.style.opacity = '0';
  card.querySelector(like ? '.stamp.like' : '.stamp.nope').style.opacity = 1;
  setTimeout(done, 300);
}

function setupDrag(card, decideFn) {
  let startX = 0, startY = 0, dx = 0, dy = 0, active = false;
  const like = card.querySelector('.stamp.like');
  const nope = card.querySelector('.stamp.nope');
  card.addEventListener('pointerdown', (e) => {
    active = true; dragging = true; startX = e.clientX; startY = e.clientY; dx = dy = 0;
    card.setPointerCapture(e.pointerId);
    card.style.transition = 'none';
  });
  card.addEventListener('pointermove', (e) => {
    if (!active) return;
    dx = e.clientX - startX; dy = e.clientY - startY;
    card.style.transform = `translate(${dx}px, ${dy * 0.3}px) rotate(${dx / 18}deg)`;
    like.style.opacity = Math.max(0, Math.min(1, dx / 100));
    nope.style.opacity = Math.max(0, Math.min(1, -dx / 100));
  });
  const end = () => {
    if (!active) return;
    active = false; dragging = false;
    if (Math.abs(dx) > 100) return flyOut(card, dx > 0, () => decideFn(dx > 0));
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return go(`recipe/${card.dataset.id}`);
    card.style.transition = 'transform .25s';
    card.style.transform = '';
    like.style.opacity = nope.style.opacity = 0;
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

function decide(id, like) {
  const r = getRecipe(id);
  if (!r) return;
  if (like) {
    if (!state.liked.includes(id)) state.liked.push(id);
    if (r.source) state.extRecipes[id] = r;
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
      <div class="big-emoji">🎉</div>
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
      <p class="sub">${esc(r.desc)}</p>
      <div class="meta">
        ${r.time ? `<span>⏱ ${r.time} min</span>` : ''}
        ${r.cost ? `<span class="cost">${euro(r.cost)}</span>` : ''}
        <span>🍽 ${portions} portion${portions > 1 ? 's' : ''}</span>
      </div>
      ${allergenLabels.length ? `<p class="allergens">⚠️ Contains: ${allergenLabels.join(', ')}${r.source ? ' (auto-detected, so check the labels)' : ''}</p>` : ''}
      <h2>Ingredients</h2>
      <ul class="ingredients">
        ${r.ingredients.map((x) => scaledIngredient(x, factor)).map((x) =>
          `<li><span>${esc(x.name)}</span><span class="amt">${esc(x.amount)}</span></li>`).join('')}
      </ul>
      <h2>Method</h2>
      <ol class="method">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      ${r.sourceUrl ? `<p class="hint">Recipe from <a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">${esc(r.source)}</a></p>` : ''}
      <div class="actions sticky">
        ${inPlan
          ? '<button class="btn danger" id="toggle">Remove from my week</button>'
          : '<button class="btn primary big" id="toggle">♥ Add to my week</button>'}
      </div>
    </section>`;
  view.querySelector('#back').addEventListener('click', () => history.length > 1 ? history.back() : go('swipe'));
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
      ${shared.length ? `<div class="overlap block">♻️ <strong>${shared.length}</strong> ingredients are used in more than one meal: ${esc(shared.slice(0, 6).map((s) => s.name).join(', '))}${shared.length > 6 ? '…' : ''}</div>` : ''}
      ${recipes.length ? `<ul class="plan-list">
        ${recipes.map((r) => `
          <li class="plan-item">
            <a href="#/recipe/${esc(r.id)}" class="plan-link">
              ${recipeArt(r, 'thumb')}
              <span><strong>${esc(r.title)}</strong><small>${r.time ? `${r.time} min · ` : ''}${euro(r.cost)}</small></span>
            </a>
            <div class="portions" data-id="${esc(r.id)}">
              <button class="round sm" data-d="-1" aria-label="Fewer portions">−</button>
              <span>${portionsFor(r.id)}<small>portions</small></span>
              <button class="round sm" data-d="1" aria-label="More portions">+</button>
            </div>
            <button class="remove" data-remove="${esc(r.id)}" aria-label="Remove">✕</button>
          </li>`).join('')}
      </ul>` : '<div class="empty"><div class="big-emoji">🫙</div><p>No meals yet. Go and swipe some!</p></div>'}
      <div class="actions">
        <button class="btn ghost" id="swipe">${recipes.length < state.cookCount ? 'Find more meals' : 'Keep swiping'}</button>
        ${recipes.length ? '<button class="btn primary big" id="list">Shopping list</button>' : ''}
      </div>
    </section>`;
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

function listScreen() {
  const items = buildList();
  const byStore = state.listGroup === 'store';
  const groups = byStore
    ? STORES.map((s) => ({ id: s.id, label: s.label, emoji: '🏪', items: items.filter((it) => it.store === s.id && it.cat !== 'staple') }))
      .concat([{ id: 'staple', label: 'Check you have', emoji: '🧂', items: items.filter((it) => it.cat === 'staple') }])
    : CATEGORIES.map((c) => ({ ...c, items: items.filter((it) => it.cat === c.id) }));
  const left = items.filter((it) => !it.checked && it.cat !== 'staple').length;

  view.innerHTML = `
    <section class="screen">
      <h1>Shopping list</h1>
      <p class="sub">${items.length ? `${left} item${left === 1 ? '' : 's'} left to get` : 'Your list is empty. Pick some meals first.'}</p>
      <div class="list-tools">
        <div class="segmented">
          <button class="${byStore ? '' : 'on'}" data-group="aisle">By aisle</button>
          <button class="${byStore ? 'on' : ''}" data-group="store">By shop</button>
        </div>
        <button class="btn ghost sm" id="share">Share</button>
      </div>
      <form class="add-item" id="add">
        <input class="input" name="item" placeholder="Add something else, e.g. toilet roll" autocomplete="off">
        <button class="btn primary" type="submit">Add</button>
      </form>
      ${groups.filter((g) => g.items.length).map((g) => `
        <h2 class="group-title">${g.emoji} ${esc(g.label)} <small>${g.items.length}</small></h2>
        <ul class="shop-list">
          ${g.items.map((it) => {
            const store = STORES.find((s) => s.id === it.store) || STORES[0];
            return `
            <li class="shop-item ${it.checked ? 'done' : ''}" data-key="${esc(it.key)}">
              <label class="check">
                <input type="checkbox" ${it.checked ? 'checked' : ''}>
                <span class="tick"></span>
                <span class="item-text">
                  <span class="item-name">${esc(it.name)}</span>
                  ${it.amount ? `<span class="item-amt">${esc(it.amount)}</span>` : ''}
                  ${it.from.length > 1 ? `<span class="item-shared" title="${esc(it.from.join(', '))}">♻️ ${it.from.length} meals</span>` : ''}
                </span>
              </label>
              ${it.cat === 'staple' ? '' : `
              <select class="store-pick" style="--store:${store.color}" aria-label="Shop for ${esc(it.name)}">
                ${STORES.map((s) => `<option value="${s.id}" ${s.id === it.store ? 'selected' : ''}>${s.short}</option>`).join('')}
              </select>`}
              ${it.custom ? `<button class="remove" data-custom="${esc(it.id)}" aria-label="Remove">✕</button>` : ''}
            </li>`;
          }).join('')}
        </ul>`).join('')}
      ${items.some((it) => it.checked) ? '<div class="actions"><button class="btn ghost" id="clear">Untick everything</button></div>' : ''}
    </section>`;

  const setItem = (key, patch) => { state.items[key] = { ...state.items[key], ...patch }; save(); };
  view.querySelectorAll('.shop-item').forEach((li) => {
    li.querySelector('input[type=checkbox]').addEventListener('change', (e) => {
      setItem(li.dataset.key, { checked: e.target.checked });
      li.classList.toggle('done', e.target.checked);
    });
    li.querySelector('.store-pick')?.addEventListener('change', (e) => {
      setItem(li.dataset.key, { store: e.target.value });
      listScreen();
    });
  });
  view.querySelectorAll('[data-custom]').forEach((b) => b.addEventListener('click', () => {
    state.custom = state.custom.filter((c) => c.id !== b.dataset.custom);
    delete state.items[`custom:${b.dataset.custom}`];
    save(); listScreen();
  }));
  view.querySelectorAll('[data-group]').forEach((b) => b.addEventListener('click', () => {
    state.listGroup = b.dataset.group; save(); listScreen();
  }));
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
  view.querySelector('#share').addEventListener('click', () => shareList(items));
}

async function shareList(items) {
  const lines = items.filter((it) => !it.checked).map((it) => {
    const store = it.store ? ` [${STORES.find((s) => s.id === it.store)?.short}]` : '';
    return `☐ ${it.name}${it.amount ? ` (${it.amount})` : ''}${store}`;
  });
  const text = `🛒 Shopping list\n\n${lines.join('\n')}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Shopping list', text });
    else { await navigator.clipboard.writeText(text); toast('List copied to clipboard'); }
  } catch { /* share cancelled */ }
}

// ---------- settings ----------

function settingsScreen() {
  const user = sync.currentUser();
  const goals = GOALS.filter((g) => state.goals.includes(g.id)).map((g) => g.label).join(', ') || 'None';
  const limits = [
    ...ALLERGENS.filter((a) => state.allergies.includes(a.id)).map((a) => `no ${a.label.toLowerCase()}`),
    ...DIETS.filter((d) => state.diets.includes(d.id)).map((d) => d.label.toLowerCase()),
  ].join(', ') || 'None';
  view.innerHTML = `
    <section class="screen">
      <h1>Settings</h1>
      <h2>Account &amp; sync</h2>
      <div class="card-block">
        ${!sync.isConfigured()
          ? '<p>📱 Your data is saved on this device. Cloud sync with Google sign-in can be turned on later (see the README).</p>'
          : user
            ? `<p>✅ Signed in as <strong>${esc(user.email)}</strong>. Your plan syncs across devices.</p><button class="btn ghost" id="signout">Sign out</button>`
            : '<p>Sign in to sync your list and plan across your devices.</p><button class="btn google" id="signin"><span>G</span> Sign in with Google</button>'}
      </div>
      <h2>Your preferences</h2>
      <div class="card-block settings-rows">
        <a href="#/goals" class="row"><span>Goals</span><span class="val">${esc(goals)} ›</span></a>
        <a href="#/cook" class="row"><span>Cooking</span><span class="val">${state.cookCount}× for ${state.people} ›</span></a>
        <a href="#/limits" class="row"><span>Limitations</span><span class="val">${esc(limits)} ›</span></a>
      </div>
      <h2>Start over</h2>
      <div class="card-block">
        <button class="btn primary" id="week">Start a new week</button>
        <p class="hint">Clears your picked meals and list but keeps your preferences.</p>
        <button class="btn danger" id="reset">Reset everything</button>
      </div>
      <p class="hint center">Extra recipes from <a href="https://www.themealdb.com" target="_blank" rel="noopener">TheMealDB</a>. Shop prices are coming soon.</p>
    </section>`;
  view.querySelector('#signin')?.addEventListener('click', () => sync.signIn());
  view.querySelector('#signout')?.addEventListener('click', () => sync.signOut());
  view.querySelector('#week').addEventListener('click', () => {
    if (confirm('Clear this week\'s meals and shopping list?')) { startNewWeek(); go('swipe'); }
  });
  view.querySelector('#reset').addEventListener('click', () => {
    if (confirm('Delete all your data and start from scratch?')) { resetAll(); go('goals'); }
  });
}

// ---------- router ----------

const ONBOARDING = ['goals', 'cook', 'limits'];
const currentRoute = () => location.hash.replace(/^#\/?/, '').split('/')[0] || '';

function render() {
  const [route, param] = location.hash.replace(/^#\/?/, '').split('/');
  if (!route) return go(state.onboarded ? 'swipe' : 'goals');
  if (!state.onboarded && !ONBOARDING.includes(route) && route !== 'settings') return go('goals');

  const inOnboarding = !state.onboarded && ONBOARDING.includes(route);
  steps.hidden = !inOnboarding;
  nav.hidden = inOnboarding;
  if (inOnboarding) {
    const idx = ONBOARDING.indexOf(route);
    steps.innerHTML = [...ONBOARDING, 'swipe'].map((_, i) => `<span class="${i <= idx ? 'on' : ''}"></span>`).join('');
  }
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#/${route}`));
  const count = nav.querySelector('.count');
  count.textContent = state.liked.length;
  count.hidden = !state.liked.length;

  const screens = { goals: goalsScreen, cook: cookScreen, limits: limitsScreen, swipe: swipeScreen,
    plan: planScreen, list: listScreen, settings: settingsScreen, recipe: () => recipeScreen(decodeURIComponent(param || '')) };
  (screens[route] || (() => go('swipe')))();
  if (route !== 'swipe') window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
document.addEventListener('keydown', (e) => {
  if (currentRoute() !== 'swipe' || e.target.matches('input')) return;
  if (e.key === 'ArrowRight') view.querySelector('#like')?.click();
  if (e.key === 'ArrowLeft') view.querySelector('#nope')?.click();
});

render();
sync.initSync(render);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js');
}
