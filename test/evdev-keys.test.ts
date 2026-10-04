import { describe, expect, it } from 'vitest';

import {
  NUT_KEY_TO_EVDEV,
  nutKeyToEvdev,
} from '../electron-main/input/evdev-keys';

/**
 * Linux `input-event-codes.h` defines 510 KEY_* codes.  KEY_RESERVED is 0 and is
 * not a real key, so a mapping onto it (or anything outside the range) would be a
 * bug in the generated table.
 */
const KEY_MIN = 1;
const KEY_MAX = 767;

/** nut.js `Key` has 134 members with values 0..133. */
const NUT_KEY_COUNT = 134;
/** `Fn` and `Clear` have no Linux evdev equivalent; everything else maps. */
const UNMAPPED = new Set([/* Fn */ 115, /* Clear */ 121]);

describe('NUT_KEY_TO_EVDEV', () => {
  it('covers every nut.js Key value', () => {
    const mapped = Object.keys(NUT_KEY_TO_EVDEV).map(Number);
    const expected: number[] = [];
    for (let i = 0; i < NUT_KEY_COUNT; i += 1) {
      if (!UNMAPPED.has(i)) expected.push(i);
    }
    expect(mapped.sort((a, b) => a - b)).toEqual(expected);
  });

  it('never maps onto KEY_RESERVED or outside the evdev range', () => {
    Object.entries(NUT_KEY_TO_EVDEV).forEach(([nutKey, evdev]) => {
      expect(evdev, `nut.js key ${nutKey}`).toBeGreaterThanOrEqual(KEY_MIN);
      expect(evdev, `nut.js key ${nutKey}`).toBeLessThanOrEqual(KEY_MAX);
      expect(Number.isInteger(evdev)).toBe(true);
    });
  });

  it('maps the keys a control client actually sends', () => {
    const cases: Array<[number, number]> = [
      [0 /* Escape */, 1],
      [1 /* F1 */, 59],
      [12 /* F12 */, 88],
      [29 /* Num1 */, 2],
      [38 /* Num0 */, 11],
      [71 /* A */, 30],
      [87 /* Z */, 44],
      [108 /* Space */, 57],
      [82 /* Return */, 28],
      [102 /* Enter */, 28],
    ];
    cases.forEach(([nutKey, evdev]) => {
      expect(nutKeyToEvdev(nutKey), `nut.js key ${nutKey}`).toBe(evdev);
    });
  });
});

describe('nutKeyToEvdev', () => {
  it('returns 0 for keys with no evdev equivalent', () => {
    UNMAPPED.forEach((nutKey) => {
      expect(nutKeyToEvdev(nutKey)).toBe(0);
    });
  });

  it('returns 0 for values outside the nut.js enum', () => {
    expect(nutKeyToEvdev(-1)).toBe(0);
    expect(nutKeyToEvdev(9999)).toBe(0);
  });
});
