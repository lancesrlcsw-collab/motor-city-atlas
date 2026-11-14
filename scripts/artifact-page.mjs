// After `VITE_TARGET=artifact vite build`: turn dist-artifact/index.html into the bare page a
// Claude artifact expects (no doctype/head/body of its own), drop files the artifact does not
// need, and list every supporting file for the publish step.
import fs from 'node:fs/promises'
import path from 'node:path'

const DIR = path.resolve('dist-artifact')
const html = await fs.readFile(path.join(DIR, 'index.html'), 'utf8')
const script = html.match(/<script[^>]+type="module"[^>]+src="\.\/([^"]+)"/)?.[1]
const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\.\/([^"]+)"/g)].map((m) => m[1])
if (!script) throw new Error('Could not find the entry script in dist-artifact/index.html')

const page = `<title>Motor City Atlas</title>
<meta name="claude:viewport-fit-sides" content="cover">
${styles.map((s) => `<link rel="stylesheet" href="${s}">`).join('\n')}
<style>
  :root { color-scheme: dark; background: #03070d; }
  html, body { height: 100%; }
  body { background: #03070d; color: #eaf2f8; }
</style>
<div id="root"></div>
<script type="module" src="${script}"></script>
`
await fs.writeFile(path.join(DIR, 'page.html'), page)

// The stylesheet lists .woff fallbacks that no current browser requests; the share image and
// favicon belong to the website build only.
const walk = async (dir) => (await Promise.all((await fs.readdir(dir, { withFileTypes: true })).map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])))).flat()
const files = []
for (const file of await walk(DIR)) {
  const rel = path.relative(DIR, file).split(path.sep).join('/')
  if (rel.endsWith('.woff') || rel === 'og.jpg' || rel === 'favicon.svg' || rel === 'index.html') { await fs.rm(file); continue }
  if (rel !== 'page.html' && rel !== 'files.json') files.push(rel)
}
await fs.writeFile(path.join(DIR, 'files.json'), JSON.stringify(files.sort()))
console.log(`Artifact page ready: ${files.length} supporting files, entry ${script}`)
