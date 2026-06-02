const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 5500;
const ROOT = __dirname;
const PENDING_PATH = path.join(ROOT, "pending.json");
const VERIFIED_PATH = path.join(ROOT, "verified.json");
const INDEX_PATH = path.join(ROOT, "index.html");

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "[]", "utf8");
  }
}

function readJsonArray(filePath) {
  ensureFile(filePath);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function readState() {
  return {
    pending: readJsonArray(PENDING_PATH),
    verified: readJsonArray(VERIFIED_PATH)
  };
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendIndex(res) {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (req.method === "GET" && pathname === "/api/state") {
      return json(res, 200, readState());
    }

    if (req.method === "POST" && pathname === "/api/pending") {
      const body = await readBody(req);
      const username = String(body.username || "").trim();
      if (!username) return json(res, 400, { error: "Username required" });
      if (username.length > 20) return json(res, 400, { error: "Username is too long for Roblox." });

      const isRealUsername = await isRealRobloxUsername(username);
      if (!isRealUsername) {
        return json(res, 400, { error: "That Roblox username does not exist." });
      }

      const state = readState();
      const existsPending = state.pending.some((u) => u.username.toLowerCase() === username.toLowerCase());
      const existsVerified = state.verified.some((u) => u.username.toLowerCase() === username.toLowerCase());
      if (existsPending || existsVerified) {
        return json(res, 409, { error: "This username is already pending or verified." });
      }

      const user = {
        id: createId(),
        username,
        bioCode: "",
        codeAssigned: false,
        codeShownToUser: false,
        createdAt: Date.now()
      };
      state.pending.push(user);
      writeJsonArray(PENDING_PATH, state.pending);
      return json(res, 201, { user });
    }

    if (req.method === "POST" && pathname.startsWith("/api/assign-code/")) {
      const id = decodeURIComponent(pathname.replace("/api/assign-code/", ""));
      const body = await readBody(req);
      const codeText = String(body.codeText || "").trim();
      if (!codeText) return json(res, 400, { error: "Code text required" });

      const state = readState();
      const user = state.pending.find((u) => u.id === id);
      if (!user) return json(res, 404, { error: "User not found" });
      user.bioCode = codeText;
      user.codeAssigned = true;
      user.codeShownToUser = false;
      writeJsonArray(PENDING_PATH, state.pending);
      return json(res, 200, { success: true });
    }

    if (req.method === "POST" && pathname.startsWith("/api/mark-shown/")) {
      const id = decodeURIComponent(pathname.replace("/api/mark-shown/", ""));
      const state = readState();
      const user = state.pending.find((u) => u.id === id);
      if (!user) return json(res, 404, { error: "User not found" });
      user.codeShownToUser = true;
      writeJsonArray(PENDING_PATH, state.pending);
      return json(res, 200, { success: true });
    }

    if (req.method === "POST" && pathname.startsWith("/api/verify/")) {
      const id = decodeURIComponent(pathname.replace("/api/verify/", ""));
      const state = readState();
      const index = state.pending.findIndex((u) => u.id === id);
      if (index < 0) return json(res, 404, { error: "User not found" });

      const [user] = state.pending.splice(index, 1);
      state.verified.unshift({
        id: user.id,
        username: user.username,
        bioCode: user.bioCode || "",
        verifiedAt: Date.now()
      });

      writeJsonArray(PENDING_PATH, state.pending);
      writeJsonArray(VERIFIED_PATH, state.verified);
      return json(res, 200, { success: true });
    }

    if (req.method === "GET" && pathname === "/") {
      return sendIndex(res);
    }

    if (req.method === "GET" && pathname === "/index.html") {
      return sendIndex(res);
    }

    return json(res, 404, { error: "Not found" });
  } catch (error) {
    return json(res, 500, { error: error.message || "Server error" });
  }
});

ensureFile(PENDING_PATH);
ensureFile(VERIFIED_PATH);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
