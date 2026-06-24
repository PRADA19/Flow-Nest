const mongoose = require("mongoose");

const userSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true
    },
    device: { type: String, default: "Unknown Device" },
    browser: { type: String, default: "Unknown Browser" },
    os: { type: String, default: "Unknown OS" },
    ipAddress: { type: String, required: true },
    lastActive: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["active", "revoked", "expired"],
      default: "active",
      required: true
    }
  },
  { timestamps: true }
);

// Indexes for high performance session queries
userSessionSchema.index({ userId: 1 });
userSessionSchema.index({ lastActive: -1 });

module.exports = mongoose.model("UserSession", userSessionSchema);
