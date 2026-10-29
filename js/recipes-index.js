// One place to look up any recipe: built-in, fetched this session, or a saved TheMealDB favourite.

import { RECIPES } from './recipes.js';
import { state } from './store.js';

const builtIn = new Map(RECIPES.map((r) => [r.id, r]));
const fetched = new Map(); // TheMealDB recipes loaded this session

export const addFetched = (recipes) => recipes.forEach((r) => fetched.set(r.id, r));

export const getRecipe = (id) => builtIn.get(id) || state.extRecipes[id] || fetched.get(id);

export const allCandidates = () => {
  const out = [...RECIPES];
  for (const r of fetched.values()) if (!builtIn.has(r.id)) out.push(r);
  return out;
};
