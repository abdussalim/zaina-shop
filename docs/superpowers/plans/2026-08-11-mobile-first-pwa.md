# Mobile-First PWA Toko Zaina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Rewrite the Toko Zaina frontend from a 320 px mobile foundation, preserve the existing API and pricing/inventory behavior, and ship an installable PWA with honest read-only catalog and stock snapshots while offline.

**Architecture:** Keep the Express API, database, routes, and domain contracts unchanged. Replace the React/Vite presentation layer with app, pwa, features, components/ui, and lib boundaries; use an IndexedDB snapshot adapter for sanitized catalog/stock data, a service worker for the static app shell, and a connectivity context that disables all server writes while offline. Route-level lazy loading keeps the shell and login out of report/chart bundles.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, React Testing Library, React Hook Form, Zod, Express API, vite-plugin-pwa, Workbox injectManifest, IndexedDB, Playwright, CSS custom properties.

## Global Constraints

- The frontend rewrite stays under apps/web and preserves /login, /, /products, /products/:id, /sales/new, /sales/:id, /inventory, /reports, and /settings.
- The server remains authoritative for cost price, sale price, minimum and maximum discount, unit factors, stock balances, and every mutation.
- Offline business data is limited to a versioned, namespaced catalog and latest stock snapshot with updatedAt; no credentials, cookies, tokens, auth responses, account data, reports, receipts, or write responses may be persisted.
- Logout, session expiry, account/store change, malformed snapshot, or migration failure clears local business data; no offline write queue or optimistic stock update is allowed.
- CSS starts at 320 px and enhances only with min-width breakpoints 481 px, 769 px, and 1025 px; no desktop-first max-width layout rules.
- Every button, link, input, select, and quantity control has a minimum 48 x 48 px interactive box with visible focus and keyboard support.
- The main acceptance viewports are 320, 360, 430, 768, 1024, and 1366 px; the layout must never scroll horizontally.
- Bundle gates are initial JavaScript below 100 KB gzip, total page below 500 KB, and FCP below 3 seconds on a mobile 3G profile.
- Every task follows test-first order: add a failing test, run the focused test to observe failure, implement the smallest behavior, run the focused and related suite, then commit the task.
- Do not deploy or push production. Keep the existing frontend available as a parity reference until all route and PWA acceptance gates pass.

---

### Task 1: Add a repeatable frontend bundle budget gate

**Files:**
- Create: scripts/check-web-budget.mjs
- Create: scripts/check-web-budget.test.mjs
- Modify: apps/web/package.json
- Modify: apps/web/vite.config.ts
- Modify: package.json
- Modify: package-lock.json

**Interfaces:**
- Produce checkBudget({ distDir, maxInitialJsGzipBytes, maxPageBytes }): Promise<{ initialJsGzipBytes, pageBytes, assets }>.
- The checker reads dist/index.html modulepreload and script src references, gzips the referenced JavaScript, sums unique initial assets, and throws an actionable error when the initial-JS or total-page threshold is exceeded.

- [ ] Step 1: Write a failing test for a temporary dist directory containing index.html, one script, one modulepreload, and a large asset; assert the returned byte counts and that both over-budget cases throw the named error.
- [ ] Step 2: Run npm.cmd test --workspace @zaina/web -- scripts/check-web-budget.test.mjs and verify the checker import fails because the module does not exist.
- [ ] Step 3: Implement check-web-budget.mjs with deterministic path resolution, gzipSync for JavaScript, byte counting for every file under dist, deduplication of modulepreload and script references, and CLI output naming the exceeded threshold and files.
- [ ] Step 4: Add scripts budget:web and budget:web:check to the root and web package, run the checker against a production build, and keep vite output split by route without preloading reports.
- [ ] Step 5: Run the focused test, web build, and budget command; commit as perf: enforce mobile bundle budgets.

### Task 2: Build the typed IndexedDB snapshot and connectivity layer

**Files:**
- Create: apps/web/src/pwa/types.ts
- Create: apps/web/src/pwa/snapshotPolicy.ts
- Create: apps/web/src/pwa/snapshotStore.ts
- Create: apps/web/src/pwa/snapshotStore.test.ts
- Create: apps/web/src/pwa/connectivity.ts
- Create: apps/web/src/pwa/connectivity.test.ts
- Modify: apps/web/src/test/setup.ts
- Modify: apps/web/package.json
- Modify: package-lock.json

