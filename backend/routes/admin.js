const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const User = require("../models/User");
const UserSession = require("../models/UserSession");
const ActivityLog = require("../models/ActivityLog");
const SystemMetric = require("../models/SystemMetric");
const Task = require("../models/Task");
const SupportTicket = require("../models/SupportTicket");
const requireRole = require("../middleware/requireRole");

// Middleware to block execution if MongoDB connection is not open
router.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: "Database connection offline. Admin features are unavailable." });
  }
  next();
});

// Helper: Generate daily snapshot of system metrics
const generateDailySnapshot = async (targetDate = new Date()) => {
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  // 1. Total users & tasks
  const [totalUsers, totalTasks, completedTasks] = await Promise.all([
    User.countDocuments(),
    Task.countDocuments(),
    Task.countDocuments({ completed: true })
  ]);

  // 2. Calculate DAU/WAU/MAU from active sessions
  const sevenDaysAgo = new Date(targetDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(targetDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [dau, wau, mau] = await Promise.all([
    UserSession.distinct("userId", { lastActive: { $gte: startOfDay, $lte: endOfDay } }).then(arr => arr.length),
    UserSession.distinct("userId", { lastActive: { $gte: sevenDaysAgo, $lte: endOfDay } }).then(arr => arr.length),
    UserSession.distinct("userId", { lastActive: { $gte: thirtyDaysAgo, $lte: endOfDay } }).then(arr => arr.length)
  ]);

  // 3. Focus Garden distribution based on user levels or XP
  // FlowNest uses 7 stages of tree growth derived from Level.
  // Stage 0: lvl 1, Stage 1: lvl 2-3, Stage 2: lvl 4-5, Stage 3: lvl 6-7, Stage 4: lvl 8-9, Stage 5: lvl 10-12, Stage 6: lvl 13-15, Stage 7: lvl 16+
  const users = await User.find({}, "level");
  const gardenDist = {
    stage0: 0, stage1: 0, stage2: 0, stage3: 0, stage4: 0, stage5: 0, stage6: 0, stage7: 0
  };

  users.forEach(u => {
    const lvl = u.level || 1;
    if (lvl === 1) gardenDist.stage0++;
    else if (lvl <= 3) gardenDist.stage1++;
    else if (lvl <= 5) gardenDist.stage2++;
    else if (lvl <= 7) gardenDist.stage3++;
    else if (lvl <= 9) gardenDist.stage4++;
    else if (lvl <= 12) gardenDist.stage5++;
    else if (lvl <= 15) gardenDist.stage6++;
    else gardenDist.stage7++;
  });

  // 4. Support tickets status
  const [openTickets, closedTickets] = await Promise.all([
    SupportTicket.countDocuments({ status: { $in: ["open", "reviewing"] } }),
    SupportTicket.countDocuments({ status: "closed" })
  ]);

  // 5. AI chats and estimated token usage for the day
  const aiChatsToday = await ActivityLog.find({
    action: "ai_chat",
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  });

  let totalTokensUsed = 0;
  aiChatsToday.forEach(log => {
    if (log.details && log.details.estimatedTokens) {
      totalTokensUsed += log.details.estimatedTokens;
    } else {
      totalTokensUsed += 150; // default backup estimate
    }
  });

  // 6. Save snapshot
  const snapshotDate = new Date(startOfDay);
  const metricDoc = await SystemMetric.findOneAndUpdate(
    { date: snapshotDate },
    {
      metrics: {
        totalUsers,
        dailyActiveUsers: dau || 1, // ensure at least 1 if empty
        weeklyActiveUsers: wau || 1,
        monthlyActiveUsers: mau || 1,
        totalTasks,
        completedTasks,
        focusGardenStageDistribution: gardenDist,
        openTickets,
        closedTickets,
        aiConversationsCount: aiChatsToday.length,
        aiTokenUsage: totalTokensUsed
      }
    },
    { upsert: true, new: true }
  );

  return metricDoc;
};

// CRON TRIGGER ROOT: Force-generate today's metrics
router.post("/metrics/snapshot", requireRole(["superadmin"]), async (req, res) => {
  try {
    const snapshot = await generateDailySnapshot();
    res.json({ message: "Daily metric snapshot generated successfully", snapshot });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate snapshot: " + err.message });
  }
});

// GET /api/admin/summary
router.get("/summary", requireRole(["admin", "superadmin"]), async (req, res) => {
  try {
    const [totalUsers, totalTasks, completedTasks, openTickets, activeSessions] = await Promise.all([
      User.countDocuments(),
      Task.countDocuments(),
      Task.countDocuments({ completed: true }),
      SupportTicket.countDocuments({ status: { $in: ["open", "reviewing"] } }),
      UserSession.countDocuments({ status: "active" })
    ]);

    // Calculate AI Chats from ActivityLogs (all-time count)
    const aiConversations = await ActivityLog.countDocuments({ action: "ai_chat" });

    // Calculate database size estimate (in bytes)
    const stats = await mongoose.connection.db.stats();
    const dbSize = stats.dataSize || stats.storageSize || 0;

    // Daily active users estimation for the past 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeUsers = await UserSession.distinct("userId", {
      lastActive: { $gte: oneDayAgo }
    }).then(arr => arr.length);

    res.json({
      totalUsers,
      activeUsers: activeUsers || 1,
      totalTasks,
      completedTasks,
      openTickets,
      aiConversations,
      dbSize,
      activeSessions
    });
  } catch (err) {
    console.error("Summary fetch error:", err);
    res.status(500).json({ error: "Failed to load summary stats" });
  }
});

