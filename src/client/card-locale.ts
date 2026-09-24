/**
 * card-locale — 插件配置卡的英中双语文案（en 为默认回退）。
 * 经 ctx.locale.register(XC_LOCALE_NS, { en, zh }) 注册到宿主 locale 运行时；
 * 槽注册带 locale: XC_LOCALE_NS 后，框架把与宿主当前语言绑定的 t 座放进卡 props。
 * t 座缺失（旧宿主未注入 locale）时，plugin-card 回退到 en 字典，卡永远可读。
 * 纯数据模块（零 import）：esbuild 直接内联进客户端 bundle，无跨插件值导入。
 */

export const XC_LOCALE_NS = 'dsh-mobile-xc'

export const XC_CARD_LOCALE_KEYS = {
  title: 'title',
  description: 'description',
  expand: 'expand',
  collapse: 'collapse',
  swipeEnabled: 'swipeEnabled',
  swipeEnabledHint: 'swipeEnabledHint',
  dshmarketNavFix: 'dshmarketNavFix',
  dshmarketNavFixHint: 'dshmarketNavFixHint',
  pwaEnabled: 'pwaEnabled',
  pwaEnabledHint: 'pwaEnabledHint',
  drawerRefresh: 'drawerRefresh',
  drawerRefreshHint: 'drawerRefreshHint',
  headerScroll: 'headerScroll',
  headerScrollHint: 'headerScrollHint',
  turnRail: 'turnRail',
  turnRailHint: 'turnRailHint',
} as const

export type XcCardLocaleKey = (typeof XC_CARD_LOCALE_KEYS)[keyof typeof XC_CARD_LOCALE_KEYS]

export type XcCardLocaleDict = Record<XcCardLocaleKey, string>

export const en: XcCardLocaleDict = {
  title: 'Mobile UI',
  description: 'Mobile-only options: swipe drawer, marketplace nav fix, PWA cache, refresh button, header scroll, turn rail',
  expand: 'Expand',
  collapse: 'Collapse',
  swipeEnabled: 'Swipe to open drawer',
  swipeEnabledHint: 'Swipe right from the left screen edge to open the workspace drawer',
  dshmarketNavFix: 'Marketplace settings-nav fix',
  dshmarketNavFixHint: 'Keep the settings nav visible on narrow screens so the marketplace page cannot dead-end',
  pwaEnabled: 'PWA offline cache',
  pwaEnabledHint: 'Turning this off unloads the cache immediately; the page then loads from the network',
  drawerRefresh: 'Drawer refresh button',
  drawerRefreshHint: 'Refresh entry at the bottom of the drawer, for when the PWA has no pull-to-refresh (hidden by default)',
  headerScroll: 'Horizontal header scroll',
  headerScrollHint: 'On narrow screens the header title and PTC/usage badges stay on one line; scroll sideways to see the overflow',
  turnRail: 'Turn navigation rail',
  turnRailHint: 'Tick rail on the right of the chat, dim at rest: click a tick to preview the turn, click the same tick again to jump to it',
}

export const zh: XcCardLocaleDict = {
  title: '移动端适配',
  description: '移动端适配选项：滑动抽屉 / 市场兼容 / 刷新按钮 / PWA / 页头滑动 / 轮次导航',
  expand: '展开',
  collapse: '收起',
  swipeEnabled: '滑动打开抽屉',
  swipeEnabledHint: '从屏幕左边缘右滑打开工作区抽屉',
  dshmarketNavFix: 'dshmarket 设置导航修复',
  dshmarketNavFixHint: '窄屏保留设置导航，防止市场页死路',
  pwaEnabled: 'PWA 离线缓存',
  pwaEnabledHint: '关闭后立即卸载缓存，页面走网络',
  drawerRefresh: '抽屉刷新按钮',
  drawerRefreshHint: '侧栏底部刷新入口，PWA 无下拉刷新时的手动刷新（默认隐藏）',
  headerScroll: '页头横向滑动',
  headerScrollHint: '窄屏下页头标题与 PTC/用量徽标保持单行，溢出部分左右滑动查看',
  turnRail: '轮次导航',
  turnRailHint: '对话右侧轮次刻度条：平时淡显，点击先预览轮次、再点同一刻度跳转',
}
