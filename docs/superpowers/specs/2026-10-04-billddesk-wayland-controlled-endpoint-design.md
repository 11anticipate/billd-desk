# BilldDesk 被控端 Wayland 适配设计

日期：2026-10-04
目标机器：Ubuntu 24.04.5 LTS / GNOME 46 / Wayland 会话 / NVIDIA RTX 4060 Laptop
上游仓库：`galaxy-s10/billd-desk`（MIT）
本仓库：`11anticipate/billd-desk`

## 1. 目标与非目标

**目标**：把本仓库构建成 Ubuntu 上的**被控端**，用华为手机（HarmonyOS 4 / EMUI，可装 Android APK）通过官方 BilldDesk Android 客户端远程控制这台机器，支持键鼠 + 剪贴板 + 文件传输。

**非目标（明确排除）**：

- 多显示器支持（上游 `getScreenStream` 硬编码 `res[0]`，坐标分母只算 primary display）
- 自建服务端（`billd-desk-server` + COTURN + 域名 TLS）
- 修改 renderer（`src/`）、IPC 协议、线上消息格式 —— 主控端使用官方版本，协议被锁死
- 开机自启 / 无人值守
- 任意文本输入（`keyboardType` 死代码，portal 无法实现）

## 2. 环境事实（已实测）

| 项 | 值 |
|---|---|
| 会话类型 | `XDG_SESSION_TYPE=wayland`，`XDG_CURRENT_DESKTOP=ubuntu:GNOME` |
| 显示器 | 单屏 HDMI-1，逻辑 2048×1152，`scaleFactor = 1.25`，物理模式 2560×1440@120Hz |
| portal 后端 | `xdg-desktop-portal-gnome` 46.2（已确认注册 `RemoteDesktop` / `ScreenCast`） |
| D-Bus | `unix:path=/run/user/1000/bus` |
| nut.js | `@nut-tree-fork/nut-js@4.2.2` 预编译 NAPI 包 |

**截屏可行性已用 spike 验证**：Electron 33.4.11 下 `desktopCapturer.getSources({types:['screen']})` 返回 `screen:1:0`，`getUserMedia` 得到 2048×1152@30fps，3 秒 89 帧，像素标准差 113.92（真实画面，非黑屏）。

**spike 发现的约束**：`desktopCapturer.getSources()` 调用前必须已有已 map 的窗口，否则 `xdg-desktop-portal-gnome` 段错误。真实代码天然满足（`IPC_EVENT.getScreenStream` 被 `if (win)` 守卫）。

## 3. 根因

现有输入注入全部依赖 nut.js（`electron-main/index.ts` 17 处调用），nut.js 在 Linux 下走 XTest 扩展，而 **Wayland 从协议层移除了全局输入注入能力**。因此 Wayland 会话下键鼠注入完全失效。

解决方案是改用 `org.freedesktop.portal.RemoteDesktop` —— Wayland 的官方标准注入通道，不需 root、不需切 Xorg。

## 4. 架构

```
renderer（现有 IPC，不改）
   ↓
electron-main/index.ts
   ↓
inputInjector.dispatch(action, payload)
   ├── NutJsInjector     win32 / darwin / linux-xorg   （现有 nut.js 代码原样搬入）
   └── PortalInjector    linux-wayland                 （新增）
```

**改动全部收敛在 `electron-main/` 内。**

| 文件 | 职责 |
|---|---|
| `electron-main/input/injector.ts` | `InputInjector` 接口 + `createInjector()` 工厂 |
| `electron-main/input/nutjs-injector.ts` | 现有 17 处 nut.js 调用原样搬入 |
| `electron-main/input/portal-injector.ts` | 新写。翻译成 D-Bus `Notify*` 调用 |
| `electron-main/input/portal-session.ts` | RemoteDesktop 会话生命周期 + D-Bus 连接 |
| `electron-main/input/evdev-keys.ts` | 134 条 `nut.js Key 值 → evdev 码` 静态表 |
| `scripts/gen-evdev-keys.cjs` | 上述表的生成脚本（出处可复现） |

**接口按 nut.js 语义定义**，不是按 portal 语义。这样 `nutjs-injector.ts` 是零改动搬运，portal 的坐标归一化、button code、keycode 转换全部封在 `portal-injector.ts` 内部。

唯一新增依赖：**`dbus-next`**（纯 TypeScript，无原生编译，不破坏 electron-builder 打包链路）。

