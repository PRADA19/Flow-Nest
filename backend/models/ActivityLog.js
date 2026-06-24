const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    action: {
      type: String,
      required: true // e.g. "auth_login", "auth_logout", "task_create", "task_update", "task_delete", "user_suspend", "user_activate", "role_change", "ticket_update", "session_revoke"
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User" // Optional target ID (e.g. user being suspended)
    },
    details: {
      type: mongoose.Schema.Types.Mixed // Flexible JSON object details
    },
    ipAddress: {
      type: String,
      required: true
    },
    userAgent: {
      type: String
    }
  },
  { timestamps: true }
);

// Indexes for pagination and filtering
activityLogSchema.index({ actorId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("ActivityLog", activityLogSchema);
