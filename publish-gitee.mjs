#!/usr/bin/env node
/* 把 publish/OpenReader.apk 推到 Gitee 固定 tag 的 Release 附件。
 *
 * 固定 URL（永久不变）：
 *   https://gitee.com/zlbku/Open-reader/releases/download/latest/OpenReader.apk
 * 流程：删同名旧附件 → 上传新附件 → 匿名访问固定 URL 校验 SHA-256。
 * 令牌读自 .gitee-token（不要提交/上传），仓库必须公开。
 *
 * 用法：node publish-gitee.mjs
 * 前置：先跑完打包，确保 publish/OpenReader.apk 是新版。
 * 收尾：把 publish/update.json 传到 PythonAnywhere ~/or_update/（触发老用户更新）。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const OWNER = 'zlbku'
const REPO = 'Open-reader'
const TAG = 'latest'
const ASSET = 'OpenReader.apk'
const RELEASES_API = `https://gitee.com/api/v5/repos/${OWNER}/${REPO}/releases`
const PUBLIC_URL = `https://gitee.com/${OWNER}/${REPO}/releases/download/${TAG}/${ASSET}`

const token = fs.readFileSync(path.join(ROOT, '.gitee-token'), 'utf8').trim()
if (!token) throw new Error('.gitee-token 为空')
const apk = fs.readFileSync(path.join(ROOT, 'publish', ASSET))
const localSha = crypto.createHash('sha256').update(apk).digest('hex')

async function api(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  })
  if (!r.ok) throw new Error(`${options.method || 'GET'} ${url} → HTTP ${r.status} ${await r.text()}`)
  return r.status === 204 ? null : r.json()
}

// 按 tag 查 Release ID（不硬编码，重建 Release 也能用）
const release = await api(`${RELEASES_API}/tags/${TAG}`)
if (!release || !release.id) throw new Error(`找不到 tag=${TAG} 的 Release`)
const API = `${RELEASES_API}/${release.id}`
console.log(`Release id=${release.id} tag=${TAG}`)

// 1. 删掉同名旧附件（固定 tag 下只允许存在一个）
const assets = await api(`${API}/attach_files`)
for (const a of assets) {
  if (a.name !== ASSET) continue
  await api(`${API}/attach_files/${a.id}`, { method: 'DELETE' })
  console.log(`已删除旧附件 id=${a.id}`)
}

// 2. 上传同名新附件
const form = new FormData()
form.append('access_token', token)
form.append('file', new Blob([apk], { type: 'application/vnd.android.package-archive' }), ASSET)
const uploaded = await api(`${API}/attach_files`, { method: 'POST', body: form })
console.log(`已上传新附件 id=${uploaded.id} (${apk.length} 字节)`)

// 3. 匿名访问固定 URL，确认替换即时生效且内容与本地一致
const r = await fetch(PUBLIC_URL, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' },
})
if (!r.ok) throw new Error(`固定 URL 返回 HTTP ${r.status}`)
const buf = Buffer.from(await r.arrayBuffer())
const remoteSha = crypto.createHash('sha256').update(buf).digest('hex')
if (remoteSha !== localSha) {
  throw new Error(`SHA 不一致！本地 ${localSha} / 云端 ${remoteSha}（可能命中缓存或上传失败）`)
}
console.log(`校验通过：${PUBLIC_URL}`)
console.log(`sha256 ${remoteSha}`)
console.log('最后一步：把 publish/update.json 传到 PythonAnywhere ~/or_update/')
