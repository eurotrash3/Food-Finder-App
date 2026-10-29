// Recipes from TheMealDB (https://www.themealdb.com). Its recipes carry no allergen, diet, cost, time or
// servings data, so we work those out from the ingredients and instructions. Ingredient names are
// normalised ("Onions", "chopped onion" -> "onion") so the app can spot food shared between recipes.

const API = 'https://www.themealdb.com/api/json/v1/1/';

const has = (text, words) => words.some((w) => new RegExp(`\\b${w}`, 'i').test(text));

// ---------- ingredient names ----------

const SYNONYMS = {
  'ground beef': 'minced beef', 'beef mince': 'minced beef', 'mince': 'minced beef', 'lean minced beef': 'minced beef',
  'ground pork': 'minced pork', 'pork mince': 'minced pork', 'ground lamb': 'minced lamb', 'lamb mince': 'minced lamb',
  'ground turkey': 'turkey mince', 'chicken breasts': 'chicken breast', 'chicken thighs': 'chicken thigh',
  'chicken legs': 'chicken leg', 'chicken breast fillets': 'chicken breast', 'skinless chicken breast': 'chicken breast',
  'onions': 'onion', 'brown onion': 'onion', 'white onion': 'onion', 'yellow onion': 'onion', 'red onions': 'red onion',
  'spring onions': 'spring onion', 'scallions': 'spring onion', 'green onions': 'spring onion', 'shallots': 'shallot',
  'garlic clove': 'garlic', 'garlic cloves': 'garlic', 'minced garlic': 'garlic', 'garlic powder': 'garlic powder',
  'carrots': 'carrot', 'potatoes': 'potato', 'baby potatoes': 'potato', 'new potatoes': 'potato', 'floury potatoes': 'potato',
  'sweet potatoes': 'sweet potato', 'tomatoes': 'tomato', 'plum tomatoes': 'tomato', 'cherry tomatoes': 'cherry tomato',
  'chopped tomatoes': 'chopped tomatoes', 'canned tomatoes': 'chopped tomatoes', 'tinned tomatoes': 'chopped tomatoes',
  'diced tomatoes': 'chopped tomatoes', 'tinned tomato': 'chopped tomatoes', 'chopped tomato': 'chopped tomatoes', 'canned tomato': 'chopped tomatoes', 'tomato puree': 'tomato purée', 'tomato paste': 'tomato purée',
  'red pepper': 'red pepper', 'red peppers': 'red pepper', 'red bell pepper': 'red pepper', 'green pepper': 'green pepper',
  'green bell pepper': 'green pepper', 'yellow pepper': 'yellow pepper', 'mushrooms': 'mushroom', 'chestnut mushroom': 'mushroom',
  'button mushrooms': 'mushroom', 'courgettes': 'courgette', 'zucchini': 'courgette', 'aubergine': 'aubergine', 'eggplant': 'aubergine',
  'celery stalks': 'celery', 'celery stick': 'celery', 'leeks': 'leek', 'peas': 'frozen peas', 'garden peas': 'frozen peas',
  'eggs': 'egg', 'free-range eggs': 'egg', 'large eggs': 'egg', 'egg yolks': 'egg yolk', 'egg whites': 'egg white',
  'cheddar cheese': 'cheddar', 'mature cheddar': 'cheddar', 'parmesan cheese': 'parmesan', 'parmigiano-reggiano': 'parmesan',
  'mozzarella balls': 'mozzarella', 'feta cheese': 'feta', 'greek yogurt': 'greek yogurt', 'natural yoghurt': 'natural yogurt',
  'yogurt': 'natural yogurt', 'plain yogurt': 'natural yogurt', 'double cream': 'cream', 'heavy cream': 'cream', 'single cream': 'cream',
  'whipping cream': 'cream', 'unsalted butter': 'butter', 'salted butter': 'butter', 'whole milk': 'milk', 'semi-skimmed milk': 'milk',
  'all purpose flour': 'plain flour', 'flour': 'plain flour', 'caster sugar': 'sugar', 'granulated sugar': 'sugar',
  'chicken stock cube': 'chicken stock', 'beef stock cube': 'beef stock', 'vegetable stock cube': 'vegetable stock',
  'fresh coriander': 'coriander', 'cilantro': 'coriander', 'coriander leaves': 'coriander', 'fresh basil': 'basil',
  'basil leaves': 'basil', 'parsley': 'parsley', 'flat leaf parsley': 'parsley', 'fresh thyme': 'thyme', 'thyme': 'thyme',
  'bay leaves': 'bay leaf', 'red chilli': 'chilli', 'green chilli': 'chilli', 'chili': 'chilli', 'chillies': 'chilli',
  'red chilli flakes': 'chilli flakes', 'chilli powder': 'chilli powder', 'chili powder': 'chilli powder', 'cumin seeds': 'cumin',
  'ground cumin': 'cumin', 'ground coriander': 'ground coriander', 'paprika': 'paprika', 'smoked paprika': 'paprika',
  'lemons': 'lemon', 'lemon juice': 'lemon', 'lemon zest': 'lemon', 'limes': 'lime', 'lime juice': 'lime',
  'basmati rice': 'rice', 'long grain rice': 'rice', 'white rice': 'rice', 'jasmine rice': 'rice', 'brown rice': 'rice',
  'risotto rice': 'arborio rice', 'kidney beans': 'kidney beans', 'red kidney beans': 'kidney beans', 'chick peas': 'chickpeas',
  'black beans': 'black beans', 'cannellini beans': 'cannellini beans', 'red lentils': 'red lentils', 'lentils': 'lentils',
  'egg noodles': 'egg noodles', 'rice noodles': 'rice noodles', 'noodles': 'egg noodles', 'tortillas': 'tortilla wraps',
  'flour tortilla': 'tortilla wraps', 'tortilla': 'tortilla wraps', 'coconut milk': 'coconut milk', 'soy sauce': 'soy sauce',
  'soya sauce': 'soy sauce', 'dark soy sauce': 'soy sauce', 'light soy sauce': 'soy sauce', 'spinach leaves': 'spinach',
  'baby spinach': 'spinach', 'fresh ginger': 'ginger', 'ginger root': 'ginger', 'vegetable oil': 'oil', 'olive oil': 'oil',
  'extra virgin olive oil': 'oil', 'sunflower oil': 'oil', 'rapeseed oil': 'oil', 'black pepper': 'salt & pepper',
  'pepper': 'salt & pepper', 'salt': 'salt & pepper', 'sea salt': 'salt & pepper', 'water': '',
};

