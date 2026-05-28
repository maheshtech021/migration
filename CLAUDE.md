# CLAUDE.md

This file is read automatically by Claude Code. It defines the non-negotiable rules and conventions for this project. Read it fully before making any suggestions.

For detailed Cloudflare service setup steps, see [`docs/cloudflare-setup.md`](docs/cloudflare-setup.md).

---

## What this project is

A Hono REST API boilerplate that teams clone as a starting template. It runs on **Cloudflare Workers** and uses **Cloudflare services exclusively** for every layer of infrastructure.

---

## Hard rules

### Infrastructure — Cloudflare only

Do **not** suggest, introduce, or reference:

| Category | Forbidden examples |
|----------|--------------------|
| Other compute platforms | Vercel, Railway, Fly.io, Render, AWS Lambda, GCP Cloud Run, Azure Functions |
| Other cloud providers | AWS, GCP, Azure, Supabase, PlanetScale, Neon, Upstash |
| RDBMS / connection-pool databases | PostgreSQL, MySQL, MariaDB, CockroachDB, and any ORM that needs a TCP connection (`pg`, `mysql2`, `@prisma/client` with a Postgres datasource, `typeorm`, `mongoose`) |

The only relational option is **Cloudflare D1** (SQLite, HTTP-based, no persistent connections).

### Code conventions

- TypeScript strict mode — no implicit `any`, no unnecessary type assertions.
- All HTTP responses must follow `{ success: true, data: ... }` or `{ success: false, error: "..." }`.
- Validation belongs in `src/validators/schemas.ts` using Zod — never inline in route handlers.
- Auth is handled by `authMiddleware` and `roleGuard` in `src/middleware/auth.ts` — do not duplicate auth logic in routes.
- Secrets go in **Wrangler secrets** in production (`wrangler secret put NAME`) — never hardcoded, never in `wrangler.jsonc`.

### Workers-specific constraints

- Do not use `node:` built-ins unavailable in Workers (`fs`, `net`, `child_process`, `cluster`). Use Web APIs or Cloudflare alternatives.
- Do not use `process.env` for bindings in production — Workers exposes them as `c.env`. `process.env` only works in Bun local dev.
- Do not suggest `npm run build` + static hosting — deploy with `wrangler deploy`.

---

## Cloudflare services — quick reference

| Need | Service | Binding type | Access in code |
|------|---------|--------------|----------------|
| Structured / relational data | **D1** (SQLite at the edge) | `D1Database` | `c.env.DB` |
| Cache / sessions / feature flags | **KV** | `KVNamespace` | `c.env.KV` |
| File / object storage | **R2** | `R2Bucket` | `c.env.BUCKET` |
| Background jobs / events | **Queues** | `Queue` | `c.env.QUEUE` |
| Stateful real-time coordination | **Durable Objects** | — | declared in wrangler.jsonc |
| AI inference | **Workers AI** | `Ai` | `c.env.AI` |
| Runtime secrets | **Workers Secrets** | `string` | `c.env.JWT_SECRET` |

Add new bindings to `Bindings` in `src/types/index.ts` and declare them in `wrangler.jsonc` (uncomment the relevant binding block).

---

## AppEnv pattern

Cloudflare bindings are typed in `src/types/index.ts`. Extend `Bindings` as you add services:

```ts
export type AppEnv = {
  Variables: {
    userId: string;
    userRole: "admin" | "user";
  };
  Bindings: {
    DB: D1Database;         // Cloudflare D1
    KV: KVNamespace;        // Cloudflare KV
    BUCKET: R2Bucket;       // Cloudflare R2
    QUEUE: Queue;           // Cloudflare Queues
    JWT_SECRET: string;     // Workers Secret
    ALLOWED_ORIGIN: string;
  };
};
```

---

## Runtime environments

| Command | Runtime | Purpose |
|---------|---------|---------|
| `bun dev` | Bun (local) | Fast local dev — no binding emulation |
| `wrangler dev` | Miniflare (local) | Test with real D1 / KV / R2 bindings locally |
| `wrangler deploy` | Cloudflare Workers | Production deployment |

---

## Adding a new resource (checklist)

1. Add TypeScript type → `src/types/index.ts`
2. Add Zod schema → `src/validators/schemas.ts`
3. Create route file → `src/routes/<resource>.ts` (use `posts.ts` as the pattern)
4. Register route → `src/index.ts`: `app.route("/<resource>", <resource>Routes)`
5. Add in-memory array → `src/store.ts` for local dev, or write D1 queries directly

For detailed service setup (D1 migrations, KV namespaces, R2 buckets, Queues), see [`docs/cloudflare-setup.md`](docs/cloudflare-setup.md).
