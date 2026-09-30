#!/usr/bin/env node
/* probe-settings-020-fix — 验证重锚定后的设置 CSS（注入候选规则后量几何 + 截图） */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL = process.env.DSH_PROBE_URL || 'http://127.0.0.1:3080/'
const SHOT = process.env.DSH_PROBE_SHOT || join(process.cwd(), 'scripts', 'shot-settings-020-fix.png')
const FIX_CSS = process.env.DSH_FIX_CSS || ''

function findBrowser() {
  const c = [process.env.DSH_PROBE_CHROME,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean)
  for (const x of c) if (existsSync(x)) return x
  throw new Error('no browser')
}
async function waitPort(port, ms) {
  const t0 = Date.now()
  for (;;) {
    try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) return } catch (e) { /* retry */ }
    if (Date.now() - t0 > ms) throw new Error('browser timeout')
    await new Promise(x => setTimeout(x, 200))
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

const DUMP = "(function(){" +
  "var dlg = document.querySelector(\".VOzbGW_panel\");" +
  "if(!dlg) return { found:false };" +
  "function box(el){if(!el)return null;var b=el.getBoundingClientRect();var cs=getComputedStyle(el);return {w:Math.round(b.width),h:Math.round(b.height),top:Math.round(b.top),left:Math.round(b.left),dir:cs.flexDirection,ovx:cs.overflowX,ovy:cs.overflowY};}" +
  "var nav=dlg.querySelector(':scope > nav');var content=nav?nav.nextElementSibling:null;" +
  "var list=dlg.querySelector('.VOzbGW_navList');" +
  "return {found:true,panel:box(dlg),nav:box(nav),navList:box(list),content:box(content),options:box(dlg.querySelector('.VOzbGW_options'))," +
  "navKids:nav?Array.prototype.map.call(nav.children,function(c){return c.tagName.toLowerCase()+'.'+String(c.className||'').split(' ')[0]+'@'+Math.round(c.getBoundingClientRect().width)+'x'+Math.round(c.getBoundingClientRect().height);}):[]," +
  "cellOverflow:list?(list.scrollWidth>list.clientWidth?('scrollW'+list.scrollWidth+'>clientW'+list.clientWidth):'fits'):null," +
  "optionsScroll:(function(){var o=dlg.querySelector('.VOzbGW_options');return o?(o.scrollHeight>o.clientHeight?('scrollH'+o.scrollHeight+'>clientH'+o.clientHeight):'fits'):null;})()," +
  "closeInNav:!!(dlg.querySelector('.VOzbGW_close')&&dlg.querySelector('.VOzbGW_close').closest('nav'))," +
  "headerDisplay:(function(){var h=dlg.querySelector('.VOzbGW_header');return h?getComputedStyle(h).display:null;})()" +
  "};})()"

async function main() {
  const browser = findBrowser()
  const port = 8700 + Math.floor(Math.random() * 80)
  const ud = mkdtempSync(join(tmpdir(), 'dsh-xc-s020f-'))
  const child = spawn(browser, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--no-first-run', '--remote-debugging-port=' + port, '--user-data-dir=' + ud, 'about:blank'], { stdio: 'ignore' })
  let ws = null
  try {
    await waitPort(port, 20000)
    const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
    ws = new WebSocket(pages.find(t => t.type === 'page').webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')) })
    let id = 0
    const pend = new Map()
    ws.onmessage = e0 => { const m = JSON.parse(e0.data); if (m.id !== undefined) { const f = pend.get(m.id); pend.delete(m.id); if (f) f(m) } }
    const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, m => m.error ? rej(new Error(method + ' ' + JSON.stringify(m.error))) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params: params || {} })) })
    const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return '__EXC__: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''); return r.result && r.result.value }
    await send('Runtime.enable'); await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    await send('Page.navigate', { url: URL })
    for (let i = 0; i < 100; i++) { if (await ev("!!document.querySelector('[data-shell-overlay]')")) break; await sleep(400) }
    await ev("var h=document.querySelector(\"[data-mobile-nav='ham']\"); if(h) h.click(); 'ok'")
    await sleep(800)
    console.log('trigger:', await ev("(function(){var d=document.querySelector(\"[data-mobile-nav='drawer']\");if(!d)return 'no-drawer';var bs=d.querySelectorAll('button');for(var i=0;i<bs.length;i++){if(/VOzbGW_trigger/.test(bs[i].className||'')){bs[i].click();return 'clicked';}}return 'no-trigger';})()"))
    await sleep(1200)
    console.log('=== BEFORE injection ===')
    console.log(JSON.stringify(await ev(DUMP), null, 1))
    if (FIX_CSS) {
      const inj = "(function(){var s=document.createElement('style');s.id='xc-fix-probe';s.textContent=" + JSON.stringify(FIX_CSS) + ";document.head.appendChild(s);return s.textContent.length;})()"
      console.log('injected css chars:', await ev(inj))
      await sleep(400)
      console.log('=== AFTER injection ===')
      console.log(JSON.stringify(await ev(DUMP), null, 1))
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(SHOT, Buffer.from(shot.data, 'base64'))
    console.log('screenshot:', SHOT)
  } finally {
    try { if (ws) ws.close() } catch (e) { /* noop */ }
    try { child.kill() } catch (e) { /* noop */ }
  }
}
main().catch(e => { console.error('PROBE FAIL', e); process.exit(1) })
