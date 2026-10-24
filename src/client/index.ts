/**
 * dsh-mobile-xc — Client half 入口（M5：全功能整合）。
 *
 * 结构：PWA 关闭标记 -> 样式注入 -> canary 失配自检 -> reconciler 生命周期
 * （frame-marker / drawer-chrome / composer-height / market-nav-fix 任务）-> 交互层
 * （Escape/点外/导航自动关）-> 手势层（滑动开抽屉）-> phone-chrome +
 * focus-guard -> 调试徽标。
 * exports.disablePwa：预留设置项一键关闭 PWA（localStorage 标记 + 卸载 SW）。
 */
import { MOBILE_CSS } from './styles/index.ts'
import { getConfig, setConfig, onConfigChange, resolveSettingsValue } from './config.ts'
import type { XcConfig } from './config.ts'
import { installMobileEffect, MOBILE_QUERY } from './breakpoints.ts'
import { checkHashedSelectors, checkStructuralAnchors, formatCanaryReport } from './core/selector-map.ts'
import { createReconcilerCore } from './core/reconciler-core.ts'
import { installDebugBadge } from './effects/debug.ts'
import { installOverlayInteractions, makeSidebarToggle } from './effects/drawer.ts'
import { installMobileGesture } from './effects/gesture.ts'
import { installRailPreviewTap } from './effects/rail-preview.ts'
import { registerDrawerTasks, registerComposerTasks, registerCompatTasks } from './effects/tasks.ts'
import { installFocusGuard } from './effects/focus-guard.ts'
import { installXcPluginCard } from './effects/plugin-card.ts'
import { installPhoneChrome } from './effects/phone-chrome.ts'
import { installComposerAutoCollapse } from './effects/composer.ts'
import { installKeyboardInset } from './effects/keyboard.ts'

/**
 * 客户端上下文最小面（本地化类型）。原 @deepseek-ai/dsh-client-runtime 已从
 * dsh 宿主移除（npm 停更于 0.1.1-rc.2）；运行时实际只消费 effect/get，
 * 其余服务面（slots/configForms）由使用方经形状防御按需取用。
 */
interface ClientContext {
  effect<T>(fn: () => T | (() => void) | undefined, label?: string): void
  get(name: string): unknown
}

declare global {
  interface Window {
    __ModuleLoader__: {
      load(options: {
        id: string
        factory: (require: (spec: string) => unknown) => Record<string, unknown>
      }): void
    }
  }
}

