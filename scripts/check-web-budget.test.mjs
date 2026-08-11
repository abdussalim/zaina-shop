import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { checkBudget } from './check-web-budget.mjs'

test('counts unique initial JavaScript and loaded page bytes', async () => {
  const distDir = await mkdtemp(path.join(os.tmpdir(), 'zaina-budget-'))
  try {
    await mkdir(path.join(distDir, 'assets'))
    await writeFile(
      path.join(distDir, 'index.html'),
      '<link rel="modulepreload" href="/assets/main.js"><script type="module" src="/assets/main.js"></script>',
    )
    await writeFile(path.join(distDir, 'assets/main.js'), 'console.log("shell")')
    await writeFile(path.join(distDir, 'assets/route.js'), 'console.log("route")')
    const result = await checkBudget({ distDir, maxInitialJsGzipBytes: 100_000, maxPageBytes: 1_000_000 })
    assert.equal(result.assets.filter((asset) => asset.endsWith('.js')).length, 1)
    assert.ok(result.initialJsGzipBytes > 0)
    assert.ok(result.pageBytes > result.initialJsGzipBytes)
    assert.equal(result.pageAssets.includes('assets/route.js'), false)
  } finally {
    await rm(distDir, { recursive: true, force: true })
  }
})

test('fails with actionable initial-js and total-page messages', async () => {
  const distDir = await mkdtemp(path.join(os.tmpdir(), 'zaina-budget-'))
  try {
    await mkdir(path.join(distDir, 'assets'))
    await writeFile(
      path.join(distDir, 'index.html'),
      '<script type="module" src="/assets/main.js"></script><link rel="stylesheet" href="/assets/large.css">',
    )
    await writeFile(path.join(distDir, 'assets/main.js'), 'x'.repeat(30_000))
    await writeFile(path.join(distDir, 'assets/large.css'), 'body{background:url("/assets/large.bin")}')
    await writeFile(path.join(distDir, 'assets/large.bin'), 'x'.repeat(10_000))
    await assert.rejects(
      checkBudget({ distDir, maxInitialJsGzipBytes: 1, maxPageBytes: 1_000_000 }),
      /initial JavaScript.*exceeds/,
    )
    await assert.rejects(
      checkBudget({ distDir, maxInitialJsGzipBytes: 100_000, maxPageBytes: 1 }),
      /total page.*exceeds/,
    )
  } finally {
    await rm(distDir, { recursive: true, force: true })
  }
})