`electron-main/index.ts` 只有两处改动：17 处 `nutjs.xxx` → `injector.xxx`（参数不变）；`IPC_EVENT.getScreenStream` handler 中拿到 `win` 之后调用 `injector.attach(win)`。

## 5. Portal 会话生命周期

**触发点**：`IPC_EVENT.getScreenStream` handler，`if (win)` 守卫通过之后。这是「有人正在连我」的信号。

**执行顺序（严格串行）**：

```
[弹窗 1] ScreenCast：Chromium 内部触发，用户选屏幕   ← 现有代码，不动
desktopCapturer.getSources() 返回 source
   ↓
[弹窗 2] RemoteDesktop：injector.attach(win) → CreateSession → SelectDevices → Start
   ↓
两种授权都拿到 → source 发给 renderer → P2P 建连
```

串行而非并发：两个 GNOME 模态弹窗同时排队会互相遮挡，用户容易只点掉一个然后卡死。

**调用序列**（签名依据 xdg-desktop-portal 官方规范）：

```
CreateSession({})                                       → Request
SelectDevices(session, {types:3, persist_mode:1, restore_token})  → Request
Start(session, '', {})                                  → Request
```

- `types` bitmask：KEYBOARD=1 / POINTER=2 → 3
- `persist_mode`：1 = 权限随应用运行期有效
- `parent_window` 传空串（Electron 拿不到可传的 Wayland 窗口句柄，Wayland 后端一般忽略该参数）
- `restore_token` 在 `SelectDevices` 传入，从 `Start` 的 Response 取回，存到 `app.getPath('userData')/portal-restore.json`

**预期弹窗次数**：首次连接 2 次（ScreenCast 一次 + RemoteDesktop 一次）。后续 `restore_token` 可能免掉第二次，但是否兑现需实测；即使不兑现也只是多点一下，功能不受影响。ScreenCast 侧 Chromium 自己管理 token，我们无法共享。

**会话不主动关闭**：RemoteDesktop 会话只在收到 `Notify*` 时注入事件，不持有输入 grab，常驻无害。主进程收不到「远程会话结束」通知（该消息在 renderer 的 WebSocket 里），在 `before-quit` 时关闭即可。

## 6. 鼠标注入映射

| 接口方法（nut.js 语义） | portal 调用 |
|---|---|
| `mouse.move([{x,y}])` | `NotifyPointerMotionAbsolute(s,{},stream,xn,yn)` —— 单次绝对定位，不复刻 nut.js 分步插值 |
| `mouse.setPosition({x,y})` | 同上 |
| `mouse.drag([{x,y}])` | `NotifyPointerButton(272,1)` → `MotionAbsolute` → `NotifyPointerButton(272,0)` |
| `pressButton(LEFT)` | `NotifyPointerButton(272, 1)` |
| `releaseButton(LEFT)` | `NotifyPointerButton(272, 0)` |
| `click(B)` | `NotifyPointerButton(btn,1)` → 立即 → `NotifyPointerButton(btn,0)` |
| `doubleClick(B)` | press → release → **80ms** → press → release |
| `scrollDown(n)` | `NotifyPointerAxisDiscrete(s,{},0,-round(n))` |
| `scrollUp(n)` | `NotifyPointerAxisDiscrete(s,{},0,+round(n))` |
| `scrollLeft(n)` | `NotifyPointerAxisDiscrete(s,{},1,-round(n))` |
| `scrollRight(n)` | `NotifyPointerAxisDiscrete(s,{},1,+round(n))` |
| `getPosition()` | portal 无此 API；返回内存中最近一次坐标（该 handler 无调用方） |

**三处与直觉相反、必须显式处理**：

1. `state` 语义是 **`0=Released, 1=Pressed`**，与 nut.js 同向，不需要反向映射。
2. `axis` 是**数字**不是字符串：`0=Vertical, 1=Horizontal`。
3. `button` 是 **evdev 码**不是 nut.js 枚举：`Button.LEFT=0→272(0x110)`、`RIGHT=1→273(0x111)`、`MIDDLE=2→274(0x112)`。

**坐标换算**：

规范原文：`NotifyPointerMotionAbsolute` 的 *"The (x, y) position represents the new pointer position in the stream's **logical coordinate space**"*。

