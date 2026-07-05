const express = require("express");
const router = express.Router();
const User = require("../models/User");
const UserSession = require("../models/UserSession");
const ActivityLog = require("../models/ActivityLog");
const requireRole = require("../middleware/requireRole");
const { invalidateUserSession } = require("../services/sessionService");

// POST /api/admin-requests/request
// Authenticated User: Request admin privileges
router.post("/request", async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User profile not found." });
    }

    if (user.role === "admin" || user.role === "owner") {
      return res.status(400).json({ error: "You already have administrative privileges." });
    }

    if (user.adminRequestStatus === "pending") {
      return res.status(400).json({ error: "Your admin request is already pending approval." });
    }

    user.adminRequestStatus = "pending";
    await user.save();

    // Log the request activity
    await ActivityLog.create({
      actorId: user._id,
      action: "admin_request_submitted",
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1",
      userAgent: req.headers["user-agent"],
      details: { email: user.email }
    }).catch(err => console.warn("Failed to log admin request:", err.message));

    res.json({ message: "Admin request submitted successfully. Pending owner review.", adminRequestStatus: "pending" });
  } catch (err) {
    console.error("Error submitting admin request:", err);
    res.status(500).json({ error: "Failed to submit admin request." });
  }
});

// GET /api/admin-requests/pending
// Owner Only: List all pending admin requests
router.get("/pending", requireRole(["owner"]), async (req, res) => {
  try {
    const pendingUsers = await User.find({ adminRequestStatus: "pending" }, "name email role adminRequestStatus createdAt");
    res.json(pendingUsers);
  } catch (err) {
    console.error("Error retrieving pending admin requests:", err);
    res.status(500).json({ error: "Failed to retrieve pending requests." });
  }
});

// POST /api/admin-requests/approve/:userId
// Owner Only: Approve a pending admin request
router.post("/approve/:userId", requireRole(["owner"]), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.adminRequestStatus !== "pending") {
      return res.status(400).json({ error: "User does not have a pending admin request." });
    }

    user.role = "admin";
    user.adminRequestStatus = "approved";
    
    // Globally invalidate active sessions and increment tokenVersion using unified session service
    await invalidateUserSession(user, req, "admin_request_approved");

    res.json({ message: `Admin request for ${user.email} approved successfully. User role promoted to admin.`, user });
  } catch (err) {
    console.error("Error approving admin request:", err);
    res.status(500).json({ error: "Failed to approve admin request." });
  }
});

// POST /api/admin-requests/reject/:userId
// Owner Only: Reject a pending admin request
router.post("/reject/:userId", requireRole(["owner"]), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.adminRequestStatus !== "pending") {
      return res.status(400).json({ error: "User does not have a pending admin request." });
    }

    user.adminRequestStatus = "rejected";
    await user.save();

    // Log the rejection activity
    await ActivityLog.create({
      actorId: req.user.id, // The owner who rejected
      action: "admin_request_rejected",
      targetId: user._id,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1",
      userAgent: req.headers["user-agent"],
      details: { email: user.email }
    }).catch(err => console.warn("Failed to log admin rejection:", err.message));

    res.json({ message: `Admin request for ${user.email} rejected.`, user });
  } catch (err) {
    console.error("Error rejecting admin request:", err);
    res.status(500).json({ error: "Failed to reject admin request." });
  }
});

module.exports = router;
