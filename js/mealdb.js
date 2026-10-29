// Extra recipes from TheMealDB (free public API, https://www.themealdb.com).
// Its recipes carry no allergen, diet or cost data, so we guess from the ingredient names.

const API = 'https://www.themealdb.com/api/json/v1/1/';

const has = (text, words) => words.some((w) => new RegExp(`\\b${w}`, 'i').test(text));

const ALLERGEN_WORDS = {
  gluten: ['flour', 'bread', 'pasta', 'spaghetti', 'noodle', 'couscous', 'tortilla', 'wrap', 'breadcrumb', 'soy sauce', 'barley',
    'beer', 'ale', 'stout', 'pastry', 'macaroni', 'lasagne', 'penne', 'fettuccine', 'linguine', 'rigatoni', 'tagliatelle',
    'biscuit', 'cracker', 'wheat', 'buns?\\b', 'pitta', 'pita', 'naan', 'semolina', 'bulgur'],
  dairy: ['(?<!(coconut|almond|oat|soy|soya) )milk', 'cheese', '(?<!(peanut|almond|nut) )butter(?! ?beans?)', '(?<!coconut )cream', 'yogurt', 'yoghurt', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'ghee',
    'creme fraiche', 'crème fraîche', 'mascarpone', 'ricotta', 'halloumi', 'paneer', 'gruyere', 'brie'],
  egg: ['eggs?\\b', 'egg yolk', 'egg white', 'mayonnaise'],
  nuts: ['almond', 'walnut', 'cashew', 'pecan', 'hazelnut', 'pistachio', 'pine nut', 'macadamia', 'brazil nut'],
  peanuts: ['peanut'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'haddock', 'anchov', 'sardine', 'mackerel', 'trout', 'worcestershire', 'hake', 'pollock'],
  shellfish: ['prawn', 'shrimp', 'crab', 'lobster', 'mussel', 'clam', 'scallop', 'oyster', 'squid', 'calamari'],
  soy: ['soy', 'soya', 'tofu', 'edamame', 'miso'],
  sesame: ['sesame', 'tahini'],
};

const MEAT_WORDS = ['chicken', 'beef', 'pork', 'lamb', 'bacon', 'ham\\b', 'sausage', 'turkey', 'mince', 'duck', 'veal', 'chorizo',
  'prosciutto', 'pancetta', 'venison', 'liver', 'steak', 'gammon', 'salami', 'pepperoni', 'goose', 'rabbit', 'oxtail', 'brisket'];
const PORK_WORDS = ['pork', 'bacon', 'ham\\b', 'sausage', 'chorizo', 'pancetta', 'prosciutto', 'gammon', 'lard', 'salami', 'pepperoni'];

const CAT_WORDS = {
  staple: ['^salt', 'black pepper', '^pepper$', 'olive oil', 'vegetable oil', 'sunflower oil', '^oil$', '^water$'],
  pantry: ['powder', 'sauce', 'paste', 'pur[eé]e', 'dried', 'stock', 'tinned', 'canned', 'flakes', 'seeds', 'flour', 'sugar',
    'vinegar', 'juice', 'coconut milk', 'coconut cream', 'peanut butter', 'beans?\\b(?!.*sprout)', 'lentil', 'chickpea', 'rice', 'pasta', 'noodle'],
  meat: MEAT_WORDS,
  fish: [...ALLERGEN_WORDS.fish, ...ALLERGEN_WORDS.shellfish],
  frozen: ['frozen'],
  dairy: ['eggs?\\b', 'tofu', ...ALLERGEN_WORDS.dairy],
  bakery: ['bread(?!crumb)', 'tortilla', 'wrap', 'buns?\\b', 'pitta', 'pita', 'naan', 'bagel', 'baguette', 'roll'],
  veg: ['onion', 'garlic', 'carrot', 'potato', 'tomato(?!.*(puree|paste|tin|chopped))', 'pepper', 'chilli', 'chili', 'lemon', 'lime',
    'ginger', 'spinach', 'lettuce', 'cucumber', 'courgette', 'zucchini', 'aubergine', 'eggplant', 'mushroom', 'celery', 'leek',
    'broccoli', 'cauliflower', 'cabbage', 'kale', 'pea\\b', 'bean sprout', 'apple', 'banana', 'orange', 'avocado', 'parsley',
    'coriander', 'cilantro', 'basil', 'mint', 'thyme', 'rosemary', 'spring onion', 'scallion', 'shallot', 'squash', 'pumpkin',
    'beetroot', 'parsnip', 'turnip', 'asparagus', 'berr', 'mango', 'pineapple', 'grape', 'pear', 'fennel', 'radish'],
};