**Interfaces:**
- SNAPSHOT_VERSION is the literal number 1.
- OfflineProduct contains id, sku, name, category, location, baseUnit, salePrice, minimumDiscountPercent, maximumDiscountPercent, minimumStock, balance, stockStatus, and units; it must not contain costPrice or arbitrary API fields.
- InventorySnapshot is { version: 1, storeKey: string, updatedAt: string, products: OfflineProduct[] }.
- SnapshotStore exposes read(storeKey): Promise<InventorySnapshot | null>, write(snapshot): Promise<void>, clear(storeKey): Promise<void>, and clearAll(): Promise<void>.
- sanitizeProduct(product): OfflineProduct, createSnapshot(storeKey, products, updatedAt?): InventorySnapshot, and createIndexedDbSnapshotStore(dbName?): SnapshotStore are exported.
- ConnectivityStatus is online, offline, or checking; createConnectivityController accepts window-like event targets and a probe returning Promise<boolean>, and exposes getStatus, subscribe, refresh, and dispose.

- [ ] Step 1: Write tests proving sanitizer strips cost price and unknown fields, keeps sale/discount/unit/stock fields, rejects invalid IDs, snapshots include version/storeKey/ISO updatedAt, IndexedDB round trips and replaces atomically, malformed rows are ignored, and clear removes only the requested store.
- [ ] Step 2: Write connectivity tests for initial navigator state, online/offline events, failed and successful reconnect probe, unsubscribe, and stale timestamp metadata.
- [ ] Step 3: Run the two focused test files and confirm imports or required fake IndexedDB setup fail.
- [ ] Step 4: Add fake-indexeddb to dev dependencies and implement the typed policy, object store keyed by storeKey, schema validation, transaction replacement, and connectivity event/probe controller.
- [ ] Step 5: Run snapshot/connectivity tests plus existing price and API type tests; commit as feat: add safe offline snapshot primitives.

### Task 3: Add the installable PWA shell, service worker, and lifecycle prompts

**Files:**
- Create: apps/web/src/pwa/sw.ts
- Create: apps/web/src/pwa/register.ts
- Create: apps/web/src/pwa/register.test.ts
- Create: apps/web/src/pwa/InstallPrompt.tsx
- Create: apps/web/src/pwa/InstallPrompt.test.tsx
- Create: apps/web/src/pwa/UpdatePrompt.tsx
- Create: apps/web/public/icons/icon.svg
- Create: apps/web/public/icons/maskable-icon.svg
- Modify: apps/web/vite.config.ts
- Modify: apps/web/package.json
- Modify: package-lock.json

**Interfaces:**
- The Vite plugin uses injectManifest and emits manifest.webmanifest plus a service worker from src/pwa/sw.ts.
- The manifest has name and short_name Toko Zaina, Indonesian lang, standalone display, start_url /, theme/background colors, and regular/maskable icons.
- The service worker precaches build assets and navigation shell routes only; API requests are network-only and never queued or cached.
- registerServiceWorker(): Promise<ServiceWorkerRegistration | undefined> is safe in tests and non-production.
- InstallPrompt and UpdatePrompt accept explicit lifecycle callbacks, are keyboard accessible, and never force a reload during active transaction UI.

- [ ] Step 1: Write registration and prompt tests for unsupported browsers, deferred install after a user gesture, update-defer, and user-selected reload.
- [ ] Step 2: Run focused PWA tests and verify the new modules are missing.
- [ ] Step 3: Implement vite-plugin-pwa injectManifest configuration, a minimal precache/navigation service worker, registration helper, and prompts with Indonesian copy and aria-live status.
- [ ] Step 4: Create simple vector icons with regular and maskable safe areas and add manifest metadata to index.html.
- [ ] Step 5: Run focused tests and production build; assert dist/manifest.webmanifest, dist/sw.js, and both icon assets exist, then commit as feat: add installable PWA shell.

### Task 4: Rewrite the CSS foundation mobile-first

**Files:**
- Create: apps/web/src/styles/mobile-css.contract.test.ts
- Modify: apps/web/src/styles/tokens.css
- Modify: apps/web/src/styles/global.css
- Modify: apps/web/src/styles/features.css
- Modify: apps/web/index.html

