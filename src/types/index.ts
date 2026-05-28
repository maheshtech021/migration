// ─── App Environment ──────────────────────────────────────────────────────────
// AppEnv defines what's available in Hono's context (c.env, c.var, c.get)

export type AppEnv = {
  Variables: {
    userId: string;       // set by authMiddleware
    userRole: "admin" | "user";
  };
  Bindings: {
    JWT_SECRET: string;
    ALLOWED_ORIGIN: string;
    // DB: D1Database;       // features.d1  — uncomment in wrangler.jsonc + here
    // KV: KVNamespace;      // features.kv
    // BUCKET: R2Bucket;     // features.r2
    // QUEUE: Queue;         // features.queues
  };
};

// ─── API Response Shapes ──────────────────────────────────────────────────────

export type ApiResponse<T> = {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
};

export type ApiError = {
  success: false;
  error: string;
  details?: unknown;
};

// ─── Domain Types ─────────────────────────────────────────────────────────────

export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  createdAt: string;
};

export type Post = {
  id: string;
  title: string;
  body: string;
  authorId: string;
  createdAt: string;
};
