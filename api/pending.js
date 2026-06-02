const { json, readState, writeState, createId, isRealRobloxUsername } = require("./_store");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const username = String(req.body?.username || "").trim();
    if (!username) return json(res, 400, { error: "Username required" });
    if (username.length > 20) return json(res, 400, { error: "Username is too long for Roblox." });

    const isReal = await isRealRobloxUsername(username);
    if (!isReal) return json(res, 400, { error: "That Roblox username does not exist." });

    const state = await readState();
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
    await writeState(state);
    return json(res, 201, { user });
  } catch (error) {
    return json(res, 500, { error: error.message || "Server error" });
  }
};
