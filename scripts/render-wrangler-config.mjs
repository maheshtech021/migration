import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED_BRANCHES = ["dev", "qa"];

function sanitizeSegment(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function assertValue(name, value) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
}

const rootDir = process.cwd();
const configPath = path.join(rootDir, "wrangler.jsonc");
const outputDir = path.join(rootDir, ".wrangler", "deploy");
const outputPath = path.join(outputDir, "wrangler.jsonc");

const rawConfig = await readFile(configPath, "utf8");
// Strip JSONC comments and trailing commas while preserving string contents
const config = JSON.parse(
  rawConfig
    .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*/g, (_, str) => str ?? "")
    .replace(/("(?:[^"\\]|\\.)*")|,(?=\s*[}\]])/g, (_, str) => str ?? "")
);

const repoName = sanitizeSegment(
  process.env.APP_NAME ??
  process.env.GITHUB_REPOSITORY?.split("/").at(-1) ??
  config.name,
);

if (!repoName) throw new Error("Unable to derive a valid Worker name.");

const rawBranch = (
  process.env.BRANCH_NAME ??
  process.env.GITHUB_REF_NAME ??
  ""
).toLowerCase().trim();

if (!ALLOWED_BRANCHES.includes(rawBranch)) {
  throw new Error(
    `Branch "${rawBranch}" is not deployable. Allowed: ${ALLOWED_BRANCHES.join(", ")}.\n` +
    `Set BRANCH_NAME=dev or BRANCH_NAME=qa.`,
  );
}

const appName = `${repoName}-${rawBranch}`;

const rootDomain = process.env.ROOT_DOMAIN?.trim().replace(/^\.+|\.+$/g, "");
assertValue("ROOT_DOMAIN", rootDomain);

const appHostname = `${appName}.${rootDomain}`;

// Wrangler resolves asset/main paths relative to the config file.
// Rebase them so they remain correct from the output directory.
function rebasePath(p) {
  if (!p || path.isAbsolute(p)) return p;
  return path.relative(outputDir, path.resolve(rootDir, p));
}

const renderedConfig = { ...config, name: appName };

if (renderedConfig.main) {
  renderedConfig.main = rebasePath(renderedConfig.main);
}
if (renderedConfig.assets?.directory) {
  renderedConfig.assets = {
    ...renderedConfig.assets,
    directory: rebasePath(renderedConfig.assets.directory),
  };
}

// Routes are managed by domain.yml via the Workers Domains API.
delete renderedConfig.routes;

// ── Cloudflare resource bindings (driven by app.config.json) ─────────────────

let features = {};
try {
  const raw = await readFile(path.join(rootDir, "app.config.json"), "utf8");
  features = JSON.parse(raw).features ?? {};
} catch {
  // app.config.json absent — all features off
}

const anyEnabled = Object.values(features).some(Boolean);

