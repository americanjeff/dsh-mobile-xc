/**
 * card-locale — 设置卡双语渲染测试（纯单元，无浏览器/宿主依赖）。
 *
 * 覆盖「配置了某 locale 时卡显示的是该 locale 的文案」：
 *  - 字典完整性：en/zh 键集一致、无空值、确为两套措辞；
 *  - 字段行覆盖：每个配置字段的 label/hint 键在两套字典中都存在；
 *  - 槽接线：槽注册的 locale 选项 === 字典注册的命名空间，字典原样为 {en,zh}；
 *  - 渲染：以 zh t 座渲染 → 全部 zh 文案在场、无 en 泄漏（en 反之）；
 *  - 回退：宿主无 t 座（旧宿主）→ 恒显 en。
 *
 * 宿主面（slots/configForms/locale/effect）与 react 均以最小桩模拟，
 * 与 plugin-card.ts 的形状防御契约一一对应。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installXcPluginCard, FIELDS } from '../src/client/effects/plugin-card.ts'
import { en, zh, XC_LOCALE_NS, type XcCardLocaleDict, type XcCardLocaleKey } from '../src/client/card-locale.ts'

// ---------- 字典完整性 ----------

test('字典：en/zh 键集完全一致且无空值', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  for (const k of Object.keys(en) as XcCardLocaleKey[]) {
    assert.ok(en[k].trim(), `en.${String(k)} 为空`)
    assert.ok(zh[k].trim(), `zh.${String(k)} 为空`)
  }
})

test('字典：en 与 zh 是两套措辞（非同一串复制）', () => {
  assert.notDeepEqual(en, zh)
})

test('字段行：label/hint 键两套字典齐备，字段名不重复', () => {
  const seen = new Set<string>()
  for (const f of FIELDS) {
    assert.ok(!seen.has(f.key), `字段 ${f.key} 重复`)
    seen.add(f.key)
    assert.ok(f.label in en && f.hint in en, `en 缺 ${f.key} 的文案键（${f.label}/${f.hint}）`)
    assert.ok(f.label in zh && f.hint in zh, `zh 缺 ${f.key} 的文案键（${f.label}/${f.hint}）`)
  }
})

// ---------- 渲染桩（最小宿主 + 最小 react） ----------

interface ElementNode {
  type: unknown
  props: Record<string, unknown>
  children: unknown[]
}

const reactFake = {
  createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): ElementNode {
    const flat = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false)
    return { type, props: props ?? {}, children: flat }
  },
  useState<T>(init: T | (() => T)): [T, (v: T) => void] {
    let v = typeof init === 'function' ? (init as () => T)() : init
    return [v, (nv: T) => void (v = nv)]
  },
  useEffect(): void {},
  useRef<T>(init: T): { current: T } {
    return { current: init }
  },
}

function extractText(node: unknown): string[] {
  if (node === null || node === undefined) return []
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(extractText)
  const el = node as ElementNode
  if (el.type !== undefined) return extractText(el.children)
  return []
}

function extractProps(node: unknown, attr: string): string[] {
  const out: string[] = []
  const walk = (n: unknown): void => {
    if (n === null || n === undefined || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const c of n) walk(c)
      return
    }
    const el = n as ElementNode
    if (el.type !== undefined) {
      const v = el.props?.[attr]
      if (typeof v === 'string') out.push(v)
      walk(el.children)
    }
  }
  walk(node)
  return out
}

/** 以最小宿主桩安装卡，返回渲染元素 + 槽注册选项 + 字典注册记录。 */
function mountCard(view?: string, t?: (k: XcCardLocaleKey) => string): {
  element: unknown
  slotOptions: Record<string, unknown>
  localeReg: { ns: string; dicts: unknown } | null
} {
  const styleStub = { dataset: {} as Record<string, string>, textContent: '', remove(): void {} }
  ;(globalThis as { document?: unknown }).document = {
    createElement: () => styleStub,
    head: { appendChild(): void {} },
  }
  let registered: { options: Record<string, unknown>; component: (props?: unknown) => unknown } | null = null
  const registerSlot = (options: Record<string, unknown>, component: unknown): () => void => {
    registered = { options, component: component as (props?: unknown) => unknown }
    return () => {}
  }
  let localeReg: { ns: string; dicts: unknown } | null = null
  const slots = {
    inject(_name: string, cb: () => unknown): unknown {
      const r = cb()
      if (r !== null && typeof r === 'object' && Symbol.iterator in (r as object)) {
        const disposers: unknown[] = []
        for (const d of r as Iterable<unknown>) disposers.push(d)
        return () => {
          for (const d of disposers) if (typeof d === 'function') (d as () => void)()
        }
      }
      return r
    },
    register: registerSlot,
  }
  const scope = {
    getSnapshot: () => ({
      status: 'ready',
      value: {
        swipeEnabled: true,
        dshmarketNavFix: true,
        pwaEnabled: true,
        drawerRefresh: false,
        headerScroll: true,
        turnRail: true,
      },
    }),
    subscribe: () => () => {},
    set: () => Promise.resolve(true),
  }
  const configForms = { get: () => scope }
  const locale = {
    register(ns: string, dicts: unknown): () => void {
      localeReg = { ns, dicts }
      return () => {}
    },
  }
  const ctx = {
    slots,
    configForms,
    locale,
    get(name: string): unknown {
      return name === 'slots' ? slots : name === 'configForms' ? configForms : locale
    },
    effect(fn: () => unknown, _label?: string): unknown {
      return fn()
    },
  }
  installXcPluginCard(ctx, reactFake)
  // 经函数读取：绕开 TS 对「仅在回调内赋值的 let」的 null 流收窄
  const takeReg = (): { options: Record<string, unknown>; component: (props?: unknown) => unknown } | null => registered
  const reg = takeReg()
  assert.ok(reg !== null, '卡未注册到 plugins.bundle.config 槽')
  const props: Record<string, unknown> = {}
  if (view !== undefined) props.view = view
  if (t !== undefined) props.t = t
  return { element: reg.component(props), slotOptions: reg.options, localeReg }
}

