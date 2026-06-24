const mongoose = require("mongoose");

const systemMetricSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      unique: true
    },
    metrics: {
      totalUsers: { type: Number, default: 0 },
      dailyActiveUsers: { type: Number, default: 0 },
      weeklyActiveUsers: { type: Number, default: 0 },
      monthlyActiveUsers: { type: Number, default: 0 },
      totalTasks: { type: Number, default: 0 },
      completedTasks: { type: Number, default: 0 },
      focusGardenStageDistribution: {
        stage0: { type: Number, default: 0 }, // Seed
        stage1: { type: Number, default: 0 }, // Sprout
        stage2: { type: Number, default: 0 }, // Small Plant
        stage3: { type: Number, default: 0 }, // Sapling
        stage4: { type: Number, default: 0 }, // Young Tree
        stage5: { type: Number, default: 0 }, // Growing Tree
        stage6: { type: Number, default: 0 }, // Mature Tree
        stage7: { type: Number, default: 0 }  // Fully Bloomed
      },
      openTickets: { type: Number, default: 0 },
      closedTickets: { type: Number, default: 0 },
      aiConversationsCount: { type: Number, default: 0 },
      aiTokenUsage: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

systemMetricSchema.index({ date: -1 });

module.exports = mongoose.model("SystemMetric", systemMetricSchema);
