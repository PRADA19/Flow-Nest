const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      unique: true
    },
    password: {
      type: String,
      required: true
    },
    xp: {
      type: Number,
      default: 0
    },
    level: {
      type: Number,
      default: 1
    },
    streak: {
      type: Number,
      default: 0
    },
    lastCompletedDate: {
      type: Date
    },
    completedTasksCount: {
      type: Number,
      default: 0
    },
    unlockedBadges: [
      {
        type: String
      }
    ],
    role: {
      type: String,
      enum: ["user", "admin", "owner"],
      default: "user"
    },
    adminRequestStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none"
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active"
    },
    tokenVersion: {
      type: Number,
      default: 1
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
