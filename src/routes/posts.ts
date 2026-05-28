import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authMiddleware } from "../middleware/auth";
import { validateBody, validateQuery, createPostSchema, paginationSchema } from "../validators/schemas";
import { posts } from "../store";
import type { AppEnv } from "../types";

export const postRoutes = new Hono<AppEnv>();

// ─── GET /posts ────────────────────────────────────────────────────────────────
// Public: list all posts with pagination.
// Try: GET /posts          → first page, 10 results
//      GET /posts?page=2&limit=5

postRoutes.get("/", validateQuery(paginationSchema), async (c) => {
  const { page, limit } = c.req.valid("query");

  const start = (page - 1) * limit;
  const paginated = posts.slice(start, start + limit);

  return c.json({
    success: true,
    data: paginated,
    meta: { page, limit, total: posts.length },
  });
});

// ─── GET /posts/:id ────────────────────────────────────────────────────────────
// Public: get a single post by ID.
// Try: GET /posts/post_001

postRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const post = posts.find((p) => p.id === id);
  if (!post) {
    throw new HTTPException(404, { message: `Post with id "${id}" not found` });
  }

  return c.json({ success: true, data: post });
});

// ─── POST /posts ───────────────────────────────────────────────────────────────
// Protected: create a new post.
// Requires: Authorization: Bearer <token>
// Body: { title, body }

postRoutes.post("/", authMiddleware, validateBody(createPostSchema), async (c) => {
  const { title, body } = c.req.valid("json");
  const authorId = c.get("userId"); // injected by authMiddleware after verifying the JWT

  const post = {
    id: crypto.randomUUID(),
    title,
    body,
    authorId,
    createdAt: new Date().toISOString(),
  };
  posts.push(post);

  return c.json({ success: true, data: post }, 201);
});

// ─── PUT /posts/:id ────────────────────────────────────────────────────────────
// Protected: edit your own post (title and/or body).
// Requires: Authorization: Bearer <token>
// Body: { title?, body? }

postRoutes.put("/:id", authMiddleware, validateBody(createPostSchema.partial()), async (c) => {
  const id = c.req.param("id");
  const updates = c.req.valid("json");
  const userId = c.get("userId");

  const index = posts.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new HTTPException(404, { message: `Post with id "${id}" not found` });
  }

  // Only the author can edit their post
  if (posts[index].authorId !== userId) {
    throw new HTTPException(403, { message: "You can only edit your own posts" });
  }

  posts[index] = { ...posts[index], ...updates };

  return c.json({ success: true, data: posts[index] });
});

// ─── DELETE /posts/:id ─────────────────────────────────────────────────────────
// Protected: delete your own post.
// Requires: Authorization: Bearer <token>

postRoutes.delete("/:id", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const index = posts.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new HTTPException(404, { message: `Post with id "${id}" not found` });
  }

  if (posts[index].authorId !== userId) {
    throw new HTTPException(403, { message: "You can only delete your own posts" });
  }

  posts.splice(index, 1);

  return c.json({ success: true, data: { deleted: id } });
});
