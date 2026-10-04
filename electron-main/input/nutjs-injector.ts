import nut from '@nut-tree-fork/nut-js';

import type {
  InjectorKeyboard,
  InjectorMouse,
  InputInjector,
  Point,
} from './injector';

/** nut.js resolves with a chainable `MouseClass`/`KeyboardClass`; discard it. */
const discard = async (p: Promise<unknown>): Promise<void> => {
  await p;
};

/**
 * XTest-based backend.  A verbatim port of the nut.js calls that used to live
 * inline in `electron-main/index.ts`; signatures and semantics are unchanged.
 *
 * Used on Windows, macOS, and Linux/X11.  On Linux/Wayland nut.js cannot reach
 * Wayland clients at all, which is why `PortalInjector` exists.
 */
export class NutJsInjector implements InputInjector {
  readonly backend = 'nutjs' as const;
  readonly ready = true;

  async attach(): Promise<void> {
    // XTest needs no permission handshake.
  }

  async dispose(): Promise<void> {
    // nut.js holds no long-lived resources.
  }

  get mouse(): InjectorMouse {
    return {
      move: (points: Point[]) => discard(nut.mouse.move(points as never)),
      setPosition: (point: Point) =>
        discard(nut.mouse.setPosition(point as never)),
      drag: (points: Point[]) => discard(nut.mouse.drag(points as never)),
      pressButton: (button: number) =>
        discard(nut.mouse.pressButton(button as never)),
      releaseButton: (button: number) =>
        discard(nut.mouse.releaseButton(button as never)),
      click: (button: number) => discard(nut.mouse.click(button as never)),
      doubleClick: (button: number) =>
        discard(nut.mouse.doubleClick(button as never)),
      scrollDown: (amount: number) => discard(nut.mouse.scrollDown(amount)),
      scrollUp: (amount: number) => discard(nut.mouse.scrollUp(amount)),
      scrollLeft: (amount: number) => discard(nut.mouse.scrollLeft(amount)),
      scrollRight: (amount: number) => discard(nut.mouse.scrollRight(amount)),
      getPosition: () => nut.mouse.getPosition() as Promise<Point>,
    };
  }

  get keyboard(): InjectorKeyboard {
    return {
      type: (text: string) => discard(nut.keyboard.type(text)),
      pressKey: (...keys: number[]) =>
        discard(nut.keyboard.pressKey(...(keys as never[]))),
      releaseKey: (...keys: number[]) =>
        discard(nut.keyboard.releaseKey(...(keys as never[]))),
    };
  }
}
