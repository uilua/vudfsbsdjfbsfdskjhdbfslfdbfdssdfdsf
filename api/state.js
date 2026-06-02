const { json, readState } = require("./_store");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  try {
    const state = await readState();
    return json(res, 200, state);
  } catch (error) {
    return json(res, 500, { error: error.message || "Server error" });
  }
};
