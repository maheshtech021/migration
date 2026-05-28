// ─── In-Memory Data Store ────────────────────────────────────────────────────
//
// This file acts as a simple "database" that lives in memory.
// All data resets when you restart the server — that's fine for learning!
//
// When you're ready to use a real database, replace the arrays below with
// actual DB calls (e.g. Prisma, Drizzle, or plain SQL). The route logic
// won't need to change much — just swap the store functions.

import type { User, Post } from "./types";

// ─── User Store ───────────────────────────────────────────────────────────────
// We extend the public User type to also hold the hashed/plain password.
// In production you'd hash with bcrypt — we keep it plain here for clarity.

export type StoredUser = User & { password: string };

export const users: StoredUser[] = [
  {
    id: "user_001",
    name: "Alice Admin",
    email: "admin@example.com",
    // ⚠️  NEVER store plain-text passwords in production!
    // Use: const hashed = await bcrypt.hash(password, 10)
    password: "password123",
    role: "admin",
    createdAt: new Date().toISOString(),
  },
  {
    id: "user_002",
    name: "Bob User",
    email: "bob@example.com",
    password: "password123",
    role: "user",
    createdAt: new Date().toISOString(),
  },
];

// ─── Post Store ───────────────────────────────────────────────────────────────

export const posts: Post[] = [
  {
    id: "post_001",
    title: "Welcome to Hono!",
    body: "Hono is a lightweight, ultra-fast web framework that runs on Bun, Node, Cloudflare Workers, and more.",
    authorId: "user_001",
    createdAt: new Date().toISOString(),
  },
  {
    id: "post_002",
    title: "Building REST APIs with Hono",
    body: "In this post we explore routing, middleware, validation with Zod, and JWT authentication — all built into this boilerplate.",
    authorId: "user_002",
    createdAt: new Date().toISOString(),
  },
];
