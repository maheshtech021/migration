import { createMiddleware } from "hono/factory";
import { verify } from "hono/jwt";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../types";

// ─── JWT Auth Middleware ───────────────────────────────────────────────────────
// Protects routes by verifying the Bearer token in the Authorization header.
// On success, injects `userId` and `userRole` into Hono's context variables.

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const payload = await verify(token, c.env.JWT_SECRET, "HS256");

    // Inject user info into context for downstream handlers
    c.set("userId", payload.sub as string);
    c.set("userRole", payload.role as "admin" | "user");

    await next();
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }
});

// ─── Role Guard ───────────────────────────────────────────────────────────────
// Use after authMiddleware to restrict routes to a specific role.
// Example: app.get("/admin", authMiddleware, roleGuard("admin"), handler)

export const roleGuard = (requiredRole: "admin" | "user") =>
  createMiddleware<AppEnv>(async (c, next) => {
    const role = c.get("userRole");
    if (role !== requiredRole) {
      throw new HTTPException(403, { message: "Forbidden: insufficient permissions" });
    }
    await next();
  });