// GET /api/admin/analytics
// Returns historical metrics for charting (Chart.js)
router.get("/analytics", requireRole(["admin", "superadmin"]), async (req, res) => {
  try {
    // Ensure we have at least one snapshot for today before querying
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayMetric = await SystemMetric.findOne({ date: today });
    if (!todayMetric) {
      await generateDailySnapshot();
    }

    // Load last 30 snapshots in ascending order
    const snapshots = await SystemMetric.find()
      .sort({ date: -1 })
      .limit(30);

    snapshots.reverse(); // put in chronological order

    res.json(snapshots);
  } catch (err) {
    console.error("Analytics fetch error:", err);
    res.status(500).json({ error: "Failed to load historical analytics data" });
  }
});

// GET /api/admin/users
// Paginated list of users with search filter
router.get("/users", requireRole(["admin", "superadmin"]), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      query.$or = [
        { name: searchRegex },
        { email: searchRegex }
      ];
    }

    if (req.query.role) {
      query.role = req.query.role;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    const [users, total] = await Promise.all([
      User.find(query, "-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query)
    ]);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve user listing" });
  }
});

// GET /api/admin/users/:id
// Get user details, task metrics, sessions and garden state
router.get("/users/:id", requireRole(["admin", "superadmin"]), async (req, res) => {
  try {
    const user = await User.findById(req.params.id, "-password");
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Retrieve stats
    const [totalTasks, completedTasks, sessions] = await Promise.all([
      Task.countDocuments({ userId: user._id }),
      Task.countDocuments({ userId: user._id, completed: true }),
      UserSession.find({ userId: user._id }).sort({ lastActive: -1 }).limit(10)
    ]);

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    res.json({
      user,
      metrics: {
        totalTasks,
        completedTasks,
        completionRate
      },
      sessions
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user profile analytics" });
  }
});

// PATCH /api/admin/users/:id/status
// SuperAdmin Only: Suspend or Reactivate user accounts
router.patch("/users/:id/status", requireRole(["superadmin"]), async (req, res) => {
  try {
    const { status } = req.body;
    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value. Must be 'active' or 'suspended'." });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.role === "superadmin") {
      return res.status(403).json({ error: "Cannot suspend a SuperAdmin account." });
    }

    const originalStatus = user.status;
    user.status = status;
    await user.save();

    // If suspending, immediately invalidate all active sessions
    if (status === "suspended") {
      await UserSession.updateMany({ userId: user._id }, { status: "revoked" });
    }

    // Log the administrative action in the immutable audit log
    await ActivityLog.create({
      actorId: req.user.id,
      action: status === "suspended" ? "user_suspend" : "user_activate",
      targetId: user._id,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1",
      userAgent: req.headers["user-agent"],
      details: {
        email: user.email,
        originalStatus,
        newStatus: status
      }
    });

    res.json({ message: `User status updated to ${status} successfully.`, user });
  } catch (err) {
    res.status(500).json({ error: "Failed to change user status" });
  }
});

// PATCH /api/admin/users/:id/role
// SuperAdmin Only: Update user administrative role
router.patch("/users/:id/role", requireRole(["superadmin"]), async (req, res) => {
  try {
    const { role } = req.body;
    if (!["user", "admin", "superadmin"].includes(role)) {
      return res.status(400).json({ error: "Invalid role value." });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Prevent demoting self
    if (String(user._id) === String(req.user.id)) {
      return res.status(400).json({ error: "Cannot change your own role." });
    }

    const originalRole = user.role;
    user.role = role;
    await user.save();

    // Revoke current sessions so they are forced to log in again and load their new role claims
    await UserSession.updateMany({ userId: user._id }, { status: "revoked" });

    // Log the change
    await ActivityLog.create({
      actorId: req.user.id,
      action: "role_change",
      targetId: user._id,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1",
      userAgent: req.headers["user-agent"],
      details: {
        email: user.email,
        originalRole,
        newRole: role
      }
    });

    res.json({ message: `User role promoted/demoted to ${role}`, user });
  } catch (err) {
    res.status(500).json({ error: "Failed to update user role" });
  }
});

// GET /api/admin/sessions
// Retrieve all active device session trackers in the system (paginated)
router.get("/sessions", requireRole(["admin", "superadmin"]), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      UserSession.find()
        .populate("userId", "name email")
        .sort({ lastActive: -1 })
        .skip(skip)
        .limit(limit),
      UserSession.countDocuments()
    ]);

    res.json({
      sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch session registry" });
  }
});

