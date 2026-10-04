#!/usr/bin/env node
/**
 * Regenerate `electron-main/input/evdev-keys.ts`.
 *
 * Why this exists
 * ---------------
 * BilldDesk's control side speaks nut.js's `Key` enum (134 sequential members,
 * Escape=0, F1=1, Num1=29, A=71, ...) because the shipped control clients are
 * built from the same code.  The Linux Wayland injection channel
 * (`org.freedesktop.portal.RemoteDesktop.NotifyKeyboardKeycode`) speaks raw
 * evdev hardware codes (KEY_ESC=1, KEY_1=2, KEY_A=30, ...).  The two numbering
 * schemes are unrelated, so a translation table is mandatory.
 *
 * The table is committed to the repository; this script only documents and
 * reproduces it.  It needs the Linux kernel headers, which build machines may
 * not have:
 *
 *   node scripts/gen-evdev-keys.cjs
 *   node scripts/gen-evdev-keys.cjs /path/to/input-event-codes.h
 *
 * Source of truth for the evdev side: /usr/include/linux/input-event-codes.h
 */
const fs = require('fs');
const path = require('path');

const HEADER =
  process.argv[2] || '/usr/include/linux/input-event-codes.h';
const OUT = path.join(
  __dirname,
  '..',
  'electron-main',
  'input',
  'evdev-keys.ts'
);

/**
 * Keys whose nut.js name cannot be derived mechanically from the evdev name.
 * Every entry here was verified by hand against input-event-codes.h.
 * `null` means "this key has no evdev equivalent and must be dropped".
 */
const OVERRIDES = {
  // nut.js orders the number row as Num1..Num0; evdev calls them KEY_1..KEY_0.
  Num1: 'KEY_1',
  Num2: 'KEY_2',
  Num3: 'KEY_3',
  Num4: 'KEY_4',
  Num5: 'KEY_5',
  Num6: 'KEY_6',
  Num7: 'KEY_7',
  Num8: 'KEY_8',
  Num9: 'KEY_9',
  Num0: 'KEY_0',

  // Numeric keypad: nut.js says NumPadN, evdev says KEY_KPn.
  NumPad0: 'KEY_KP0',
  NumPad1: 'KEY_KP1',
  NumPad2: 'KEY_KP2',
  NumPad3: 'KEY_KP3',
  NumPad4: 'KEY_KP4',
  NumPad5: 'KEY_KP5',
  NumPad6: 'KEY_KP6',
  NumPad7: 'KEY_KP7',
  NumPad8: 'KEY_KP8',
  NumPad9: 'KEY_KP9',
  Divide: 'KEY_KPSLASH',
  Multiply: 'KEY_KPASTERISK',
  Subtract: 'KEY_KPMINUS',
  Add: 'KEY_KPPLUS',
  Decimal: 'KEY_KPDOT',

  // evdev spells the bracket keys as BRACE, and ESC without the trailing PE.
  Escape: 'KEY_ESC',
  LeftBracket: 'KEY_LEFTBRACE',
  RightBracket: 'KEY_RIGHTBRACE',
  Backslash: 'KEY_BACKSLASH',
  Semicolon: 'KEY_SEMICOLON',
  Quote: 'KEY_APOSTROPHE',
  Comma: 'KEY_COMMA',
  Period: 'KEY_DOT',
  Slash: 'KEY_SLASH',
  Backquote: 'KEY_GRAVE',
  Grave: 'KEY_GRAVE',
  Minus: 'KEY_MINUS',
  Equal: 'KEY_EQUAL',

  // Super/Win/Cmd are all the same physical key.
  LeftSuper: 'KEY_LEFTMETA',
  RightSuper: 'KEY_RIGHTMETA',
  LeftWin: 'KEY_LEFTMETA',
  RightWin: 'KEY_RIGHTMETA',
  LeftCmd: 'KEY_LEFTMETA',
  RightCmd: 'KEY_RIGHTMETA',
  MetaLeft: 'KEY_LEFTMETA',
  MetaRight: 'KEY_RIGHTMETA',
  LeftControl: 'KEY_LEFTCTRL',
  RightControl: 'KEY_RIGHTCTRL',
  ControlLeft: 'KEY_LEFTCTRL',
  ControlRight: 'KEY_RIGHTCTRL',
  ShiftLeft: 'KEY_LEFTSHIFT',
  ShiftRight: 'KEY_RIGHTSHIFT',
  AltLeft: 'KEY_LEFTALT',
  AltRight: 'KEY_RIGHTALT',
  AltGr: 'KEY_RIGHTALT',

  // Return/Enter are the same evdev key.
  Return: 'KEY_ENTER',
  Enter: 'KEY_ENTER',

  // Legacy printing / paging names.
  Print: 'KEY_SYSRQ',
  PageUp: 'KEY_PAGEUP',
  PageDown: 'KEY_PAGEDOWN',
  ScrollLock: 'KEY_SCROLLLOCK',
  Pause: 'KEY_PAUSE',
  Space: 'KEY_SPACE',
  Tab: 'KEY_TAB',
  CapsLock: 'KEY_CAPSLOCK',

  // Audio transport keys.
  AudioMute: 'KEY_MUTE',
  AudioVolUp: 'KEY_VOLUMEUP',
  AudioVolDown: 'KEY_VOLUMEDOWN',
  AudioPlay: 'KEY_PLAYPAUSE',
  AudioStop: 'KEY_STOPCD',
  AudioPause: 'KEY_PAUSECD',
  AudioPrev: 'KEY_PREVIOUSSONG',
  AudioNext: 'KEY_NEXTSONG',
  AudioRewind: 'KEY_REWIND',
  AudioForward: 'KEY_FASTFORWARD',
  AudioRepeat: 'KEY_PLAYCD',
  AudioRandom: 'KEY_CONFIG',

  // No evdev equivalent exists; these are dropped at runtime.
  Fn: null,
  Clear: null,
};