**Interfaces:**
- Base declarations target 320--480 px; larger layouts are introduced only through min-width 481, 769, and 1025 media blocks.
- Shared classes include app-shell, app-header, app-main, app-bottom-nav, app-sidebar, page-grid, card-grid, data-card, data-table, bottom-sheet, dialog, offline-banner, and focus-visible behavior.
- CSS exposes safe-area variables, reduced-motion behavior, 48px control sizing, readable rem/clamp typography, and no overflow-x at the root.

- [ ] Step 1: Add a contract test that reads the three CSS files and asserts the breakpoint order, absence of non-print max-width media queries, 48px minimum control rules, safe-area variables, focus-visible, and reduced-motion declarations.
- [ ] Step 2: Run the contract test and record failure against the current desktop-first CSS.
- [ ] Step 3: Rewrite tokens, global layout, and feature styles mobile-first: sticky compact header, bottom nav, cards instead of tables, bottom sheets on mobile, safe-area padding, 8px spacing rhythm, and progressive sidebar/two-column/table enhancements.
- [ ] Step 4: Update viewport/theme/apple metadata and Indonesian title in index.html.
- [ ] Step 5: Run CSS contract, component tests, and build at 320 px through browser smoke; commit as style: establish mobile-first responsive foundation.

### Task 5: Connect session, API, and shell state to real connectivity

**Files:**
- Create: apps/web/src/app/ConnectivityContext.tsx
- Create: apps/web/src/app/OfflineBanner.tsx
- Create: apps/web/src/app/OfflineBoundary.tsx
- Create: apps/web/src/app/ConnectivityContext.test.tsx
- Modify: apps/web/src/app/App.tsx
- Modify: apps/web/src/app/AppShell.tsx
- Modify: apps/web/src/app/AppShell.test.tsx
- Modify: apps/web/src/api/client.ts

**Interfaces:**
- ConnectivityContextValue is { status: ConnectivityStatus, isOffline: boolean, canWrite: boolean, lastSnapshotAt: string | null, refreshSnapshot(): Promise<void>, clearSnapshot(): Promise<void> }.
- AppShell renders a sticky header, session-aware content, mobile bottom nav for Dashboard/Barang/Jual/Stok/Lainnya, and desktop sidebar from 769 px upward.
- OfflineBoundary takes allowOffline: boolean and renders an honest offline state for disallowed screens.
- API 401 handling invokes the session-expired callback without clearing active form or cart until re-authentication resolves; logout and expiry call SnapshotStore.clearAll.

- [ ] Step 1: Add tests for provider status transitions, offline banner stale timestamp, five mobile navigation destinations, settings under Lainnya, and 401 preserving a draft.
- [ ] Step 2: Run focused app tests and verify the new context/boundary behavior fails.
- [ ] Step 3: Implement the context around createConnectivityController and the snapshot store, explicit session expiry clearing, and API helpers that expose request IDs and typed errors.
- [ ] Step 4: Rewrite AppShell and route composition so routes are lazy loaded, offline boundaries are explicit, and service-worker registration is mounted once.
- [ ] Step 5: Run app tests, typecheck, and build; commit as feat: connect shell to offline state.

### Task 6: Replace shared UI primitives with accessible touch-first components

**Files:**
- Create: apps/web/src/components/ui/Primitives.test.tsx
- Modify: apps/web/src/components/ui/Button.tsx
- Modify: apps/web/src/components/ui/Field.tsx
- Modify: apps/web/src/components/ui/Modal.tsx
- Modify: apps/web/src/components/ui/PageHeader.tsx
- Modify: apps/web/src/components/ui/States.tsx
- Modify: apps/web/src/components/ui/StatusBadge.tsx

**Interfaces:**
- Preserve existing public props and React Hook Form ref compatibility for Button, Field, Modal, PageHeader, States, and StatusBadge.
- Button supports loading and disabled reasons without shrinking below 48px.
- Field connects label, input, hint, and error through id and aria-describedby.
- Modal renders a mobile bottom sheet and a desktop dialog with focus trap, escape handling, and labelled title.
- States exposes loading, empty, error, and offline variants with actionable text.