export function normalizeName(raw) {
  let n = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (n in SYNONYMS) return SYNONYMS[n];
  // Drop prep words: "chopped onion" -> "onion", "fresh parsley" -> "parsley".
  const stripped = n.replace(/^(fresh|hot|cold|chopped|diced|sliced|minced|grated|large|small|medium|ripe|free-range|organic|raw)\s+/, '');
  if (stripped !== n) return normalizeName(stripped);
  if (/\bsalt$/.test(n)) return 'salt & pepper'; // kosher salt, sea salt...
  if (n.endsWith('oes')) n = n.slice(0, -2); // potatoes -> potato
  else if (/[^s]s$/.test(n) && !/(us|beans|peas|lentils|chickpeas|noodles|oats|leaves|flakes|crumbs|wraps|greens|sprouts|herbs)$/.test(n)) n = n.slice(0, -1);
  return SYNONYMS[n] ?? n;
}

// ---------- allergens, diet, categories ----------

const ALLERGEN_WORDS = {
  gluten: ['flour', 'bread', 'pasta', 'spaghetti', 'noodle', 'couscous', 'tortilla', 'wrap', 'breadcrumb', 'soy sauce', 'barley',
    'beer', 'ale', 'stout', 'pastry', 'macaroni', 'lasagne', 'penne', 'fettuccine', 'linguine', 'rigatoni', 'tagliatelle', 'fusilli',
    'farfalle', 'biscuit', 'cracker', 'wheat', 'buns?\\b', 'pitta', 'pita', 'naan', 'semolina', 'bulgur', 'baguette', 'ciabatta'],
  dairy: ['(?<!(coconut|almond|oat|soy|soya) )milk', 'cheese', '(?<!(peanut|almond|nut) )butter(?! ?beans?)', '(?<!coconut )cream',
    'yogurt', 'yoghurt', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'ghee', 'creme fraiche', 'crème fraîche', 'mascarpone',
    'ricotta', 'halloumi', 'paneer', 'gruy[eè]re', 'brie', 'pecorino', 'fromage', 'quark'],
  egg: ['eggs?\\b', 'egg yolk', 'egg white', 'mayonnaise', 'egg noodles'],
  nuts: ['almond', 'walnut', 'cashew', 'pecan', 'hazelnut', 'pistachio', 'pine nut', 'macadamia', 'brazil nut', 'pesto'],
  peanuts: ['peanut'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'haddock', 'anchov', 'sardine', 'mackerel', 'trout', 'worcestershire', 'hake', 'pollock',
    'sea bass', 'barramundi', 'herring', 'bream', 'tilapia', 'pilchard', 'seafood', 'kipper'],
  shellfish: ['prawn', 'shrimp', 'crab', 'lobster', 'mussel', 'clam', 'scallop', 'oyster', 'squid', 'calamari'],
  soy: ['soy', 'soya', 'tofu', 'edamame', 'miso'],
  sesame: ['sesame', 'tahini'],
};

