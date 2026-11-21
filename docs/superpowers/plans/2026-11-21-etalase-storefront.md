# Etalase Publik Toko Zaina (Storefront & WhatsApp Checkout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a public storefront (etalase) for Toko Zaina integrated into the existing monorepo at `/`, enabling customers to browse active products with R2 images, choose selling units, manage a cart, and checkout seamlessly via WhatsApp without requiring login.

**Architecture:** 
1. `@zaina/shared`: Provide domain utilities for normalizing Indonesian WhatsApp phone numbers and formatting order summaries for WhatsApp URL transmission.
2. `apps/api`: Add public `/api/v1/storefront/info` and `/api/v1/storefront/catalog` endpoints that return active products and store contact information without requiring session cookies or exposing sensitive cost/inventory fields.
3. `apps/web`: Implement `StorefrontPage.tsx` and `StorefrontCartSheet.tsx` styled mobile-first with CSS variables, integrated into `App.tsx` so unauthenticated visitors see the public storefront at `/` with a "Akses Staf" link to `/login`, while staff can toggle between the storefront and POS/management pages.

**Tech Stack:** React 19, TypeScript, Vite, Hono (Cloudflare Workers), TanStack Query, Vitest, Lucide React, Cloudflare D1 & R2.

## Global Constraints
- **Mobile First Base Styles**: Base CSS must be mobile-first with NO `@media (max-width)`. All media queries must use `@media (min-width: ...)`.
- **Touch Ergonomics**: All interactive elements must maintain a minimum 48px tap target (`--tap-size: 3rem`) and `touch-action: pan-y` on scrollable items.
- **Data Privacy**: Storefront public API must NEVER expose `costPrice` (HPP), `barcode`, `supplier`, or inactive products.
- **Package Manager**: Always run `pnpm.cmd` on Windows.
- **Strict Verification**: Every task ends with passing automated tests and clean git commit.

---

### Task 1: WhatsApp Order Utilities in `@zaina/shared`

**Files:**
- Create: `packages/shared/src/whatsapp.ts`
- Create: `packages/shared/src/whatsapp.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: Nothing
- Produces:
  ```ts
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

  export function normalizeWhatsAppPhone(phone: string): string
  export function formatWhatsAppOrder(order: WhatsAppOrderInput): string
  export function buildWhatsAppLink(phone: string, text: string): string
  ```

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/whatsapp.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd --filter @zaina/shared test`
Expected: FAIL with module `./whatsapp.js` not found.

- [ ] **Step 3: Write implementation**

Create `packages/shared/src/whatsapp.ts`:
```ts
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

export function buildWhatsAppLink(phone: string, text: string): string {
  const cleanPhone = normalizeWhatsAppPhone(phone)
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
}
```

Update `packages/shared/src/index.ts` to export whatsapp helpers:
```ts
export * from './domain.js'
export * from './schemas.js'
export * from './whatsapp.js'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm.cmd --filter @zaina/shared test`
Expected: PASS with all tests passing.
Run: `pnpm.cmd --filter @zaina/shared build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/whatsapp.ts packages/shared/src/whatsapp.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add whatsapp phone normalizer and order text formatter"
```

---

### Task 2: Public Storefront API in `apps/api`

**Files:**
- Create: `apps/api/src/routes/storefront.ts`
- Create: `apps/api/src/modules/storefront/storefront.routes.test.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Consumes: `createCatalogService`, `createSettingsService`, `createD1Database`
- Produces:
  - `GET /api/v1/storefront/info`: `{ storeName: string, address: string, phone: string }`
  - `GET /api/v1/storefront/catalog`: `{ categories: [...], products: [...] }`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/storefront/storefront.routes.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAnonymousTestContext } from '../../test/app-context.js'

type AnonymousTestContext = Awaited<ReturnType<typeof createAnonymousTestContext>>

describe('storefront public routes', () => {
  let context: AnonymousTestContext

  beforeAll(async () => {
    context = await createAnonymousTestContext()
  })

  afterAll(async () => {
    await context?.close()
  })

  it('allows unauthenticated access to store info', async () => {
    const response = await context.app.request('/api/v1/storefront/info')
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.data).toHaveProperty('storeName')
    expect(body.data).toHaveProperty('phone')
  })

  it('allows unauthenticated access to public catalog without exposing cost price', async () => {
    const response = await context.app.request('/api/v1/storefront/catalog')
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(Array.isArray(body.data.categories)).toBe(true)
    expect(Array.isArray(body.data.products)).toBe(true)

    if (body.data.products.length > 0) {
      const product = body.data.products[0]
      expect(product).toHaveProperty('id')
      expect(product).toHaveProperty('name')
      expect(product).toHaveProperty('units')
      expect(product).toHaveProperty('stockStatus')
      expect(product).not.toHaveProperty('costPrice')
      expect(product).not.toHaveProperty('cost_price')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd --filter @zaina/api test src/modules/storefront/storefront.routes.test.ts`
