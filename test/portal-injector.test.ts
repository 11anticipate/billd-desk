import { describe, expect, it } from 'vitest';

import {
  BUTTON_TO_EVDEV,
  toStreamNormalised,
} from '../electron-main/input/portal-injector';

/** This machine: 2048x1152 logical, scaleFactor 1.25 => 2560x1440 physical. */
const LOGICAL_WIDTH = 2048;
const LOGICAL_HEIGHT = 1152;
const SCALE = 1.25;

/**
 * Mirrors `src/hooks/use-ipcRendererSend.ts`, which turns the controller's
 * [0,1000] coordinates into the physical pixels that the injector receives.
 */
function fromController(value: number, logicalSize: number): number {
  return logicalSize * SCALE * (value / 1000);
}

describe('toStreamNormalised', () => {
  const n = (x: number, y: number) =>
    toStreamNormalised({ x, y }, LOGICAL_WIDTH, LOGICAL_HEIGHT, SCALE);

  it('maps the corners of the physical desktop to 0 and 1', () => {
    expect(n(0, 0)).toEqual({ x: 0, y: 0 });
    expect(n(2560, 1440)).toEqual({ x: 1, y: 1 });
  });

  it('maps the centre to exactly (0.5, 0.5)', () => {
    expect(n(1280, 720)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('round-trips the controller coordinate space', () => {
    // Whatever the controller sends in [0,1000] must arrive at the same relative
    // position on the controlled desktop.
    [0, 250, 500, 750, 1000].forEach((value) => {
      const x = toStreamNormalised(
        { x: fromController(value, LOGICAL_WIDTH), y: 0 },
        LOGICAL_WIDTH,
        LOGICAL_HEIGHT,
        SCALE
      ).x;
      expect(x).toBeCloseTo(value / 1000, 10);
    });
    [0, 250, 500, 750, 1000].forEach((value) => {
      const y = toStreamNormalised(
        { x: 0, y: fromController(value, LOGICAL_HEIGHT) },
        LOGICAL_WIDTH,
        LOGICAL_HEIGHT,
        SCALE
      ).y;
      expect(y).toBeCloseTo(value / 1000, 10);
    });
  });

  it('clamps beyond the desktop instead of sending out-of-range values', () => {
    expect(n(-500, -1)).toEqual({ x: 0, y: 0 });
    expect(n(9999, 9999)).toEqual({ x: 1, y: 1 });
  });

  it('treats a non-positive scale factor as 1 rather than dividing by zero', () => {
    const p = { x: 100, y: 50 };
    expect(toStreamNormalised(p, 200, 100, 0)).toEqual({ x: 0.5, y: 0.5 });
    expect(toStreamNormalised(p, 200, 100, -2)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('BUTTON_TO_EVDEV', () => {
  it('maps nut.js Button values onto Linux evdev codes', () => {
    // nut.js Button: LEFT=0, RIGHT=1, MIDDLE=2.  evdev BTN_LEFT=0x110.
    expect(BUTTON_TO_EVDEV[0]).toBe(0x110);
    expect(BUTTON_TO_EVDEV[1]).toBe(0x111);
    expect(BUTTON_TO_EVDEV[2]).toBe(0x112);
  });
});