function categorize(name) {
  for (const [cat, words] of Object.entries(CAT_WORDS)) if (has(name, words)) return cat;
  return 'pantry';
}

const UNIT_MAP = { g: 'g', gr: 'g', gram: 'g', grams: 'g', kg: 'kg', ml: 'ml', l: 'l', litre: 'l', liter: 'l', litres: 'l',
  tbsp: 'tbsp', tbs: 'tbsp', tblsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', oz: 'oz', ounce: 'oz', ounces: 'oz', cup: 'cup', cups: 'cup' };

// "200g" -> {qty:200, unit:'g'}; "1/2 tsp" -> {qty:.5, unit:'tsp'}; "2 medium" -> {qty:2, unit:''}; "pinch" -> {qty:0, text:'pinch'}
function parseMeasure(raw) {
  const s = (raw || '').trim().toLowerCase();
  const m = s.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*([a-z]+)?\b/);
  if (!m) return { qty: 0, unit: '', text: (raw || '').trim() };
  let qty;
  const n = m[1].replace(',', '.');
  if (n.includes('/')) {
    const parts = n.split(/\s+/);
    const [a, b] = parts.pop().split('/').map(Number);
    qty = (parts.length ? Number(parts[0]) : 0) + a / b;
  } else qty = Number(n);
  // Unknown words after the number ("2 medium", "3 cloves") are treated as a plain count.
  let unit = (m[2] && UNIT_MAP[m[2]]) || '';
  if (unit === 'kg') { qty *= 1000; unit = 'g'; }
  if (unit === 'l') { qty *= 1000; unit = 'ml'; }
  if (unit === 'lb') { qty *= 454; unit = 'g'; }
  if (unit === 'oz') { qty *= 28; unit = 'g'; }
  return { qty, unit };
}

function convert(meal) {
  const ingredients = [];
  for (let n = 1; n <= 20; n++) {
    const name = (meal[`strIngredient${n}`] || '').trim();
    if (!name) continue;
    const cat = categorize(name);
    const { qty, unit, text } = parseMeasure(meal[`strMeasure${n}`]);
    ingredients.push({ name: name.toLowerCase(), qty: cat === 'staple' ? 0 : qty, unit, cat, text: cat === 'staple' ? '' : text });
  }
  const allText = ingredients.map((x) => x.name).join(' | ') + ' | ' + meal.strMeal;
  const allergens = Object.keys(ALLERGEN_WORDS).filter((a) => has(allText, ALLERGEN_WORDS[a]));
  const cat = meal.strCategory || '';
  let diet = 'meat';
  if (cat === 'Vegan') diet = 'vegan';
  else if (!has(allText, MEAT_WORDS)) {
    const fishy = allergens.includes('fish') || allergens.includes('shellfish');
    if (fishy) diet = 'pescatarian';
    else diet = (!allergens.includes('dairy') && !allergens.includes('egg') && !has(allText, ['honey'])) ? 'vegan' : 'vegetarian';
  }
  const steps = (meal.strInstructions || '')
    .split(/\r?\n+/)
    .map((s) => s.replace(/^\s*(step\s*\d+[:.]?|\d+[.)])\s*/i, '').trim())
    .filter((s) => s.length > 2);
  return {
    id: `mdb-${meal.idMeal}`,
    title: meal.strMeal,
    emoji: '🍽️',
    color: '#adc178',
    image: meal.strMealThumb,
    desc: [meal.strArea, cat].filter(Boolean).join(' · ').replace(/^Unknown · /, ''),
    time: null,
    cost: null,
    serves: 4,
    diet,
    pork: has(allText, PORK_WORDS),
    tags: cat === 'Dessert' ? ['dessert'] : [],
    allergens,
    ingredients,
    steps,
    source: 'TheMealDB',
    sourceUrl: meal.strSource || meal.strYoutube || `https://www.themealdb.com/meal/${meal.idMeal}`,
  };
}

// Fetch `count` random recipes (one request each - the free API has no batch endpoint).
export async function fetchRandomRecipes(count = 8) {
  const results = await Promise.allSettled(
    Array.from({ length: count }, () => fetch(`${API}random.php`).then((r) => r.json())),
  );
  const seen = new Set();
  const out = [];
  for (const r of results) {
    const meal = r.status === 'fulfilled' && r.value?.meals?.[0];
    if (!meal || seen.has(meal.idMeal)) continue;
    seen.add(meal.idMeal);
    const recipe = convert(meal);
    if (!recipe.tags.includes('dessert')) out.push(recipe);
  }
  return out;
}
