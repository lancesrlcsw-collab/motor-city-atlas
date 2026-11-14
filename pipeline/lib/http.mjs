// Small fetch layer with on-disk caching and retries.
// The cache only speeds up local development; CI starts empty and always pulls fresh data.
import fs from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const CACHE_DIR = path.resolve(process.env.PIPELINE_CACHE || '.cache')
const UA = 'MotorCityAtlas/1.0 (unofficial Detroit Lions fan data project)'
const NO_CACHE = process.env.PIPELINE_NO_CACHE === '1'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const keyFor = (url) => crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)

function fresh(file, ttlHours) {
  if (NO_CACHE || !existsSync(file)) return false
  const ageH = (Date.now() - statSync(file).mtimeMs) / 36e5
  return ageH < ttlHours
}

async function fetchRetry(url, { headers = {}, retries = 4 } = {}) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, redirect: 'follow' })
      if (res.status === 404) return res
      if (res.status === 429 || res.status >= 500) {
        // Honour the server's back-off request when it sends one.
        const wait = Number(res.headers.get('retry-after'))
        lastErr = new Error(`HTTP ${res.status}`)
        await sleep(Number.isFinite(wait) && wait > 0 ? Math.min(wait, 60) * 1000 : 1500 * 2 ** i)
        continue
      }
      return res
    } catch (err) {
      lastErr = err
      await sleep(600 * 2 ** i)
    }
  }
  throw new Error(`fetch failed for ${url}: ${lastErr?.message || lastErr}`)
}

/** Download a (possibly large) file to the cache and return its local path, or null on 404. */
export async function download(url, { ttlHours = 3 } = {}) {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  const ext = url.endsWith('.csv.gz') ? '.csv.gz' : path.extname(new URL(url).pathname) || '.bin'
  const file = path.join(CACHE_DIR, `${keyFor(url)}-${path.basename(new URL(url).pathname, ext)}${ext}`)
  if (fresh(file, ttlHours)) return file
  const res = await fetchRetry(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  // Buffer the body rather than streaming it: the largest file is ~12 MB, and buffering avoids
  // backpressure stalls when the request is tunnelled through an HTTP proxy.
  const tmp = `${file}.part`
  await fs.writeFile(tmp, Buffer.from(await res.arrayBuffer()))
  await fs.rename(tmp, file)
  return file
}

/** GET JSON with caching. Returns null on 404. `politeMs` spaces out uncached requests to the same service. */
export async function getJSON(url, { ttlHours = 1, headers = {}, politeMs = 0 } = {}) {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  const file = path.join(CACHE_DIR, `${keyFor(url)}.json`)
  if (fresh(file, ttlHours)) return JSON.parse(await fs.readFile(file, 'utf8'))
  if (politeMs) await sleep(politeMs)
  const res = await fetchRetry(url, { headers: { accept: 'application/json', ...headers } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 120)}`)
  }
  await fs.writeFile(file, text)
  return json
}

/** Run async jobs with a concurrency limit, keeping order. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}
