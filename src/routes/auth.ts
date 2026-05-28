import { Hono } from "hono";
import { sign } from "hono/jwt";
import { HTTPException } from "hono/http-exception";
import { validateBody, registerSchema, loginSchema } from "../validators/schemas";
import { users } from "../store";
import type { AppEnv } from "../types";

export const authRoutes = new Hono<AppEnv>();

// Helper: build a JWT for a given user id and role.
// The token expires in 24 hours (exp = current time + 86400 seconds).
const createToken = (id: string, role: "admin" | "user", secret: string) =>
  sign(
    { sub: id, role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 },
    secret,
    "HS256"
  );

// ─── POST /auth/register ──────────────────────────────────────────────────────
// Create a new account. Returns the user object + a JWT token.
//
// Body: { name, email, password }

authRoutes.post("/register", validateBody(registerSchema), async (c) => {
  const { name, email, password } = c.req.valid("json");

  // Reject duplicate emails
  const existing = users.find((u) => u.email === email);
  if (existing) {
    throw new HTTPException(409, { message: "An account with that email already exists" });
  }

  // Build the new user and push it into the in-memory store
  // TODO (production): hash the password with bcrypt before saving
  //   const hashed = await bcrypt.hash(password, 10);
  const newUser = {
    id: crypto.randomUUID(),
    name,
    email,
    password, // ⚠️ plain-text only for demo — hash in production!
    role: "user" as const,
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);

  const token = await createToken(newUser.id, newUser.role, c.env.JWT_SECRET);

  // Never return the password in a response
  const { password: _, ...safeUser } = newUser;
  return c.json({ success: true, data: { user: safeUser, token } }, 201);
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────
// Sign in with email + password. Returns a JWT token.
//
// Body: { email, password }
// Demo credentials: admin@example.com / password123

authRoutes.post("/login", validateBody(loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  // Look up the user by email
  const user = users.find((u) => u.email === email);

  // TODO (production): use bcrypt.compare(password, user.password) instead of ===
  if (!user || user.password !== password) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  const token = await createToken(user.id, user.role, c.env.JWT_SECRET);

  return c.json({ success: true, data: { token } });
});
