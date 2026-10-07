const wrap = (body: string, size = 18): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  dawn: wrap('<path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 6v3M4.9 10.9l1.8 1.8M19.1 10.9l-1.8 1.8M9 5l3-3 3 3"/>'),
  day: wrap('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  dusk: wrap('<path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 6v3M4.9 10.9l1.8 1.8M19.1 10.9l-1.8 1.8M9 3l3 3 3-3"/>'),
  night: wrap('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  share: wrap('<path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
  info: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  save: wrap('<path d="M12 3v12M8 11l4 4 4-4M5 21h14"/>'),
  reveal: wrap('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 8h3v3H8zM13 13h3v3h-3zM13 8h3M8 13h3"/>'),
  cube: wrap('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>'),
  check: wrap('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16),
  photo: wrap('<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 9"/>'),
  upload: wrap('<path d="M12 16V4M8 8l4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>'),
  close: wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
  chevron: wrap('<path d="M6 9l6 6 6-6"/>'),
};

export const LOGO = `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">
  <path d="M16 3 28 9.5v13L16 29 4 22.5v-13z" fill="#6d7bff"/>
  <path d="M16 3 28 9.5 16 16 4 9.5z" fill="#b6bfff"/>
  <path d="M16 16v13L4 22.5v-13z" fill="#4452e0"/>
  <path d="M16 16 28 9.5v13L16 29z" fill="#5865f2"/>
  <rect x="12.5" y="8" width="3" height="3" fill="#0f1220" opacity=".85"/><rect x="16.5" y="11" width="3" height="3" fill="#fff" opacity=".9"/>
</svg>`;
