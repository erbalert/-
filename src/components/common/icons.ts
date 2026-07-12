// Unified inline-SVG icon set (stroke-based, 24x24 viewBox, currentColor).
// No external dependencies or network requests.

export type IconName =
  | 'dashboard'
  | 'transactions'
  | 'wallet'
  | 'budget'
  | 'repeat'
  | 'loan'
  | 'import'
  | 'plus'
  | 'edit'
  | 'trash'
  | 'close'
  | 'pause'
  | 'play'
  | 'filter'
  | 'search'
  | 'chevronDown'
  | 'chevronRight'
  | 'check'
  | 'arrowUp'
  | 'arrowDown'
  | 'alert'
  | 'sparkles'
  | 'download'
  | 'upload'
  | 'sun'
  | 'moon'

export const ICON_PATHS: Record<IconName, string> = {
  dashboard: '<path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z"/>',
  transactions: '<path d="M4 7h13m0 0-3-3m3 3-3 3M20 17H7m0 0 3-3m-3 3 3 3"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2H3Zm0 0v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H3Zm14 4h.01"/>',
  budget: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v3m0 10v3m8-8h-3M7 12H4"/>',
  repeat: '<path d="M4 9a5 5 0 0 1 5-5h7m0 0-3-3m3 3-3 3M20 15a5 5 0 0 1-5 5H8m0 0 3 3m-3-3 3-3"/>',
  loan: '<path d="M5 8l14-4v13M5 8v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2M5 8l14 4"/><circle cx="9" cy="13" r="1.5"/>',
  import: '<path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3Zm10.5-13.5 3 3"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M7 5l12 7-12 7V5Z"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12l5 5L20 6"/>',
  arrowUp: '<path d="M12 20V4m0 0-6 6m6-6 6 6"/>',
  arrowDown: '<path d="M12 4v16m0 0 6-6m-6 6-6-6"/>',
  alert: '<path d="M12 3 2 20h20L12 3Zm0 6v5m0 3h.01"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Zm6 9 .9 2.1 2.1.9-2.1.9L18 21l-.9-2.1-2.1-.9 2.1-.9L18 12Z"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/>',
  upload: '<path d="M12 21V9m0 0 4 4m-4-4-4 4M5 3h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
}
