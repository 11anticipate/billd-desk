import { screen } from 'electron';

import { nutKeyToEvdev } from './evdev-keys';
import {
  AXIS_HORIZONTAL,
  AXIS_VERTICAL,
  EVDEV_BTN_LEFT,
  EVDEV_BTN_MIDDLE,
  EVDEV_BTN_RIGHT,
  PortalSession,
} from './portal-session';

import type {
  InputInjector,
  InjectorKeyboard,
  InjectorMouse,
  Point,
} from './injector';

/** GNOME's default double-click threshold is 400ms; stay well inside it. */
const DOUBLE_CLICK_GAP_MS = 80;

/** nut.js `Button` value -> Linux evdev button code. */
export const BUTTON_TO_EVDEV: Readonly<Record<number, number>> = {
  0: EVDEV_BTN_LEFT,
  1: EVDEV_BTN_RIGHT,
  2: EVDEV_BTN_MIDDLE,
};

/** All portal calls are fire-and-forget, so the handlers resolve immediately. */
const settled = (): Promise<void> => Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Physical pixels -> the stream's normalised [0,1] logical space.
 *
 * Upstream (`src/hooks/use-ipcRendererSend.ts`) turns the controller's
 * [0,1000] into physical pixels by multiplying the primary display's logical
 * size by its scale factor, so the physical extent of the desktop is
 * `logicalSize * scaleFactor`.  Dividing by that single denominator undoes both
 * the pixels-to-logical conversion and the normalisation in one step.
 *
 * With this machine's 2048x1152 / 1.25 setup the desktop is 2560x1440 physical,
 * so the centre of the screen (1280, 720) normalises to exactly (0.5, 0.5).
 */
export function toStreamNormalised(
  p: Point,
  logicalWidth: number,
  logicalHeight: number,
  scaleFactor: number
): { x: number; y: number } {
  const scale = scaleFactor > 0 ? scaleFactor : 1;
  return {
    x: clamp01(p.x / (logicalWidth * scale)),
    y: clamp01(p.y / (logicalHeight * scale)),
  };
}

/**
 * Wayland backend built on `org.freedesktop.portal.RemoteDesktop`.
 *
 * Wayland removed the global input-injection capability that XTest provided, so
 * nut.js cannot reach Wayland clients at all.  The portal is the standard
 * replacement and needs neither root nor an Xorg session; the cost is one
 * approval dialog per remote session.
 *
 * Method semantics deliberately match nut.js -- absolute coordinates in
 * *physical* pixels, `Button` / `Key` enum values -- so the IPC layer stays
 * agnostic.  Everything specific to the portal (normalised coordinates, evdev
 * button and key codes) is translated here.
 */
export class PortalInjector implements InputInjector {
  readonly backend = 'portal' as const;

  private session: PortalSession | null = null;

  private opening: Promise<void> | null = null;

  private lastError: Error | null = null;

  private warnedAboutText = false;

  get ready(): boolean {
    return this.session !== null;
  }

  /** Why injection is unavailable, if `attach()` failed. */
  get error(): Error | null {
    return this.lastError;
  }

  /**
   * Obtain permission to inject input.  Safe to call more than once and safe to
   * call concurrently; never rejects, because a failure here must degrade to
   * "video works, input does not" rather than abort the remote session.
   */
  async attach(): Promise<void> {
    if (this.session) return;
    if (this.opening) {
      await this.opening;
      return;
    }
    this.opening = this.open();
    try {
      await this.opening;
    } finally {
      this.opening = null;
    }
  }

  private async open(): Promise<void> {
    try {
      this.session = await PortalSession.open();
      this.lastError = null;
      const i = this.session.info;
      console.log(
        `[portal] ready: node=${i.streamNodeId} logical=${i.logicalWidth}x${i.logicalHeight} devices=${i.devices}`
      );
    } catch (e) {
      this.session = null;
      this.lastError = e instanceof Error ? e : new Error(String(e));
      console.warn(
        '[portal] input injection unavailable:',
        this.lastError.message
      );
    }
  }

  async dispose(): Promise<void> {
    const s = this.session;
    this.session = null;
    if (s) await s.dispose();
  }