window.__ModuleLoader__.load({
  id: 'dsh-mobile-xc',
  factory: (require: (spec: string) => unknown) => {
    const module: { exports: Record<string, unknown> } = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    // react 由 loader 提供（组件/插槽使用）；当前直接 DOM 注入，仅建立依赖关系。
    const react = require('react') as typeof import('react')

    /** 启用 PWA：清除关闭标记并重新注册 SW。 */
    const disablePwa = (): void => {
      if (typeof localStorage !== 'undefined') localStorage.setItem('dsh-mobile-xc.pwa', 'off')
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistrations().then((regs) => {
          for (const reg of regs) void reg.unregister()
        })
      }
    }
    const enablePwa = (): void => {
      if (typeof localStorage !== 'undefined') localStorage.removeItem('dsh-mobile-xc.pwa')
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
      }
    }

    function apply(ctx: ClientContext): void {
      // 0) PWA 关闭标记：off 时卸载已注册 SW（host 注册脚本本身也会跳过）
      ctx.effect(() => {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('dsh-mobile-xc.pwa') === 'off') {
          disablePwa()
        }
        return () => {}
      }, 'dsh-mobile-xc: pwa flag')

      // 0.1) 插件配置命名空间订阅（设置 -> 插件 -> dsh-mobile-xc）。
      //      DSH >= 0.1.7：客户端服务由 settingsScope 更名为 configForms，句柄改为
      //      get(ns) -> { getSnapshot(), set/unset, subscribe(listener) }（命名空间 id 即
      //      profile 条目 id）；全程形状防御 + try/catch——任何异常都不允许阻断插件加载。
      ctx.effect(() => {
        try {
          const anyCtx = ctx as unknown as { configForms?: unknown; get?(name: string): unknown }
          const face = (anyCtx.configForms ?? (typeof anyCtx.get === 'function' ? anyCtx.get('configForms') : undefined)) as
            | {
                get(ns: string): {
                  getSnapshot(): unknown
                  subscribe(listener: () => void): () => void
                }
              }
            | undefined
          if (face === undefined || typeof face.get !== 'function') return () => {}
          const scope = face.get('dsh-mobile-xc')
          if (scope === undefined || scope === null) return () => {}
          const readOnce = (): unknown => {
            try {
              return typeof scope.getSnapshot === 'function' ? resolveSettingsValue(scope.getSnapshot()) : undefined
            } catch {
              return undefined
            }
          }
          const seeded = readOnce()
          if (seeded !== undefined && seeded !== null) {
            try {
              setConfig(seeded as Partial<XcConfig>)
            } catch {
              /* 应用失败不阻断 */
            }
          }
          if (typeof scope.subscribe === 'function') {
            const off = scope.subscribe(() => {
              const next = readOnce()
              if (next !== undefined && next !== null) {
                try {
                  setConfig(next as Partial<XcConfig>)
                } catch {
                  /* 忽略 */
                }
              }
            })
            return () => {
              try {
                off()
              } catch {
                /* 忽略 */
              }
            }
          }
          return () => {}
        } catch {
          return () => {}
        }
      }, 'dsh-mobile-xc: settings namespace')

      // 0.2) 配置即时生效（当前项：PWA 开关）
      ctx.effect(() =>
        onConfigChange((cfg) => {
          try {
            if (cfg.pwaEnabled) enablePwa()
            else disablePwa()
          } catch {
            /* 忽略 */
          }
        }),
        'dsh-mobile-xc: pwa config reaction',
      )

      // 1) 样式注入（fiber 生命周期，卸载即移除）
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-mobile-xc'
        tag.textContent = MOBILE_CSS
        document.head.appendChild(tag)
        return () => {
          tag.remove()
        }
      }, 'dsh-mobile-xc: styles')

      // 2) canary 失配自检（软告警 + 兜底降级；strict 模式留待配置）
      ctx.effect(() => {
        const run = (): void => {
          const report = formatCanaryReport(checkStructuralAnchors(document), checkHashedSelectors(document))
          if (report !== null) console.warn('[dsh-mobile-xc] ' + report)
        }
        // shell 可能晚于插件生效，延迟两帧再跑
        const raf = requestAnimationFrame(() => requestAnimationFrame(run))
        return () => {
          cancelAnimationFrame(raf)
        }
      }, 'dsh-mobile-xc: canary')

      // 3) reconciler 生命周期：单全树观察者 -> 脏键 -> 本核；仅窄屏激活
      const core = createReconcilerCore({
        requestFrame: (flush) => {
          let id = 0
          const run = (): void => {
            id = 0
            flush()
          }
          id = requestAnimationFrame(run)
          return () => {
            if (id !== 0) cancelAnimationFrame(id)
          }
        },
      })
      const toggleSidebar = makeSidebarToggle(ctx)
      registerDrawerTasks(core, toggleSidebar)
      registerComposerTasks(core)
      registerCompatTasks(core)
      // 3.1) 配置变化 → 触发 reconciler（drawerRefresh 等开关即时生效，无需刷新页面）
      ctx.effect(() =>
        onConfigChange(() => {
          try {
            core.note(['*'])
          } catch {
            /* 忽略 */
          }
        }),
        'dsh-mobile-xc: reconciler config reaction',
      )
      installMobileEffect(ctx, 'dsh-mobile-xc: reconciler', () => {
        const observer = new MutationObserver((records) => {
          const keys = new Set<string>()
          for (const record of records) {
            keys.add(
              record.type === 'attributes' && record.attributeName !== null ? record.attributeName : '*',
            )
          }
          core.note(keys)
        })
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'class', 'data-sidebar-collapsed', 'data-details-collapsed', 'data-rightbar-collapsed', 'data-rightbar-fullscreen'],
        })
        core.activate()
        return () => {
          observer.disconnect()
          core.deactivate()
        }
      })

      // 4) 交互层（Escape / 点外 / 导航自动关；窄屏装配）
      installOverlayInteractions(ctx, toggleSidebar)

      // 4.05) 轮次导航 rail 两段式 tap（点击出预览、再点击跳转；桌面零影响）
      installRailPreviewTap(ctx)

      // 4.1) 手势层（从左边缘滑动打开/关闭抽屉）
      installMobileGesture(ctx, toggleSidebar)

      // 5) 移动基线（viewport-fit=cover + 缩放抑制；focus-guard 防键盘弹起）
      installMobileEffect(ctx, 'dsh-mobile-xc: phone chrome', () => installPhoneChrome())
      installMobileEffect(ctx, 'dsh-mobile-xc: focus guard', () => installFocusGuard())
      installMobileEffect(ctx, 'dsh-mobile-xc: composer auto-collapse', () => installComposerAutoCollapse())
      // 5.1) 软键盘：按 visualViewport 收窄帧高 + 清掉 WebKit 的残余滚动（iOS 专属症状）
      installMobileEffect(ctx, 'dsh-mobile-xc: keyboard inset', () => installKeyboardInset())

      // 6) ?mobile-nav-debug=1 徽标（返回 disposer 由 effect 持有）
      ctx.effect(() =>
        installDebugBadge(() => {
          const structural = checkStructuralAnchors(document)
          const hashed = checkHashedSelectors(document)
          const narrow = window.matchMedia(MOBILE_QUERY).matches
          const frameShape = structural.frameShape
          return (
            'view=' + window.innerWidth + 'px' +
            ' mq=' + (narrow ? 'narrow' : 'wide') +
            ' shell=' + (structural.shellOverlay ? 'ok' : 'MISS') +
            ' rightbar=' + (structural.rightbarContract ? 'ok' : 'MISS') +
            ' frame=' + (frameShape && structural.shellOverlay ? 'ok' : 'MISS') +
            ' composer=' + (structural.composerSlot ? 'ok' : 'MISS') +
            ' hash=' + hashed.hits + '/' + hashed.declared
          )
        }),
        'dsh-mobile-xc: debug badge',
      )

      // 7) 设置 → 插件 →「插件配置」tab 的配置卡（dshmarket 同款；异常不阻断加载）
      try {
        installXcPluginCard(ctx, react as unknown as { createElement(...a: unknown[]): unknown; useState<T>(i: T | (() => T)): [T, (v: T) => void]; useEffect(f: () => unknown, d: unknown[]): void; useRef<T>(i: T): { current: T } })
      } catch {
        /* 忽略 */
      }

    }

    exports.apply = apply
    exports.disablePwa = disablePwa
    // 声明所需客户端服务面（由运行时注入为 ctx 属性）；DSH >= 0.1.7 用 configForms。
    exports.inject = ['slots', 'locale', 'configForms']
    return module.exports
  },
})