const UserSession = require("../models/UserSession");
const ActivityLog = require("../models/ActivityLog");

/**
 * Increments the user's tokenVersion and revokes all active device sessions.
 * This instantly invalidates any outstanding JWT access tokens globally.
 * 
 * @param {Object} user - The Mongoose User document
 * @param {Object} req - The Express request object (optional, for logging)
 * @param {String} actionName - The description of the administrative action triggering invalidation
 */
const invalidateUserSession = async (user, req = null, actionName = "session_revocation") => {
  try {
    // 1. Increment tokenVersion to invalidate current JWT signature payloads
    user.tokenVersion = (user.tokenVersion || 1) + 1;
    await user.save();

    // 2. Revoke all active device sessions in UserSession collection
    const result = await UserSession.updateMany(
      { userId: user._id, status: "active" },
      { status: "revoked" }
    );

    // 3. Log the revocation event if request is available
    if (req) {
      await ActivityLog.create({
        actorId: req.user?.id || user._id,
        action: actionName,
        targetId: user._id,
        ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1",
        userAgent: req.headers["user-agent"],
        details: {
          email: user.email,
          revokedCount: result.modifiedCount,
          newTokenVersion: user.tokenVersion
        }
      }).catch(err => console.warn("Failed to create activity audit log for session invalidation:", err.message));
    }

    console.log(`✓ Instantly invalidated all (${result.modifiedCount}) sessions and updated tokenVersion to ${user.tokenVersion} for user ${user.email}.`);
    return { success: true, revokedCount: result.modifiedCount, newTokenVersion: user.tokenVersion };
  } catch (err) {
    console.error("❌ Error executing invalidateUserSession helper:", err);
    throw err;
  }
};

module.exports = {
  invalidateUserSession
};
