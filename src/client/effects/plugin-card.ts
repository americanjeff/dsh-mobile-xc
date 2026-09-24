/**
 * plugin-card — 在「设置 → 内置插件」注册 dsh-mobile-xc 配置页签（settings.plugins.tab）。
 * 命名空间若只注册 schema 而没有页签，可配置 tab 不会渲染任何东西；
 * DSH >= 0.1.7：本模块按 settings.plugins.tab 契约注册页签组件（id = 命名空间）。
 * 文案走宿主 locale 字典（card-locale.ts 的 en/zh，namespace = dsh-mobile-xc），
 * 宿主当前语言为 en 时渲染英文；t 座缺失时回退 en，卡对英语用户恒可读。
 * 全链路形状防御 + try/catch：任何异常不影响插件 entry 加载。
 */

import { resolveSettingsValue, setConfig } from '../config.ts'
import { XC_LOCALE_NS, en, zh, type XcCardLocaleKey } from '../card-locale.ts'

interface Reactish {
  createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown
  useState<T>(init: T | (() => T)): [T, (v: T) => void]
  useEffect(fn: () => unknown, deps: unknown[]): void
  useRef<T>(init: T): { current: T }
}

interface ScopeLike {
  getSnapshot(): unknown
  set(field: string, value: unknown): Promise<unknown> | unknown
  subscribe(listener: () => void): () => void
}

interface SlotsFace {
  inject(name: string, factory: () => unknown): unknown
  register(options: Record<string, unknown>, component: unknown): unknown
}

/** DSH >= 0.1.7：客户端设置服务为 configForms，get(namespace) 直接返回命名空间 scope。 */
interface ConfigFormsFace {
  get(ns: string): ScopeLike
}

/** DSH >= 0.1.7 locale 运行时：register(ns, {en,zh}) 返回 disposer（缺失则卡回退 en）。 */
interface LocaleFace {
  register(ns: string, dicts: Record<string, Record<string, string>>): unknown
}

interface CtxFace {
  slots?: unknown
  configForms?: unknown
  locale?: unknown
  get?(name: string): unknown
  effect(fn: () => unknown, label?: string): unknown
}

const XC_NS = 'dsh-mobile-xc'

/** 字段行：key = 配置字段名；label/hint = 双语字典键（card-locale.ts）。导出供单测校验覆盖。 */
export const FIELDS: Array<{ key: string; label: XcCardLocaleKey; hint: XcCardLocaleKey }> = [
  { key: 'swipeEnabled', label: 'swipeEnabled', hint: 'swipeEnabledHint' },
  { key: 'dshmarketNavFix', label: 'dshmarketNavFix', hint: 'dshmarketNavFixHint' },
  { key: 'pwaEnabled', label: 'pwaEnabled', hint: 'pwaEnabledHint' },
  { key: 'drawerRefresh', label: 'drawerRefresh', hint: 'drawerRefreshHint' },
  { key: 'headerScroll', label: 'headerScroll', hint: 'headerScrollHint' },
  { key: 'turnRail', label: 'turnRail', hint: 'turnRailHint' },
]

const rowClass = 'dsh-xc-srow'
const textClass = 'dsh-xc-srow-text'
const titleClass = 'dsh-xc-srow-title'
const hintClass = 'dsh-xc-srow-hint'
const swClass = 'dsh-xc-switch'

