import type { BrowserWindow } from 'electron';

/** Matches nut.js's `Point`. Structurally identical, no nut.js coupling. */
export interface Point {
  x: number;
  y: number;
}

/**
 * nut.js `Button` values, reproduced so that `electron-main/index.ts` no longer
 * needs to `require('@nut-tree-fork/nut-js')` just to name a button.  The
 * numeric values are nut.js's own, which is what the IPC layer carries.
 */
export enum Button {
  LEFT = 0,
  RIGHT = 1,
  MIDDLE = 2,
}

export interface InjectorMouse {
  move(points: Point[]): Promise<void>;
  setPosition(point: Point): Promise<void>;
  drag(points: Point[]): Promise<void>;
  pressButton(button: number): Promise<void>;
  releaseButton(button: number): Promise<void>;
  click(button: number): Promise<void>;
  doubleClick(button: number): Promise<void>;
  scrollDown(amount: number): Promise<void>;
  scrollUp(amount: number): Promise<void>;
  scrollLeft(amount: number): Promise<void>;
  scrollRight(amount: number): Promise<void>;
  getPosition(): Promise<Point>;
}

export interface InjectorKeyboard {
  /**
   * Type arbitrary text.  Not implementable through the Wayland RemoteDesktop
   * portal, which only accepts evdev keycodes.  The only caller is the
   * `BilldDeskBehaviorEnum.keyboardType` IPC branch, which the shipped control
   * clients never send, so the portal backend logs a warning and ignores it.
   */
  type(text: string): Promise<void>;
  /** Press keys as a chord. `keys` are nut.js `Key` enum values. */
  pressKey(...keys: number[]): Promise<void>;
  releaseKey(...keys: number[]): Promise<void>;
}

/**
 * Platform input backend.  The method signatures deliberately mirror nut.js so
 * that the IPC handlers in `electron-main/index.ts` stay unchanged; each
 * backend translates to whatever its platform actually speaks.
 */
export interface InputInjector {
  readonly backend: 'nutjs' | 'portal';
  /** True once input injection is usable. The nut.js backend is always ready. */
  readonly ready: boolean;
  mouse: InjectorMouse;
  keyboard: InjectorKeyboard;
  /**
   * Called when a remote session is being established, i.e. from the
   * `IPC_EVENT.getScreenStream` handler.  The Wayland backend uses it to obtain
   * input-injection permission; the nut.js backend ignores it.  Never rejects:
   * a failure must degrade to "video works, input does not".
   */
  attach(win: BrowserWindow): Promise<void>;
  /** Release any platform resources. Called on `before-quit`. */
  dispose(): Promise<void>;
}

export function detectSessionType(): 'wayland' | 'x11' | 'other' {
  const t = (process.env.XDG_SESSION_TYPE || '').toLowerCase();
  if (t === 'wayland') return 'wayland';
  if (t === 'x11' || t === 'xorg') return 'x11';
  // Fall back to WAYLAND_DISPLAY, which is set even when XDG_SESSION_TYPE is not.
  return process.env.WAYLAND_DISPLAY ? 'wayland' : 'other';
}

/**
 * Both backends are loaded lazily so that a Linux/Wayland machine never loads
 * the native libnut binding it will never use, and so that a Windows/macOS
 * install never loads `dbus-next`.
 */
function loadNutJs(): typeof import('./nutjs-injector') {
  // eslint-disable-next-line global-require
  return require('./nutjs-injector');
}

function loadPortal(): typeof import('./portal-injector') {
  // eslint-disable-next-line global-require
  return require('./portal-injector');
}

/**
 * Pick a backend.
 *
 * Override with `BILLD_INPUT_BACKEND=nutjs|portal` — useful for A/B testing a
 * session or for forcing the XTest path on a machine that does have XWayland.
 */
export function createInjector(): InputInjector {
  const override = (process.env.BILLD_INPUT_BACKEND || '').toLowerCase();

  let usePortal: boolean;
  if (override === 'portal') usePortal = true;
  else if (override === 'nutjs') usePortal = false;
  else if (process.platform !== 'linux') usePortal = false;
  else usePortal = detectSessionType() === 'wayland';

  if (!usePortal) return new (loadNutJs().NutJsInjector)();
  return new (loadPortal().PortalInjector)();
}