const MEAT_WORDS = ['chicken', 'beef', 'pork', 'lamb', 'bacon', 'ham\\b', 'sausage', 'turkey', 'mince', 'duck', 'veal', 'chorizo',
  'prosciutto', 'pancetta', 'venison', 'liver', 'steak', 'gammon', 'salami', 'pepperoni', 'goose', 'rabbit', 'oxtail', 'brisket',
  'goat(?!s? ?cheese)', 'black pudding', 'kidney(?! beans?)'];
const PORK_WORDS = ['pork', 'bacon', 'ham\\b', 'sausage', 'chorizo', 'pancetta', 'prosciutto', 'gammon', 'lard', 'salami', 'pepperoni',
  'black pudding'];
// Expensive proteins count fully; cheese, cream, wine and nuts add a bit.
const PREMIUM_WORDS = ['steak', 'sirloin', 'fillet(?!.*fish)', 'lamb', 'salmon', 'prawn', 'shrimp', 'scallop', 'duck', 'brisket', 'veal',
  'venison', 'lobster', 'crab', 'beef(?! stock)'];
const EXTRA_WORDS = ['parmesan', 'pecorino', 'mascarpone', 'cream', 'wine', 'brandy', 'sherry', 'pine nut', 'cashew', 'saffron',
  'mozzarella', 'feta', 'halloumi', 'gruy', 'cheese', 'cheddar', 'avocado'];