- [ ] Step 1: Add component tests for 48px bounds, keyboard activation, label/error association, modal focus/escape, loading/disabled reason, and all state variants.
- [ ] Step 2: Run the focused component test and verify the old primitives fail at least the touch and aria assertions.
- [ ] Step 3: Implement the primitives using semantic elements, forwardRef where existing callers require it, CSS classes from Task 4, and Indonesian copy.
- [ ] Step 4: Run focused tests and the complete web unit suite; commit as feat: refresh accessible touch primitives.

### Task 7: Rewrite login and dashboard without stale finance offline data

**Files:**
- Modify: apps/web/src/features/auth/LoginPage.tsx
- Modify: apps/web/src/features/auth/LoginPage.test.tsx
- Modify: apps/web/src/features/auth/SessionReauthDialog.tsx
- Modify: apps/web/src/features/dashboard/DashboardPage.tsx
- Modify: apps/web/src/features/dashboard/DashboardPage.test.tsx

**Interfaces:**
- Login remains online-only and does not persist credentials or auth responses.
- Re-authentication preserves the supplied draft form/cart callback on 401 and returns the session result to the caller.
- Dashboard can show live summary online and only catalog/stock cards offline; financial/revenue cards show the disallowed offline state.

- [ ] Step 1: Add tests for 320 px form flow, field errors, session re-auth draft preservation, loading/error states, and dashboard offline card policy.
- [ ] Step 2: Run auth/dashboard tests and capture failures for the new responsive and offline behavior.
- [ ] Step 3: Implement mobile-first login, accessible re-auth dialog, and dashboard cards using the connectivity context; remove any offline financial fallback.
- [ ] Step 4: Run auth/dashboard tests, typecheck, and a production build; commit as feat: modernize auth and dashboard flows.

### Task 8: Rewrite catalog and inventory with read-only offline snapshots

**Files:**
- Modify: apps/web/src/features/products/ProductsPage.tsx
- Modify: apps/web/src/features/products/ProductDetailPage.tsx
- Modify: apps/web/src/features/products/ProductForm.tsx
- Modify: apps/web/src/features/products/ProductForm.test.tsx
- Modify: apps/web/src/features/inventory/InventoryPage.tsx
- Modify: apps/web/src/features/inventory/MovementForm.tsx
- Modify: apps/web/src/features/inventory/MovementForm.test.tsx
- Create: apps/web/src/features/products/ProductsOffline.test.tsx

**Interfaces:**
- Product cards and inventory cards consume API data online or OfflineProduct snapshots offline, always displaying updatedAt and stale labeling when offline.
- ProductForm preserves costPrice, salePrice, minimumDiscountPercent, maximumDiscountPercent, unit factors, and server validation; it is disabled when canWrite is false.
- MovementForm and inventory mutations are network-only, preserve drafts on reconnect/401, and never update balances optimistically.

- [ ] Step 1: Add offline catalog/stock tests proving snapshot data renders, costPrice is not persisted in snapshot, stale time is visible, and every write control is disabled with a connection-required reason.
- [ ] Step 2: Run product/inventory tests and verify offline reads and disabled writes fail.
- [ ] Step 3: Rewrite products and inventory layouts as cards at mobile widths and tables/two-column panels at larger widths, wire snapshot reads/writes, preserve search/filter and unit data, and keep server validation.
- [ ] Step 4: Run focused product/inventory tests, price calculation tests, typecheck, and build; commit as feat: add offline catalog and inventory views.

### Task 9: Rewrite sales and receipt with online-only checkout

**Files:**
- Modify: apps/web/src/features/sales/SalesPage.tsx
- Modify: apps/web/src/features/sales/SalesPage.test.tsx
- Modify: apps/web/src/features/sales/SaleReceipt.tsx
- Modify: apps/web/src/features/sales/SaleReceipt.test.tsx
- Modify: apps/web/src/api/client.ts

**Interfaces:**
- Export assertOnlineWrite(canWrite: boolean): void; it throws a typed OfflineWriteError with an Indonesian connection-required message when false.
- The sale draft/cart can remain in memory while offline, but checkout, receipt loading, and sale mutations always call assertOnlineWrite before network requests.
- Existing idempotency key, per-line discount bounds, unit factor, server totals, and receipt data behavior remain unchanged; receipts do not enter IndexedDB or Cache Storage.

