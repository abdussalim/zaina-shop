import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesDir = path.resolve(process.cwd(), 'src/styles')

describe('mobile-first CSS contract', () => {
  it('uses mobile base styles and progressive min-width enhancements', async () => {
    const source = await Promise.all(
      ['tokens.css', 'global.css', 'features.css'].map((file) => readFile(path.join(stylesDir, file), 'utf8')),
    )
    const combined = source.join('\n')
    expect(combined).not.toMatch(/@media\s*\(\s*max-width/i)
    expect(combined.indexOf('@media (min-width: 481px)')).toBeGreaterThan(-1)
    expect(combined.indexOf('@media (min-width: 769px)')).toBeGreaterThan(combined.indexOf('@media (min-width: 481px)'))
    expect(combined.indexOf('@media (min-width: 1025px)')).toBeGreaterThan(combined.indexOf('@media (min-width: 769px)'))
    expect(combined).toContain('--safe-bottom')
    expect(combined).toContain('--tap-size: 3rem')
    expect(combined).toContain(':focus-visible')
    expect(combined).toContain('prefers-reduced-motion')
    expect(combined).toContain('overflow-x: hidden')
  })
})