const CAT_WORDS = {
  staple: ['^salt & pepper$', '\\boil$'],
  pantry: ['^ground ', 'powder', 'sauce', 'paste', 'pur[eé]e', 'dried', 'stock', 'tinned', 'canned', 'flakes', 'seeds?\\b', 'flour', 'sugar',
    'rigatoni', 'farfalle', 'tagliatelle', 'fettuccine', 'orzo', 'gnocchi', 'cornstarch', 'salsa', 'mayonnaise', 'hot ?sauce', 'sherry',
    'sake', 'mirin', 'treacle', 'allspice', 'cayenne', 'cajun', 'seasoning', 'grain', 'dal\\b', 'passata', 'taco shell', 'vinaigrette',
    'soya milk', 'bicarbonate', 'prune', 'dressing',
    'vinegar', 'coconut milk', 'coconut cream', 'peanut butter', 'beans?\\b(?!.*sprout)', 'lentil', 'chickpea', 'rice', 'pasta',
    'noodle', 'spaghetti', 'penne', 'macaroni', 'lasagne', 'fusilli', 'linguine', 'couscous', 'quinoa', 'oats', 'honey', 'mustard',
    'ketchup', 'cumin', 'paprika', 'turmeric', 'cinnamon', 'oregano', 'garam masala', 'curry', 'bay leaf', 'chopped tomatoes', 'nutmeg',
    'wine', 'beer', 'stout', 'cider', 'garni', 'spice', 'masala', 'chocolate', 'cocoa', 'yeast', 'baking', 'syrup', 'jam', 'raisin',
    'sultana', 'olives?\\b', 'breadcrumb', 'cornflour', 'starch', 'tuna', 'sweetcorn', 'capers', 'stuffing', 'gravy'],
  frozen: ['frozen'],
  dairy: ['eggs?\\b', 'egg yolk', 'egg white', 'tofu', 'vegan butter', ...ALLERGEN_WORDS.dairy],
  meat: MEAT_WORDS,
  fish: [...ALLERGEN_WORDS.fish, ...ALLERGEN_WORDS.shellfish],
  bakery: ['bread(?!crumb)', 'tortilla', 'wrap', 'buns?\\b', 'pitta', 'pita', 'naan', 'bagel', 'baguette', 'roll', 'ciabatta', 'pastry'],
};

function categorize(name) {
  for (const [cat, words] of Object.entries(CAT_WORDS)) if (has(name, words)) return cat;
  return 'veg';
}

// ---------- the main staple a recipe is built around ----------

export const BASE_WORDS = {
  pasta: ['pasta', 'spaghetti', 'penne', 'macaroni', 'lasagne', 'fusilli', 'linguine', 'rigatoni', 'tagliatelle', 'fettuccine',
    'farfalle', 'orzo', 'gnocchi', 'ravioli', 'tortellini', 'conchiglie'],
  noodles: ['noodle'], // before rice, so "rice noodles" count as noodles
  rice: ['rice\\b(?! noodle)', 'arborio'],
  potato: ['potato(?!.*sweet)', '^potato'],
  bread: ['bread(?!crumb)', 'tortilla', 'wrap', 'buns?\\b', 'pitta', 'pita', 'naan', 'baguette', 'ciabatta', 'pastry', 'pizza',
    'taco', 'burger', 'sandwich', 'enchilada', 'fajita'],
  grains: ['couscous', 'quinoa', 'bulgur', 'oats', 'barley', 'polenta'],
};

function detectBase(ingredientNames, title) {
  for (const [base, words] of Object.entries(BASE_WORDS)) {
    if (ingredientNames.some((n) => has(n, words) && !/sweet potato/.test(n))) return base;
  }
  // Nothing in the ingredients - fall back to the dish name ("Pizza Margherita", "Fish tacos").
  const t = title.replace(/sweet potato/gi, '');
  for (const [base, words] of Object.entries(BASE_WORDS)) if (has(t, words)) return base;
  return 'none';
}

// ---------- measures ----------

const UNIT_MAP = { g: 'g', gr: 'g', gram: 'g', grams: 'g', kg: 'kg', ml: 'ml', l: 'l', litre: 'l', liter: 'l', litres: 'l',
  tbsp: 'tbsp', tbs: 'tbsp', tblsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', oz: 'oz', ounce: 'oz', ounces: 'oz', cup: 'cup', cups: 'cup',
  tin: 'tin', tins: 'tin', can: 'tin', cans: 'tin', clove: 'clove', cloves: 'clove' };

