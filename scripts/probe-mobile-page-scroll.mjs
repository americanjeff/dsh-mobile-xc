#!/usr/bin/env node
/**
 * probe-mobile-page-scroll — 移动端「整页可滚 / 输入框被顶出折叠线」回归门禁（v0.6.8 起）。
 *
 * 为什么需要它：该缺陷只在 `env(safe-area-inset-top) > 0` 的真机（刘海/挖孔机型）出现，
 * CDP 的设备模拟器里 env() 恒为 0，常规几何探针永远测不到。故本探针注入
 * `padding-top:59px`（iPhone 竖屏典型值）来模拟安全区，断言：
 *   1. `[data-mobile-nav="frame"]` 必须 border-box，帧高恒等于视口高（不得被 padding 撑高）；
 *   2. 文档（scrollingElement）不可纵向滚动 —— 修复前这里会多出 inset 高度的滚动量，
 *      真机上表现为「页面可以一直往上滚，像无穷长」；
 *   3. 会话 active 态下 composer 底边贴视口底（修复前会被顶到视口下方 inset 高度）；
 *   4. 抽屉开合、汉堡 44px、桌面零影响。
 *
 * 用法：node scripts/probe-mobile-page-scroll.mjs --url='http://127.0.0.1:3080/?token=...'
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const URL_ = process.argv.find((a) => a.startsWith('--url='))?.split('=').slice(1).join('=') ?? 'http://127.0.0.1:3080/'
const GEO = "(() => {\n  const doc = document.scrollingElement\n  const frame = document.querySelector('[data-mobile-nav=\"frame\"]')\n  const seat = document.querySelector('.wSkVaW_composerSeat')\n  const card = document.querySelector('.uV2eYG_card')\n  const ham = document.querySelector('[data-mobile-nav=\"ham\"]')\n  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) } }\n  const cs = frame ? getComputedStyle(frame) : null\n  const root = document.querySelector('.wSkVaW_root')\n  return {\n    innerH: innerHeight,\n    docSH: doc.scrollHeight, docCH: doc.clientHeight, pageScroll: doc.scrollHeight - doc.clientHeight,\n    frameBox: cs ? cs.boxSizing : null, framePad: cs ? cs.paddingTop : null, frame: R(frame),\n    phase: root ? root.getAttribute('data-phase') : null,\n    seat: R(seat), card: R(card), ham: R(ham),\n  }\n})()"
const DRAWER = "(() => {\n  const frame = document.querySelector('[data-mobile-nav=\"frame\"]')\n  const ham = document.querySelector('[data-mobile-nav=\"ham\"]')\n  ham && ham.click()\n  return new Promise((res) => setTimeout(() => {\n    const d = document.querySelector('[data-mobile-nav=\"drawer\"]')\n    const opened = frame && !frame.hasAttribute('data-sidebar-collapsed') && d && getComputedStyle(d).transform === 'none'\n    const scrim = document.querySelector('[data-mobile-nav=\"scrim\"]')\n    const scrimShown = scrim && getComputedStyle(scrim).display === 'block'\n    scrim && scrim.click()\n    setTimeout(() => res({ opened, scrimShown, closed: frame.hasAttribute('data-sidebar-collapsed') }), 500)\n  }, 500))\n})()"
const PICK = "(() => {\n  const ham = document.querySelector('[data-mobile-nav=\"ham\"]')\n  if (ham && ham.getBoundingClientRect().width > 0) ham.click()\n  let tries = 0\n  return new Promise((res) => {\n    const tick = () => {\n      tries += 1\n      const rs = [...document.querySelectorAll('[data-mobile-nav=\"drawer\"] [role=\"treeitem\"]')]\n      const leaf = rs.find((r) => !r.hasAttribute('aria-expanded') && r.textContent.trim() !== '新会话')\n      if (leaf) { leaf.click(); return res('opened@' + tries) }\n      if (tries > 30) return res('no-leaf')\n      setTimeout(tick, 300)\n    }\n    tick()\n  })\n})()"
const OVERFLOW = "(() => { const h = getComputedStyle(document.documentElement); const b = getComputedStyle(document.body); return { html: h.overflowY, body: b.overflowY } })()"
// 真机上第三方浮层（better-sidebar [data-dsh-panel-host]）会把文档可滚动区撑到视口之外，
// 这里注入一个等价的"视口下方 400px 溢出物"，断言文档仍然不可滚（v0.6.8 文档级禁滚的兜底价值）
const OFFEND_ADD = "(() => { const d = document.createElement('div'); d.id='__xo'; d.style.cssText = 'position:absolute;top:' + (innerHeight + 200) + 'px;left:0;width:1px;height:400px'; document.body.appendChild(d); return document.scrollingElement.scrollHeight })()"
const OFFEND_DEL = "(() => { const d = document.getElementById('__xo'); if (d) d.remove(); return Math.round(window.scrollY) })()"
// 键盘收窄的 CSS 契约：effects/keyboard.ts 写 --dsh-xc-frame-h，帧高即跟随，composer 贴其上沿
const KB_SIM = "(() => { const root = document.documentElement; root.style.setProperty('--dsh-xc-frame-h', '457px'); const f = document.querySelector('[data-mobile-nav=\"frame\"]'); const s = document.querySelector('.wSkVaW_composerSeat'); const r = { frameH: Math.round(f.getBoundingClientRect().height), seatBottom: s ? Math.round(s.getBoundingClientRect().bottom) : -1 }; root.style.removeProperty('--dsh-xc-frame-h'); return r })()"
const KB_PAD = "(() => { const root = document.documentElement; root.dataset.xcKb = '1'; const el = document.querySelector('[data-mobile-nav=\"frame\"] .uV2eYG_root'); const pb = el ? getComputedStyle(el).paddingBottom : null; delete root.dataset.xcKb; return pb })()"
const PALETTE_BG = "(() => { const vp = document.querySelector('[role=\"listbox\"]'); if (!vp) return { open: false }; const bg = getComputedStyle(vp).backgroundColor; const a = bg.slice(bg.indexOf('(') + 1, bg.lastIndexOf(')')).split(',').map(parseFloat); return { open: true, bg: bg, alpha: a.length === 4 ? a[3] : 1 } })()"
const KB_OFF = "(() => ({ hasVar: document.documentElement.style.getPropertyValue('--dsh-xc-frame-h'), frameH: Math.round(document.querySelector('[data-mobile-nav=\"frame\"]').getBoundingClientRect().height) }))()"
const findBrowser = () => {
  const c = [process.env.DSH_PROBE_CHROME, 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean)
  for (const x of c) if (existsSync(x)) return x
  throw new Error('no browser')
}
const main = async () => {
  const port = 9500 + Math.floor(Math.random() * 400)
  const child = spawn(findBrowser(), ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + port, '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'xcp-')), 'about:blank'], { stdio: 'ignore' })
  let ws = null
  const out = []
  const check = (label, ok, detail) => { out.push({ label, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : '')) }
  try {
    const t0 = Date.now()
    for (;;) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) break } catch (e) {} if (Date.now() - t0 > 15000) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 200)) }
    const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
    ws = new WebSocket(pages.find((t) => t.type === 'page').webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')) })
    let id = 0
    const pending = new Map()
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id !== undefined) { const f = pending.get(m.id); if (f) { pending.delete(m.id); f(m) } } }
    const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(method + ' ' + JSON.stringify(m.error))) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })) })
    const touch = async (x, y) => {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      await new Promise((r) => setTimeout(r, 60))
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await new Promise((r) => setTimeout(r, 700))
    }
    const point = (sel) => ev('(() => { const e = document.querySelector(' + JSON.stringify(sel) + '); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] })()')
    const activeStr = () => ev('(() => { const a = document.activeElement; return a ? a.tagName + "|" + (a.className || "").toString().slice(0, 18) : "" })()')
    const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value }
    await send('Runtime.enable'); await send('Page.enable')

    // ---- mobile 390x844 ----
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    // 真机安全区用 CDP 真实注入 env(safe-area-inset-*)，比往元素上注 padding 更接近 iPhone 实况
    // （Edge/Chrome 130+ 支持；不支持时降级为注入 padding 的老做法）
    let safeArea = true
    try {
      await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } })
    } catch {
      safeArea = false
      await ev("(() => { const st = document.createElement('style'); st.textContent = '@media (max-width:1023px){[data-mobile-nav=\"frame\"]{padding-top:59px !important}}'; document.head.appendChild(st); return 1 })()")
    }
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
    await send('Page.navigate', { url: URL_ })
    for (let i = 0; i < 60; i++) { if (await ev('!!document.querySelector("[data-shell-overlay]")')) break; await new Promise((r) => setTimeout(r, 300)) }
    await new Promise((r) => setTimeout(r, 2500))

    let g = await ev(GEO)
    const envTop = await ev("(() => { const d = document.createElement('div'); d.style.paddingTop = 'env(safe-area-inset-top, 0px)'; document.body.appendChild(d); const v = getComputedStyle(d).paddingTop; d.remove(); return v })()")
    check('真机安全区 env(safe-area-inset-top)=59px 已生效', !safeArea || envTop === '59px', String(envTop))
    check('hero: frame 为 border-box', g.frameBox === 'border-box', String(g.frameBox))
    check('hero: 安全区 59px 下文档不可滚动', g.pageScroll === 0, 'docSH=' + g.docSH + ' docCH=' + g.docCH)
    check('hero: 帧高仍等于视口', g.frame.h === g.innerH, 'frame=' + g.frame.h + ' vp=' + g.innerH)
    const ov = await ev(OVERFLOW)
    check('html/body 已禁滚（overflow:hidden）', ov && ov.html === 'hidden' && ov.body === 'hidden', JSON.stringify(ov))
    // 用真实触摸手势（CDP synthesizeScrollGesture）验证，而不是 scrollTo——
    // overflow:hidden 仍允许脚本 scrollTo，只有用户手势才是真机行为
    const offSH = await ev(OFFEND_ADD)
    await send('Input.synthesizeScrollGesture', { x: 195, y: 560, yDistance: -500, gestureSourceType: 'touch', speed: 1200 })
    await new Promise((r) => setTimeout(r, 400))
    const sy = await ev(OFFEND_DEL)
    check('注入视口外溢出物 + 触摸上滑，页面不滚', sy === 0, 'scrollY=' + sy + ' docSH=' + offSH)

    const dr = await ev(DRAWER)
    check('抽屉可开（transform:none + 遮罩可见）', !!(dr && dr.opened && dr.scrimShown), JSON.stringify(dr))
    check('遮罩点击可关', !!(dr && dr.closed), JSON.stringify(dr))

    console.log('click:', await ev(PICK))
    await new Promise((r) => setTimeout(r, 6000))
    g = await ev(GEO)
    check('active: 文档不可滚动（无"无穷长页面"）', g.pageScroll === 0, 'docSH=' + g.docSH + ' docCH=' + g.docCH)
    check('active: 输入框底部贴视口底（不被顶出折叠线）', g.seat !== null && g.seat.bottom <= g.innerH + 1 && g.seat.bottom >= g.innerH - 2, JSON.stringify(g.seat) + ' vp=' + g.innerH)
    check('active: 汉堡 44px 且可见', g.ham !== null && g.ham.w >= 44 && g.ham.h >= 44, JSON.stringify(g.ham))
    // 用户实测场景：会话滑到尽头后继续上滑（滚动链会传给文档）——页面必须纹丝不动
    await ev("(() => { const sb = document.querySelector('.wSkVaW_scrollBody'); if (sb) sb.scrollTop = sb.scrollHeight; return 1 })()")
    const sbTop0 = await ev("(() => { const sb = document.querySelector('.wSkVaW_scrollBody'); return sb ? Math.round(sb.scrollTop) : -1 })()")
    await send('Input.synthesizeScrollGesture', { x: 195, y: 300, yDistance: -600, gestureSourceType: 'touch', speed: 1400 })
    await new Promise((r) => setTimeout(r, 400))
    const chain = await ev('({ sy: Math.round(window.scrollY), sb: (() => { const e = document.querySelector(".wSkVaW_scrollBody"); return e ? Math.round(e.scrollTop) : -1 })() })')
    check('active: 会话滑到尽头再上滑，页面不跟着走', chain.sy === 0, 'scrollY=' + chain.sy + ' sbTop=' + sbTop0 + '->' + chain.sb)
    // 键盘适配：帧高必须跟随 --dsh-xc-frame-h（可变高 = visualViewport 可视底边），composer 贴其上沿
    const kbOff = await ev(KB_OFF)
    check('无键盘时帧高不受 --dsh-xc-frame-h 影响', kbOff && kbOff.hasVar === '' && kbOff.frameH === g.innerH, JSON.stringify(kbOff))
    const padOff = await ev("(() => { const el = document.querySelector('[data-mobile-nav=\"frame\"] .uV2eYG_root'); return el ? getComputedStyle(el).paddingBottom : null })()")
    const padOn = await ev(KB_PAD)
    check('键盘在场时底部安全区内边距被去掉（42px -> 8px）', !safeArea || (padOff === '42px' && padOn === '8px'), 'off=' + padOff + ' on=' + padOn)
    // 加号菜单：真实触摸点开——面板要开、表面不透明、且绝不能抢焦点（真机上就是"弹输入法"）
    const f0 = await activeStr()
    const plusPt = await point('[data-slot="conversation.composer.bar"] button[aria-label*="添加文件"]')
    if (plusPt) await touch(plusPt[0], plusPt[1])
    const palBg = await ev(PALETTE_BG)
    const f1 = await activeStr()
    check('加载后 composer 不被自动聚焦（键盘不弹）', f0.indexOf('uV2eYG_input') < 0, 'active=' + f0)
    check('点加号：面板打开且不抢焦点', !!(palBg && palBg.open) && f1.indexOf('uV2eYG_input') < 0, 'open=' + (palBg && palBg.open) + ' active=' + f1)
    check('加号指令面板表面不透明（不再透出对话）', !!(palBg && palBg.alpha === 1), JSON.stringify(palBg).slice(0, 120))
    const palShot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync('D:/workspace/dsh-mobile-xc/scripts/shot-mobile-palette.png', Buffer.from(palShot.data, 'base64'))
    const inputPt = await point('[class*="uV2eYG_input"]')
    if (inputPt) await touch(inputPt[0], inputPt[1])
    const f2 = await activeStr()
    check('点输入框仍能聚焦（没把打字废掉）', f2.indexOf('uV2eYG_input') >= 0, 'active=' + f2)
    await ev("(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); return 1 })()")
    const kbOn = await ev(KB_SIM)
    check('键盘收窄：帧高跟随变量且 composer 贴键盘上沿', kbOn && kbOn.frameH === 457 && Math.abs(kbOn.seatBottom - 457) <= 2, JSON.stringify(kbOn))
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync('D:/workspace/dsh-mobile-xc/scripts/shot-mobile-page-scroll.png', Buffer.from(shot.data, 'base64'))

    // ---- desktop 1440x900 ----
    await send('Emulation.clearDeviceMetricsOverride')
    try { await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0 } }) } catch {}
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: URL_ })
    for (let i = 0; i < 60; i++) { if (await ev('!!document.querySelector("[data-shell-overlay]")')) break; await new Promise((r) => setTimeout(r, 300)) }
    await new Promise((r) => setTimeout(r, 2500))
    g = await ev(GEO)
    check('desktop: 无 data-mobile-nav 标记（零影响）', await ev('document.querySelectorAll("[data-mobile-nav]").length === 0'), '')
    check('desktop: 文档不可滚动', g.pageScroll === 0, 'docSH=' + g.docSH + ' docCH=' + g.docCH)
  } finally {
    try { ws?.close() } catch (e) {}
    child.kill()
    const failed = out.filter((r) => !r.ok)
    console.log('\n[verify] ' + (out.length - failed.length) + '/' + out.length + ' 通过')
    process.exit(failed.length ? 1 : 0)
  }
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })