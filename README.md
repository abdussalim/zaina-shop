# PROJECT_TOKO_ZAINA — E-commerce Monorepo

> Monorepo (apps/web + apps/api) dengan Docker, Playwright, dan graphify-out.

## 📁 Struktur

```
PROJECT_TOKO_ZAINA/
├── apps/
│   ├── web/                 → Frontend
│   └── api/                 → Backend API
├── packages/                → Shared packages
├── docs/                    → DB, deployment, operations, backup
├── scripts/                 → Utility scripts
├── graphify-out/            → Knowledge graph
├── compose.yaml             → Docker compose (dev)
├── compose.production.yaml  → Docker compose (prod)
└── playwright.config.ts     → E2E test config
```

## 🔗 Entry Points

- [`README.md`](README.md) — Project README
- [`docs/`](docs/) — BACKUP_RESTORE, DATABASE, DEPLOYMENT, OPERATIONS