// "200g" -> {qty:200, unit:'g'}; "1/2 tsp" -> {qty:.5, unit:'tsp'}; "2 medium" -> {qty:2, unit:''}; "pinch" -> {qty:0, text:'pinch'}
export function parseMeasure(raw) {
  const s = (raw || '').trim().toLowerCase().replace(/½/g, '1/2').replace(/¼/g, '1/4').replace(/¾/g, '3/4');
  const m = s.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*([a-z]+)?\b/);
  if (!m) return { qty: 0, unit: '', text: (raw || '').trim() };
  let qty;
  const n = m[1].replace(',', '.');
  if (n.includes('/')) {
    const parts = n.split(/\s+/);
    const [a, b] = parts.pop().split('/').map(Number);
    qty = (parts.length ? Number(parts[0]) : 0) + a / b;
  } else qty = Number(n);
  // Unknown words after the number ("2 medium", "3 large") are treated as a plain count.
  let unit = (m[2] && UNIT_MAP[m[2]]) || '';
  if (unit === 'kg') { qty *= 1000; unit = 'g'; }
  if (unit === 'l') { qty *= 1000; unit = 'ml'; }
  if (unit === 'lb') { qty *= 454; unit = 'g'; }
  if (unit === 'oz') { qty *= 28; unit = 'g'; }
  return { qty, unit };
}

// ---------- time, cost and tags ----------

const SLOW_WORDS = ['stew', 'hotpot', 'casserole', 'pie', 'roast', 'braise', 'lasagne', 'tagine', 'goulash', 'shepherd'];

// Rough total time: add up the cooking times mentioned in the method, plus prep. Ignores marinating/overnight
// rests, and slow dishes get at least an hour.
function estimateTime(instructions, title) {
  let mins = 0;
  const re = /(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*(hours?|hrs?|minutes?|mins?)\b/gi;
  for (const m of instructions.matchAll(re)) {
    const context = instructions.slice(Math.max(0, m.index - 60), m.index);
    if (/marinat|overnight|rest|chill|soak|cool|fridge|refrigerat/i.test(context)) continue;
    const v = Number(m[2] || m[1]);
    mins += /^h/i.test(m[3]) ? v * 60 : v;
  }
  let total = mins + 15;
  if (has(title, SLOW_WORDS)) total = Math.max(total, 60);
  return Math.min(180, Math.max(15, Math.round(total / 5) * 5));
}

function estimateCost(ingredients) {
  let points = 0;
  for (const i of ingredients) {
    if (i.cat === 'staple') continue;
    if (has(i.name, PREMIUM_WORDS)) points += 3;
    else if (i.cat === 'meat' || i.cat === 'fish') points += 1.5;
    else if (has(i.name, EXTRA_WORDS)) points += 0.7;
    else points += 0.25;
  }
  return points <= 3.5 ? 1 : points <= 6 ? 2 : 3;
}

const MEALPREP_WORDS = ['stew', 'curry', 'chilli', 'chili', 'soup', 'bake', 'casserole', 'pie', 'lasagne', 'bolognese', 'tagine',
  'hotpot', 'dahl', 'dal', 'ragu', 'goulash', 'traybake'];
const FAMILY_WORDS = ['pie', 'pasta', 'spaghetti', 'burger', 'pizza', 'bake', 'fajita', 'taco', 'macaroni', 'mac and cheese',
  'lasagne', 'nugget', 'meatball', 'sausage', 'shepherd', 'cottage', 'bolognese', 'pancake', 'wrap'];
const RICH_WORDS = ['cream', 'butter', 'deep fry', 'deep-fry', 'pastry', 'sugar', 'bacon', 'cheese'];

function tagsFor(r, instructions) {
  const names = r.ingredients.map((i) => i.name);
  const vegCount = r.ingredients.filter((i) => i.cat === 'veg').length;
  const tags = [];
  if (r.cost === 1) tags.push('money');
  if (r.time <= 30) tags.push('quick');
  if (has(r.title, MEALPREP_WORDS)) tags.push('mealprep');
  if (has(r.title, FAMILY_WORDS)) tags.push('family');
  if (r.ingredients.some((i) => i.cat === 'meat' || i.cat === 'fish') || has(names.join(' '), ['egg', 'tofu', 'lentil', 'chickpea', 'beans'])) tags.push('protein');
  const rich = RICH_WORDS.filter((w) => has(names.join(' ') + ' ' + instructions, [w])).length;
  if (vegCount >= 3 && rich <= 1) tags.push('healthy');
  return tags;
}

// ---------- conversion ----------

export function convertMeal(meal) {
  const ingredients = [];
  for (let n = 1; n <= 20; n++) {
    const rawName = (meal[`strIngredient${n}`] || '').trim();
    if (!rawName) continue;
    const name = normalizeName(rawName);
    if (!name) continue;
    const cat = categorize(name);
    const { qty, unit, text } = parseMeasure(meal[`strMeasure${n}`]);
    ingredients.push({ name, qty: cat === 'staple' ? 0 : qty, unit, cat, text: cat === 'staple' ? '' : (text || '') });
  }
  const names = ingredients.map((x) => x.name);
  const allText = names.join(' | ') + ' | ' + meal.strMeal;
  const allergens = Object.keys(ALLERGEN_WORDS).filter((a) => has(allText, ALLERGEN_WORDS[a]));
  const category = meal.strCategory || '';
  let diet = 'meat';
  if (category === 'Vegan') diet = 'vegan';
  else if (!has(allText, MEAT_WORDS)) {
    const fishy = allergens.includes('fish') || allergens.includes('shellfish');
    if (fishy) diet = 'pescatarian';
    else diet = (!allergens.includes('dairy') && !allergens.includes('egg') && !has(allText, ['honey'])) ? 'vegan' : 'vegetarian';
  }
  const instructions = meal.strInstructions || '';
  const steps = instructions
    .split(/\r?\n+/)
    .map((s) => s.replace(/^\s*(step\s*\d+[:.]?|\d+[.)])\s*/i, '').trim())
    .filter((s) => s.length > 2 && !/^step\s*\d+$/i.test(s));
  const r = {
    id: `mdb-${meal.idMeal}`,
    title: meal.strMeal.trim(),
    image: meal.strMealThumb,
    desc: [meal.strArea !== 'Unknown' ? meal.strArea : '', category].filter(Boolean).join(' · '),
    category,
    serves: 4,
    diet,
    pork: has(allText, PORK_WORDS),
    allergens,
    base: detectBase(names, meal.strMeal),
    ingredients,
    steps,
    source: 'TheMealDB',
    sourceUrl: meal.strSource || `https://www.themealdb.com/meal/${meal.idMeal}`,
  };
  r.time = estimateTime(instructions, r.title);
  r.cost = estimateCost(ingredients);
  r.tags = tagsFor(r, instructions);
  return r;
}

