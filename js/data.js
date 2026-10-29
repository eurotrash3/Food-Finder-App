// Option lists used across the app.

export const GOALS = [
  { id: 'money',    emoji: '💶', label: 'Save money',         hint: 'Cheaper ingredients, fewer extras' },
  { id: 'healthy',  emoji: '🥦', label: 'Eat healthier',      hint: 'More veg, lighter meals' },
  { id: 'mealprep', emoji: '🍱', label: 'Easy meal prep',     hint: 'Batch-cook once, eat all week' },
  { id: 'waste',    emoji: '♻️', label: 'Waste less food',    hint: 'Recipes that share ingredients' },
  { id: 'quick',    emoji: '⚡', label: 'Quick meals',        hint: '30 minutes or less' },
  { id: 'protein',  emoji: '💪', label: 'More protein',       hint: 'Filling, high-protein meals' },
  { id: 'family',   emoji: '👨‍👩‍👧', label: 'Family friendly',    hint: 'Crowd-pleasers for all ages' },
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
  { id: 'veg',    label: 'Fruit & veg',          emoji: '🥕' },
  { id: 'meat',   label: 'Meat',                 emoji: '🥩' },
  { id: 'fish',   label: 'Fish',                 emoji: '🐟' },
  { id: 'dairy',  label: 'Dairy, eggs & chilled', emoji: '🧀' },
  { id: 'bakery', label: 'Bakery',               emoji: '🍞' },
  { id: 'frozen', label: 'Frozen',               emoji: '🧊' },
  { id: 'pantry', label: 'Cupboard',             emoji: '🥫' },
  { id: 'other',  label: 'Other',                emoji: '🛒' },
  { id: 'staple', label: 'Check you have',       emoji: '🧂' },
];

// Chain stores that items can be flagged with. Prices will come from
// BasketWatch Ireland later (see README).
export const STORES = [
  { id: '',          label: 'Any shop',  short: 'Any',   color: '#8a948c' },
  { id: 'tesco',     label: 'Tesco',     short: 'Tesco', color: '#00539f' },
  { id: 'dunnes',    label: 'Dunnes Stores', short: 'Dunnes', color: '#1d1d1b' },
  { id: 'supervalu', label: 'SuperValu', short: 'SuperValu', color: '#d6001c' },
  { id: 'aldi',      label: 'Aldi',      short: 'Aldi',  color: '#001e78' },
  { id: 'lidl',      label: 'Lidl',      short: 'Lidl',  color: '#0050aa' },
];
