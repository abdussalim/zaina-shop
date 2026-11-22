import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesDir = path.resolve(process.cwd(), 'src/styles')

describe('mobile-first CSS contract', () => {
  it('uses mobile base styles and progressive min-width enhancements', async () => {
    const files = ['tokens.css', 'global.css', 'features.css', 'storefront.css']
    const sources = await Promise.all(
      files.map(async (file) => ({
        file,
        content: await readFile(path.join(stylesDir, file), 'utf8'),
      })),
    )

    for (const { content } of sources) {
      expect(content).not.toMatch(/@media\s*\(\s*max-width/i)
      const bp481 = content.indexOf('@media (min-width: 481px)')
      const bp769 = content.indexOf('@media (min-width: 769px)')
      const bp1025 = content.indexOf('@media (min-width: 1025px)')
      if (bp481 !== -1 && bp769 !== -1) {
        expect(bp769).toBeGreaterThan(bp481)
      }
      if (bp769 !== -1 && bp1025 !== -1) {
        expect(bp1025).toBeGreaterThan(bp769)
      }
    }

    const combined = sources.map(({ content }) => content).join('\n')
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
