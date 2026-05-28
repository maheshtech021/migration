import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authMiddleware, roleGuard } from "../middleware/auth";
import { validateBody, validateQuery, updateUserSchema, paginationSchema } from "../validators/schemas";
import { users } from "../store";
import type { AppEnv } from "../types";

export const userRoutes = new Hono<AppEnv>();

// ─── GET /users ────────────────────────────────────────────────────────────────
// Public: list all users with pagination.
// Try: GET /users?page=1&limit=5

userRoutes.get("/", validateQuery(paginationSchema), async (c) => {
  const { page, limit } = c.req.valid("query");

  // Slice the in-memory array to simulate pagination
  const start = (page - 1) * limit;
  const paginated = users.slice(start, start + limit);

  // Strip passwords before sending — never expose them!
  const safeUsers = paginated.map(({ password: _, ...u }) => u);

  return c.json({
    success: true,
    data: safeUsers,
    meta: { page, limit, total: users.length },
  });
});

// ─── GET /users/:id ────────────────────────────────────────────────────────────
// Public: get a single user by ID.
// Try: GET /users/user_001

userRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const user = users.find((u) => u.id === id);
  if (!user) {
    throw new HTTPException(404, { message: `User with id "${id}" not found` });
  }

  const { password: _, ...safeUser } = user;
  return c.json({ success: true, data: safeUser });
});

// ─── PUT /users/:id ────────────────────────────────────────────────────────────
// Protected: update your own profile (you cannot update someone else's).
// Requires: Authorization: Bearer <token>

userRoutes.put("/:id", authMiddleware, validateBody(updateUserSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const requesterId = c.get("userId");

  // Users can only edit their own profile
  if (id !== requesterId) {
    throw new HTTPException(403, { message: "You can only update your own profile" });
  }

  const index = users.findIndex((u) => u.id === id);
  if (index === -1) {
    throw new HTTPException(404, { message: `User with id "${id}" not found` });
  }

  // Merge the updates into the stored user
  users[index] = { ...users[index], ...body };

  const { password: _, ...safeUser } = users[index];
  return c.json({ success: true, data: safeUser });
});

// ─── DELETE /users/:id ─────────────────────────────────────────────────────────
// Admin only: remove a user. Regular users will get a 403.
// Requires: Authorization: Bearer <admin-token>

userRoutes.delete("/:id", authMiddleware, roleGuard("admin"), async (c) => {
  const id = c.req.param("id");

  const index = users.findIndex((u) => u.id === id);
  if (index === -1) {
    throw new HTTPException(404, { message: `User with id "${id}" not found` });
  }

  users.splice(index, 1);

  return c.json({ success: true, data: { deleted: id } });
});
