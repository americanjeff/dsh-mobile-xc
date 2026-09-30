# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.7] - 2026-09-30

### Fixed
- **设置页移动端优化族规则重锚定（适配 DSH 0.2.0）**：0.2.0 起设置对话框改为
  `createPortal(document.body)`（`overlay > mask + panel`），不再有
  `[data-mobile-nav="frame"]` 祖先；原作用域在该锚下的设置族规则（面板全屏、nav 横滚条、
  内容区滚动/安全区）集体失效，设置页回退为桌面双栏布局被挤进窄屏（左 188px 竖 nav +
  右 ~150px 内容列逐字换行）。现改锚 canary 已登记的哈希类：
  `.VOzbGW_panel` / `.VOzbGW_panel:has(> nav) …`；抽屉内 transform 陷阱规则保留，
  仅对其余仍渲染在抽屉内的 aria-modal 弹层生效。selector-map 的 `.VOzbGW_panel`、
  `.VOzbGW_nav` 两条登记 dshVersion 更新为 0.2.0-rc.2 并补 portal 变迁说明。
  验证：CDP 探针（scripts/probe-settings-020.mjs）实测 390×844 下面板 390×844 全屏、
  nav 52px 横条（navList 横向可滚）、内容区全宽纵向滚动，与 0.1.x 移动端设计一致；
  桌面 ≥1024px 规则仍在 `@media (max-width:1023px)` 内，零影响。
- **`pnpm verify` 门禁转绿**：`src/index.ts` 的 volatile 标记改经 `markVolatile()` 助手
  （一次结构断言绕开 schemastery 3.18.1 `extra()` 的 `keyof Meta` 类型限制；运行时仍为
  `meta.volatile=true`，与 `.volatile()`（>=3.18.4）行为一致）。此前 clean HEAD 上 tsc 即报
  6 条 TS2345，与功能无关但挡住门禁。

## [0.6.6] - 2026-09-24

### Changed
- **适配 DSH 0.1.7**：设置命名空间改由宿主导出的 `Config` 声明（各字段标 `volatile`，
  否则不会投影到 describe() / 设置页）；插件 `cordis.patch.yml` 的 `insert[].id` 与命名空间
  统一为 `dsh-mobile-xc`（0.1.7 起命名空间 id 恒等于 profile 条目 id，客户端以
  `configForms.get('dsh-mobile-xc')` 查询）。
- **设置入口移到新版「插件页」**（与 modsearch、官方 subagent 同款机制）：注册到
  `plugins.bundle.config`（keyed，key = npm 包名），`view='page'` 时渲染整页配置表单；
  旧 `settings.plugin.item`（0.1.7 已移除）不再适用，保留折叠卡作宿主兜底。
- `engines.dsh`：`>=0.1.1-rc.2` → `>=0.1.7-rc.1`。

## [0.6.3] - 2026-09-12

### Added
- 「轮次导航」成为插件可配置项（`turnRail`，默认开启）：关闭后 rail 恢复 vendor
  窄屏隐藏原状、两段式点击预览一并停用；开关在 设置 → 插件 → 移动端适配 卡片内。
  门控实现：reconciler 任务把配置投影为 `html[data-xc-turn-rail]` 属性，rail 的 CSS 段与
  点击拦截均以该属性为总闸（仿 headerScroll 模式），配置变化即时生效、无需刷新。
### Changed
- 移动端轮次导航 rail 平时刻度淡化：普通刻度背景降至 ~8% 透明、未加载刻度 ~4.5% 透明
  （color-mix 双声明，不支持时回退原 border-l4 纯色；不碰 opacity，busy 闪烁动画不受影响），
  点击预览（markPreview 26px）与当前轮（markActive 28px 品牌色）保持醒目，
  「平时淡、交互时亮」两级视觉。仅 ≤1023px 生效，桌面零影响。
## [0.6.2] - 2026-09-12

### Added
- 移动端显示对话记录右侧的「轮次导航」rail（每轮一个刻度，点击可跳转到对应轮次）：
  vendor 自 0.1.5 起在聊天列容器宽度 ≤900px 时用 `@container (width<=900px)` 隐藏
  `.eGxaPq_slot`（移动端聊天列恒全宽必命中），导致移动端轮次指示器消失。本插件在
  ≤1023px 下反制恢复显示（`display:block !important`）；桌面 ≥1024px 不受影响，
  行为仍由 vendor 容器查询决定。哈希类 `.eGxaPq_slot` 已登记 canary，
  漂移兜底 = 恢复 vendor 隐藏原状（无功能损害）。
- 移动端轮次导航 rail 改为两段式 tap：「点击先出轮次预览、再点同一刻度跳转」（rail-preview.ts）：
  第一击在 window 捕获阶段拦截 vendor 直跳，按 vendor itemAtPointer 同源算法换算命中刻度并聚焦对应
  mark → 触发 vendor onFocus → preview 浮层（轮次 + 摘要）显示 + 刻度 markPreview 高亮；第二击同一刻度
  放行原 onClick 跳转，并主动失焦回收浮层；点击 rail 外解除武装。触屏原先无 hover、点击即跳（点错即跳错）
  的体验由此获得「先确认后跳转」的缓冲。桌面 ≥1024px 不装配，vendor hover 预览原样。哈希类
  `.eGxaPq_frame` 补登记 canary（漂移兜底 = 单击即跳，无功能损害）。