Expected: FAIL with 404.

- [ ] **Step 3: Write implementation**

Create `apps/api/src/routes/storefront.ts`:
```ts
import { Hono } from 'hono'
import type { Env } from '../env.js'
import { sendData } from '../http/respond.js'
import { createD1Database } from '../db/d1.js'
import { createSettingsService } from '../modules/settings/settings.service.js'
import { createCatalogService } from '../modules/catalog/catalog.service.js'

export const storefrontRoutes = new Hono<Env>()

storefrontRoutes.get('/info', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createSettingsService(db)
  const store = await service.getStore()

  return sendData(c, {
    storeName: store.storeName,
    address: store.address ?? '',
    phone: store.phone ?? '',
  })
})

storefrontRoutes.get('/catalog', async (c) => {
  const db = createD1Database(c.env.DB)
  const catalogService = createCatalogService(db)

  const [categories, allProducts] = await Promise.all([
    catalogService.listCategories(),
    catalogService.listProducts({ includeInactive: false }),
  ])

  const sanitizedProducts = allProducts.map((p) => ({
    id: p.id,
    name: p.name,
    categoryId: p.categoryId,
    categoryName: p.categoryName,
    categoryColor: p.categoryColor,
    baseUnit: p.baseUnit,
    imageUrl: p.imageUrl,
    stockStatus: p.stockStatus,
    units: p.units.map((u) => ({
      id: u.id,
      name: u.name,
      factor: u.factor,
      salePrice: u.salePrice,
      isDefault: u.isDefault,
    })),
  }))

  return sendData(c, {
    categories,
    products: sanitizedProducts,
  })
})
```

