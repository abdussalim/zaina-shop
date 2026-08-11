import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InstallPrompt } from './InstallPrompt.js'

describe('InstallPrompt', () => {
  it('waits for the browser install gesture and dismisses after choice', async () => {
    render(<InstallPrompt />)
    const prompt = async () => undefined
    let prevented = false
    window.dispatchEvent(
      Object.assign(new Event('beforeinstallprompt'), {
        prompt,
        userChoice: Promise.resolve({ outcome: 'accepted' as const }),
        preventDefault: () => {
          prevented = true
        },
      }),
    )
    expect(prevented).toBe(true)
    expect(await screen.findByText('Pasang Toko Zaina')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pasang' }))
    await waitFor(() => expect(screen.queryByText('Pasang Toko Zaina')).not.toBeInTheDocument())
  })
})