if (anyEnabled) {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken || !accountId) {
    throw new Error(
      "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required when features are enabled in app.config.json.",
    );
  }

  const cfGet = (url) =>
    fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } }).then((r) => r.json());

  const cfPost = (url, body) =>
    fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());

  // ── D1 ──────────────────────────────────────────────────────────────────────
  if (features.d1) {
    const listData = await cfGet(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database?name=${appName}`,
    );
    if (!listData.success) {
      throw new Error(`CF API error listing D1: ${JSON.stringify(listData.errors)}`);
    }

    let db = listData.result?.[0];
    if (!db) {
      console.log(`D1 database "${appName}" not found — creating...`);
      const createData = await cfPost(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`,
        { name: appName },
      );
      if (!createData.success) {
        throw new Error(`Failed to create D1 database "${appName}": ${JSON.stringify(createData.errors)}`);
      }
      db = createData.result;
      console.log(`D1 database  : created ${db.name} (${db.uuid})`);
    } else {
      console.log(`D1 database  : ${db.name} (${db.uuid})`);
    }

    renderedConfig.d1_databases = [
      {
        binding: "DB",
        database_name: db.name,
        database_id: db.uuid,
        migrations_dir: rebasePath("migrations"),
      },
    ];
  }

  // ── KV ──────────────────────────────────────────────────────────────────────
  if (features.kv) {
    // CF KV API has no name filter — paginate with cursor until found
    let kv = null;
    let cursor = "";
    do {
      const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces?per_page=100${cursor ? `&cursor=${cursor}` : ""}`;
      const data = await cfGet(url);
      if (!data.success) {
        throw new Error(`CF API error listing KV: ${JSON.stringify(data.errors)}`);
      }
      kv = data.result?.find((ns) => ns.title === appName) ?? null;
      cursor = kv ? "" : (data.result_info?.cursor ?? "");
    } while (!kv && cursor);

    if (!kv) {
      console.log(`KV namespace "${appName}" not found — creating...`);
      const createData = await cfPost(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`,
        { title: appName },
      );
      if (!createData.success) {
        throw new Error(`Failed to create KV namespace "${appName}": ${JSON.stringify(createData.errors)}`);
      }
      kv = createData.result;
      console.log(`KV namespace : created ${kv.title} (${kv.id})`);
    } else {
      console.log(`KV namespace : ${kv.title} (${kv.id})`);
    }

    renderedConfig.kv_namespaces = [{ binding: "KV", id: kv.id }];
  }

  // ── R2 ──────────────────────────────────────────────────────────────────────
  if (features.r2) {
    const checkData = await cfGet(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${appName}`,
    );

    if (!checkData.success) {
      const code = checkData.errors?.[0]?.code;
      // 10006 = bucket not found — expected on first deploy
      if (code !== 10006) {
        throw new Error(`CF API error checking R2 bucket "${appName}": ${JSON.stringify(checkData.errors)}`);
      }

      console.log(`R2 bucket "${appName}" not found — creating...`);
      const createData = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: appName }),
        },
      ).then((r) => r.json());
      if (!createData.success) {
        throw new Error(`Failed to create R2 bucket "${appName}": ${JSON.stringify(createData.errors)}`);
      }
      console.log(`R2 bucket    : created ${appName}`);
    } else {
      console.log(`R2 bucket    : ${appName}`);
    }

    renderedConfig.r2_buckets = [{ binding: "BUCKET", bucket_name: appName }];
  }

  // ── Queues ───────────────────────────────────────────────────────────────────
  if (features.queues) {
    let queue = null;
    let page = 1;
    do {
      const data = await cfGet(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/queues?per_page=100&page=${page}`,
      );
      if (!data.success) {
        throw new Error(`CF API error listing Queues: ${JSON.stringify(data.errors)}`);
      }
      queue = data.result?.find((q) => q.queue_name === appName) ?? null;
      if (!queue && (data.result?.length ?? 0) === 100) page++;
      else break;
    } while (!queue);

    if (!queue) {
      console.log(`Queue "${appName}" not found — creating...`);
      const createData = await cfPost(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/queues`,
        { queue_name: appName },
      );
      if (!createData.success) {
        throw new Error(`Failed to create Queue "${appName}": ${JSON.stringify(createData.errors)}`);
      }
      queue = createData.result;
      console.log(`Queue        : created ${appName}`);
    } else {
      console.log(`Queue        : ${appName}`);
    }

    renderedConfig.queues = {
      producers: [{ binding: "QUEUE", queue: appName }],
      consumers: [{ queue: appName, max_batch_size: 10, max_batch_timeout: 5 }],
    };
  }
}

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(renderedConfig, null, 2)}\n`);

if (process.env.GITHUB_OUTPUT) {
  await writeFile(
    process.env.GITHUB_OUTPUT,
    `app_name=${appName}\napp_hostname=${appHostname}\nbranch=${rawBranch}\n`,
    { flag: "a" },
  );
}

console.log(`Worker name  : ${appName}`);
console.log(`Hostname     : ${appHostname}`);
console.log(`Branch       : ${rawBranch}`);
console.log(`Config output: ${outputPath}`);
