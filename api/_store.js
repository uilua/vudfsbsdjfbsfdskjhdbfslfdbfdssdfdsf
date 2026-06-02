function firstEnv(...keys) {
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }
  return "";
}

const KV_URL = firstEnv(
  "KV_REST_API_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_KV_URL",
  "UPSTASH_REDIS_REST_KV_REST_API_URL",
  "STORAGE_REST_API_URL",
  "STORAGE_REST_URL",
  "STORAGE_URL"
);

const KV_TOKEN = firstEnv(
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_READ_ONLY_TOKEN",
  "UPSTASH_REDIS_REST__PI_READ_ONLY_TOKEN",
  "STORAGE_REST_API_TOKEN",
  "STORAGE_REST_TOKEN",
  "STORAGE_TOKEN"
);

const PENDING_KEY = "vant:pending";
const VERIFIED_KEY = "vant:verified";

async function kvRequest(command, ...args) {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error("KV storage is not configured on Vercel. Set KV_* or UPSTASH_* or STORAGE_* env vars.");
  }

  const response = await fetch(`${KV_URL}/${command}/${args.map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error(`KV request failed (${response.status})`);
  }

  const payload = await response.json();
  if (payload.error) throw new Error(payload.error);
  return payload.result;
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readState() {
  const [pendingRaw, verifiedRaw] = await Promise.all([
    kvRequest("get", PENDING_KEY),
    kvRequest("get", VERIFIED_KEY)
  ]);
  return {
    pending: toArray(pendingRaw),
    verified: toArray(verifiedRaw)
  };
}

async function writeState({ pending, verified }) {
  await Promise.all([
    kvRequest("set", PENDING_KEY, JSON.stringify(pending || [])),
    kvRequest("set", VERIFIED_KEY, JSON.stringify(verified || []))
  ]);
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function isRealRobloxUsername(username) {
  const response = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: false
    })
  });

  if (!response.ok) {
    throw new Error("Unable to validate Roblox username right now.");
  }

  const payload = await response.json();
  return Array.isArray(payload.data) && payload.data.length > 0;
}

module.exports = {
  json,
  readState,
  writeState,
  createId,
  isRealRobloxUsername
};
