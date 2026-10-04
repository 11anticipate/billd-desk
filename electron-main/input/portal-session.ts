import dbus from 'dbus-next';

const PORTAL_BUS = 'org.freedesktop.portal.Desktop';
const PORTAL_PATH = '/org/freedesktop/portal/desktop';
const IFACE_REMOTE_DESKTOP = 'org.freedesktop.portal.RemoteDesktop';
const IFACE_SCREEN_CAST = 'org.freedesktop.portal.ScreenCast';
const IFACE_REQUEST = 'org.freedesktop.portal.Request';

const DEVICE_KEYBOARD = 1;
const DEVICE_POINTER = 2;
const SCREEN_CAST_SOURCE_TYPE_MONITOR = 1;
const SCREEN_CAST_CURSOR_MODE_EMBEDDED = 1;

/** Linux evdev button codes for the mouse buttons nut.js exposes. */
export const EVDEV_BTN_LEFT = 0x110; // 272
export const EVDEV_BTN_RIGHT = 0x111; // 273
export const EVDEV_BTN_MIDDLE = 0x112; // 274

export const AXIS_VERTICAL = 0;
export const AXIS_HORIZONTAL = 1;

export interface PortalSessionInfo {
  /** Opaque portal session object path, needed by every Notify* call. */
  sessionPath: string;
  /** PipeWire node id of the shared monitor; the `stream` argument. */
  streamNodeId: number;
  /** Size of the shared stream in *logical* pixels — the coordinate space. */
  logicalWidth: number;
  logicalHeight: number;
  devices: number;
}

const REQUEST_TIMEOUT_MS = 120_000;

