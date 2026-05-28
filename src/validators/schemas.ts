import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

// ─── Auth Schemas ─────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ─── User Schemas ─────────────────────────────────────────────────────────────

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
});

// ─── Post Schemas ─────────────────────────────────────────────────────────────

export const createPostSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  body: z.string().min(10, "Body must be at least 10 characters"),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

// ─── Validator Helpers ────────────────────────────────────────────────────────
// zValidator wraps Zod schemas into Hono middleware.
// Usage in a route: app.post("/", validateBody(registerSchema), handler)

export const validateBody = <T extends z.ZodTypeAny>(schema: T) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) {
      return c.json(
        { success: false, error: "Validation failed", details: result.error.flatten() },
        422
      );
    }
  });

export const validateQuery = <T extends z.ZodTypeAny>(schema: T) =>
  zValidator("query", schema, (result, c) => {
    if (!result.success) {
      return c.json(
        { success: false, error: "Invalid query params", details: result.error.flatten() },
        422
      );
    }
  });
