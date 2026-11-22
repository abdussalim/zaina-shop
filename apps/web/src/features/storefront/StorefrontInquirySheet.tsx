import { useEffect, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { buildWhatsAppLink, formatWhatsAppGeneralInquiry } from '@zaina/shared'
import type { StorefrontInfo } from './types.js'

const GENERAL_TOPICS = [
  'Tanya jam buka toko',
  'Tanya ketersediaan barang lain',
  'Tanya petunjuk arah ke toko',
  'Pertanyaan lainnya',
] as const

export function StorefrontInquirySheet({
  storeInfo,
  onClose,
}: {
  storeInfo: StorefrontInfo
  onClose: () => void
}) {
  const [selectedTopic, setSelectedTopic] = useState<string>(GENERAL_TOPICS[0])
  const [customMessage, setCustomMessage] = useState('')

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleSendWhatsApp() {
    const phone = storeInfo.phone.trim() || '088744982845'
    const message = formatWhatsAppGeneralInquiry({
      storeName: storeInfo.storeName.trim() || 'Toko Zaina',
      topic: selectedTopic,
      ...(customMessage.trim() ? { customMessage: customMessage.trim() } : {}),
    })
    const waUrl = buildWhatsAppLink(phone, message)
    window.open(waUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <div className="modal__overlay" onClick={onClose} aria-hidden="true" />
      <div
        className="modal modal--small storefront-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="general-inquiry-title"
      >
        <div className="modal__handle" aria-hidden="true" />

        <div className="storefront-sheet__header">
          <h2 id="general-inquiry-title" className="storefront-sheet__title">
            Tanya Toko via WhatsApp
          </h2>
          <button
            type="button"
            className="icon-button storefront-sheet__close"
            onClick={onClose}
            aria-label="Tutup"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="storefront-sheet__body">
          <div className="storefront-detail__section">
            <div className="storefront-detail__section-head">
              <span className="storefront-detail__label">Pilih Topik</span>
              <span className="storefront-detail__hint">
                Biar kami lebih cepat merespons
              </span>
            </div>

            <div className="storefront-chip-grid" role="group" aria-label="Pilih Topik">
              {GENERAL_TOPICS.map((topic) => {
                const isActive = selectedTopic === topic
                return (
                  <button
                    key={topic}
                    type="button"
                    className={`storefront-chip ${isActive ? 'storefront-chip--active' : ''}`}
                    aria-pressed={isActive}
                    onClick={() => setSelectedTopic(topic)}
                  >
                    {topic}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="field">
            <label htmlFor="general-inquiry-message" className="field__label">
              Detail pertanyaan (opsional)
            </label>
            <textarea
              id="general-inquiry-message"
              className="storefront-inquiry-note"
              rows={3}
              placeholder="Contoh: Apakah hari Minggu toko buka sampai sore?"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
            />
          </div>
        </div>

        <div className="storefront-sheet__footer">
          <button
            type="button"
            className="button button--large storefront-wa-btn"
            onClick={handleSendWhatsApp}
          >
            <MessageCircle size={18} aria-hidden="true" />
            <span>Kirim ke WhatsApp</span>
          </button>
          <p className="storefront-sheet__helper">
            Pesan otomatis terbuka di WhatsApp toko — tanpa perlu bikin akun
          </p>
        </div>
      </div>
    </>
  )
}
