// Builds the shopping list by merging ingredients from every picked recipe.

import { state } from './store.js';
import { getRecipe } from './recipes-index.js';

export const normName = (name) => name.trim().toLowerCase();
export const portionsFor = (id) => state.portions[id] ?? state.people;

const COUNT_UNITS = new Set(['', 'tin', 'clove', 'stick', 'bunch', 'jar', 'pack', 'bottle', 'tub', 'thumb', 'loaf', 'head']);
const PLURAL = { loaf: 'loaves', bunch: 'bunches' };

function roundQty(qty, unit) {
  if (unit === 'g' || unit === 'ml') return qty < 20 ? Math.ceil(qty) : Math.ceil(qty / 10) * 10;
  if (unit === 'tsp' || unit === 'tbsp') return Math.ceil(qty * 2) / 2;
  if (COUNT_UNITS.has(unit)) return Math.max(1, Math.ceil(qty - 0.05));
  return Math.round(qty * 10) / 10;
}

export function formatAmount(qty, unit) {
  if (!qty) return '';
  if ((unit === 'g' || unit === 'ml') && qty >= 1000) return `${+(qty / 1000).toFixed(1)} ${unit === 'g' ? 'kg' : 'l'}`;
  if (unit === 'g' || unit === 'ml') return `${qty} ${unit}`;
  if (!unit) return `${qty}`;
  const u = qty > 1 && COUNT_UNITS.has(unit) ? (PLURAL[unit] || `${unit}s`) : unit;
  return `${qty} ${u}`;
}

// Scaled ingredient for display inside a recipe.
export function scaledIngredient(ing, factor) {
  if (!ing.qty) return { ...ing, amount: ing.text || '' };
  const qty = roundQty(ing.qty * factor, ing.unit);
  return { ...ing, amount: formatAmount(qty, ing.unit) };
}

export function buildList() {
  const map = new Map();
  for (const id of state.liked) {
    const r = getRecipe(id);
    if (!r) continue;
    const factor = portionsFor(id) / (r.serves || 4);
    for (const ing of r.ingredients) {
      const key = normName(ing.name);
      let e = map.get(key);
      if (!e) {
        e = { key, name: ing.name, cat: ing.cat || 'pantry', amounts: {}, notes: [], from: [] };
        map.set(key, e);
      }
      if (ing.qty) e.amounts[ing.unit] = (e.amounts[ing.unit] || 0) + ing.qty * factor;
      else if (ing.text && !e.notes.includes(ing.text)) e.notes.push(ing.text);
      if (!e.from.includes(r.title)) e.from.push(r.title);
    }
  }
  const items = [...map.values()].map((e) => {
    const parts = Object.entries(e.amounts).map(([unit, q]) => formatAmount(roundQty(q, unit), unit));
    return { ...e, amount: [...parts, ...e.notes].filter(Boolean).join(' + '), custom: false };
  });
  for (const c of state.custom) {
    items.push({ key: `custom:${c.id}`, id: c.id, name: c.name, cat: 'other', amount: '', from: [], custom: true });
  }
  for (const it of items) {
    const o = state.items[it.key] || {};
    it.checked = Boolean(o.checked);
    it.store = o.store || '';
  }
  return items;
}

// Ingredients (not staples) used by two or more picked recipes - these mean less waste.
export function sharedIngredients() {
  return buildList().filter((it) => it.cat !== 'staple' && it.from.length > 1);
}
