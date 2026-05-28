import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";

import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";
import { postRoutes } from "./routes/posts";
import type { AppEnv } from "./types";

// ─── App Initialization ──────────────────────────────────────────────────────

const app = new Hono<AppEnv>();

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use("*", logger());           // Logs every request to console
app.use("*", prettyJSON());       // Pretty-prints JSON responses in dev
app.use("*", secureHeaders());    // Sets security headers (XSS, CSRF etc.)
app.use("*", (c, next) =>
  cors({
    origin: c.env.ALLOWED_ORIGIN ?? "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization"],
  })(c, next)
);

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/", (c) => {
  return c.json({ status: "ok", message: "Hono API is running 🔥" });
});

app.get("/health", (c) => {
  return c.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.route("/auth", authRoutes);
app.route("/users", userRoutes);
app.route("/posts", postRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────

app.notFound((c) => {
  return c.json(
    { success: false, error: `Route ${c.req.path} not found` },
    404
  );
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ success: false, error: err.message }, err.status);
  }
  console.error("[Server Error]", err);
  return c.json({ success: false, error: "Internal Server Error" }, 500);
});

// ─── Export ───────────────────────────────────────────────────────────────────

export default app;