/** Split `LeftBracket` -> ['Left','Bracket'], `F13` -> ['F','13'] */
function camelSplit(name) {
  return name.match(/[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+/g) || [];
}

/** Candidate evdev macro names for a nut.js key, most specific first. */
function candidates(name) {
  const words = camelSplit(name);
  const out = [];
  if (OVERRIDES && Object.prototype.hasOwnProperty.call(OVERRIDES, name)) {
    return [OVERRIDES[name]];
  }
  const digits = words.filter((w) => /^\d+$/.test(w)).join('');
  const alpha = words.filter((w) => !/^\d+$/.test(w));
  // Digits belong to the name: F1 -> KEY_F1, not KEY_F.  Try the joined form
  // before the bare alpha form, otherwise every F-key collapses onto KEY_F.
  if (alpha.length && digits) {
    out.push('KEY_' + alpha.join('') .toUpperCase() + digits);
    out.push('KEY_' + alpha.join('_').toUpperCase() + '_' + digits);
  }
  if (alpha.length) {
    out.push('KEY_' + alpha.join('_').toUpperCase());
    out.push('KEY_' + alpha.join('').toUpperCase());
  }
  if (digits) out.push('KEY_' + digits);
  out.push('KEY_' + words.join('_').toUpperCase());
  out.push('KEY_' + words.join('').toUpperCase());
  return out;
}

function parseEvdev(file) {
  const src = fs.readFileSync(file, 'utf8');
  const map = new Map();
  const re = /#define\s+(KEY_[A-Z0-9_]+)\s+(\d+)/g;
  let m;
  while ((m = re.exec(src))) map.set(m[1], Number(m[2]));
  return map;
}

function main() {
  const { Key } = require('@nut-tree-fork/shared');
  const nutKeys = Object.keys(Key).filter((k) => isNaN(Number(k)));
  const evdev = parseEvdev(HEADER);
  if (evdev.size < 300) {
    console.error(
      `Refusing to run: parsed only ${evdev.size} KEY_* macros from ${HEADER}.\n` +
        'Pass the path to a Linux input-event-codes.h explicitly.'
    );
    process.exit(1);
  }

  const entries = [];
  const unresolved = [];
  const dropped = [];

  for (const name of nutKeys) {
    const tries = candidates(name);
    let hit;
    for (const t of tries) {
      if (t === null) {
        hit = null;
        break;
      }
      if (evdev.has(t)) {
        hit = t;
        break;
      }
    }
    if (hit === null) {
      dropped.push(name);
      continue;
    }
    if (hit === undefined) {
      unresolved.push(`${name} (tried: ${tries.join(', ')})`);
      continue;
    }
    entries.push({ name, nut: Key[name], evdevName: hit, evdev: evdev.get(hit) });
  }

  // Sanity: every code must be a real key code, never KEY_RESERVED (0).
  const bad = entries.filter((e) => e.evdev === 0);
  if (bad.length) {
    console.error('Mapped to KEY_RESERVED (0):', bad.map((b) => b.name).join(', '));
    process.exit(1);
  }

  const rows = entries
    .slice()
    .sort((a, b) => a.nut - b.nut)
    .map(
      (e) =>
        `  ${e.nut}: ${String(e.evdev).padStart(3)}, // ${e.name} -> ${e.evdevName}`
    )
    .join('\n');

  const out = `/**
 * AUTO-GENERATED by scripts/gen-evdev-keys.cjs — do not edit by hand.
 *
 * nut.js \`Key\` enum value -> Linux evdev hardware code.
 * The control clients built from this repo speak nut.js numbering; the Wayland
 * RemoteDesktop portal speaks evdev numbering.  134 nut.js keys, of which
 * ${entries.length} have an evdev equivalent (${dropped.length} dropped: ${dropped.join(', ') || 'none'}).
 *
 * Regenerate:  node scripts/gen-evdev-keys.cjs
 */

/** nut.js Key enum value -> evdev code. 0 means "no equivalent, skip". */
export const NUT_KEY_TO_EVDEV: Readonly<Record<number, number>> = {
${rows}
};

/** Look up the evdev code for a nut.js key value, or 0 when unmapped. */
export function nutKeyToEvdev(nutKey: number): number {
  return NUT_KEY_TO_EVDEV[nutKey] || 0;
}
`;

  fs.writeFileSync(OUT, out);

  console.log(`wrote ${OUT}`);
  console.log(`  mapped   : ${entries.length}/${nutKeys.length}`);
  console.log(`  dropped  : ${dropped.length}  [${dropped.join(', ') || 'none'}]`);
  if (unresolved.length) {
    console.log(`  UNRESOLVED (${unresolved.length}):`);
    unresolved.forEach((u) => console.log('    ' + u));
    process.exit(2);
  }
}

main();