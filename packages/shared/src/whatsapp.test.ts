import { describe, expect, it } from 'vitest'
import {
  buildWhatsAppLink,
  formatWhatsAppOrder,
  normalizeWhatsAppPhone,
  type WhatsAppOrderInput,
} from './whatsapp.js'

describe('normalizeWhatsAppPhone', () => {
  it('converts leading 08 to 628 and removes spaces and hyphens', () => {
    expect(normalizeWhatsAppPhone('0812-3456-7890')).toBe('6281234567890')
    expect(normalizeWhatsAppPhone('0812 3456 789')).toBe('628123456789')
    expect(normalizeWhatsAppPhone('+62 812-3456-7890')).toBe('6281234567890')
    expect(normalizeWhatsAppPhone('6281234567890')).toBe('6281234567890')
  })
})

describe('formatWhatsAppOrder', () => {
  it('formats customer order into clean Indonesian text', () => {
    const input: WhatsAppOrderInput = {
      storeName: 'Toko Zaina',
      customerName: 'Siti Aminah',
      customerAddressOrNotes: 'Jl. Merpati No. 4, tolong antar siang',
      items: [
        {
          productName: 'Beras Rojolele 5kg',
          unitName: 'sak',
          quantity: 2,
          unitPrice: 75_000,
          subtotal: 150_000,
        },
        {
          productName: 'Minyak Goreng Bimoli 2L',
          unitName: 'pouch',
          quantity: 1,
          unitPrice: 38_000,
          subtotal: 38_000,
        },
      ],
      total: 188_000,
    }

    const text = formatWhatsAppOrder(input)
    expect(text).toContain('Halo Toko Zaina, saya ingin memesan:')
    expect(text).toContain('1. Beras Rojolele 5kg (sak) - 2 x Rp 75.000 = Rp 150.000')
    expect(text).toContain('2. Minyak Goreng Bimoli 2L (pouch) - 1 x Rp 38.000 = Rp 38.000')
    expect(text).toContain('*Total Perkiraan:* Rp 188.000')
    expect(text).toContain('*Data Pemesan:*')
    expect(text).toContain('Nama: Siti Aminah')
    expect(text).toContain('Alamat/Catatan: Jl. Merpati No. 4, tolong antar siang')
  })
})

describe('buildWhatsAppLink', () => {
  it('encodes message and generates wa.me URL', () => {
    const url = buildWhatsAppLink('0812-3456-7890', 'Halo Toko Zaina')
    expect(url).toBe('https://wa.me/6281234567890?text=Halo%20Toko%20Zaina')
  })
})
