# Hono API Boilerplate

A beginner-friendly REST API starter built with [Hono](https://hono.dev) and TypeScript, designed to run on **Cloudflare Workers**.

**What's included:**
- JWT authentication (register + login)
- Role-based access control (admin / user)
- Request validation with Zod
- In-memory data store (works out of the box — swap for Cloudflare D1 when ready)
- Pagination, error handling, and security headers

> **Infrastructure rule:** This project uses **Cloudflare services only**. No other cloud providers or RDBMS databases. See [`CLAUDE.md`](CLAUDE.md) for the full list of allowed services and architecture decisions.

---

## Quick Start (local dev)

```bash
# 1. Install dependencies
bun install

# 2. Copy the environment file
cp .env.example .env

# 3. Start the dev server (hot reload)
bun dev
```

The server starts at **http://localhost:3000**

> Data lives in memory during local dev — it resets when the server restarts. This is normal. Move to [Cloudflare D1](#connecting-cloudflare-d1) when you need persistence.

**Alternative — run with Workers emulation (tests bindings locally):**
```bash
wrangler dev
```

---

## Project Structure

```
src/
├── index.ts              # App entry point — middleware, routes, error handling
├── store.ts              # In-memory data store (replace with D1 for persistence)
├── types/
│   └── index.ts          # Shared TypeScript types + Cloudflare binding declarations
├── middleware/
│   └── auth.ts           # JWT auth middleware + role guard
├── validators/
│   └── schemas.ts        # Zod schemas + reusable validator helpers
└── routes/
    ├── auth.ts           # POST /auth/register, POST /auth/login
    ├── users.ts          # CRUD for /users
    └── posts.ts          # CRUD for /posts

CLAUDE.md                 # Rules and architecture guide for AI assistants
wrangler.jsonc            # Cloudflare Workers config (fill in placeholders)
```

---

## Environment Variables

**Local dev** — copy `.env.example` to `.env`:

| Variable         | Description                             | Default                  |
|------------------|-----------------------------------------|--------------------------|
| `PORT`           | Port the server listens on (Bun only)   | `3000`                   |
| `JWT_SECRET`     | Secret used to sign/verify JWT tokens   | `secret` (**change this**) |
| `ALLOWED_ORIGIN` | CORS allowed origin                     | `http://localhost:5173`  |

**Production** — use Wrangler secrets instead of `.env`:
```bash
wrangler secret put JWT_SECRET
wrangler secret put ALLOWED_ORIGIN
```

Secrets set this way are encrypted and injected as `c.env.JWT_SECRET` at runtime. Never put production secrets in `wrangler.jsonc`.

---

## Deploying to Cloudflare Workers

### 1. Install Wrangler
```bash
bun add -g wrangler     # or: npm install -g wrangler
wrangler login
```

### 2. Fill in `wrangler.jsonc`

The repo includes a `wrangler.jsonc` template. Open it and replace the `<placeholder>` values:

```jsonc
{
  "name": "my-app",
  "main": "src/index.ts",
  "compatibility_date": "2024-11-01",
  "observability": { "enabled": true }
}
```

Uncomment the D1 / KV / R2 / Queues blocks as you add services.

### 3. Set secrets
```bash
wrangler secret put JWT_SECRET
wrangler secret put ALLOWED_ORIGIN
```

### 4. Deploy
```bash
wrangler deploy
```

Your API is now live at `https://my-app.<your-subdomain>.workers.dev`.

**Other useful commands:**
```bash
wrangler dev        # local Workers emulation (supports bindings like D1/KV)
wrangler tail       # stream live production logs
wrangler secret list
```

---

## Cloudflare Services

All resources in this project must use Cloudflare services. Here is what to reach for:

| Need | Service | Notes |
|------|---------|-------|
| Database | **D1** | SQLite at the edge — see below |
| Cache / sessions | **KV** | Key-value store, global replication |
| File storage | **R2** | Object storage, S3-compatible |
| Background jobs | **Queues** | Producer/consumer message queue |
| Secrets | **Workers Secrets** | `wrangler secret put NAME` |

---

## Connecting Cloudflare D1

D1 is the database for this project — SQLite that runs at the edge, no connection pools needed.

```bash
# 1. Create the database
wrangler d1 create my-app-db

# 2. Uncomment the D1 block in wrangler.jsonc
```
```toml
[[d1_databases]]
binding        = "DB"
database_name  = "my-app-db"
database_id    = "<id printed by step 1>"
migrations_dir = "migrations"
```
```bash
# 3. Write your schema
mkdir migrations
# create migrations/0001_init.sql with your CREATE TABLE statements

# 4. Apply locally first, then to production
wrangler d1 migrations apply my-app-db --local
wrangler d1 migrations apply my-app-db --remote
```

Add `DB: D1Database` to `Bindings` in `src/types/index.ts`, then replace the in-memory store calls with D1 queries:

```ts
// Before (in-memory store)
const post = posts.find((p) => p.id === id);

// After (D1)
const post = await c.env.DB
  .prepare("SELECT * FROM posts WHERE id = ?")
  .bind(id)
  .first();
```

---

## API Reference

### Health

| Method | Path      | Auth | Description        |
|--------|-----------|------|--------------------|
| GET    | `/`       | No   | Basic status check |
| GET    | `/health` | No   | Uptime + timestamp |

---

### Auth

| Method | Path             | Auth | Description                   |
|--------|------------------|------|-------------------------------|
| POST   | `/auth/register` | No   | Create account, returns token |
| POST   | `/auth/login`    | No   | Sign in, returns token        |

**Register** — `POST /auth/register`
```json
{ "name": "Jane Doe", "email": "jane@example.com", "password": "mypassword" }
```

**Login** — `POST /auth/login`
```json
{ "email": "admin@example.com", "password": "password123" }
```
Returns a `token` — pass it in subsequent requests as `Authorization: Bearer <token>`.

---

### Users

| Method | Path         | Auth         | Description             |
|--------|--------------|--------------|-------------------------|
| GET    | `/users`     | No           | List users (paginated)  |
| GET    | `/users/:id` | No           | Get one user            |
| PUT    | `/users/:id` | Bearer token | Update your own profile |
| DELETE | `/users/:id` | Admin only   | Delete a user           |

**Pagination** — append `?page=1&limit=10` to any list endpoint.

---

### Posts

| Method | Path         | Auth         | Description             |
|--------|--------------|--------------|-------------------------|
| GET    | `/posts`     | No           | List posts (paginated)  |
| GET    | `/posts/:id` | No           | Get one post            |
| POST   | `/posts`     | Bearer token | Create a post           |
| PUT    | `/posts/:id` | Bearer token | Edit your own post      |
| DELETE | `/posts/:id` | Bearer token | Delete your own post    |

**Create post** — `POST /posts`
```json
{ "title": "My First Post", "body": "Hello from Hono!" }
```

---

## Trying it out with curl

```bash
# 1. Login and capture the token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 2. Create a post
curl -X POST http://localhost:3000/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Hello Hono","body":"My first post via the API!"}'

# 3. List all posts
curl http://localhost:3000/posts
```

---

## Adding Your Own Resource

1. Add the TypeScript type to `src/types/index.ts`
2. Add an array to `src/store.ts` for local dev (or write D1 queries directly)
3. Add Zod schemas in `src/validators/schemas.ts`
4. Create `src/routes/yourresource.ts` — use `src/routes/posts.ts` as the pattern
5. Register the route in `src/index.ts`:
   ```ts
   import { widgetRoutes } from "./routes/widgets";
   app.route("/widgets", widgetRoutes);
   ```
