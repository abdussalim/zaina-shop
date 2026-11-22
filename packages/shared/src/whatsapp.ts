export interface WhatsAppOrderItem {
  productName: string
  unitName: string
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface WhatsAppOrderInput {
  storeName: string
  customerName: string
  customerAddressOrNotes?: string
  items: readonly WhatsAppOrderItem[]
  total: number
}

export interface WhatsAppProductInquiryInput {
  storeName: string
  productName: string
  unitName?: string | undefined
  unitPrice?: number | undefined
  question: string
  customNote?: string | undefined
}

export interface WhatsAppGeneralInquiryInput {
  storeName: string
  topic: string
  customMessage?: string | undefined
}

export function normalizeWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`
  }
  if (digits.startsWith('62')) {
    return digits
  }
  return digits
}

function formatRupiahText(amount: number): string {
  return `Rp ${Math.round(amount).toLocaleString('id-ID')}`
}

export function formatWhatsAppOrder(order: WhatsAppOrderInput): string {
  const lines = [
    `Halo ${order.storeName.trim() || 'Toko'}, saya ingin memesan:`,
    '',
  ]

  order.items.forEach((item, index) => {
    const formattedPrice = formatRupiahText(item.unitPrice)
    const formattedSubtotal = formatRupiahText(item.subtotal)
    lines.push(
      `${index + 1}. ${item.productName} (${item.unitName}) - ${item.quantity} x ${formattedPrice} = ${formattedSubtotal}`,
    )
  })

  lines.push('')
  lines.push(`*Total Perkiraan:* ${formatRupiahText(order.total)}`)
  lines.push('')
  lines.push('*Data Pemesan:*')
  lines.push(`Nama: ${order.customerName.trim() || '-'}`)
  if (order.customerAddressOrNotes?.trim()) {
    lines.push(`Alamat/Catatan: ${order.customerAddressOrNotes.trim()}`)
  }
  lines.push('')
  lines.push('Mohon konfirmasi ketersediaan barang dan total ongkirnya. Terima kasih!')

  return lines.join('\n')
}

export function formatWhatsAppProductInquiry(input: WhatsAppProductInquiryInput): string {
  const storeName = input.storeName.trim() || 'Toko'
  const productName = input.productName.trim() || '-'
  const unitName = input.unitName?.trim()
  const hasPrice = typeof input.unitPrice === 'number' && Number.isFinite(input.unitPrice)

  const lines = [
    `Halo ${storeName}, saya ingin menanyakan produk berikut:`,
    '',
    `*Produk:* ${productName}`,
  ]

  if (unitName && hasPrice) {
    lines.push(`*Satuan:* ${unitName} (${formatRupiahText(input.unitPrice!)})`)
  } else if (unitName) {
    lines.push(`*Satuan:* ${unitName}`)
  } else if (hasPrice) {
    lines.push(`*Harga:* ${formatRupiahText(input.unitPrice!)}`)
  }

  if (input.question.trim()) {
    lines.push(`*Pertanyaan:* ${input.question.trim()}`)
  }

  if (input.customNote?.trim()) {
    lines.push(`*Catatan:* ${input.customNote.trim()}`)
  }

  lines.push('')
  lines.push('Terima kasih!')

  return lines.join('\n')
}

export function formatWhatsAppGeneralInquiry(input: WhatsAppGeneralInquiryInput): string {
  const storeName = input.storeName.trim() || 'Toko'
  const topic = input.topic.trim() || 'Pertanyaan seputar toko'

  const lines = [
    `Halo ${storeName}, saya ingin bertanya:`,
    '',
    `*Topik:* ${topic}`,
  ]

  if (input.customMessage?.trim()) {
    lines.push(`*Pesan:* ${input.customMessage.trim()}`)
  }

  lines.push('')
  lines.push('Terima kasih!')

  return lines.join('\n')
}

export function buildWhatsAppLink(phone: string, text: string): string {
  const cleanPhone = normalizeWhatsAppPhone(phone)
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
}