Update `apps/api/src/index.ts`:
Import `storefrontRoutes`:
```ts
import { storefrontRoutes } from './routes/storefront.js'
```
And mount it BEFORE `sessionMiddleware` or ensure it does not require auth:
```ts
app.route('/api/v1/storefront', storefrontRoutes)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm.cmd --filter @zaina/api test src/modules/storefront/storefront.routes.test.ts`
Expected: PASS.
Run: `pnpm.cmd --filter @zaina/api test`
Expected: PASS for all api suites.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/storefront.ts apps/api/src/modules/storefront/storefront.routes.test.ts apps/api/src/index.ts
git commit -m "feat(api): expose public storefront info and catalog routes"
```

---

### Task 3: Storefront State, Types, and Local Storage Cart in `apps/web`

**Files:**
- Create: `apps/web/src/features/storefront/types.ts`
- Create: `apps/web/src/features/storefront/cartStore.ts`
- Create: `apps/web/src/features/storefront/cartStore.test.ts`

**Interfaces:**
- Consumes: `@zaina/shared` (WhatsAppOrderInput)
- Produces:
  ```ts
  export interface StorefrontProductUnit {
    id: string
    name: string
    factor: number
    salePrice: number
    isDefault: boolean
  }

  export interface StorefrontProduct {
    id: string
    name: string
    categoryId: string
    categoryName: string
    categoryColor: string
    baseUnit: string
    imageUrl: string | null
    stockStatus: 'OK' | 'LOW' | 'OUT_OF_STOCK'
    units: StorefrontProductUnit[]
  }

  export interface StorefrontInfo {
    storeName: string
    address: string
    phone: string
  }

  export interface CartItem {
    productId: string
    productName: string
    unitId: string
    unitName: string
    unitPrice: number
    quantity: number
    imageUrl: string | null
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/storefront/cartStore.test.ts`:
```ts
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd --filter @zaina/web test src/features/storefront/cartStore.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Write implementation**

Create `apps/web/src/features/storefront/types.ts`:
```ts
export interface StorefrontProductUnit {
  id: string
  name: string
  factor: number
  salePrice: number
  isDefault: boolean
}

export interface StorefrontProduct {
  id: string
  name: string
  categoryId: string
  categoryName: string
  categoryColor: string
  baseUnit: string
  imageUrl: string | null
  stockStatus: 'OK' | 'LOW' | 'OUT_OF_STOCK'
  units: StorefrontProductUnit[]
}

export interface StorefrontCategory {
  id: string
  name: string
  color: string
  isActive: boolean
}

export interface StorefrontCatalogResponse {
  categories: StorefrontCategory[]
  products: StorefrontProduct[]
}

export interface StorefrontInfo {
  storeName: string
  address: string
  phone: string
}

export interface CartItem {
  productId: string
  productName: string
  unitId: string
  unitName: string
  unitPrice: number
  quantity: number
  imageUrl: string | null
}
```

Create `apps/web/src/features/storefront/cartStore.ts`:
```ts
import type { CartItem } from './types.js'

const CART_STORAGE_KEY = 'zaina_storefront_cart'

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
    // Storage quota or disabled cookies
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm.cmd --filter @zaina/web test src/features/storefront/cartStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/storefront/types.ts apps/web/src/features/storefront/cartStore.ts apps/web/src/features/storefront/cartStore.test.ts
git commit -m "feat(web): add storefront cart storage and types"
```

---

### Task 4: Storefront Components & UI Styling

**Files:**
- Create: `apps/web/src/features/storefront/StorefrontHeader.tsx`
- Create: `apps/web/src/features/storefront/ProductCard.tsx`
- Create: `apps/web/src/features/storefront/ProductDetailSheet.tsx`
- Create: `apps/web/src/features/storefront/StorefrontCartSheet.tsx`
- Create: `apps/web/src/features/storefront/StorefrontPage.tsx`
- Modify: `apps/web/src/styles/features.css`

**Interfaces:**
- Consumes: `types.ts`, `cartStore.ts`, `@zaina/shared` (`buildWhatsAppLink`, `formatWhatsAppOrder`)
- Produces: `StorefrontPage` component for public routing.

- [ ] **Step 1: Write mobile-first styles in `features.css`**

Add storefront styles to `apps/web/src/styles/features.css`:
```css
/* Storefront Public Showcase */
.storefront {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--canvas);
  padding-bottom: calc(6rem + var(--safe-bottom));
}

.storefront-header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: calc(0.75rem + var(--safe-top)) max(var(--space-4), var(--safe-left)) 0.75rem max(var(--space-4), var(--safe-right));
  background: rgb(255 253 248 / 0.94);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}

.storefront-brand {
  display: flex;
  flex-direction: column;
}

.storefront-brand h1 {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--ink);
  margin: 0;
}

.storefront-brand p {
  font-size: 0.72rem;
  color: var(--ink-soft);
  margin: 0;
}

.storefront-nav-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.storefront-staff-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ink-soft);
  padding: 0.4rem 0.65rem;
  border-radius: var(--radius-sm);
  background: var(--paper-strong);
  border: 1px solid var(--line);
  text-decoration: none;
}

.storefront-hero {
  padding: var(--space-4);
  background: var(--paper);
  border-bottom: 1px solid var(--line);
  display: grid;
  gap: var(--space-3);
}

.category-pills {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 0.25rem;
  scrollbar-width: none;
}
.category-pills::-webkit-scrollbar {
  display: none;
}

.category-pill {
  touch-action: pan-y;
  white-space: nowrap;
  padding: 0.45rem 0.85rem;
  border-radius: 99rem;
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--ink-soft);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.category-pill--active {
  background: var(--olive-dark);
  color: #fff;
  border-color: var(--olive-dark);
}

.storefront-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  padding: var(--space-4);
}

@media (min-width: 769px) {
  .storefront-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-4);
    max-width: 1200px;
    margin-inline: auto;
  }
}

.storefront-card {
  touch-action: pan-y;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-soft);
  cursor: pointer;
}

.storefront-card__thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: var(--canvas);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.storefront-card__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.storefront-card__placeholder {
  font-size: 2rem;
  font-weight: 700;
  color: var(--ink-soft);
  opacity: 0.4;
}

.storefront-card__body {
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0.35rem;
}

.storefront-card__title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.1rem;
}

.storefront-card__price {
  font-family: var(--font-data);
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--olive-dark);
  margin-top: auto;
}

.storefront-card__unit {
  font-size: 0.7rem;
  color: var(--ink-soft);
  font-weight: normal;
}

/* Floating Cart Trigger */
.storefront-floating-cart {
  position: fixed;
  bottom: calc(1rem + var(--safe-bottom));
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  width: calc(100% - 2rem);
  max-width: 480px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  min-height: var(--tap-size);
  background: var(--olive-dark);
  color: #fff;
  border-radius: 99rem;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.2);
  border: 0;
  cursor: pointer;
}
```

- [ ] **Step 2: Create `StorefrontHeader.tsx`**

Create `apps/web/src/features/storefront/StorefrontHeader.tsx`:
```tsx
import { ShoppingBag, User } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { StorefrontInfo } from './types.js'

export function StorefrontHeader({
  storeInfo,
  cartCount,
  onOpenCart,
  isStaff,
}: {
  storeInfo: StorefrontInfo
  cartCount: number
  onOpenCart: () => void
  isStaff?: boolean
}) {
  return (
    <header className="storefront-header">
      <div className="storefront-brand">
        <h1>{storeInfo.storeName || 'Toko Zaina'}</h1>
        <p>{storeInfo.address || 'Katalog & Pesan Online'}</p>
      </div>
      <div className="storefront-nav-actions">
        <button
          type="button"
          onClick={onOpenCart}
          className="storefront-staff-link"
          aria-label="Keranjang Belanja"
        >
          <ShoppingBag size={16} />
          {cartCount > 0 && <span>{cartCount}</span>}
        </button>
        <Link
          to={isStaff ? '/sales' : '/login'}
          className="storefront-staff-link"
        >
          <User size={16} />
          <span>{isStaff ? 'Kasir' : 'Staf'}</span>
        </Link>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Create `ProductCard.tsx`**

Create `apps/web/src/features/storefront/ProductCard.tsx`:
```tsx
import { Plus } from 'lucide-react'
import { formatCurrency } from '../../lib/format.js'
import type { StorefrontProduct } from './types.js'

export function ProductCard({
  product,
  onSelect,
}: {
  product: StorefrontProduct
  onSelect: (product: StorefrontProduct) => void
}) {
  const defaultUnit = product.units.find((u) => u.isDefault) ?? product.units[0]
  const isAvailable = product.stockStatus !== 'OUT_OF_STOCK'

  return (
    <div
      className="storefront-card"
      onClick={() => onSelect(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(product)
        }
      }}
    >
      <div className="storefront-card__thumb">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" />
        ) : (
          <span className="storefront-card__placeholder">
            {product.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="storefront-card__body">
        <span
          className="badge"
          style={{
            alignSelf: 'flex-start',
            fontSize: '0.65rem',
            padding: '0.15rem 0.4rem',
            backgroundColor: `${product.categoryColor}20`,
            color: product.categoryColor,
          }}
        >
          {product.categoryName}
        </span>
        <h3 className="storefront-card__title">{product.name}</h3>
        <div className="storefront-card__price">
          {defaultUnit ? formatCurrency(defaultUnit.salePrice) : '-'}
          {defaultUnit && <span className="storefront-card__unit"> /{defaultUnit.name}</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
          <span style={{ fontSize: '0.7rem', color: isAvailable ? 'var(--olive-dark)' : 'var(--danger)' }}>
            {isAvailable ? 'Tersedia' : 'Habis'}
          </span>
          <button
            type="button"
            className="btn btn--secondary"
            style={{ minHeight: '2rem', height: '2rem', width: '2rem', padding: 0, borderRadius: '99rem' }}
            disabled={!isAvailable}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(product)
            }}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `ProductDetailSheet.tsx`**

Create `apps/web/src/features/storefront/ProductDetailSheet.tsx`:
```tsx
import { useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { formatCurrency } from '../../lib/format.js'
import type { CartItem, StorefrontProduct } from './types.js'

export function ProductDetailSheet({
  product,
  onClose,
  onAddToCart,
}: {
  product: StorefrontProduct
  onClose: () => void
  onAddToCart: (item: CartItem) => void
}) {
  const [selectedUnitId, setSelectedUnitId] = useState(
    product.units.find((u) => u.isDefault)?.id ?? product.units[0]?.id ?? '',
  )
  const [quantity, setQuantity] = useState(1)

  const selectedUnit = product.units.find((u) => u.id === selectedUnitId) ?? product.units[0]

  if (!selectedUnit) return null

  function handleAdd() {
    onAddToCart({
      productId: product.id,
      productName: product.name,
      unitId: selectedUnit.id,
      unitName: selectedUnit.name,
      unitPrice: selectedUnit.salePrice,
      quantity,
      imageUrl: product.imageUrl,
    })
    onClose()
  }

  return (
    <>
      <div className="modal__overlay" onClick={onClose} />
      <div className="modal" style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Detail Produk</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose} style={{ minHeight: '2.5rem' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
          {product.imageUrl && (
            <div style={{ width: '100%', height: '180px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}

          <div>
            <h3 style={{ fontSize: '1.2rem', margin: '0 0 0.25rem 0' }}>{product.name}</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>Kategori: {product.categoryName}</span>
          </div>

          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
              Pilih Satuan:
            </label>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {product.units.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  className={`category-pill ${unit.id === selectedUnit.id ? 'category-pill--active' : ''}`}
                  onClick={() => setSelectedUnitId(unit.id)}
                >
                  {unit.name} ({formatCurrency(unit.salePrice)})
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBlock: 'var(--space-2)' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Jumlah:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn--secondary"
                style={{ width: '2.5rem', minHeight: '2.5rem', padding: 0 }}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus size={16} />
              </button>
              <span style={{ minWidth: '2rem', textAlign: 'center', fontWeight: 700 }}>{quantity}</span>
              <button
                type="button"
                className="btn btn--secondary"
                style={{ width: '2.5rem', minHeight: '2.5rem', padding: 0 }}
                onClick={() => setQuantity((q) => q + 1)}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: 'var(--space-3)' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', display: 'block' }}>Total Harga:</span>
              <strong style={{ fontSize: '1.2rem', color: 'var(--olive-dark)' }}>
                {formatCurrency(selectedUnit.salePrice * quantity)}
              </strong>
            </div>
            <button
              type="button"
              className="btn btn--primary"
              disabled={product.stockStatus === 'OUT_OF_STOCK'}
              onClick={handleAdd}
            >
              Tambah ke Keranjang
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 5: Create `StorefrontCartSheet.tsx`**

Create `apps/web/src/features/storefront/StorefrontCartSheet.tsx`:
```tsx
import { useState } from 'react'
import { Minus, Plus, Trash2, X } from 'lucide-react'
import { buildWhatsAppLink, formatWhatsAppOrder } from '@zaina/shared'
import { formatCurrency } from '../../lib/format.js'
import type { CartItem, StorefrontInfo } from './types.js'

export function StorefrontCartSheet({
  cart,
  storeInfo,
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}: {
  cart: CartItem[]
  storeInfo: StorefrontInfo
  onClose: () => void
  onUpdateQuantity: (productId: string, unitId: string, quantity: number) => void
  onRemoveItem: (productId: string, unitId: string) => void
  onClearCart: () => void
}) {
  const [customerName, setCustomerName] = useState('')
  const [addressOrNotes, setAddressOrNotes] = useState('')
  const [error, setError] = useState<string>()

  const total = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

  function handleCheckoutWhatsApp() {
    if (!customerName.trim()) {
      setError('Mohon isi nama Anda terlebih dahulu')
      return
    }

    if (!storeInfo.phone.trim()) {
      setError('Nomor WhatsApp toko belum diatur di pengaturan toko')
      return
    }

    const message = formatWhatsAppOrder({
      storeName: storeInfo.storeName || 'Toko Zaina',
      customerName: customerName.trim(),
      customerAddressOrNotes: addressOrNotes.trim() || undefined,
      items: cart.map((i) => ({
        productName: i.productName,
        unitName: i.unitName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        subtotal: i.unitPrice * i.quantity,
      })),
      total,
    })

    const waUrl = buildWhatsAppLink(storeInfo.phone, message)
    window.open(waUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <div className="modal__overlay" onClick={onClose} />
      <div className="modal" style={{ padding: 'var(--space-4)', maxHeight: '90dvh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Keranjang Belanja ({cart.length})</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose} style={{ minHeight: '2.5rem' }}>
            <X size={20} />
          </button>
        </div>

        {cart.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)' }}>
            <p style={{ color: 'var(--ink-soft)' }}>Keranjang Anda masih kosong</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
            <div style={{ display: 'grid', gap: 'var(--space-2)', maxHeight: '35vh', overflowY: 'auto' }}>
              {cart.map((item) => (
                <div
                  key={`${item.productId}-${item.unitId}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 'var(--space-2)',
                    alignItems: 'center',
                    padding: 'var(--space-2) 0',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.88rem' }}>{item.productName}</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
                      {formatCurrency(item.unitPrice)} / {item.unitName}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      style={{ width: '2rem', minHeight: '2rem', padding: 0 }}
                      onClick={() => onUpdateQuantity(item.productId, item.unitId, item.quantity - 1)}
                    >
                      <Minus size={14} />
                    </button>
                    <span style={{ minWidth: '1.5rem', textAlign: 'center', fontWeight: 600, fontSize: '0.88rem' }}>
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      style={{ width: '2rem', minHeight: '2rem', padding: 0 }}
                      onClick={() => onUpdateQuantity(item.productId, item.unitId, item.quantity + 1)}
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ width: '2rem', minHeight: '2rem', padding: 0, color: 'var(--danger)' }}
                      onClick={() => onRemoveItem(item.productId, item.unitId)}
                      aria-label="Hapus item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>Total Belanja:</span>
              <strong style={{ fontSize: '1.2rem', color: 'var(--olive-dark)' }}>{formatCurrency(total)}</strong>
            </div>

            {error && (
              <div style={{ color: 'var(--danger)', fontSize: '0.8rem', background: '#ffebee', padding: '0.5rem', borderRadius: '4px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
                  Nama Anda <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Ibu Ani"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
                  Alamat Pengiriman / Catatan
                </label>
                <textarea
                  placeholder="Contoh: Jl. Mawar No. 5, tolong antar sebelum jam 3"
                  value={addressOrNotes}
                  onChange={(e) => setAddressOrNotes(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={onClearCart}
                style={{ flex: '0 0 auto' }}
              >
                Kosongkan
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleCheckoutWhatsApp}
                style={{ flex: 1, backgroundColor: '#25D366', borderColor: '#25D366' }}
              >
                Pesan via WhatsApp
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 6: Create `StorefrontPage.tsx`**

Create `apps/web/src/features/storefront/StorefrontPage.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ShoppingBag } from 'lucide-react'
import { apiRequest } from '../../api/client.js'
import { formatCurrency } from '../../lib/format.js'
import { LoadingState } from '../../components/ui/States.js'
import {
  addItemToCart,
  clearCart,
  getCartTotal,
  loadCartFromStorage,
  removeItemFromCart,
  saveCartToStorage,
  updateCartItemQuantity,
} from './cartStore.js'
import { ProductCard } from './ProductCard.js'
import { ProductDetailSheet } from './ProductDetailSheet.js'
import { StorefrontCartSheet } from './StorefrontCartSheet.js'
import { StorefrontHeader } from './StorefrontHeader.js'
import type {
  CartItem,
  StorefrontCatalogResponse,
  StorefrontInfo,
  StorefrontProduct,
} from './types.js'

export function StorefrontPage({ isStaff }: { isStaff?: boolean }) {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<StorefrontProduct | null>(null)
  const [cart, setCart] = useState<CartItem[]>(() => loadCartFromStorage())
  const [isCartOpen, setIsCartOpen] = useState(false)

  useEffect(() => {
    saveCartToStorage(cart)
  }, [cart])

  const storeInfoQuery = useQuery({
    queryKey: ['storefront', 'info'],
    queryFn: () => apiRequest<StorefrontInfo>('/api/v1/storefront/info'),
  })

  const catalogQuery = useQuery({
    queryKey: ['storefront', 'catalog'],
    queryFn: () => apiRequest<StorefrontCatalogResponse>('/api/v1/storefront/catalog'),
  })

  const storeInfo = storeInfoQuery.data ?? {
    storeName: 'Toko Zaina',
    address: '',
    phone: '',
  }

  const catalog = catalogQuery.data ?? { categories: [], products: [] }

  const filteredProducts = catalog.products.filter((product) => {
    const matchesCategory =
      selectedCategory === 'ALL' || product.categoryId === selectedCategory
    const matchesQuery =
      !searchQuery.trim() ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.categoryName.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesQuery
  })

  const cartTotal = getCartTotal(cart)
  const totalItemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div className="storefront">
      <StorefrontHeader
        storeInfo={storeInfo}
        cartCount={totalItemCount}
        onOpenCart={() => setIsCartOpen(true)}
        isStaff={isStaff}
      />

      <section className="storefront-hero">
        <div className="filter-search" style={{ width: '100%' }}>
          <Search size={18} color="var(--ink-soft)" />
          <input
            type="search"
            placeholder="Cari produk toko..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="category-pills">
          <button
            type="button"
            className={`category-pill ${selectedCategory === 'ALL' ? 'category-pill--active' : ''}`}
            onClick={() => setSelectedCategory('ALL')}
          >
            Semua ({catalog.products.length})
          </button>
          {catalog.categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`category-pill ${selectedCategory === cat.id ? 'category-pill--active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </section>

      {catalogQuery.isLoading ? (
        <div style={{ padding: 'var(--space-8)' }}>
          <LoadingState label="Memuat etalase produk..." />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)', color: 'var(--ink-soft)' }}>
          <p>Tidak ada produk yang cocok dengan pencarian.</p>
        </div>
      ) : (
        <div className="storefront-grid">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onSelect={setSelectedProduct}
            />
          ))}
        </div>
      )}

      {totalItemCount > 0 && !isCartOpen && (
        <button
          type="button"
          className="storefront-floating-cart"
          onClick={() => setIsCartOpen(true)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShoppingBag size={20} />
            <span style={{ fontWeight: 600 }}>{totalItemCount} Barang</span>
          </div>
          <strong>{formatCurrency(cartTotal)}</strong>
        </button>
      )}

      {selectedProduct && (
        <ProductDetailSheet
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={(item) => setCart((prev) => addItemToCart(prev, item))}
        />
      )}

      {isCartOpen && (
        <StorefrontCartSheet
          cart={cart}
          storeInfo={storeInfo}
          onClose={() => setIsCartOpen(false)}
          onUpdateQuantity={(prodId, unitId, qty) =>
            setCart((prev) => updateCartItemQuantity(prev, prodId, unitId, qty))
          }
          onRemoveItem={(prodId, unitId) =>
            setCart((prev) => removeItemFromCart(prev, prodId, unitId))
          }
          onClearCart={() => setCart([])}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 7: Run mobile CSS contract test to verify compliance**

Run: `pnpm.cmd --filter @zaina/web test src/styles/mobile-css.contract.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/storefront/ apps/web/src/styles/features.css
git commit -m "feat(web): add storefront page, product cards, detail sheet, and cart components"
```

---

### Task 5: Routing Integration in `apps/web`

**Files:**
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/app/AppShell.tsx`
- Create: `apps/web/src/features/storefront/StorefrontPage.test.tsx`

**Interfaces:**
- Consumes: `StorefrontPage`, `AppShell`
- Produces: Seamless public routing at `/` and `/etalase`, with `/login` and internal `/sales`, `/products`, etc. remaining fully operational.

- [ ] **Step 1: Write integration tests**

Create `apps/web/src/features/storefront/StorefrontPage.test.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { StorefrontPage } from './StorefrontPage.js'

vi.mock('../../api/client.js', () => ({
  apiRequest: vi.fn((url: string) => {
    if (url.includes('/info')) {
      return Promise.resolve({
        storeName: 'Toko Zaina Test',
        address: 'Jl. Ahmad Yani',
        phone: '08123456789',
      })
    }
    if (url.includes('/catalog')) {
      return Promise.resolve({
        categories: [{ id: 'cat-1', name: 'Sembako', color: '#16a34a', isActive: true }],
        products: [
          {
            id: 'prod-1',
            name: 'Gula Pasir 1kg',
            categoryId: 'cat-1',
            categoryName: 'Sembako',
            categoryColor: '#16a34a',
            baseUnit: 'bungkus',
            imageUrl: null,
            stockStatus: 'OK',
            units: [
              { id: 'unit-1', name: 'bungkus', factor: 1, salePrice: 17_000, isDefault: true },
            ],
          },
        ],
      })
    }
    return Promise.reject(new Error('Unknown url'))
  }),
}))

describe('StorefrontPage', () => {
  it('renders store header and products from catalog query', async () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StorefrontPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Toko Zaina Test')).toBeInTheDocument()
    expect(await screen.findByText('Gula Pasir 1kg')).toBeInTheDocument()
    expect(screen.getByText('Rp 17.000')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm.cmd --filter @zaina/web test src/features/storefront/StorefrontPage.test.tsx`
Expected: PASS.

- [ ] **Step 3: Update `App.tsx` routing**

In `apps/web/src/app/App.tsx`:
- Import `StorefrontPage`:
```tsx
import { StorefrontPage } from '../features/storefront/StorefrontPage.js'
```
- In `RoutedApp`:
When unauthenticated (`!session.data`):
```tsx
    return (
      <Routes>
        <Route path="/" element={<StorefrontPage />} />
        <Route path="/etalase" element={<StorefrontPage />} />
        <Route
          path="/login"
          element={
            <LoginPage
              onAuthenticated={(user) => {
                cache.setQueryData(['session'], user)
                setReauthRequired(false)
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
```
When authenticated (`session.data`):
Provide both `/` (with staff controls) and backoffice routes:
```tsx
      <Routes>
        <Route
          element={
            <AppShell
              user={session.data}
              storeSettings={storeSettings.data ?? defaultStoreSettings}
              onLoggedOut={() => cache.setQueryData(['session'], undefined)}
            />
          }
        >
          <Route path="/" element={<StorefrontPage isStaff />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/sales/:id" element={<SaleReceipt />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
```

- [ ] **Step 4: Update `AppShell.tsx` navigation**

In `apps/web/src/app/AppShell.tsx`:
Ensure navigation links point to `/dashboard` for Dashboard, and add quick link to `/` for Etalase:
```tsx
const navigation = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/products', label: 'Barang', icon: PackageSearch },
  { to: '/sales/new', label: 'Jual', icon: ShoppingBasket, featured: true },
  { to: '/inventory', label: 'Stok', icon: Boxes },
  { to: '/reports', label: 'Laporan', icon: BarChart3, desktopOnly: true },
  { to: '/settings', label: 'Pengaturan', mobileLabel: 'Lainnya', icon: MoreHorizontal },
]
```

- [ ] **Step 5: Run all web tests**

Run: `pnpm.cmd --filter @zaina/web test`
Expected: PASS (all suites passing).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/App.tsx apps/web/src/app/AppShell.tsx apps/web/src/features/storefront/StorefrontPage.test.tsx
git commit -m "feat(web): wire public storefront route at root and preserve authenticated app routes"
```

---

### Task 6: Full Verification, Build & Deployment

**Files:** None (testing & deployment verification)

- [ ] **Step 1: Run comprehensive tests across monorepo**

Run: `pnpm.cmd test`
Expected: PASS for shared, api, and web packages.

- [ ] **Step 2: Build monorepo**

Run: `pnpm.cmd build`
Expected: Clean build of `@zaina/shared`, `@zaina/web`, and `@zaina/api` (`_worker.js`).

- [ ] **Step 3: Deploy to Cloudflare Pages**

Run:
```powershell
$env:CLOUDFLARE_API_TOKEN="$env:CLOUDFLARE_API_TOKEN"; $env:CLOUDFLARE_ACCOUNT_ID="$env:CLOUDFLARE_ACCOUNT_ID"; npx.cmd wrangler pages deploy apps/web/dist --project-name zaina-shop --branch development
```
Expected: Successful deployment to `https://zaina-shop.pages.dev`.

- [ ] **Step 4: Push to origin development**

Run: `git push origin development`
Expected: Remote branch up to date.