- injector 接口收**物理像素**，与 nut.js 语义一致（上游 `use-ipcRendererSend.ts:204-211` 先算 `x_phys = primaryDisplaySize.width * scaleFactor * (data.x/1000)` = 2560 × 比例）
- 归一化：`xn = clamp(x_phys / (logicalWidth * scaleFactor), 0, 1)`
- 原理：物理像素 → 逻辑像素要除 1.25，归一化再除 2048，两个除法合成一个除以 2560。验算正中 `x_phys=1280 → 1280/2560 = 0.5` ✓
- 分母直接取 `screen.getPrimaryDisplay()` 的 `.size.width` × `.scaleFactor`，不走 IPC

**`stream` 参数**：传 `0`。规范未定义 0 的语义，需实测。退路是在同一 RemoteDesktop session 上额外调 `ScreenCast.SelectSources` + `Start` 取 `streams[0][0]`（仍是同一个授权框，只多一次无用调用），画面照旧走 Chromium。

## 7. 键盘注入映射

`NotifyKeyboardKeycode(o, a{sv}, i keycode, u state)`，keycode 为 evdev 码，`state` `0=Released / 1=Pressed`。

- **134 条映射表硬编码进仓库**。nut.js `Key` 枚举（134 个成员，定义在 `@nut-tree-fork/shared/dist/lib/enums/key.enum.d.ts`）是 nut.js 自定义的顺序枚举（`Escape=0, F1=1 … Num1=29 … A=71`），与 evdev（`KEY_ESC=1, KEY_A=30, KEY_1=2`）完全不同编号。
- 表的生成草稿已完成：89 条自动匹配 + 45 条需人工确认（`Num1..Num0`、`NumPad*`、`LeftSuper/RightSuper`、`Audio*` 等），0 条无对应，2 处数值别名（evdev 28 = Return/Enter，evdev 0 = Fn/Clear）。
- **evdev 0（`KEY_RESERVED`）视为无效键 → 跳过 + `console.warn`**，不抛错。
- `pressKey(...keys)` / `releaseKey(...keys)` 的数组展开：nut.js 语义是 chord。portal 侧逐个连发 `Notify*`，**严格保持数组原顺序**（上游释放时传的是同一个顺序，不是反序，不要反转）。
- `keyboard.type()` 无法实现（portal 只能发 evdev 键码），但它是死代码，不在范围内。

## 8. 实现选择与错误处理

**`createInjector()` 判定顺序**：

| 条件 | 实现 |
|---|---|
| `BILLD_INPUT_BACKEND=nutjs` | NutJsInjector |
| `BILLD_INPUT_BACKEND=portal` | PortalInjector |
| `process.platform !== 'linux'` | NutJsInjector |
| linux + `XDG_SESSION_TYPE=x11` | NutJsInjector |
| linux + `XDG_SESSION_TYPE=wayland` | PortalInjector |

Windows/macOS 代码路径零变化。

**错误处理**：

1. **授权被拒**：`Start` 的 Response `code !== 0` → 抛错 → 被 `getScreenStream` handler 捕获 → **仍然把 screen source 发给 renderer**（画面能看、输入无效），并 `dialog.showMessageBox` 提示一次。远程会话不中断。
2. **输入失败一律静默降级**：所有 `Notify*` 包 try/catch，只 `console.error`，**绝不让异常冒泡到 IPC handler** —— 冒泡会回 `code:1` 给 renderer，可能被当成失败而中断会话。
3. **会话未就绪时**丢弃输入事件并计数，每 10s 打一条汇总日志，避免刷屏。

## 9. 测试策略

| 层 | 内容 |
|---|---|
| 单元（无 Electron/D-Bus） | `evdev-keys.ts` 134 条全覆盖、码值 ∈ [1,767] 且无 0；坐标换算在 `(2048, 1.25)` 下断言四角 + 正中；`Button.LEFT→272`、`Key.A→30` |
| D-Bus 集成（手动脚本） | ① `CreateSession→SelectDevices→Start` 拿到 `devices=3` ② `stream=0` 被 mutter 接受 ③ `NotifyKeyboardKeycode(30, Pressed)` 在 GNOME 里打出 `a` |
| 端到端手工验收 | 手机客户端实测：移动/单击/双击/右键/拖拽/四向滚轮；字母/数字/Shift·Ctrl·Alt 组合/Ctrl+C·V/方向键/回车/退格/Tab；剪贴板与文件传输走现有 DataChannel，回归验证 |
| 回归 | Windows/macOS 打包与 nut.js 路径不受影响 |

## 10. 手机端

HarmonyOS 4 / EMUI 是 AOSP 兼容，可直接安装官方 BilldDesk Android 客户端（`https://desk.hsslive.cn/#/download`）。手机侧无需任何开发工作。