function token(): string {
  return `billd${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Portal results arrive as `a{sv}`, so every value is still wrapped in a
 * `Variant`.  Accept both wrapped and bare values.
 */
function unwrap(value: unknown): any {
  if (value instanceof dbus.Variant) return value.value;
  return value;
}

interface PendingRequest {
  resolve: (results: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
}

/**
 * A live `org.freedesktop.portal.RemoteDesktop` session.
 *
 * Establishing one requires the user to approve a GNOME dialog, so `open()`
 * must not be called speculatively — it is driven from the
 * `IPC_EVENT.getScreenStream` handler, i.e. when someone actually connects.
 *
 * Injection failures are deliberately swallowed: a dropped input event must
 * never surface as an IPC error, because the renderer treats `code: 1` as a
 * failed remote session and would tear the connection down.
 */
export class PortalSession {
  private static readonly pending = new Map<string, PendingRequest>();
  private static listening = false;

  private bus: dbus.MessageBus | null = null;
  private iface: any = null;
  readonly info: PortalSessionInfo;
  private dropped = 0;
  private lastReport = 0;

  private constructor(info: PortalSessionInfo) {
    this.info = info;
  }

  static async open(): Promise<PortalSession> {
    const bus = dbus.sessionBus();
    const desktop = await bus.getProxyObject(PORTAL_BUS, PORTAL_PATH);
    const rd = desktop.getInterface(IFACE_REMOTE_DESKTOP);
    const sc = desktop.getInterface(IFACE_SCREEN_CAST);

    // `CreateSession` resolves with the Response payload, which carries the
    // new session's object path under `session_handle`.
    const created = await PortalSession.request(
      bus,
      rd,
      'CreateSession',
      (handleToken) => [
        {
          handle_token: new dbus.Variant('s', handleToken),
          session_handle_token: new dbus.Variant('s', `${handleToken}s`),
        },
      ]
    );
    const sessionPath = unwrap(created?.session_handle) as string;

    // Records the screen selection on the RemoteDesktop session so that the
    // `Start` dialog offers a monitor and `Start` returns stream metadata.
    // Returns an empty result dict by design.
    await PortalSession.request(bus, sc, 'SelectSources', (handleToken) => [
      sessionPath,
      {
        types: new dbus.Variant('u', SCREEN_CAST_SOURCE_TYPE_MONITOR),
        multiple: new dbus.Variant('b', false),
        cursor_mode: new dbus.Variant('u', SCREEN_CAST_CURSOR_MODE_EMBEDDED),
        handle_token: new dbus.Variant('s', handleToken),
      },
    ]);

    console.log('[portal] sources selected; request device access');
    await PortalSession.request(bus, rd, 'SelectDevices', (handleToken) => [
      sessionPath,
      {
        types: new dbus.Variant('u', DEVICE_KEYBOARD | DEVICE_POINTER),
        handle_token: new dbus.Variant('s', handleToken),
      },
    ]);

    const results = await PortalSession.request(
      bus,
      rd,
      'Start',
      (handleToken) => [
        sessionPath,
        '',
        { handle_token: new dbus.Variant('s', handleToken) },
      ]
    );

    const streams = unwrap(results?.streams);
    if (!Array.isArray(streams) || streams.length === 0) {
      throw new Error(
        'RemoteDesktop.Start returned no streams; cannot resolve pointer coordinates'
      );
    }
    const [nodeId, rawProps] = streams[0];
    const size = unwrap((rawProps as any)?.size) ?? [0, 0];
    // A session that reports no devices rejects every Notify* call with
    // "Session is not allowed to call NotifyPointer methods", so treat that as a
    // hard failure rather than silently accepting a session that cannot inject.
    const devices = Number(unwrap(results.devices) ?? 0);
    const required = DEVICE_KEYBOARD | DEVICE_POINTER;
    if ((devices & required) !== required) {
      throw new Error(
        `RemoteDesktop.Start granted devices=${devices}, need ${required}`
      );
    }

    const session = new PortalSession({
      sessionPath,
      streamNodeId: Number(nodeId),
      logicalWidth: Number(size[0]) || 0,
      logicalHeight: Number(size[1]) || 0,
      devices: Number(unwrap(results.devices)) || 0,
    });
    session.bus = bus;
    session.iface = rd;
    return session;
  }

  /**
   * Call a portal method that returns a Request handle, then wait for that
   * Request's `Response` signal.  Resolves with the results dict, rejects when
   * the user dismisses the dialog or the call times out.
   *
   * The pending entry is registered *before* the method goes out and matched on
   * the handle token, because portal-gnome answers `SelectSources` synchronously:
   * its Request object is exported and destroyed again within a single event-loop
   * turn, which is far too soon to introspect it and attach a handler afterwards.
   */
  private static request(
    bus: dbus.MessageBus,
    iface: any,
    method: string,
    buildArgs: (handleToken: string) => any[],
    timeoutMs = REQUEST_TIMEOUT_MS
  ): Promise<any> {
    const handleToken = token();
    PortalSession.listenForResponses(bus);

    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        PortalSession.pending.delete(handleToken);
        reject(new Error(`${method}: timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      PortalSession.pending.set(handleToken, {
        resolve,
        reject,
        timer,
        method,
      });

      try {
        const result = iface[method](...buildArgs(handleToken));
        if (result && typeof result.catch === 'function') {
          result.catch((e: unknown) => {
            PortalSession.pending.delete(handleToken);
            clearTimeout(timer);
            reject(e instanceof Error ? e : new Error(String(e)));
          });
        }
      } catch (e) {
        PortalSession.pending.delete(handleToken);
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  /**
   * Route every `org.freedesktop.portal.Request::Response` on the bus, keyed by
   * the trailing element of the request path (the handle token we chose).
   * Installed once per process.
   */
  private static listenForResponses(bus: dbus.MessageBus): void {
    if (PortalSession.listening) return;
    PortalSession.listening = true;

    // dbus-next 0.10.2 exposes no public match-rule API; `_addMatch` is its own
    // refcounted helper, and the portal bus only emits signals we have matched.
    // eslint-disable-next-line no-underscore-dangle
    void (bus as any)._addMatch(
      `type='signal',interface='${IFACE_REQUEST}',member='Response'`
    );

    bus.on('message', (msg: any) => {
      if (msg.type !== dbus.MessageType.SIGNAL) return;
      if (msg.interface !== IFACE_REQUEST || msg.member !== 'Response') return;
      const handleToken = String(msg.path).split('/').pop() as string;
      const entry = PortalSession.pending.get(handleToken);
      if (!entry) return;
      PortalSession.pending.delete(handleToken);
      clearTimeout(entry.timer);
      const [response, results] = msg.body as [number, any];
      if (response === 0) entry.resolve(results);
      else
        entry.reject(
          new Error(
            `${entry.method} was refused or cancelled (response=${response})`
          )
        );
    });
  }

  /** Fire-and-forget. Never rejects; counts and reports failures instead. */
  private notify(method: string, args: any[]): void {
    if (!this.iface) return;
    try {
      const p = this.iface[method](this.info.sessionPath, {}, ...args);
      if (p && typeof p.catch === 'function') {
        p.catch((e: unknown) => this.reportFailure(method, e));
      }
    } catch (e) {
      this.reportFailure(method, e);
    }
  }

  private reportFailure(method: string, e: unknown): void {
    this.dropped += 1;
    const now = Date.now();
    if (now - this.lastReport < 10_000) return;
    this.lastReport = now;
    console.warn(
      `[portal] ${this.dropped} input event(s) failed so far, last was ${method}:`,
      e instanceof Error ? e.message : e
    );
  }

  /** `x`/`y` are normalised to [0,1] against the stream's logical size. */
  moveAbsolute(x: number, y: number): void {
    this.notify('NotifyPointerMotionAbsolute', [this.info.streamNodeId, x, y]);
  }

  button(evdevButton: number, pressed: boolean): void {
    this.notify('NotifyPointerButton', [evdevButton, pressed ? 1 : 0]);
  }

  /** `steps` is signed: positive scrolls up / right. */
  scroll(axis: number, steps: number): void {
    this.notify('NotifyPointerAxisDiscrete', [axis, Math.round(steps)]);
  }

  key(evdevKeycode: number, pressed: boolean): void {
    this.notify('NotifyKeyboardKeycode', [evdevKeycode, pressed ? 1 : 0]);
  }

  dispose(): Promise<void> {
    this.iface = null;
    if (this.bus) {
      try {
        this.bus.disconnect();
      } catch {
        /* already gone */
      }
      this.bus = null;
    }
    return Promise.resolve();
  }
}
