import type { CartItem } from './types.js'

export const CART_STORAGE_KEY = 'zaina_storefront_cart'

export function loadCartFromStorage(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCartToStorage(cart: CartItem[]): void {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
  } catch {
    // Storage quota exceeded or disabled cookies
  }
}

export function clearCart(): void {
  try {
    localStorage.removeItem(CART_STORAGE_KEY)
  } catch {
    // Ignore
  }
}

export function addItemToCart(cart: CartItem[], newItem: CartItem): CartItem[] {
  const existingIndex = cart.findIndex(
    (item) => item.productId === newItem.productId && item.unitId === newItem.unitId,
  )

  if (existingIndex >= 0) {
    const updated = [...cart]
    const existing = updated[existingIndex]!
    updated[existingIndex] = {
      ...existing,
      quantity: existing.quantity + newItem.quantity,
    }
    return updated
  }

  return [...cart, newItem]
}

export function updateCartItemQuantity(
  cart: CartItem[],
  productId: string,
  unitId: string,
  quantity: number,
): CartItem[] {
  if (quantity <= 0) {
    return removeItemFromCart(cart, productId, unitId)
  }

  return cart.map((item) =>
    item.productId === productId && item.unitId === unitId ? { ...item, quantity } : item,
  )
}

export function removeItemFromCart(
  cart: CartItem[],
  productId: string,
  unitId: string,
): CartItem[] {
  return cart.filter((item) => !(item.productId === productId && item.unitId === unitId))
}

export function getCartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
}
