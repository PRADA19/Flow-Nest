const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },
    completed: {
      type: Boolean,
      default: false
    },
    dueDate: {
      type: Date
    },
    priority: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium"
    },
    tags: [
      {
        type: String
      }
    ],
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    completedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

// Add indexes for performance
taskSchema.index({ userId: 1 });
taskSchema.index({ userId: 1, completed: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ completed: 1 });

module.exports = mongoose.model("Task", taskSchema);
