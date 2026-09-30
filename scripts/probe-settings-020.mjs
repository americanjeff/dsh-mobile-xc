#!/usr/bin/env node
/* probe-settings-020 — DSH 0.2.x 设置面板移动端失效取证（只读诊断，不改 DOM） */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL = process.env.DSH_PROBE_URL || 'http://127.0.0.1:3080/'
const SHOT = process.env.DSH_PROBE_SHOT || join(process.cwd(), 'scripts', 'shot-settings-020.png')

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
  "var dlg = document.querySelector(\"[role='dialog'][aria-modal='true']\");" +
  "if(!dlg) return { found:false, anyDialog: document.querySelectorAll(\"[role='dialog']\").length };" +
  "var chain=[];for(var n=dlg;n&&n!==document.documentElement;n=n.parentElement){chain.push(n.tagName.toLowerCase()+(n.id?'#'+n.id:'')+'.'+String(n.className||'').split(' ').filter(Boolean).slice(0,2).join('.'));}" +
  "var pb=dlg.getBoundingClientRect();var pcs=getComputedStyle(dlg);" +
  "var nav=dlg.querySelector(':scope > nav');var content=nav?nav.nextElementSibling:null;" +
  "function box(el){if(!el)return null;var b=el.getBoundingClientRect();var cs=getComputedStyle(el);return {w:Math.round(b.width),h:Math.round(b.height),top:Math.round(b.top),left:Math.round(b.left),display:cs.display,dir:cs.flexDirection,pos:cs.position,ovx:cs.overflowX,ovy:cs.overflowY};}" +
  "return {found:true,parentChain:chain," +
  "insideMobileFrame: !!dlg.closest(\"[data-mobile-nav='frame']\")," +
  "frameScopedPanelHit: !!document.querySelector(\"[data-mobile-nav='frame'] .VOzbGW_panel\")," +
  "unscopedPanelHit: !!document.querySelector('.VOzbGW_panel')," +
  "viewport:{vw:innerWidth,vh:innerHeight,dvh:Math.round(document.documentElement.clientHeight)}," +
  "panel:Object.assign({cls:String(dlg.className||'').slice(0,60)},box(dlg))," +
  "nav:nav?Object.assign({cls:String(nav.className||'').slice(0,40),kids:Array.prototype.map.call(nav.children,function(c){return c.tagName.toLowerCase()+'.'+String(c.className||'').split(' ')[0];})},box(nav)):null," +
  "navList:box(dlg.querySelector('.VOzbGW_navList'))," +
  "navCells:dlg.querySelectorAll('.VOzbGW_navCell').length," +
  "content:content?Object.assign({cls:String(content.className||'').slice(0,40)},box(content)):null," +
  "header:box(dlg.querySelector('.VOzbGW_header'))," +
  "actions:(function(){var a=dlg.querySelector('.VOzbGW_actions');return a?Object.assign({text:(a.textContent||'').trim().slice(0,50)},box(a)):null;})()," +
  "close:(function(){var c=dlg.querySelector('.VOzbGW_close');if(!c)return null;return {parentCls:String(c.parentElement&&c.parentElement.className||'').slice(0,40),inNav:!!c.closest('nav'),rect:(function(){var b=c.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height),top:Math.round(b.top),left:Math.round(b.left)};})()};})()," +
  "overlay:(function(){var o=dlg.parentElement;if(!o)return null;var cs=getComputedStyle(o);return {cls:String(o.className||'').slice(0,40),role:o.getAttribute('role'),pos:cs.position,z:cs.zIndex,parent:o.parentElement?o.parentElement.tagName.toLowerCase():null};})()," +
  "openConfigBtn:(function(){var bs=document.querySelectorAll(\"[role='dialog'][aria-modal='true'] button\");for(var i=0;i<bs.length;i++){var t=(bs[i].textContent||'').trim();if(t==='打开配置文件'||t==='Open configuration file')return {found:true,display:getComputedStyle(bs[i]).display};}return {found:false};})()" +
  "};})()"

async function main() {
  const browser = findBrowser()
  const port = 8600 + Math.floor(Math.random() * 80)
  const ud = mkdtempSync(join(tmpdir(), 'dsh-xc-s020-'))
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
    const logs = []
    ws.onmessage = e0 => {
      const m = JSON.parse(e0.data)
      if (m.id !== undefined) { const f = pend.get(m.id); pend.delete(m.id); if (f) f(m); return }
      if (m.method === 'Runtime.consoleAPICalled') {
        const txt = (m.params.args || []).map(a => (a.value !== undefined ? a.value : (a.description || ''))).join(' ')
        logs.push(m.params.type + ': ' + String(txt).slice(0, 900))
      }
      if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + String((m.params.exceptionDetails && m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || '').slice(0, 400))
    }
    const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, m => m.error ? rej(new Error(method + ' ' + JSON.stringify(m.error))) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params: params || {} })) })
    const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return '__EXC__: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''); return r.result && r.result.value }
    await send('Runtime.enable'); await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    await send('Page.navigate', { url: URL })
    for (let i = 0; i < 100; i++) { if (await ev("!!document.querySelector('[data-shell-overlay]')")) break; await sleep(400) }
    console.log('shell ready:', await ev("!!document.querySelector('[data-shell-overlay]')"))
    console.log('html attrs:', await ev("Array.prototype.map.call(document.documentElement.attributes,function(a){return a.name+'='+a.value;}).join(' ')"))
    console.log('frame mark:', await ev("!!document.querySelector(\"[data-mobile-nav='frame']\")"))
    console.log('plugin styles injected:', await ev("Array.prototype.filter.call(document.querySelectorAll('style[data-plugin]'),function(s){return /mobile-xc/.test(s.getAttribute('data-plugin')||'');}).length"))

    await ev("var h=document.querySelector(\"[data-mobile-nav='ham']\"); if(h) h.click(); 'clicked'")
    await sleep(800)
    const opened = await ev("(function(){var d=document.querySelector(\"[data-mobile-nav='drawer']\");if(!d)return 'no-drawer';var bs=d.querySelectorAll('button');var hit=null;for(var i=0;i<bs.length;i++){if(/VOzbGW_trigger/.test(bs[i].className||'')){hit=bs[i];break;}}if(!hit){for(var j=0;j<bs.length;j++){var t=(bs[j].textContent||'').trim();if(t==='设置'||t==='Settings'){hit=bs[j];break;}}}if(!hit)return 'no-trigger; buttons='+Array.prototype.map.call(bs,function(b){return (b.textContent||'').trim();}).filter(Boolean).slice(0,14).join('/');hit.click();return 'clicked:'+String(hit.className||'').slice(0,50);})()")
    console.log('trigger:', opened)
    await sleep(1500)

    const info = await ev(DUMP)
    console.log('=== dialog info ===')
    console.log(JSON.stringify(info, null, 1))

    const shot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(SHOT, Buffer.from(shot.data, 'base64'))
    console.log('screenshot:', SHOT)

    console.log('=== canary / plugin logs ===')
    const rel = logs.filter(l => /canary|mobile-xc|selector|VOzbGW/i.test(l))
    console.log(rel.length ? rel.join('\n---\n') : '(none)')
    console.log('=== all logs tail ===')
    console.log(logs.slice(-10).join('\n'))
  } finally {
    try { if (ws) ws.close() } catch (e) { /* noop */ }
    try { child.kill() } catch (e) { /* noop */ }
  }
}
main().catch(e => { console.error('PROBE FAIL', e); process.exit(1) })
