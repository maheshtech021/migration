# Cloudflare Service Setup Guides

Step-by-step instructions for connecting each Cloudflare service to this project.
All commands assume you are logged in (`wrangler login`) and are run from the project root.

---

## D1 Database

D1 is Cloudflare's SQLite-at-the-edge database. No connection pools, no persistent TCP connections — queries go over HTTP.

```bash
# 1. Create the database
wrangler d1 create <your-database-name>
# Copy the database_id printed in the output
```

**Uncomment in `wrangler.jsonc`** (the D1 block):
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "<your-database-name>",
    "database_id": "<paste id from step above>",
    "migrations_dir": "migrations"
  }
],
```

**Add to `src/types/index.ts`** under `Bindings`:
```ts
DB: D1Database;
```

```bash
# 2. Create a migrations folder and write your schema
mkdir migrations
```

Example `migrations/0001_init.sql`:
```sql
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  author_id  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (author_id) REFERENCES users(id)
);
```

```bash
# 3. Apply locally (creates a local SQLite file for wrangler dev)
wrangler d1 migrations apply <your-database-name> --local

# 4. Apply to production
wrangler d1 migrations apply <your-database-name> --remote
```

**Query patterns in route handlers:**
```ts
// SELECT one row
const post = await c.env.DB
  .prepare("SELECT * FROM posts WHERE id = ?")
  .bind(id)
  .first();

// SELECT multiple rows (with pagination)
const { results } = await c.env.DB
  .prepare("SELECT * FROM posts LIMIT ? OFFSET ?")
  .bind(limit, (page - 1) * limit)
  .all();

// INSERT
await c.env.DB
  .prepare("INSERT INTO posts (id, title, body, author_id, created_at) VALUES (?, ?, ?, ?, ?)")
  .bind(crypto.randomUUID(), title, body, authorId, new Date().toISOString())
  .run();

// UPDATE
await c.env.DB
  .prepare("UPDATE posts SET title = ?, body = ? WHERE id = ?")
  .bind(title, body, id)
  .run();

// DELETE
await c.env.DB
  .prepare("DELETE FROM posts WHERE id = ?")
  .bind(id)
  .run();
```

> Tip: You can also use [Drizzle ORM](https://orm.drizzle.team/docs/get-started-cloudflare-d1) with the D1 adapter for a type-safe query builder.

---

## KV Namespace

KV is a global key-value store suited for caching, sessions, feature flags, and rate-limit counters.

```bash
# Create namespaces (you need separate ones for prod and local preview)
wrangler kv namespace create KV
wrangler kv namespace create KV --preview
# Copy both IDs printed in the output
```

**Uncomment in `wrangler.jsonc`** (the KV block):
```jsonc
"kv_namespaces": [
  {
    "binding": "KV",
    "id": "<prod namespace id>",
    "preview_id": "<preview namespace id>"
  }
],
```

**Add to `src/types/index.ts`** under `Bindings`:
```ts
KV: KVNamespace;
```

**Usage in route handlers:**
```ts
// Write (with optional TTL in seconds)
await c.env.KV.put("session:" + userId, JSON.stringify(payload), { expirationTtl: 3600 });

// Read
const raw = await c.env.KV.get("session:" + userId);
const data = raw ? JSON.parse(raw) : null;

// Read with automatic JSON parsing
const data = await c.env.KV.get("session:" + userId, "json");

// Delete
await c.env.KV.delete("session:" + userId);

// List keys with a prefix
const { keys } = await c.env.KV.list({ prefix: "session:" });
```

---

## R2 Object Storage

R2 is Cloudflare's S3-compatible object storage. Use it for file uploads, generated assets, and any binary data.

```bash
# Create a bucket
wrangler r2 bucket create <your-bucket-name>
```

**Uncomment in `wrangler.jsonc`** (the R2 block):
```jsonc
"r2_buckets": [
  {
    "binding": "BUCKET",
    "bucket_name": "<your-bucket-name>"
  }
],
```

**Add to `src/types/index.ts`** under `Bindings`:
```ts
BUCKET: R2Bucket;
```

**Usage in route handlers:**
```ts
// Upload (body can be ArrayBuffer, ReadableStream, string, or Blob)
await c.env.BUCKET.put("uploads/" + filename, await c.req.arrayBuffer(), {
  httpMetadata: { contentType: c.req.header("Content-Type") },
});

// Download
const object = await c.env.BUCKET.get("uploads/" + filename);
if (!object) throw new HTTPException(404, { message: "File not found" });
return new Response(object.body, {
  headers: { "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream" },
});

// Delete
await c.env.BUCKET.delete("uploads/" + filename);

// List objects in a folder
const { objects } = await c.env.BUCKET.list({ prefix: "uploads/" });
```

---

## Queues

Queues let you offload work to a background consumer. The producer sends messages; a separate consumer Worker processes them asynchronously.

```bash
# Create a queue
wrangler queues create <your-queue-name>
```

**Uncomment in `wrangler.jsonc`** (the Queues block):
```jsonc
"queues": {
  // Producer — sends messages from your API
  "producers": [
    {
      "binding": "QUEUE",
      "queue": "<your-queue-name>"
    }
  ],
  // Consumer — processes messages (can be the same Worker)
  "consumers": [
    {
      "queue": "<your-queue-name>",
      "max_batch_size": 10,
      "max_batch_timeout": 5
    }
  ]
}
```

**Add to `src/types/index.ts`** under `Bindings`:
```ts
QUEUE: Queue;
```

**Sending a message (in a route handler):**
```ts
await c.env.QUEUE.send({ type: "send-email", userId, template: "welcome" });
```

**Processing messages (add a queue handler to `src/index.ts`):**
```ts
export default {
  port: process.env.PORT ?? 3000,
  fetch: app.fetch,

  // Cloudflare Queues consumer
  async queue(batch: MessageBatch, env: AppEnv["Bindings"]) {
    for (const msg of batch.messages) {
      const { type, userId } = msg.body as { type: string; userId: string };
      if (type === "send-email") {
        // handle the message
        msg.ack(); // acknowledge so it won't be retried
      }
    }
  },
};
```

---

## Workers Secrets

Secrets are encrypted environment variables. They appear as plain strings in `c.env` at runtime but are never visible in source control or the dashboard after being set.

```bash
# Set a secret (you'll be prompted to type the value)
wrangler secret put JWT_SECRET
wrangler secret put ALLOWED_ORIGIN

# List all secrets for the Worker
wrangler secret list

# Delete a secret
wrangler secret delete JWT_SECRET
```

**In code**, access them exactly like any other binding:
```ts
const secret = c.env.JWT_SECRET;
```

**In `src/types/index.ts`**, declare them as `string` under `Bindings`:
```ts
JWT_SECRET: string;
ALLOWED_ORIGIN: string;
```

> Local dev: secrets fall back to `process.env` when running with `bun dev`. Set them in `.env`. When running `wrangler dev`, use a `.dev.vars` file instead (same format as `.env`, loaded automatically by Wrangler).

---

## Deployment commands

```bash
wrangler deploy          # deploy to production
wrangler dev             # run locally with binding emulation
wrangler tail            # stream live logs from production
wrangler d1 migrations apply <db> --remote   # run pending DB migrations
wrangler secret list     # verify secrets are set
```