/** 页视图实际渲染的文案值（页头 + 全部字段行；折叠卡的 description/expand 不在此视图）。 */
function pageTexts(d: XcCardLocaleDict): string[] {
  const keys: XcCardLocaleKey[] = ['title', ...FIELDS.flatMap((f) => [f.label, f.hint])]
  return keys.map((k) => d[k])
}

// ---------- 槽接线 ----------

test('接线：槽 locale 选项 === 字典注册命名空间，字典原样 {en,zh}', () => {
  const { slotOptions, localeReg } = mountCard('page', (k) => en[k])
  assert.equal(localeReg?.ns, XC_LOCALE_NS)
  assert.equal(slotOptions.locale, XC_LOCALE_NS)
  assert.deepEqual(localeReg?.dicts, { en, zh })
})

// ---------- 按 locale 渲染 ----------

test('页视图 + zh t 座：zh 文案全在场，en 零泄漏', () => {
  const { element } = mountCard('page', (k) => zh[k])
  const text = extractText(element).join('\n')
  for (const v of pageTexts(zh)) assert.ok(text.includes(v), `zh 文案未渲染：${v}`)
  for (const v of pageTexts(en)) assert.ok(!text.includes(v), `en 文案泄漏：${v}`)
})

test('页视图 + en t 座：en 文案全在场，zh 零泄漏', () => {
  const { element } = mountCard('page', (k) => en[k])
  const text = extractText(element).join('\n')
  for (const v of pageTexts(en)) assert.ok(text.includes(v), `en 文案未渲染：${v}`)
  for (const v of pageTexts(zh)) assert.ok(!text.includes(v), `zh 文案泄漏：${v}`)
})

test('页视图无 t 座（旧宿主）：回退 en，无 zh 泄漏', () => {
  const { element } = mountCard('page')
  const text = extractText(element).join('\n')
  for (const v of pageTexts(en)) assert.ok(text.includes(v), `回退 en 文案未渲染：${v}`)
  for (const v of pageTexts(zh)) assert.ok(!text.includes(v), `回退态 zh 文案泄漏：${v}`)
})

test('折叠卡 + zh t 座：名称/描述/aria-label 均为 zh', () => {
  const { element } = mountCard(undefined, (k) => zh[k])
  const text = extractText(element).join('\n')
  assert.ok(text.includes(zh.title), '折叠卡名称未用 zh')
  assert.ok(text.includes(zh.description), '折叠卡描述未用 zh')
  const aria = extractProps(element, 'aria-label').join('\n')
  assert.ok(aria.includes(zh.expand) && aria.includes(zh.title), `aria-label 未用 zh：${aria}`)
  for (const v of [en.title, en.description]) assert.ok(!text.includes(v), `en 文案泄漏：${v}`)
})

// ---------- 行状态接线（桩保真度） ----------

test('行开关状态跟随设置快照（drawerRefresh 默认关）', () => {
  const { element } = mountCard('page', (k) => en[k])
  const states = new Map<string, boolean>()
  const walk = (n: unknown): void => {
    if (n === null || n === undefined || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const c of n) walk(c)
      return
    }
    const el = n as ElementNode
    if (el.type === 'label' && typeof el.props['data-xc-row'] === 'string') {
      let checked: boolean | undefined
      const findInput = (x: unknown): void => {
        if (x === null || x === undefined || typeof x !== 'object') return
        if (Array.isArray(x)) {
          for (const c of x) findInput(c)
          return
        }
        const e2 = x as ElementNode
        if (e2.type === 'input' && e2.props.type === 'checkbox') checked = e2.props.checked as boolean
        else if (e2.type !== undefined) findInput(e2.children)
      }
      findInput(el.children)
      states.set(el.props['data-xc-row'] as string, checked === true)
    } else if (el.type !== undefined) walk(el.children)
  }
  walk(element)
  assert.deepEqual(
    [...states.entries()].sort(),
    [
      ['drawerRefresh', false],
      ['dshmarketNavFix', true],
      ['headerScroll', true],
      ['pwaEnabled', true],
      ['swipeEnabled', true],
      ['turnRail', true],
    ],
  )
})
