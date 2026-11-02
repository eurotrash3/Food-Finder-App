// Option lists used across the app.

export const GOALS = [
  { id: 'money',    icon: 'money', label: 'Save money',         hint: 'Cheaper ingredients, fewer extras' },
  { id: 'healthy',  icon: 'healthy', label: 'Eat healthier',      hint: 'More veg, lighter meals' },
  { id: 'mealprep', icon: 'mealprep', label: 'Easy meal prep',     hint: 'Batch-cook once, eat all week' },
  { id: 'waste',    icon: 'waste', label: 'Waste less food',    hint: 'Recipes that share ingredients' },
  { id: 'quick',    icon: 'quick', label: 'Quick meals',        hint: '30 minutes or less' },
  { id: 'protein',  icon: 'protein', label: 'More protein',       hint: 'Filling, high-protein meals' },
  { id: 'family',   icon: 'family', label: 'Family friendly',    hint: 'Crowd-pleasers for all ages' },
];

// The main staple a meal is built around. `fetch` = TheMealDB ingredient names used to find more recipes.
export const BASES = [
  { id: 'pasta',   icon: 'pasta', label: 'Pasta',          fetch: ['spaghetti', 'penne_rigate', 'macaroni', 'lasagne_sheets', 'farfalle'] },
  { id: 'rice',    icon: 'rice', label: 'Rice',           fetch: ['rice', 'basmati_rice'] },
  { id: 'potato',  icon: 'potato', label: 'Potatoes',       fetch: ['potatoes'] },
  { id: 'noodles', icon: 'noodles', label: 'Noodles',        fetch: ['rice_noodles', 'noodles', 'egg_noodles'] },
  { id: 'bread',   icon: 'bread', label: 'Bread & wraps',  fetch: ['bread', 'tortillas', 'puff_pastry'] },
  { id: 'grains',  icon: 'grains', label: 'Couscous & grains', fetch: ['couscous', 'quinoa'] },
  { id: 'none',    icon: 'stew', label: 'Soups, stews & curries', fetch: [] },
];

// Quick picks for the "I like" / "I don't like" lists. `match` = words found in ingredient names.
export const FOODS = [
  { id: 'chicken',   label: 'Chicken',      match: ['chicken'] },
  { id: 'beef',      label: 'Beef',         match: ['beef', 'steak'] },
  { id: 'pork',      label: 'Pork & bacon', match: ['pork', 'bacon', 'ham', 'sausage', 'chorizo'] },
  { id: 'lamb',      label: 'Lamb',         match: ['lamb'] },
  { id: 'fish',      label: 'Fish',         match: ['fish', 'salmon', 'cod', 'tuna', 'haddock', 'hake'] },
  { id: 'prawn',     label: 'Prawns',       match: ['prawn', 'shrimp'] },
  { id: 'egg',       label: 'Eggs',         match: ['egg'] },
  { id: 'cheese',    label: 'Cheese',       match: ['cheese', 'cheddar', 'mozzarella', 'feta', 'parmesan', 'halloumi', 'pecorino'] },
  { id: 'mushroom',  label: 'Mushrooms',    match: ['mushroom'] },
  { id: 'spinach',   label: 'Spinach',      match: ['spinach'] },
  { id: 'broccoli',  label: 'Broccoli',     match: ['broccoli'] },
  { id: 'peppers',   label: 'Peppers',      match: ['red pepper', 'green pepper', 'yellow pepper', 'bell pepper'] },
  { id: 'aubergine', label: 'Aubergine',    match: ['aubergine'] },
  { id: 'beans',     label: 'Beans',        match: ['beans'] },
  { id: 'chickpeas', label: 'Chickpeas',    match: ['chickpea'] },
  { id: 'lentils',   label: 'Lentils',      match: ['lentil'] },
  { id: 'avocado',   label: 'Avocado',      match: ['avocado'] },
  { id: 'chilli',    label: 'Spicy food',   match: ['chilli', 'jalapeno', 'cayenne', 'scotch bonnet'] },
  { id: 'coriander', label: 'Coriander',    match: ['coriander', 'cilantro'] },
  { id: 'olives',    label: 'Olives',       match: ['olive'] },
  { id: 'coconut',   label: 'Coconut',      match: ['coconut'] },
  { id: 'tofu',      label: 'Tofu',         match: ['tofu'] },
];

export const ALLERGENS = [
  { id: 'gluten',    label: 'Gluten' },
  { id: 'dairy',     label: 'Dairy' },
  { id: 'egg',       label: 'Eggs' },
  { id: 'nuts',      label: 'Tree nuts' },
  { id: 'peanuts',   label: 'Peanuts' },
  { id: 'fish',      label: 'Fish' },
  { id: 'shellfish', label: 'Shellfish' },
  { id: 'soy',       label: 'Soy' },
  { id: 'sesame',    label: 'Sesame' },
];

export const DIETS = [
  { id: 'vegetarian',  label: 'Vegetarian' },
  { id: 'vegan',       label: 'Vegan' },
  { id: 'pescatarian', label: 'Pescatarian' },
  { id: 'nopork',      label: 'No pork' },
];

export const TIMES = [
  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
  { value: 0,  label: 'Any' },
];

// Shopping list aisles, in the order they appear in the list.
export const CATEGORIES = [
  { id: 'veg',    label: 'Fruit & veg' },
  { id: 'meat',   label: 'Meat' },
  { id: 'fish',   label: 'Fish' },
  { id: 'dairy',  label: 'Dairy, eggs & chilled' },
  { id: 'bakery', label: 'Bakery' },
  { id: 'frozen', label: 'Frozen' },
  { id: 'pantry', label: 'Cupboard' },
  { id: 'other',  label: 'Other' },
  { id: 'staple', label: 'Check you have' },
];

// Chain stores that items can be flagged with. Prices come from BasketWatch Ireland (see prices.js);
// `osm` matches the brand tag on OpenStreetMap for the shop finder (see shops.js).
export const STORES = [
  { id: '',          label: 'Any shop',  short: 'Any',   color: '#8a948c' },
  { id: 'tesco',     label: 'Tesco',     short: 'Tesco', color: '#00539f', osm: /tesco/i },
  { id: 'dunnes',    label: 'Dunnes Stores', short: 'Dunnes', color: '#1d1d1b', osm: /dunnes/i },
  { id: 'supervalu', label: 'SuperValu', short: 'SuperValu', color: '#d6001c', osm: /supervalu/i },
  { id: 'aldi',      label: 'Aldi',      short: 'Aldi',  color: '#001e78', osm: /aldi/i },
  { id: 'lidl',      label: 'Lidl',      short: 'Lidl',  color: '#0050aa', osm: /lidl/i },
];
export const CHAINS = STORES.filter((s) => s.id);