  private toNormalised(p: Point): { x: number; y: number } {
    const info = this.session!.info;
    let logicalWidth = info.logicalWidth;
    let logicalHeight = info.logicalHeight;
    if (!logicalWidth || !logicalHeight) {
      const size = screen.getPrimaryDisplay().size;
      logicalWidth = size.width;
      logicalHeight = size.height;
    }
    return toStreamNormalised(
      p,
      logicalWidth,
      logicalHeight,
      screen.getPrimaryDisplay().scaleFactor
    );
  }

  private moveTo(p: Point): void {
    if (!this.session) return;
    const n = this.toNormalised(p);
    this.session.moveAbsolute(n.x, n.y);
  }

  private buttonCode(button: number): number | undefined {
    return BUTTON_TO_EVDEV[button];
  }

  get mouse(): InjectorMouse {
    return {
      move: (points: Point[]) => {
        // nut.js interpolates between the given points; a single absolute
        // notification lands faster and is corrected by the next move anyway.
        const p = points[points.length - 1];
        if (p) this.moveTo(p);
        return settled();
      },
      setPosition: (point: Point) => {
        this.moveTo(point);
        return settled();
      },
      drag: (points: Point[]) => {
        const p = points[points.length - 1];
        if (this.session && p) {
          // nut.js drags with the left button held: press, move, release.
          this.session.button(EVDEV_BTN_LEFT, true);
          this.moveTo(p);
          this.session.button(EVDEV_BTN_LEFT, false);
        }
        return settled();
      },
      pressButton: (button: number) => {
        const code = this.buttonCode(button);
        if (this.session && code !== undefined) this.session.button(code, true);
        return settled();
      },
      releaseButton: (button: number) => {
        const code = this.buttonCode(button);
        if (this.session && code !== undefined)
          this.session.button(code, false);
        return settled();
      },
      click: (button: number) => {
        const code = this.buttonCode(button);
        if (this.session && code !== undefined) {
          this.session.button(code, true);
          this.session.button(code, false);
        }
        return settled();
      },
      doubleClick: async (button: number) => {
        const code = this.buttonCode(button);
        if (!this.session || code === undefined) return;
        this.session.button(code, true);
        this.session.button(code, false);
        await sleep(DOUBLE_CLICK_GAP_MS);
        this.session.button(code, true);
        this.session.button(code, false);
      },
      scrollDown: (amount: number) => {
        this.session?.scroll(AXIS_VERTICAL, -Math.abs(amount));
        return settled();
      },
      scrollUp: (amount: number) => {
        this.session?.scroll(AXIS_VERTICAL, Math.abs(amount));
        return settled();
      },
      scrollLeft: (amount: number) => {
        this.session?.scroll(AXIS_HORIZONTAL, -Math.abs(amount));
        return settled();
      },
      scrollRight: (amount: number) => {
        this.session?.scroll(AXIS_HORIZONTAL, Math.abs(amount));
        return settled();
      },
      // No portal API reads the pointer back; this IPC handler has no caller.
      getPosition: () => Promise.resolve({ x: 0, y: 0 }),
    };
  }

  get keyboard(): InjectorKeyboard {
    const send = (keys: number[], pressed: boolean): Promise<void> => {
      const s = this.session;
      if (s) {
        // Order matters: nut.js treats the arguments as a chord, so the array
        // order is the press order (and the controller sends the same order when
        // releasing).
        keys.forEach((k) => {
          const code = nutKeyToEvdev(k);
          if (code === 0) {
            console.warn(
              `[portal] no evdev equivalent for nut.js key ${k}, skipped`
            );
            return;
          }
          s.key(code, pressed);
        });
      }
      return settled();
    };
    return {
      // The portal can only emit evdev keycodes, so arbitrary text is out of
      // reach.  No shipped control client sends `keyboardType`, so this path is
      // unreachable in practice; warn loudly rather than throw, because throwing
      // would surface as an IPC error and drop the remote session.
      type: (text: string) => {
        if (!this.warnedAboutText) {
          this.warnedAboutText = true;
          console.warn(
            `[portal] keyboard.type(${JSON.stringify(text)}) ignored: the Wayland ` +
              'RemoteDesktop portal only accepts evdev keycodes, not arbitrary text.'
          );
        }
        return settled();
      },
      pressKey: (...keys: number[]) => send(keys, true),
      releaseKey: (...keys: number[]) => send(keys, false),
    };
  }
}
