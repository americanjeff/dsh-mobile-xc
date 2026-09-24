/**
 * package-metadata — 插件管理器展示文案测试（package.json + locale/*.json）。
 *
 * 宿主（dsh >= 0.1.7）readPluginMeta 的约定：
 *  - 存在 locale/en.json 时读全部 locale/<语言>.json，meta.description 合成 {en,zh} 映射，
 *    客户端 resolveText 按浏览器 locale 取对应译文（插件列表与详情页头部共用此路径）；
 *  - 无 locale 目录（旧宿主）时回退 package.json 的 description 纯字符串。
 * 因此本测试固定：
 *  - package.json description 为英文（英文用户直读，npm 页同源）；
 *  - en.json 与 package.json 的 description 完全一致（两处不漂移）；
 *  - zh.json 保留中文原文；
 *  - 文件名是合法语言 id、各文件 meta 键集一致（宿主静默忽略未知键，防拼写错误）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))

/** 宿主 dsh-app-boot 的 LANGUAGE_ID 正则（locale 文件名即语言 id）。 */
const LANGUAGE_ID = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/

interface MetaFile {
  meta?: { title?: unknown; description?: unknown }
}

function readJson(rel: string): unknown {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'))
}

const manifest = readJson('package.json') as { description?: string; files?: string[] }
const localeDir = 'locale'

test('package.json description：英文且非空', () => {
  assert.ok(typeof manifest.description === 'string' && manifest.description.trim() !== '', 'description 缺失')
  assert.ok(!CJK.test(manifest.description), `description 含 CJK：${manifest.description}`)
})

test('package.json files 含 locale 目录（npm 发布必须带上译文）', () => {
  assert.ok(Array.isArray(manifest.files) && manifest.files.includes(localeDir), 'files 未包含 locale/')
})

test('en.json description 与 package.json 完全一致', () => {
  const en = readJson(`${localeDir}/en.json`) as MetaFile
  assert.equal(en.meta?.description, manifest.description, 'en.json 与 package.json 的 description 漂移了')
})

test('zh.json description 是中文原文（非空、含 CJK、非 en 复制）', () => {
  const zh = readJson(`${localeDir}/zh.json`) as MetaFile
  const desc = zh.meta?.description
  assert.ok(typeof desc === 'string' && desc.trim() !== '', 'zh.json 缺 description')
  assert.ok(CJK.test(desc), `zh.json description 不是中文：${desc}`)
  assert.notEqual(desc, manifest.description, 'zh.json 是 en 文案的复制')
})

test('locale 文件名是合法语言 id，各文件 meta 键集一致且键名合法', () => {
  const files = readdirSync(join(root, localeDir)).sort()
  assert.ok(files.includes('en.json'), '缺少 locale/en.json（它是宿主读取翻译的触发文件）')
  const keySets: Array<[string, string[]]> = []
  for (const f of files) {
    assert.match(f, /\.json$/, `locale/ 下存在非 json 文件：${f}`)
    assert.match(f.replace(/\.json$/, ''), LANGUAGE_ID, `非法语言 id：${f}`)
    const doc = readJson(`${localeDir}/${f}`) as MetaFile
    const keys = Object.keys(doc.meta ?? {})
    for (const k of keys) {
      assert.ok(k === 'title' || k === 'description', `${f}: meta 存在宿主不识别的键 ${k}（拼写错误？宿主会静默忽略）`)
      assert.ok(typeof doc.meta![k] === 'string' && (doc.meta![k] as string).trim() !== '', `${f}: meta.${k} 须为非空字符串`)
    }
    keySets.push([f, keys.sort()])
  }
  const enKeys = keySets.find(([f]) => f === 'en.json')![1]
  for (const [f, keys] of keySets) {
    assert.deepEqual(keys, enKeys, `${f} 与 en.json 的 meta 键集不一致：${keys} vs ${enKeys}`)
  }
})