- [ ] Step 1: Add tests for mobile product picker/cart, discount min/max validation, offline cart preservation, disabled checkout, assertOnlineWrite, and receipt offline state.
- [ ] Step 2: Run sales/receipt tests and observe failures for the offline guard and responsive flow.
- [ ] Step 3: Implement the typed guard, mobile cart/bottom-sheet interaction, accessible totals, server-authoritative submit, and printable receipt cards.
- [ ] Step 4: Run focused sales/receipt and existing pricing tests, typecheck, and build; commit as feat: harden online sales and receipts.

### Task 10: Rewrite reports and settings with explicit online-only boundaries

**Files:**
- Modify: apps/web/src/features/reports/ReportsPage.tsx
- Modify: apps/web/src/features/reports/ReportsPage.test.tsx
- Modify: apps/web/src/features/settings/SettingsPage.tsx
- Modify: apps/web/src/features/settings/SettingsPage.test.tsx
- Create: apps/web/src/features/reports/ReportsOffline.test.tsx

**Interfaces:**
- Reports and settings render loading, empty, error, and offline states without reading business snapshots.
- Report charts are lazy loaded after the report route is entered; no chart module is in the initial shell preload.
- Settings remains reachable from the mobile Lainnya destination and all writes are disabled offline.

- [ ] Step 1: Add tests for report offline rejection, chart lazy boundary, settings reachability, and 48px controls.
- [ ] Step 2: Run reports/settings tests and verify the offline and lazy-loading assertions fail.
- [ ] Step 3: Implement route-level lazy chart import, responsive report cards/table, settings sections, and explicit offline boundaries.
- [ ] Step 4: Run focused tests, full web tests, typecheck, and build/budget; commit as feat: finish online-only reports and settings.

### Task 11: Add browser acceptance, release documentation, and final gates

**Files:**
- Create: playwright.config.ts
- Create: apps/web/tests/pwa.spec.ts
- Create: apps/web/tests/mobile-layout.spec.ts
- Modify: package.json
- Modify: apps/web/package.json
- Modify: package-lock.json
- Modify: README.md
- Create: docs/DEPLOYMENT.md

**Interfaces:**
- Playwright starts the web dev server with npm.cmd run dev --workspace @zaina/web and uses the six viewport matrix.
- Browser tests verify no horizontal overflow and 48px controls, manifest/service worker/install prompt, online to offline to reconnect snapshot behavior, disabled writes/reports offline, and logout snapshot clearing.
- Deployment docs explain build, environment variables, HTTPS/service-worker requirement, cache limits, offline limitations, rollback, and staging-only write acceptance.

- [ ] Step 1: Add Playwright configuration and failing smoke tests for viewport overflow, manifest, and offline write policy.
- [ ] Step 2: Run the focused browser tests and verify they fail against the pre-rewrite app or missing configuration.
- [ ] Step 3: Implement the browser fixtures, route mocks using the existing API contract, and assertions for all acceptance states without writing to production data.
- [ ] Step 4: Document local install, npm ci, npm test, typecheck, lint, build, budget check, Playwright, HTTPS hosting, and staging approval gates.
- [ ] Step 5: Run npm.cmd ci, npm.cmd test, npm.cmd run typecheck, npm.cmd run lint, npm.cmd run build, npm.cmd run budget:web:check, and npm.cmd run test:e2e; inspect manifest, service worker, icons, and bundle sizes.
- [ ] Step 6: Run git diff --check, rg for forbidden cache fields and unfinished-marker text, confirm graphify-out is ignored and no secrets are staged, then commit as test: add mobile PWA acceptance gates.

## Final completion checkpoint

- [ ] Re-run all unit, component, browser, typecheck, lint, production build, bundle budget, and smoke checks from a clean install.
- [ ] Verify the viewport matrix manually or through Playwright at 320, 360, 430, 768, 1024, and 1366 px with no horizontal scroll.
- [ ] Verify offline snapshot contains only sanitized catalog/stock fields, exposes updatedAt/stale status, clears on logout/session expiry, and never intercepts API writes.
- [ ] Verify every route preserves prices, cost price, sale price, minimum discount, maximum discount, unit factors, stock ledger, sales idempotency, and server totals.
- [ ] Keep frontend replacement and any obsolete-file cleanup in separate commits for rollback; do not deploy until the owner approves staging evidence.