// ---------- fetching ----------

const getJson = (path) => fetch(API + path).then((r) => r.json());

async function lookupMany(ids) {
  const results = await Promise.allSettled(ids.map((id) => getJson(`lookup.php?i=${id}`)));
  return results
    .map((r) => r.status === 'fulfilled' && r.value?.meals?.[0])
    .filter(Boolean)
    .filter((m) => m.strCategory !== 'Dessert')
    .map(convertMeal);
}

// Random recipes (one request each - the free API has no batch endpoint).
export async function fetchRandomRecipes(count = 8) {
  const results = await Promise.allSettled(Array.from({ length: count }, () => getJson('random.php')));
  const ids = [...new Set(results.map((r) => r.status === 'fulfilled' && r.value?.meals?.[0]?.idMeal).filter(Boolean))];
  return lookupMany(ids);
}

// Recipes whose main ingredient is `ingredient` (e.g. "rice", "chicken_breast"), skipping ids we already have.
export async function fetchByIngredient(ingredient, { limit = 6, skip = new Set() } = {}) {
  const data = await getJson(`filter.php?i=${encodeURIComponent(ingredient.trim().replace(/\s+/g, '_'))}`);
  const ids = (data?.meals || []).map((m) => m.idMeal).filter((id) => !skip.has(`mdb-${id}`));
  ids.sort(() => Math.random() - 0.5);
  return lookupMany(ids.slice(0, limit));
}