export function installXcPluginCard(ctx: unknown, react: Reactish): void {
  try {
    const face = ctx as CtxFace
    const slots = (face.slots ?? (typeof face.get === 'function' ? face.get('slots') : undefined)) as SlotsFace | undefined
    const scopeFace = (face.configForms ?? (typeof face.get === 'function' ? face.get('configForms') : undefined)) as ConfigFormsFace | undefined
    if (slots === undefined || typeof slots.inject !== 'function') return
    if (scopeFace === undefined || typeof scopeFace.get !== 'function') return
    let scope: ScopeLike | null = null
    try {
      scope = scopeFace.get(XC_NS)
    } catch {
      return
    }
    const s = scope
    if (s === null || typeof s.getSnapshot !== 'function' || typeof s.set !== 'function') return

    const CardComponent = (props?: { view?: string; t?: (key: XcCardLocaleKey) => string }): unknown => {
      // DSH >= 0.1.7 插件页（plugins.bundle.config）以 view='page' 渲染整页表单；
      // 旧宿主/兜底走折叠卡。
      const view = props !== null && props !== undefined ? props.view : undefined
      // 文案座：宿主按当前语言合成 t（locale 字典已注册）；旧宿主无 t 座则回退 en。
      const t: (key: XcCardLocaleKey) => string =
        props !== null && props !== undefined && typeof props.t === 'function' ? props.t : (key) => en[key]
      const [open, setOpen] = react.useState<boolean>(false)
      const page = view === 'page'
      const expanded = page || open
      const read = (): Record<string, boolean> => {
        try {
          const v = resolveSettingsValue(s.getSnapshot())
          return v !== undefined && v !== null && typeof v === 'object' ? (v as Record<string, boolean>) : {}
        } catch {
          return {}
        }
      }
      const [values, setValues] = react.useState<Record<string, boolean>>(read)
      const dirtyRef = react.useRef<boolean>(false)
      react.useEffect(() => {
        let alive = true
        const sync = (): void => {
          if (!alive) return
          try {
            const v = read()
            if (v !== undefined && v !== null && Object.keys(v).length > 0) setValues(v)
          } catch {
            /* 忽略 */
          }
        }
        // 迟到播种：settings 服务可能在 mount 时尚未 publish 完，稍后再取权威值
        sync()
        const timer = window.setTimeout(sync, 400)
        const off =
          typeof s.subscribe === 'function'
            ? s.subscribe(() => {
                // 用户手动改过则保留本地值；未改过才用权威快照纠正（如配置文件已为 true）
                if (!dirtyRef.current) sync()
              })
            : null
        return () => {
          alive = false
          window.clearTimeout(timer)
          if (off !== null) {
            try {
              off()
            } catch {
              /* 忽略 */
            }
          }
        }
      }, [])
      const toggle = (key: string, checked: boolean): void => {
        dirtyRef.current = true
        // 同步写入 localStorage（供 getConfig() 读取）
        try {
          setConfig({ [key]: checked } as Partial<import('../config.ts').XcConfig>)
        } catch {
          /* 忽略 */
        }
        // 本地乐观翻转：立即改变 UI 状态（设置服务写入为异步）
        try {
          setValues({ ...values, [key]: checked })
        } catch {
          /* 忽略 */
        }
        try {
          const pr = s.set(key, checked) as Promise<unknown> | undefined
          if (pr !== undefined && pr !== null && typeof (pr as { then?: unknown }).then === 'function') {
            // 成功：保持乐观值（一致性交由订阅推送）；失败：重读快照回滚
            void (pr as Promise<unknown>).catch(() => {
              try {
                setValues(read())
              } catch {
                /* 忽略 */
              }
            })
          }
          // 同步返回（无 promise）：乐观值即终态
        } catch {
          /* 写入失败忽略 */
        }
      }
      const rows = FIELDS.map((f) => {
        const on = values[f.key] === true
        return react.createElement(
          'label',
          {
            key: f.key,
            className: rowClass,
            'data-xc-row': f.key,
          },
          react.createElement(
            'span',
            { className: textClass },
            react.createElement('span', { className: titleClass }, t(f.label)),
            react.createElement('span', { className: hintClass }, t(f.hint)),
          ),
          react.createElement(
            'span',
            { className: swClass + (on ? ' on' : '') },
            react.createElement('input', {
              type: 'checkbox',
              checked: on,
              onChange: (e: { target: { checked: boolean } }) => toggle(f.key, e.target.checked),
            }),
            react.createElement('span', { className: 'dsh-xc-switch-track' }),
            react.createElement('span', { className: 'dsh-xc-switch-thumb' }),
          ),
        )
      })
      // 官方 PluginCard 卡壳（YyYd_a_* 由 settings-plugins 注入全局可用）
      if (page) {
        // 插件页整页表单：页头已由插件页标题承担，直接渲染字段行（参照 modsearch）。
        return react.createElement(
          'div',
          { 'data-xc-page': true },
          react.createElement('h4', { className: 'dsh-xc-pagesec' }, t('title')),
          react.createElement('div', { className: 'YyYd_a_body' }, ...rows),
        )
      }
      return react.createElement(
        'li',
        { className: 'YyYd_a_card' + (open ? ' YyYd_a_cardOpen' : ''), 'data-xc-card': true },
        react.createElement(
          'button',
          {
            type: 'button',
            className: 'YyYd_a_header',
            'aria-expanded': open ? 'true' : 'false',
            'aria-label': t(open ? 'collapse' : 'expand') + ': ' + t('title'),
            onClick: () => setOpen(!open),
          },
          react.createElement(
            'span',
            { className: 'YyYd_a_headText' },
            react.createElement('span', { className: 'YyYd_a_name' }, t('title')),
            react.createElement('span', { className: 'YyYd_a_description' }, t('description')),
          ),
          react.createElement(
            'svg',
            {
              className: 'YyYd_a_chevron' + (open ? ' YyYd_a_chevronOpen' : ''),
              width: '14',
              height: '14',
              viewBox: '0 0 16 16',
              fill: 'none',
              'aria-hidden': 'true',
            },
            react.createElement('path', { d: 'M3 6L8 11L13 6', stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round' }),
          ),
        ),
        open
          ? react.createElement('div', { className: 'YyYd_a_body' }, ...rows)
          : null,
      )
    }

    face.effect(() => {
      // 行样式（主题 token；随卡生命周期注入/移除）
      const styleTag = document.createElement('style')
      styleTag.dataset.pluginCss = '@dsh-mobile-xc/card'
      styleTag.textContent = [
        '.dsh-xc-srow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--dsw-alias-border-l1,#2a3342);cursor:pointer}',
        '.dsh-xc-srow:first-child{border-top:none}',
        '.dsh-xc-srow-text{display:flex;flex-direction:column;gap:2px;min-width:0;padding-right:8px}',
        '.dsh-xc-srow-title{font-size:13px;line-height:18px;color:var(--dsw-alias-label-primary,#e2e8f0);font-weight:500}',
        '.dsh-xc-srow-hint{font-size:12px;line-height:16px;color:var(--dsw-alias-label-caption,#94a3b8)}',
        '.dsh-xc-switch{position:relative;width:40px;height:24px;flex:none;border-radius:12px;background:var(--dsw-alias-border-l2,#3b4557);transition:background .18s var(--ds-ease-in-out,ease)}',
        '.dsh-xc-switch.on{background:var(--dsw-alias-button-info-fill,#3b82f6)}',
        '.dsh-xc-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer}',
        '.dsh-xc-switch-thumb{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:transform .18s var(--ds-ease-in-out,ease);pointer-events:none}',
        '.dsh-xc-switch.on .dsh-xc-switch-thumb{transform:translateX(16px)}',
        '.dsh-xc-pagesec{margin:0 0 8px;font-size:14px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary,#e2e8f0)}'
      ].join('')
      document.head.appendChild(styleTag)

      // 双语字典（en/zh）注册到宿主 locale 运行时；卡片槽带 locale 座后，
      // 框架按宿主当前语言合成 t。注册失败/无 locale 服务时卡片回退 en 字典。
      let localeDispose: (() => void) | null = null
      try {
        const localeFace = (face.locale ?? (typeof face.get === 'function' ? face.get('locale') : undefined)) as
          | LocaleFace
          | undefined
        if (localeFace !== undefined && typeof localeFace.register === 'function') {
          const r = localeFace.register(XC_LOCALE_NS, { en, zh })
          if (typeof r === 'function') localeDispose = r as unknown as () => void
        }
      } catch {
        /* 忽略：回退 en */
      }

      // DSH >= 0.1.7：第三方插件配置挂到新「插件页」的 plugins.bundle.config
      //（keyed，key=npm 包名；参照 modsearch / 官方 subagent）。settings.plugin.item
      // 与 settings.plugins.tab 均已随 0.1.7 设置系统重构不再适用。
      const remove = slots.inject('plugins.bundle.config', function* () {
        yield slots.register(
          {
            name: 'plugins.bundle.config',
            key: XC_NS,
            locale: XC_LOCALE_NS,
            order: 25,
          },
          CardComponent,
        )
      })
      return () => {
        styleTag.remove()
        if (localeDispose !== null) {
          try {
            localeDispose()
          } catch {
            /* 忽略 */
          }
        }
        if (remove !== undefined && remove !== null && typeof remove === 'function') {
          try {
            ;(remove as () => void)()
          } catch {
            /* 忽略 */
          }
        }
      }
    }, 'dsh-mobile-xc: plugin config card')
  } catch {
    /* 任何异常都不阻断插件加载 */
  }
}