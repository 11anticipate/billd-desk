[BilldDesk Pro](./README.md) | BilldDesk 开源版

<p align="center">
  <a href="https://desk.hsslive.cn" target="_blank">
    <img
      width="200"
      src="https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/icon.png"
    />
  </a>
</p>

<h1 align="center">
  BilldDesk
</h1>

<p align="center">
  基于Vue3 + WebRTC + Nodejs + Electron + Flutter搭建的桌面控制（win、mac、linux、安卓）
</p>

<div align="center">

![stars](https://img.shields.io/github/stars/galaxy-s10/billd-desk)
![forks](https://img.shields.io/github/forks/galaxy-s10/billd-desk)

![version](https://img.shields.io/github/package-json/v/galaxy-s10/billd-desk)
![License](https://img.shields.io/github/license/galaxy-s10/billd-desk)
![language](https://img.shields.io/github/languages/top/galaxy-s10/billd-desk)
![language](https://img.shields.io/github/languages/top/galaxy-s10/billd-desk-server)
![language](https://img.shields.io/github/languages/top/galaxy-s10/billd-desk-flutter)

</div>

## ⚠️ 本仓库说明（fork）

这是 [galaxy-s10/billd-desk](https://github.com/galaxy-s10/billd-desk) 的 fork，分支 `ubuntu-wayland`。**上游代码与协议均未改动，功能与原开源版一致**，只额外解决了「Ubuntu / GNOME Wayland 下无法作为被控端」这一个上游未完成的功能。

如果你不需要 Wayland 支持，请直接使用上游仓库，本仓库对你没有价值。

### ⚠️ 开源版目前连不上官方服务器

Wayland 注入层解决的是本地能力，但**开源版客户端目前无法连接 BilldDesk 官方服务**，原因是接口形态已经变了：

- 官方地址 `api-live.hsslive.cn` 已 NXDOMAIN，源码里写死的 `api-live` / `srs-pull` 均已失效
- 官方客户端（安卓版v0.601、网页版 v0.582.0）实际请求的是 `desk-api.hsslive.cn`，而该服务的**每个请求都必须携带 `X-Billd-Sign` MD5 签名**，密钥硬编码在厂商客户端中
- 服务端的登录接口只接受**数字用户 ID**（`{"username":...}` 会得到 `WHERE parameter "id" has invalid "undefined" value`），账号体系为 GitHub / QQ / 邮箱三方 OAuth

因此本 fork 只在**自建服务端**（[`galaxy-s10/billd-desk-server`](https://github.com/galaxy-s10/billd-desk-server)，同为开源）的前提下可用：开源服务端的 `/desk_user/create` 本就是匿名接口，不需要签名。若你的目标是立刻远程控制 Ubuntu 而不自建服务器，请直接用 [RustDesk](https://rustdesk.com/)（Linux 被控端原生支持 Wayland，无需注入层）。

### 为什么上游在 Wayland 下不能被控

上游的键鼠注入全部依赖 [nut.js](https://github.com/nut-tree-fork/nut-js)，它在 Linux 下走 X11 的 XTest 扩展。而 Wayland 从协议层面移除了全局输入注入能力，因此 GNOME 原生应用、终端、文件管理器都收不到注入的输入事件 —— 表现就是画面能看、鼠标键盘完全没反应。

本仓库改用 Wayland 的官方标准通道 `org.freedesktop.portal.RemoteDesktop`。不需要 root，不需要切换到 Xorg 会话，也不需要安装 `ydotool` 之类的内核模块。

### 已验证环境

| 项 | 值 |
| --- | --- |
| 系统 | Ubuntu 24.04.5 LTS |
| 桌面 | GNOME 46，Wayland 会话 |
| 显卡 | NVIDIA RTX 4060 Laptop（驱动 595.91.07）+ AMD Radeon 混合显卡 |
| 被控端 | Electron 33.2.1，AppImage（x64 / arm64） |
| 主控端 | 官方 Android 客户端（HarmonyOS 4 / EMUI 实测可用） |

实测通过的输入操作：鼠标绝对定位移动、单击、双击、右键、拖拽、四向滚轮、键盘（字母、数字、Shift/Ctrl/Alt 组合、功能键）。

### 使用方式

1. 在**主控端**（手机 / 另一台电脑）使用官方客户端。浏览器直接打开 <https://desk.hsslive.cn>，或从 <https://desk.hsslive.cn/#/download> 下载 Android 客户端。
2. 在**被控端**（Ubuntu）安装本仓库构建的 AppImage：

   ```bash
   # 构建（需要 Node 20+）
   npx vite build && npx electron-builder --linux

   # 安装依赖缺失 FUSE 时先执行，或用 --appimage-extract-and-run 启动
   sudo apt install libfuse2
   ```

3. 主控端发起远程后，**Ubuntu 桌面上会弹出两次授权框**：第一次是屏幕共享，第二次是键鼠注入。这是 Wayland 的安全模型，两次都必须点「允许」，无法绕过。

### 已知限制

| 限制 | 说明 |
| --- | --- |
| 每次远程会话都要点授权 | 上游协议与主控端不可改，无法预授权。实测 `restore_token` 会恢复出设备数为 0 的会话并导致注入全部被拒，故未采用 |
| 不支持多显示器 | 上游 `getScreenStream` 硬编码只取第一个屏幕，鼠标坐标换算也只按主显示器计算。属于上游问题，本仓库未修 |
| 不支持开机自启 / 无人值守 | 上游开源版未实现 |
| 无法输入任意文本 | portal 只能发送 evdev 键码。`keyboard.type` 在上游是死代码，不影响使用 |
| 不支持隐私屏 / 虚拟屏 / 安卓被控 | 上游开源版未实现 |

### 实现要点

改动全部收敛在 `electron-main/input/`，`src/`、IPC 协议、线上消息格式一行未动：

| 文件 | 职责 |
| --- | --- |
| `injector.ts` | 输入注入接口 + 后端选择（`BILLD_INPUT_BACKEND=nutjs\|portal` 可强制覆盖） |
| `nutjs-injector.ts` | 原有 nut.js 逻辑，Windows / macOS / Linux X11 走这里，行为与上游一致 |
| `portal-injector.ts` | Wayland 实现：坐标归一化、evdev 事件码转换 |
| `portal-session.ts` | RemoteDesktop portal 会话生命周期 |
| `evdev-keys.ts` | 132 条 nut.js 键值 → Linux evdev 键码对照表 |
| `scripts/gen-evdev-keys.cjs` | 上述对照表的生成脚本 |

新增唯一依赖：[dbus-next](https://github.com/bus1/dbus-next)（纯 TypeScript，无原生编译）。

平台选择的判断逻辑：非 Linux 平台走 nut.js；Linux 下读 `XDG_SESSION_TYPE`，`x11` 走 nut.js，`wayland` 走 portal。因此 Windows 与 macOS 的行为与上游完全一致。

设计与实测细节见 [`docs/superpowers/specs/2026-10-04-billddesk-wayland-controlled-endpoint-design.md`](./docs/superpowers/specs/2026-10-04-billddesk-wayland-controlled-endpoint-design.md)。

### 开发与测试

```bash
npx vitest run                    # 单元测试
npx vue-tsc --noEmit -p tsconfig.json   # 类型检查（必须用 tsconfig.json）
npx eslint electron-main/input --config ./eslint.config.js
```

> [!CAUTION]
> 上游 README 指出 BilldDesk 至今未发布 1.0 稳定版，不建议用于生产环境。本 fork 同样如此。

---

## ⭐️ BilldDesk

> [!CAUTION]
> BilldDesk 目前仍未发布稳定版，不建议开发者用于生产环境！

## ⚡️ BilldDesk Pro

BilldDesk存在两个已知问题（权限，控制）在现有架构下，几乎不可修复！为什么不可修复？看我发的b站视频：[https://www.bilibili.com/video/BV1yqN9zsEEd?vd_source=bf386c933a4aff3e8b19a1f003de0015&p=2&spm_id_from=333.788.videopod.sections](https://www.bilibili.com/video/BV1yqN9zsEEd?vd_source=bf386c933a4aff3e8b19a1f003de0015&p=2&spm_id_from=333.788.videopod.sections)，01:35秒开始到20:45秒。

`BilldDeskPro` 完全重写了`BilldDesk`，修复了`BilldDesk`的已知问题（权限，控制）。并且稳定性更高、性能更强、代码可读性更好、更新更频繁

BilldDeskPro客户端下载：

- github release：[https://github.com/galaxy-s10/billd-desk/releases/tag/v0.76.0](https://github.com/galaxy-s10/billd-desk/releases/tag/v0.76.0)
- 官网下载：[https://desk.hsslive.cn/#/download](https://desk.hsslive.cn/#/download)

> BilldDeskPro订阅：[https://desk.hsslive.cn/#/price](https://desk.hsslive.cn/#/price)

## 简介

BilldDesk 远程桌面控制，目前实现了类似 ToDesk、向日葵等远程桌面的功能。

## 对比ToDesk

> 作者使用过很多远程软件：TeamViewer、向日葵、ToTesk、AnyDesk、RustDesk、UU远程、连连控，还有qq自带的远程协助等等，但用ToDesk比较多，因此用ToTesk和BilldDesk作对比~

|                           | BilldDesk    | BilldDesk Pro    | ToDesk                                                 |
| ------------------------- | ------------ | ---------------- | ------------------------------------------------------ |
| 连接限制                  | 无限制，免费 | 无限制，免费     | 80h/月，200次/月，24h/次，超出需要购买专业版（¥24/月） |
| 画质限制                  | 无限制，免费 | 限制1080p，免费  | 限制1080p，免费                                        |
| 帧率限制                  | 无限制，免费 | 限制60帧，免费   | 限制30帧，免费                                         |
| 安卓被控                  | 不支持       | 支持，免费       | 支持，需要购买专业版（¥24/月）或购买插件（¥15/月）     |
| 自定义设备码              | 支持，免费   | 支持，免费       | 不支持                                                 |
| 设备分组管理              | 支持，免费   | 支持，免费       | 支持，免费                                             |
| 开机自启/无人值守         | 不支持       | 支持，免费       | 支持，免费                                             |
| 隐私屏                    | 不支持       | 支持，免费       | 支持，需要购买专业版（¥24/月）                         |
| 虚拟屏                    | 不支持       | 支持，免费       | 支持，需要购买性能版（¥95/月）                         |
| 远程时录屏                | 不支持       | 支持，免费       | 不支持                                                 |
| 屏幕墙                    | 不支持       | 支持，阶梯收费   | 支持，需要购买技术版（¥218/月）                        |
| 批量群控                  | 不支持       | 支持，屏幕墙自带 | 不支持                                                 |
| web网页发起远程控制       | 支持，免费   | 支持，免费       | 支持，需要购买专业版（¥24/月）                         |
| 后台管理                  | 不支持       | 支持，免费       | 支持，免费                                             |
| 远程控制web网页（仅观看） | 支持，免费   | 支持，免费       | 不支持                                                 |
| 同账号多主控同时发起远控  | 支持，免费   | 支持，免费       | 支持，需要购买插件（¥233/月）                          |
| 私有化部署/二次开发       | 支持，免费   | 支持，付费       | 支持，需要ToDesk企业版，定价未知                       |

## 生态

| 项目名称            | 代码仓库                                                               | star & fork                                                                                                                                                                                                                                                                                                     | 线上地址/下载地址                                                        |
| ------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 远程桌面网页/客户端 | [billd-desk](https://github.com/galaxy-s10/billd-desk)                 | [![github](https://img.shields.io/github/stars/galaxy-s10/billd-desk?label=star&logo=GitHub)](https://github.com/galaxy-s10/billd-desk) [![github](https://img.shields.io/github/forks/galaxy-s10/billd-desk?label=fork&logo=GitHub)](https://github.com/galaxy-s10/billd-desk)                                 | [https://desk.hsslive.cn](https://desk.hsslive.cn)                       |
| 远程桌面后台        | [billd-desk-admin](https://github.com/galaxy-s10/billd-desk-admin)     | [![github](https://img.shields.io/github/stars/galaxy-s10/billd-desk-admin?label=star&logo=GitHub)](https://github.com/galaxy-s10/billd-desk) [![github](https://img.shields.io/github/forks/galaxy-s10/billd-desk-admin?label=fork&logo=GitHub)](https://github.com/galaxy-s10/billd-desk-admin)               | [https://desk-admin.hsslive.cn](https://desk-admin.hsslive.cn)           |
| 远程桌面移动端      | [billd-desk-flutter](https://github.com/galaxy-s10/billd-desk-flutter) | [![github](https://img.shields.io/github/stars/galaxy-s10/billd-desk-flutter?label=star&logo=GitHub)](https://github.com/galaxy-s10/billd-desk-flutter) [![github](https://img.shields.io/github/forks/galaxy-s10/billd-desk-flutter?label=fork&logo=GitHub)](https://github.com/galaxy-s10/billd-desk-flutter) | [https://desk.hsslive.cn/#/download](https://desk.hsslive.cn/#/download) |
| 远程桌面服务端      | [billd-desk-server](https://github.com/galaxy-s10/billd-desk-server)   | [![github](https://img.shields.io/github/stars/galaxy-s10/billd-desk-server?label=star&logo=GitHub)](https://github.com/galaxy-s10/billd-desk-server) [![github](https://img.shields.io/github/forks/galaxy-s10/billd-desk-server?label=fork&logo=GitHub)](https://github.com/galaxy-s10/billd-desk-server)     | [https://desk-api.hsslive.cn](https://desk-api.hsslive.cn)               |

## 功能

- [x] `web网页` 控制 `电脑端`
- [x] `web网页` 控制 `安卓端`
- [x] `web网页` 控制 `web网页`（仅观看）
- [x] `电脑端` 控制 `电脑端`
- [x] `电脑端` 控制 `安卓端`
- [x] `电脑端` 控制 `web网页`（仅观看）
- [ ] `安卓端` 控制 `电脑端`
- [ ] `安卓端` 控制 `安卓端`
- [ ] `安卓端` 控制 `web网页`（仅观看）
- [x] 多台设备同时远程一台设备
- [x] 一台设备同时远程多台设备
- [x] 多屏操作
- [x] 连接鉴权
- [x] 自定义设备码/连接密码
- [x] 自定义接口（wws/api/中继服务器）
- [x] 按键组合键
- [x] 文件传输
- [x] 开机自启
- [x] 锁屏保活
- [x] 屏幕墙
- [x] 批量群控
- [x] 隐私屏
- [x] 虚拟屏
- [x] 扩展屏
- [x] 设备分组
- [x] 支持 macOS 系统
- [x] 支持 Windows 系统
- [x] 支持 Linux 系统（Wayland 键鼠注入由本仓库实现，见上文「本仓库说明（fork）」）
- [x] 支持 安卓端（Flutter）
- [ ] 支持 苹果端（Flutter）
- [x] 后台管理
- [ ] Docker一键部署
- [x] 支持私有化部署

## 预览

快速体验：[https://desk.hsslive.cn](https://desk.hsslive.cn)

### web网页/电脑端控制电脑端

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/111.png?raw=true)

### web网页/电脑端控制安卓端

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/222.png?raw=true)

### web网页/电脑端控制web网页

> 仅观看模式

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/333.png?raw=true)

### web网页移动端

> 首页

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/777.png?raw=true)

> 控制页

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/888.png?raw=true)

### 屏幕墙

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/444.png?raw=true)

### 批量群控

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/b1.webp?raw=true)

### 设备分组

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/999.png?raw=true)

### 隐私屏

> 支持自定义隐私屏（图片、文字）

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/a7.png?raw=true)

### 虚拟屏

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/a8.png?raw=true)

### 鼠标、键盘仿真

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/a9.jpg?raw=true)

### 安卓端控制电脑端【TODO】

### 安卓端控制安卓端【TODO】

### 安卓端控制web网页【TODO】

> 仅观看模式

### 文件传输

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/666.png?raw=true)

### 跨平台支持

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/555.png?raw=true)

### [后台] 控制台

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/a2.png?raw=true)

### [后台] 黑名单

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/a1.png?raw=true)

### [后台] 设备分组

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/a3.png?raw=true)

### [后台] 远程管理

- 远程记录

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/a4.png?raw=true)

- 在线远程

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/a5.png?raw=true)

- 在线设备

![img](https://github.com/galaxy-s10/billd-desk/blob/main/readme_img/a6.png?raw=true)

## 技术栈

- 前端相关：[Vue3](https://vuejs.org) 以及相关技术栈、`Typescript`、`WebRTC`、`WebCodecs`、`Web Workder`、`Web Audio`、`Canvas`
- 后端相关：[Nodejs](https://nodejs.org) 以及相关技术栈、`Koa2`、`Typescript`、`Sequelize`、`Mysql`、`Redis`、`Socket.io`
- 桌面客户端相关：[Electron](https://www.electronjs.org)以及相关技术栈、`WebRTC`
- 移动客户端相关：[Flutter3](https://flutter.dev)以及相关技术栈、`WebRTC`
- 流媒体服务器相关：[SRS](https://ossrs.net)、 [FFmpeg](https://ffmpeg.org)、[Coturn](https://github.com/coturn/coturn)
- Docker 相关：[Docker](https://www.docker.com)
- 部署相关：[阿里云云效](https://devops.aliyun.com)、[billd-deploy](https://github.com/galaxy-s10/billd-deploy)

## 本地启动

- [x] billd-desk(pro) 查看 [start-client.md](https://github.com/galaxy-s10/billd-desk/blob/main/doc/start-client.md)

## 接口文档

查看 [apifox](https://apifox.com/apidoc/shared-a8ba9715-7730-432d-896c-97f983050795)

## 性能测试

查看 [benchmarking.md](https://github.com/galaxy-s10/billd-desk/blob/main/doc/benchmarking.md)

## 常见问题

[https://desk.hsslive.cn/#/faq](https://desk.hsslive.cn/#/faq)

## 问题反馈

欢迎提 [issue](https://github.com/galaxy-s10/billd-desk/issues)

## 参与贡献

欢迎提 [pr](https://github.com/galaxy-s10/billd-desk/pulls)

## 私有化部署

billd-desk完全开源（可商用），欢迎部署！

## 客户端下载

[https://desk.hsslive.cn/#/download](https://desk.hsslive.cn/#/download)

## 官方交流群

- [交流群（用户）.md](https://github.com/galaxy-s10/billd-desk/blob/main/doc/交流群（用户）.md)
- [交流群（开发）.md](https://github.com/galaxy-s10/billd-desk/blob/main/doc/交流群（开发）.md)

## 多平台支持

- [x] Web网页（建议使用：[Chrome浏览器](https://www.google.com/intl/zh-CN/chrome/) / [Via浏览器](https://viayoo.com) / `Safari浏览器`）
- [ ] Windows 7 不支持
- [x] Windows 10、Windows 11
- [x] Windows Server 2022，其他版本未实际测试
- [x] macOS
- [x] Linux（X11 与 Wayland 均可作为被控端，Wayland 支持由本仓库实现）
- [x] Android 11 至 Android 15，其他版本未实际测试
- [ ] iOS

## 贡献者

  <a href="https://github.com/galaxy-s10/billd-desk/graphs/contributors" target="_blank">
    <img
      width="200"
      src="https://contrib.rocks/image?repo=galaxy-s10/billd-desk"
      alt="BilldDesk logo"
    />
  </a>

## 初心

该项目初心只是作为[billd-live](https://github.com/galaxy-s10/billd-live)的衍生项目，但后面觉得远程桌面也挺有意思的，就一直坚持完善下去。

## 愿景

各大远程软件虽然免费都能用，但免费版的功能覆盖不够全面，比如有些普通个人用户可能只是临时需要远程一下安卓手机，但却需要开通一个月的服务才可以。BilldDesk完善了这些基本功能，让普通用户也能用上~
