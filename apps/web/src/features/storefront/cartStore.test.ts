import { beforeEach, describe, expect, it } from 'vitest'
import {
  addItemToCart,
  clearCart,
  getCartTotal,
  loadCartFromStorage,
  removeItemFromCart,
  saveCartToStorage,
  updateCartItemQuantity,
} from './cartStore.js'
import type { CartItem } from './types.js'

describe('cartStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const item1: CartItem = {
    productId: 'prod-1',
    productName: 'Minyak Goreng',
    unitId: 'unit-1',
    unitName: 'pouch',
    unitPrice: 20_000,
    quantity: 1,
    imageUrl: null,
  }

  it('adds item to cart and merges duplicate product-unit combo', () => {
    let cart = addItemToCart([], item1)
    expect(cart).toHaveLength(1)
    expect(cart[0]!.quantity).toBe(1)

    cart = addItemToCart(cart, item1)
    expect(cart).toHaveLength(1)
    expect(cart[0]!.quantity).toBe(2)
  })

  it('updates quantity and removes when quantity is 0', () => {
    let cart = addItemToCart([], item1)
    cart = updateCartItemQuantity(cart, 'prod-1', 'unit-1', 5)
    expect(cart[0]!.quantity).toBe(5)

    cart = updateCartItemQuantity(cart, 'prod-1', 'unit-1', 0)
    expect(cart).toHaveLength(0)
  })

  it('removes item from cart using removeItemFromCart', () => {
    let cart = addItemToCart([], item1)
    cart = removeItemFromCart(cart, 'prod-1', 'unit-1')
    expect(cart).toHaveLength(0)
  })

  it('calculates cart total accurately', () => {
    const cart: CartItem[] = [
      { ...item1, unitPrice: 20_000, quantity: 2 },
      { ...item1, productId: 'prod-2', unitId: 'unit-2', unitPrice: 15_000, quantity: 3 },
    ]
    expect(getCartTotal(cart)).toBe(85_000)
  })

  it('persists to and reads from localStorage', () => {
    const cart = [item1]
    saveCartToStorage(cart)
    const loaded = loadCartFromStorage()
    expect(loaded).toEqual(cart)

    clearCart()
    expect(loadCartFromStorage()).toEqual([])
  })

  it('handles invalid JSON or non-array data gracefully in loadCartFromStorage', () => {
    localStorage.setItem('zaina_storefront_cart', 'invalid json')
    expect(loadCartFromStorage()).toEqual([])

    localStorage.setItem('zaina_storefront_cart', '{"not": "an array"}')
    expect(loadCartFromStorage()).toEqual([])
  })
})
