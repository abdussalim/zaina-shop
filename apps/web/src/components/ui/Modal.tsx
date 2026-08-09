import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'small' | 'medium' | 'large'
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'medium',
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal__overlay" />
        <Dialog.Content className={`modal modal--${size}`}>
          <div className="modal__header">
            <div>
              <Dialog.Title className="modal__title">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="modal__description">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close className="icon-button" aria-label="Tutup dialog">
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="modal__body">{children}</div>
          {footer ? <div className="modal__footer">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
