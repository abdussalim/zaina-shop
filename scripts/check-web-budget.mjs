import { gzipSync } from 'node:zlib'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_INITIAL_JS = 100 * 1024
const DEFAULT_PAGE = 500 * 1024

async function listFiles(root, current = root) {
  const entries = await fs.readdir(current, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(root, fullPath)))
    else files.push(path.relative(root, fullPath).replaceAll(path.sep, '/'))
  }
  return files
}

function referencedAssets(content) {
  const refs = new Set()
  const pattern = /(?:src|href)=["']([^"']+)["']|url\(["']?([^"')]+)["']?\)/g
  for (const match of content.matchAll(pattern)) {
    const value = match[1] ?? match[2]
    if (value.startsWith('/')) refs.add(value.slice(1).split('?')[0])
    else if (!value.startsWith('http')) refs.add(value.split('?')[0])
  }
  return refs
}

async function pageAssets(distDir, indexHtml, files) {
  const queue = [...referencedAssets(indexHtml)]
  const result = new Set()
  while (queue.length > 0) {
    const asset = queue.shift()
    if (!asset || result.has(asset) || !files.includes(asset)) continue
    result.add(asset)
    if (asset.endsWith('.css')) {
      const css = await fs.readFile(path.join(distDir, asset), 'utf8')
      for (const ref of referencedAssets(css)) queue.push(ref)
    }
  }
  return [...result]
}

export async function checkBudget({
  distDir,
  maxInitialJsGzipBytes = DEFAULT_INITIAL_JS,
  maxPageBytes = DEFAULT_PAGE,
}) {
  const indexPath = path.join(distDir, 'index.html')
  const indexHtml = await fs.readFile(indexPath, 'utf8')
  const files = await listFiles(distDir)
  const initialAssets = [...referencedAssets(indexHtml)].filter((asset) => files.includes(asset))
  const jsAssets = initialAssets.filter((asset) => asset.endsWith('.js'))
  let initialJsGzipBytes = 0
  for (const asset of jsAssets) {
    const source = await fs.readFile(path.join(distDir, asset))
    initialJsGzipBytes += gzipSync(source, { level: 9 }).byteLength
  }
  const loadedAssets = await pageAssets(distDir, indexHtml, files)
  let pageBytes = (await fs.stat(indexPath)).size
  for (const asset of loadedAssets) pageBytes += (await fs.stat(path.join(distDir, asset))).size
  const result = { initialJsGzipBytes, pageBytes, assets: initialAssets, pageAssets: loadedAssets }
  const failures = []
  if (initialJsGzipBytes > maxInitialJsGzipBytes) {
    failures.push(
      `initial JavaScript ${initialJsGzipBytes} bytes exceeds ${maxInitialJsGzipBytes} bytes (${jsAssets.join(', ')})`,
    )
  }
  if (pageBytes > maxPageBytes) {
    failures.push(`total page ${pageBytes} bytes exceeds ${maxPageBytes} bytes`)
  }
  if (failures.length > 0) throw new Error(`Web budget exceeded: ${failures.join('; ')}`)
  return result
}

if (import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  const distDir = process.argv[2] ?? path.resolve('apps/web/dist')
  checkBudget({ distDir })
    .then((result) => {
      console.log(
        `Web budget OK: initial JS ${result.initialJsGzipBytes} bytes gzip; page ${result.pageBytes} bytes`,
      )
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
}