- 同条 rail 追加移动端触控增强（仍 ≤1023px、桌面零影响）：rail 内移
  `right:6px` 避开 iOS 屏幕边缘（∓9px）手势区（此前的 28px 贴边热区在真机上
  常被边缘返回手势抢走点击，表现为"点了没反应"）；`::after` 向左扩展 12px
  透明命中区（总 ≈40px，符合触控热区直觉，命中仍落在宿主 frame 上，vendor 按
  clientY 换算轮次不受影响）；刻度线加粗加长（12→18px、2→3px）、active 刻度
  品牌色高亮 + `frame:active` 按压反馈，触屏可感知点击落点与跳转结果。

## [0.6.1] - 2026-09-12

### Fixed
- 移动端（<768px）点击会话头右上角「打开侧边栏」按钮（vendor 原生右栏 ExpandButton，
  装载 dsh-better-sidebar 等插件的右栏）不显示右侧插件抽屉：该按钮打开的右栏面板是
  `position:fixed` 全屏态（frame 仍带 `data-rightbar-collapsed`），而插件的
  details 列 CSS 一直保持 `transform: translateX(110%)` 平移——transform 列成为
  fixed 面板的包含块，面板被钉进「零宽绝对定位列」里不可见。
  修复：frame 带 `data-rightbar-fullscreen` 时强制解除 details 列 transform
  （面板按 vendor 桌面行为 fixed 盖满视口）；frame-marker 把全屏态当作右栏展开
  （隐藏汉堡）；MutationObserver 补监听 `data-rightbar-fullscreen`。
  底部工作台等非右栏面板不受影响（此前即正常）。

## [0.6.0] - 2026-09-11

### Added
- 会话页头标题簇横向滑动（`header-scroll` 状态层，默认开）：≤1023px 下页头第一行保持单行，
  「会话名 + PTC 模式 + 剩余用量 + token 用量徽标 + jobs」溢出时可左右滑动查看；右缘渐隐
  mask 提示仍有内容、滑到最右自动撤除（`data-xc-hscroll-more` 随溢出态可逆切换），滑到最右
  不留灰边。汉堡避让的 52px 留白在外层 `titleRow` 上，内容不会滑入汉堡底下。
- 设置卡新增「页头横向滑动」开关（配置项 `headerScroll`，默认开；关闭 = 字节级回到 0.5.8 表现）。
- 会话面包屑 `nav` 增加 96px 宽度地板（`min-width`）：标题短、徽标多时不再被 flex 压到 0 宽。
- selector-map 新增 3 条登记（0.1.5-rc.2）：`.wSkVaW_titleCluster`、`.wSkVaW_headerActions`、
  `.wSkVaW_crumbs`，失配时软告警并有各自安全兜底（最坏回 0.5.8 行为，不炸页头）。

### Fixed
- 反制 `dsh-token-usage-xc` 的 `@media (max-width:380px)` 页头换行：极窄屏（≤380px）徽标不再
  换行、页头不再长高一行；徽标 flex 收缩保护规则改为两臂并列（`.wSkVaW_headerActions > *` 槽锚臂 +
  `[data-slot="conversation.session.header.actions"] > *` 徽标根臂）。

### Changed
- Service Worker 缓存版本 bump 至 `202609-xc1`：activate 时删旧缓存并重收 boot 资源，真机 PWA
  不会继续拿旧 `client.js`。

## [0.5.4] - 2026-09-08

### Added
- Declare `engines.dsh` (`>=0.1.1-rc.2`) in package.json so dsh-market shows the
  host-version requirement and can filter by it. No functional change.

## [0.5.3] - 2026-09-03

### Fixed
- Prevent iOS Safari auto-zoom on input focus: mobile input/editable font-size is
  raised to 16px (the hard threshold below which Safari zooms the page on focus),
  covering inputs, textareas, selects and the composer contenteditable; pinch zoom
  is unaffected.

## [0.5.2] - 2025-01-20

### Added
- Gesture support: swipe to toggle drawer (replaced drag-to-follow)
- PWA support with official DSH whale icon
- Canary version mismatch detection with soft warnings
- Compatibility fixes for dshmarket, dsh-better-sidebar, dsh-token-usage

### Changed
- Improved reconciler single-observer scheduling
- Enhanced safe-area handling for mobile devices
- Better overlay drawer animations with FLIP technique

## [0.5.0] - 2025-01-15

### Added
- Overlay drawer with scrim
- Safe-area full coverage for notch/home indicator
- Focus guard and aria-modal support
- CDP gate for development

### Changed
- Refactored breakpoints to align with vendor SIDEBAR_AUTO_COLLAPSE=1024

## [0.4.0] - 2025-01-10

### Added
- Glass card composer
- 44px touch target compliance
- Keyboard dvh handling
- reduced-motion support

## [0.3.0] - 2025-01-05

### Added
- Settings panel mobile adaptation
- Third-party compatibility switches
- Plugin card styling fixes

## [0.2.0] - 2025-01-01

### Added
- Core reconciler implementation
- Selector-map for vendor DOM targeting
- Breakpoint detection system

## [0.1.0] - 2024-12-20

### Added
- Initial release
- Basic mobile UI detection
- CI/CD setup with GitHub Actions

---

For older versions, see git history.