// GET /api/admin/users/:id/sessions
// Retrieve all device session trackers for a user
router.get("/users/:id/sessions", requireRole(["admin", "superadmin"]), async (req, res) => {
  try {
    const sessions = await UserSession.find({ userId: req.params.id }).sort({ lastActive: -1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user session registry" });
  }
});

// DELETE /api/admin/users/:id/sessions
// SuperAdmin Only: Revoke all active sessions for a user
router.delete("/users/:id/sessions", requireRole(["superadmin"]), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const result = await UserSession.updateMany(
      { userId: user._id, status: "active" },
      { status: "revoked" }
    );

    await ActivityLog.create({
      actorId: req.user.id,
      action: "session_revoke_all",
      targetId: user._id,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1",
      userAgent: req.headers["user-agent"],
      details: {
        email: user.email,
        revokedCount: result.modifiedCount
      }
    });

    res.json({ message: `Successfully revoked all (${result.modifiedCount}) active sessions for this user.` });
  } catch (err) {
    res.status(500).json({ error: "Failed to revoke user sessions" });
  }
});

// DELETE /api/admin/sessions/:id
// SuperAdmin Only: Forceful session revocation (Remote logout)
router.delete("/sessions/:id", requireRole(["superadmin"]), async (req, res) => {
  try {
    const session = await UserSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session record not found." });
    }

    if (session.status === "revoked") {
      return res.status(400).json({ error: "Session is already revoked." });
    }

    session.status = "revoked";
    await session.save();

    // Add session activity logs
    await ActivityLog.create({
      actorId: req.user.id,
      action: "session_revoke",
      targetId: session.userId,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1",
      userAgent: req.headers["user-agent"],
      details: {
        sessionId: session._id,
        device: session.device,
        browser: session.browser,
        os: session.os
      }
    });

    res.json({ message: "Session revoked successfully. User will be logged out on next request." });
  } catch (err) {
    res.status(500).json({ error: "Failed to revoke active session" });
  }
});

