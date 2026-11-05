// Player settings: saved per browser in localStorage, never in the save file (game-overview.md 9.0).
export type TextSize = 'small' | 'medium' | 'large';
export type DiceSetting = 'normal' | 'fast' | 'off';

export interface Settings {
  textSize: TextSize;
  dice: DiceSetting;
  reducedMotion: boolean;
  /** Off hides every image, and the game plays as text only (graphics.md 6.3). */
  graphics: boolean;
}

const KEY = 'votann.settings';
const LEGACY_DICE_KEY = 'votann.dice';
const DEFAULTS: Settings = { textSize: 'medium', dice: 'normal', reducedMotion: false, graphics: true };

export const TEXT_SIZES: TextSize[] = ['small', 'medium', 'large'];
export const DICE_SETTINGS: DiceSetting[] = ['normal', 'fast', 'off'];

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(): Settings {
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
    // Before Milestone 4 the dice switch had its own key.
    if (storage()?.getItem(LEGACY_DICE_KEY) === 'off') return { ...DEFAULTS, dice: 'off' };
  } catch {
    // Unreadable settings fall back to the defaults.
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: the settings just won't persist.
  }
  applySettings(s);
}

/** Text size and reduced motion are applied as attributes on <html>, which the stylesheet reads. */
export function applySettings(s: Settings): void {
  const root = document.documentElement;
  root.dataset.textSize = s.textSize;
  root.dataset.reducedMotion = s.reducedMotion ? 'on' : 'off';
}

/** The next value in a list, wrapping round: settings change by pressing their option. */
export function cycle<T>(list: readonly T[], value: T): T {
  return list[(list.indexOf(value) + 1) % list.length];
}
