const {
  CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID,
  APP_NAME,
  APP_HOSTNAME,
  CLOUDFLARE_ACCESS_POLICY_ID,
  ACCESS_SESSION_DURATION = "24h",
} = process.env;

if (!CLOUDFLARE_API_TOKEN) throw new Error("Missing CLOUDFLARE_API_TOKEN.");
if (!CLOUDFLARE_ACCOUNT_ID) throw new Error("Missing CLOUDFLARE_ACCOUNT_ID.");
if (!APP_NAME) throw new Error("Missing APP_NAME.");
if (!APP_HOSTNAME) throw new Error("Missing APP_HOSTNAME.");
if (!CLOUDFLARE_ACCESS_POLICY_ID) throw new Error("Missing CLOUDFLARE_ACCESS_POLICY_ID.");

const apiBase = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/access`;

async function apiRequest(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json();

  if (!response.ok || payload.success === false) {
    const notEnabled = payload.errors?.some(
      (e) => e.code === 9999 && e.message?.includes("not_enabled"),
    );
    if (notEnabled) {
      console.warn(
        "Cloudflare Access is not enabled on this account.\n" +
        "Complete Zero Trust setup at https://one.dash.cloudflare.com, then re-run.",
      );
      process.exit(0);
    }
    throw new Error(
      `Cloudflare API error [${path}]: ${JSON.stringify(payload.errors ?? payload, null, 2)}`,
    );
  }

  return payload.result;
}

async function syncAccessApp() {
  const apps = await apiRequest("/apps?per_page=100");

  const existing = apps.find(
    (app) =>
      app.domain === APP_HOSTNAME ||
      app.destinations?.some((d) => d.uri === APP_HOSTNAME),
  );

  // Reference the pre-existing reusable policy by its ID.
  // Cloudflare Access will attach it without modifying the policy itself.
  const body = {
    name: APP_NAME,
    domain: APP_HOSTNAME,
    type: "self_hosted",
    app_launcher_visible: false,
    session_duration: ACCESS_SESSION_DURATION,
    policies: [{ id: CLOUDFLARE_ACCESS_POLICY_ID }],
  };

  if (existing) {
    await apiRequest(`/apps/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    console.log(`Access app updated  : ${existing.id}`);
    return;
  }

  const created = await apiRequest("/apps", {
    method: "POST",
    body: JSON.stringify(body),
  });
  console.log(`Access app created  : ${created.id}`);
}

await syncAccessApp();
console.log(`Access configured for https://${APP_HOSTNAME}`);
console.log(`Policy ID attached  : ${CLOUDFLARE_ACCESS_POLICY_ID}`);
