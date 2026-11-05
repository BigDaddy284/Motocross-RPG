// Rebinding keys (GDD 20.1 Controls; Boss, 5 Nov 2026: "Build it"). Each action has one key the player
// picks in Settings > Controls; the arrow keys, Space, Enter, Tab and I stay as fixed extras, so a
// rebind can never leave the game without a way to move, talk or open the bag.

import type { Settings } from './settings';

export type ControlId = keyof Settings['controls'];

/** The actions in the order Settings lists them, with what each does. */
export const CONTROL_ACTIONS: { id: ControlId; label: string; extra?: string }[] = [
  { id: 'up', label: 'Walk up', extra: 'or Up arrow' },
  { id: 'left', label: 'Walk left', extra: 'or Left arrow' },
  { id: 'down', label: 'Walk down', extra: 'or Down arrow' },
  { id: 'right', label: 'Walk right', extra: 'or Right arrow' },
  { id: 'interact', label: 'Talk / use', extra: 'or Space' },
  { id: 'bag', label: 'Bike and bag', extra: 'or Tab, I' },
  { id: 'skills', label: 'Skills' },
  { id: 'map', label: 'World map' },
  { id: 'menu', label: 'Pause menu' },
];

/** Keys that always do their fixed job and can't be picked for an action. */
export const FIXED_KEYS = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'ENTER', 'TAB', 'I', 'PLUS', 'MINUS', 'NUMPAD_ADD', 'NUMPAD_SUBTRACT'];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIGITS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
const OTHERS = ['ESC', 'SHIFT', 'CTRL', 'ALT', 'BACKSPACE', 'BACKTICK', 'COMMA', 'PERIOD', 'FORWARD_SLASH', 'SEMICOLON', 'QUOTES', 'OPEN_BRACKET', 'CLOSED_BRACKET'];
/** Every key an action can have: Phaser KeyCodes names. */
export const BINDABLE = [...LETTERS, ...DIGITS, ...OTHERS];

const CODES: Record<string, string> = {
  Escape: 'ESC', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ControlLeft: 'CTRL', ControlRight: 'CTRL', AltLeft: 'ALT', AltRight: 'ALT',
  Backspace: 'BACKSPACE', Backquote: 'BACKTICK', Comma: 'COMMA', Period: 'PERIOD', Slash: 'FORWARD_SLASH', Semicolon: 'SEMICOLON',
  Quote: 'QUOTES', BracketLeft: 'OPEN_BRACKET', BracketRight: 'CLOSED_BRACKET',
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', Space: 'SPACE', Enter: 'ENTER', NumpadEnter: 'ENTER', Tab: 'TAB',
  Equal: 'PLUS', Minus: 'MINUS', NumpadAdd: 'NUMPAD_ADD', NumpadSubtract: 'NUMPAD_SUBTRACT',
};

/** The key's name from a browser key event's code ("KeyW" is W, "Digit1" ONE), or null for one we don't name. */
export function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return DIGITS[Number(code.slice(5))];
  return CODES[code] ?? null;
}

/** How a key reads in Settings. */
export function keyLabel(name: string): string {
  const d = DIGITS.indexOf(name);
  if (d >= 0) return String(d);
  const words: Record<string, string> = { ESC: 'Esc', SHIFT: 'Shift', CTRL: 'Ctrl', ALT: 'Alt', BACKSPACE: 'Backspace', BACKTICK: '`', COMMA: ',', PERIOD: '.', FORWARD_SLASH: '/', SEMICOLON: ';', QUOTES: "'", OPEN_BRACKET: '[', CLOSED_BRACKET: ']' };
  return words[name] ?? name;
}

export type RebindResult = { ok: true; controls: Settings['controls']; swapped?: ControlId } | { ok: false; message: string };

/** Gives an action a new key. A key another action had swaps over, so no two actions share one. */
export function rebind(controls: Settings['controls'], action: ControlId, key: string): RebindResult {
  if (FIXED_KEYS.includes(key)) return { ok: false, message: `${keyLabel(key)} always does its own job. Pick another key.` };
  if (!BINDABLE.includes(key)) return { ok: false, message: "That key can't be used. Pick a letter, a number or Esc." };
  const out = { ...controls };
  const other = (Object.keys(out) as ControlId[]).find((a) => a !== action && out[a] === key);
  if (other) out[other] = controls[action];
  out[action] = key;
  return { ok: true, controls: out, ...(other ? { swapped: other } : {}) };
}

/** Saved controls made safe: an unknown or fixed key, or one used twice, goes back to its default. */
export function cleanControls(saved: Settings['controls'], defaults: Settings['controls']): Settings['controls'] {
  const out = { ...saved };
  const seen = new Set<string>();
  for (const a of Object.keys(defaults) as ControlId[]) {
    if (!BINDABLE.includes(out[a]) || FIXED_KEYS.includes(out[a]) || seen.has(out[a])) out[a] = defaults[a];
    seen.add(out[a]);
  }
  // A default that collided with a kept key: fall back to defaults for every action.
  return new Set(Object.values(out)).size === Object.keys(out).length ? out : { ...defaults };
}

/** The action a key does, by its name, with the fixed extras. */
export function actionFor(controls: Settings['controls'], key: string): ControlId | 'advance' | null {
  const extra: Record<string, ControlId | 'advance'> = { UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right', SPACE: 'interact', ENTER: 'advance', TAB: 'bag', I: 'bag' };
  const bound = (Object.keys(controls) as ControlId[]).find((a) => controls[a] === key);
  return bound ?? extra[key] ?? null;
}
