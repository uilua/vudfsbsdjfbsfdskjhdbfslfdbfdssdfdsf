const { json, readState, writeState } = require("../_store");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const userId = String(req.query?.id || "");
    if (!userId) return json(res, 400, { error: "User id required" });

    const state = await readState();
    const idx = state.pending.findIndex((u) => u.id === userId);
    if (idx < 0) return json(res, 404, { error: "User not found" });

    const [user] = state.pending.splice(idx, 1);
    state.verified.unshift({
      id: user.id,
      username: user.username,
      bioCode: user.bioCode || "",
      verifiedAt: Date.now()
    });

    await writeState(state);
    return json(res, 200, { success: true });
  } catch (error) {
    return json(res, 500, { error: error.message || "Server error" });
  }
};