// GET /api/admin/tickets
// Support ticket overview list with SLA sorting (Oldest open first)
router.get("/tickets", requireRole(["admin", "superadmin"]), async (req, res) => {
  try {
    // Sort: Open/Reviewing first (oldest first for SLA), then Closed (latest first)
    const tickets = await SupportTicket.find()
      .populate("userId", "name email")
      .sort({ status: 1, createdAt: 1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch support tickets ticket listing" });
  }
});

// PATCH /api/admin/tickets/:id
// Manage ticket status and attach administrative responses
router.patch("/tickets/:id", requireRole(["admin", "superadmin"]), async (req, res) => {
  try {
    const { status, replyText } = req.body;
    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found." });
    }

    const oldStatus = ticket.status;
    if (status) {
      if (!["open", "reviewing", "closed"].includes(status)) {
        return res.status(400).json({ error: "Invalid status value." });
      }
      ticket.status = status;
    }

    // In a full production app, this would trigger an email back to the customer.
    // We update description or add a custom field. Let's record the response in the activity log details.
    await ticket.save();

    await ActivityLog.create({
      actorId: req.user.id,
      action: "ticket_update",
      targetId: ticket.userId,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1",
      userAgent: req.headers["user-agent"],
      details: {
        ticketId: ticket._id,
        title: ticket.title,
        oldStatus,
        newStatus: ticket.status,
        hasAdminReply: !!replyText
      }
    });

    res.json({ message: "Ticket updated successfully", ticket });
  } catch (err) {
    res.status(500).json({ error: "Failed to update support ticket details" });
  }
});

// GET /api/admin/audit-logs
// SuperAdmin Only: Paginated searchable audit trail
router.get("/audit-logs", requireRole(["superadmin"]), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.action) {
      query.action = req.query.action;
    }

    if (req.query.actorId) {
      query.actorId = req.query.actorId;
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      // Search details or actions
      query.$or = [
        { action: searchRegex },
        { "details.email": searchRegex }
      ];
    }

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) {
        query.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        query.createdAt.$lte = new Date(req.query.endDate);
      }
    }

    const [logs, total] = await Promise.all([
      ActivityLog.find(query)
        .populate("actorId", "name email")
        .populate("targetId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ActivityLog.countDocuments(query)
    ]);

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to read security audit trails" });
  }
});

// GET /api/admin/system-health
// SuperAdmin Only: Live diagnostic reporting
router.get("/system-health", requireRole(["superadmin"]), async (req, res) => {
  try {
    // 1. Process diagnostic specs
    const memory = process.memoryUsage();
    const uptime = process.uptime();

    // 2. Database statistics
    const stats = await mongoose.connection.db.stats();

    // 3. Collection details
    const collections = ["users", "tasks", "supporttickets", "usersessions", "activitylogs"];
    const collectionDetails = {};

    for (const name of collections) {
      try {
        const collStats = await mongoose.connection.db.collection(name).stats();
        collectionDetails[name] = {
          count: collStats.count,
          sizeKb: Math.round(collStats.size / 1024),
          avgObjSize: Math.round(collStats.avgObjSize || 0),
          indexSizeKb: Math.round(collStats.totalIndexSize / 1024)
        };
      } catch (e) {
        collectionDetails[name] = { count: 0, sizeKb: 0, error: e.message };
      }
    }

    res.json({
      process: {
        uptime,
        memoryUsage: {
          rssMb: Math.round(memory.rss / (1024 * 1024)),
          heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
          heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
          externalMb: Math.round(memory.external / (1024 * 1024))
        },
        nodeVersion: process.version,
        platform: process.platform
      },
      database: {
        status: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        dbName: stats.db,
        totalCollections: stats.collections,
        dataSizeMb: Math.round((stats.dataSize || 0) / (1024 * 1024)),
        storageSizeMb: Math.round((stats.storageSize || 0) / (1024 * 1024)),
        avgObjSize: Math.round(stats.avgObjSize || 0),
        indexSizeMb: Math.round((stats.indexSize || 0) / (1024 * 1024))
      },
      collections: collectionDetails
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to gather diagnostics: " + err.message });
  }
});

module.exports = router;
