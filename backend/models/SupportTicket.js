const mongoose = require("mongoose");

const supportTicketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    type: {
      type: String,
      enum: ["contact", "bug", "feature"],
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ["open", "reviewing", "closed"],
      default: "open",
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      required: true
    }
  },
  { timestamps: true }
);

// Indexes for fast retrieval by user or type
supportTicketSchema.index({ userId: 1 });
supportTicketSchema.index({ type: 1 });

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
