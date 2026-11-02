// Simple line icons (24×24, drawn with the current text colour) used instead of emoji.

const PATHS = {
  // tab bar and header
  swipe: '<rect x="4" y="6" width="12" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v13"/>',
  kitchen: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M5 10h14M9 5.5v2M9 13v3"/>',
  week: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  list: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11.5l2-8H6.2"/>',
  shops: '<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  settings: '<path d="M12 2.5l1.6 2.3 2.7-.7.6 2.7 2.6 1-.9 2.6 1.9 2-1.9 2 .9 2.6-2.6 1-.6 2.7-2.7-.7L12 21.5l-1.6-2.3-2.7.7-.6-2.7-2.6-1 .9-2.6L3.5 12l1.9-2-.9-2.6 2.6-1 .6-2.7 2.7.7z"/><circle cx="12" cy="12" r="3"/>',
  // goals
  money: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5a4.2 4.2 0 1 0 0 7M7.5 10.8h6M7.5 13.3h6"/>',
  healthy: '<path d="M5 19C5 10 11 5 20 5c0 9-5 15-14 15"/><path d="M5 19l8-8"/>',
  mealprep: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 12h18M12 12v8M6 5h12"/>',
  waste: '<path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  quick: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  protein: '<path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/>',
  family: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17.5" cy="9" r="2.2"/><path d="M16.5 14c2.8 0 4.5 2.2 4.5 5"/>',
  // main staples
  pasta: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M7.5 11c0-3.5 9-3.5 9 0M10 11c0-1.6 4-1.6 4 0"/>',
  rice: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M6 11a6 4 0 0 1 12 0"/>',
  potato: '<ellipse cx="12" cy="12" rx="8.5" ry="6" transform="rotate(-20 12 12)"/><path d="M9 10.5h.01M14 13h.01M11.5 15h.01"/>',
  noodles: '<path d="M3 12h18a9 9 0 0 1-18 0z"/><path d="M13 3 9 12M19 4l-6 8"/>',
  bread: '<path d="M5 10a3.5 3.5 0 0 1 2-7h10a3.5 3.5 0 0 1 2 7v10H5z"/>',
  grains: '<path d="M12 22V8"/><path d="M12 12c-3 0-4-2-4-4 3 0 4 2 4 4zM12 12c3 0 4-2 4-4-3 0-4 2-4 4zM12 17c-3 0-4-2-4-4 3 0 4 2 4 4zM12 17c3 0 4-2 4-4-3 0-4 2-4 4zM12 8c-1.5-1-1.5-3 0-5 1.5 2 1.5 4 0 5z"/>',
  stew: '<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M2 10h20M9 6.5c0-1.5 1-1.5 1-3M14 6.5c0-1.5 1-1.5 1-3"/>',
  // other
  bowl: '<path d="M3 11h18a9 9 0 0 1-18 0z"/>',
};

export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
  stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || PATHS.bowl}</svg>`;
