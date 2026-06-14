// ================= IMPORTS =================
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const morgan = require("morgan");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const compression = require("compression");

require("dotenv").config();

let genAI = null;

if (process.env.GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  } catch (err) {
    console.error("Gemini init failed:", err.message);
    genAI = null;
  }
}
// ================= ENV VALIDATION =================
const requiredEnv = ["JWT_SECRET", "COOKIE_SECRET"];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`🚨 Missing ${key}`);
    process.exit(1);
  }
}

// ================= MODELS =================
const Task = require("./models/Task");
const User = require("./models/User");
const failover = require("./database/sqliteFailover");

// ================= APP =================
const app = express();
app.set("trust proxy", 1);

// ================= SECURITY & COMPRESSION =================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));

app.use(compression());

app.use(mongoSanitize());

app.use(morgan("combined"));

const allowedOrigins = [];

const addOrigin = (originStr) => {
  if (!originStr) return;
  originStr.split(",").forEach(orig => {
    const trimmed = orig.trim().replace(/\/$/, "");
    if (trimmed && !allowedOrigins.includes(trimmed)) {
      allowedOrigins.push(trimmed);
    }
  });
};

addOrigin(process.env.FRONTEND_URL);
addOrigin(process.env.CLIENT_URL);
addOrigin(process.env.ALLOWED_ORIGINS);

// Always allow local development origins alongside production allowed origins
const localOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5501",
  "http://localhost:3456",
  "http://127.0.0.1:3456",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];
localOrigins.forEach(origin => {
  if (!allowedOrigins.includes(origin)) {
    allowedOrigins.push(origin);
  }
});

const isLocalDevOrigin = (origin) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }
  if (allowedOrigins.includes(origin)) {
    return true;
  }
  if (process.env.NODE_ENV !== "production" && isLocalDevOrigin(origin)) {
    return true;
  }
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked origin: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));

app.use(cookieParser(process.env.COOKIE_SECRET));

// Create dedicated Express Router for consistent /api routing without stripping
const apiRouter = express.Router();
app.use("/api", apiRouter);

// Bind app routing methods to apiRouter (exempting health and status diagnostics and settings getters)
const methods = ["get", "post", "put", "delete", "patch", "options", "head"];
methods.forEach((method) => {
  const original = app[method].bind(app);
  app[method] = (path, ...handlers) => {
    if (handlers.length === 0) {
      return original(path);
    }
    if (path === "/health" || path === "/status" || path === "/api/health") {
      return original(path, ...handlers);
    }
    return apiRouter[method](path, ...handlers);
  };
});

// ================= MIDDLEWARE =================
const {
  authLimiter,
  aiLimiter,
  apiLimiter,
} = require("./middleware/rateLimiter");

const { validateBody } = require("./middleware/validator");

const authMiddleware = require("./middleware/auth");
const {
  extractToken,
  blacklistToken,
} = require("./middleware/tokenBlacklist");

const validateObjectId = require("./middleware/validateObjectId");

// ================= RATE LIMIT =================
app.use("/api/tasks", apiLimiter);
app.use("/api/dashboard", apiLimiter);
app.use("/api/analytics", apiLimiter);
app.use("/api/notifications", apiLimiter);
app.use("/api/support", apiLimiter);

// ================= SUPPORT ROUTES =================
app.use("/api/support", require("./routes/support"));

// ================= DATABASE =================
let isOfflineMode = false;
let isDatabaseUnavailable = false;
let isReconnecting = false;

// In-memory stores (dev / lightweight — not persistent across restarts)
const pushSubscriptions = new Map();
const userNotifications = new Map();

// Monitor mongoose connection events
mongoose.connection.on("connected", () => {
  console.log("✅ MongoDB connection established");
  isDatabaseUnavailable = false;
  isOfflineMode = false;
});

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB disconnected!");
  if (process.env.NODE_ENV === "production") {
    isDatabaseUnavailable = true;
    scheduleBackgroundReconnect();
  }
});

mongoose.connection.on("error", (err) => {
  console.error("🚨 MongoDB connection error:", err.message);
});

const scheduleBackgroundReconnect = (initialInterval = 5000, maxInterval = 60000) => {
  if (isReconnecting) return;
  isReconnecting = true;

  let currentInterval = initialInterval;

  const attemptReconnect = () => {
    if (mongoose.connection.readyState === 1) {
      isDatabaseUnavailable = false;
      isReconnecting = false;
      return;
    }

    console.log("📡 Attempting background MongoDB reconnection...");
    setTimeout(async () => {
      try {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (mongoUri) {
          await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 30000,
          });
          isDatabaseUnavailable = false;
          isOfflineMode = false;
          isReconnecting = false;
          console.log("✅ MongoDB reconnected successfully in background!");
          return;
        }
      } catch (err) {
        console.error(`❌ Background MongoDB reconnection failed: ${err.message}. Retrying in ${currentInterval / 1000}s (exponential backoff)...`);
        currentInterval = Math.min(currentInterval * 2, maxInterval);
      }

      if (mongoose.connection.readyState !== 1) {
        attemptReconnect();
      } else {
        isReconnecting = false;
      }
    }, currentInterval);
  };

  console.log(`📡 Scheduling background MongoDB reconnection check (initial retry in ${initialInterval / 1000}s)...`);
  attemptReconnect();
};

const connectDB = async (retries = 5, initialDelay = 2000) => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!mongoUri) {
    console.error("🚨 FATAL: MONGO_URI missing");
    process.exit(1);
  }

  let delay = initialDelay;

  for (let i = 1; i <= retries; i++) {
    try {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 30000,
      });
      return;
    } catch (err) {
      console.error(`❌ MongoDB connection attempt ${i} failed:`, err.message);
      if (i < retries) {
        console.log(`Retrying connection in ${delay / 1000}s (exponential backoff)...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        if (process.env.NODE_ENV === "production") {
          isDatabaseUnavailable = true;
          console.error(
            "🚨 Production mode: failover disabled — API will return 503 until MongoDB is available"
          );
          scheduleBackgroundReconnect();
        } else {
          console.warn("⚠️ Development mode: switching to offline failover...");
          isOfflineMode = true;
        }
      }
    }
  }
};

connectDB();

app.use((req, res, next) => {
  if (req.path === "/health") {
    return next();
  }
  if (isDatabaseUnavailable) {
    return res.status(503).json({ error: "Database unavailable" });
  }
  next();
});

// ================= DATABASE HELPERS =================

const findUserByEmail = async (email) => {
  if (isOfflineMode) {
    return await failover.findUserByEmail(email);
  }

  return await User.findOne({
    email: email.toLowerCase(),
  });
};

const createUser = async (userData) => {
  if (isOfflineMode) {
    return await failover.createUser(userData);
  }

  return await User.create(userData);
};

const findUserById = async (id) => {
  if (isOfflineMode) {
    return await failover.findUserById(id);
  }

  return await User.findById(id);
};

const findTasks = async (filter, sortOpt = {}) => {
  if (isOfflineMode) {
    return await failover.findTasks(filter);
  }

  return await Task.find(filter).sort(sortOpt);
};

const createTask = async (taskData) => {
  const { _id, userId, ...safeData } = taskData;

  const payload = {
    ...safeData,
    userId,
  };

  if (isOfflineMode) {
    return await failover.createTask(payload);
  }

  return await Task.create(payload);
};

const findTaskByIdAndUser = async (id, userId) => {
  if (isOfflineMode) {
    return await failover.findTaskByIdAndUser(id, userId);
  }

  return await Task.findOne({
    _id: id,
    userId,
  });
};

const updateTask = async (id, userId, updateData) => {
  const {
    _id,
    userId: clientUserId,
    ...cleanData
  } = updateData;

  if (isOfflineMode) {
    return await failover.updateTask(
      id,
      userId,
      cleanData
    );
  }

  return await Task.findOneAndUpdate(
    {
      _id: id,
      userId,
    },
    cleanData,
    {
      returnDocument: "after",
    }
  );
};

const deleteTaskById = async (id, userId) => {
  if (isOfflineMode) {
    return await failover.deleteTaskById(id, userId);
  }

  return await Task.findOneAndDelete({
    _id: id,
    userId,
  });
};

// ================= GAMIFICATION =================

const getLevelTitle = (level) => {
  const titles = [
    "Novice",
    "Explorer",
    "Apprentice",
    "Achiever",
    "Specialist",
    "Pro Planner",
    "Priority Champion",
    "Focus Master",
    "Productivity Legend",
  ];

  return titles[
    Math.min(level - 1, titles.length - 1)
  ];
};

const calculateGamification = async (
  user,
  task,
  completed
) => {
  if (!completed) {
    if (user.completedTasksCount > 0) {
      user.completedTasksCount -= 1;
    }

    await user.save();

    const nextLevelXp = user.level * 100;

    return {
      xpEarned: 0,
      streak: user.streak,
      newlyUnlockedBadges: [],
      leveledUp: false,
      levelInfo: {
        level: user.level,
        levelTitle: getLevelTitle(user.level),
        progressPercent: Math.round(
          (user.xp / nextLevelXp) * 100
        ),
        currentLevelXp: user.xp,
        nextLevelXp,
      },
    };
  }

  let xpEarned = 10;

  if (task.priority === "high") {
    xpEarned = 20;
  } else if (task.priority === "medium") {
    xpEarned = 15;
  }

  user.xp += xpEarned;

  user.completedTasksCount += 1;

  const today = new Date().toDateString();

  const yesterday = new Date(
    Date.now() - 86400000
  ).toDateString();

  let streakUpdated = false;

  if (user.lastCompletedDate) {
    const lastDateString = new Date(
      user.lastCompletedDate
    ).toDateString();

    if (lastDateString === today) {
      streakUpdated = true;
    } else if (lastDateString === yesterday) {
      user.streak += 1;
      streakUpdated = true;
    }
  }

  if (!streakUpdated) {
    user.streak = 1;
  }

  user.lastCompletedDate = new Date();

  const newlyUnlockedBadges = [];

  const addBadge = (id, name) => {
    if (!user.unlockedBadges.includes(id)) {
      user.unlockedBadges.push(id);

      newlyUnlockedBadges.push({
        id,
        name,
      });
    }
  };

  addBadge("first_step", "First Step");

  if (task.priority === "high") {
    addBadge(
      "priority_champion",
      "Priority Champion"
    );
  }

  if (user.streak >= 3) {
    addBadge("streak_starter", "Streak Starter");
  }

  if (user.streak >= 7) {
    addBadge("focus_master", "Focus Master");
  }

  if (user.completedTasksCount >= 100) {
    addBadge("century_club", "Century Club");
  }

  const allTasks = await findTasks({
    userId: user._id,
  });

  const completedTasks = allTasks.filter(
    (t) => t.completed
  );

  const distinctTags = new Set(
    completedTasks.flatMap((t) => t.tags || [])
  );

  if (distinctTags.size >= 3) {
    addBadge(
      "category_explorer",
      "Category Explorer"
    );
  }

  let leveledUp = false;

  let nextLevelXp = user.level * 100;

  while (user.xp >= nextLevelXp) {
    user.xp -= nextLevelXp;

    user.level += 1;

    leveledUp = true;

    nextLevelXp = user.level * 100;
  }

  await user.save();

  return {
    xpEarned,
    streak: user.streak,
    newlyUnlockedBadges,
    leveledUp,
    levelInfo: {
      level: user.level,
      levelTitle: getLevelTitle(user.level),
      progressPercent: Math.round(
        (user.xp / nextLevelXp) * 100
      ),
      currentLevelXp: user.xp,
      nextLevelXp,
    },
  };
};

// ================= AUTH =================

// REGISTER
app.post(
  "/auth/register",
  authLimiter,
  validateBody("authRegister"),
  async (req, res) => {
    try {
      const { name, email, password } = req.body;

      const existingUser =
        await findUserByEmail(email);

      if (existingUser) {
        return res.status(400).json({
          error: "Email already registered",
        });
      }

      const hashedPassword =
        await bcrypt.hash(password, 10);

      await createUser({
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
      });

      res.status(201).json({
        message:
          "Registration successful. Please login.",
      });
    } catch (err) {
      res.status(500).json({
        error: "Registration failed",
      });
    }
  }
);

// LOGIN
app.post(
  "/auth/login",
  authLimiter,
  validateBody("authLogin"),
  async (req, res) => {
    try {
      const { email, password } = req.body;

      const user = await findUserByEmail(email);

      if (!user) {
        return res.status(400).json({
          error: "Invalid credentials",
        });
      }

      const isMatch = await bcrypt.compare(
        password,
        user.password
      );

      if (!isMatch) {
        return res.status(400).json({
          error: "Invalid credentials",
        });
      }

      const token = jwt.sign(
        {
          id: user._id,
          email: user.email,
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "7d",
        }
      );

      res.cookie("smarttodo_token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        signed: true,
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        token,
        user: {
          name: user.name,
          email: user.email,
          xp: user.xp,
          level: user.level,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: "Login failed",
      });
    }
  }
);

// LOGOUT
app.post("/auth/logout", async (req, res) => {
  await blacklistToken(extractToken(req));

  res.clearCookie("smarttodo_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    signed: true,
    path: "/",
  });

  res.json({
    message: "Logged out successfully",
  });
});

// ================= TASKS =================

// GET TASKS
app.get(
  "/tasks",
  authMiddleware,
  async (req, res) => {
    try {
      const userId = req.user.id;

      const filter = {
        userId,
      };

      if (req.query.priority) {
        filter.priority = req.query.priority;
      }

      if (req.query.tag) {
        filter.tags = req.query.tag;
      }

      const tasks = await findTasks(filter, {
        completed: 1,
        _id: -1,
      });

      res.json(tasks);
    } catch (err) {
      res.status(500).json({
        error: "Failed to fetch tasks",
      });
    }
  }
);

// CREATE TASK
app.post(
  "/tasks",
  authMiddleware,
  validateBody("taskPost"),
  async (req, res) => {
    try {
      const {
        title,
        dueDate,
        priority,
        tags,
      } = req.body;

      const task = await createTask({
        title,
        dueDate,
        priority: priority || "medium",
        tags: tags || [],
        userId: req.user.id,
      });

      res.status(201).json(task);
    } catch (err) {
      res.status(500).json({
        error: "Failed to create task",
      });
    }
  }
);

// UPDATE TASK
app.put(
  "/tasks/:id",
  authMiddleware,
  validateObjectId("id"),
  validateBody("taskPut"),
  async (req, res) => {
    try {
      const userId = req.user.id;

      const originalTask =
        await findTaskByIdAndUser(
          req.params.id,
          userId
        );

      if (!originalTask) {
        return res.status(404).json({
          error: "Task not found",
        });
      }

      const wasCompleted =
        originalTask.completed;

      // Dynamically manage completedAt timestamp lifecycle
      if (req.body.completed !== undefined) {
        if (req.body.completed) {
          req.body.completedAt = new Date();
        } else {
          req.body.completedAt = null;
        }
      }

      const task = await updateTask(
        req.params.id,
        userId,
        req.body
      );

      const user = await findUserById(userId);

      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      const taskObj = typeof task.toObject === "function" ? task.toObject() : task;

      if (!wasCompleted && task.completed) {
        const rewards =
          await calculateGamification(
            user,
            task,
            true
          );

        return res.json({
          ...taskObj,
          gamification: rewards,
          userName: user.name,
        });
      }

      if (wasCompleted && !task.completed) {
        const rewards =
          await calculateGamification(
            user,
            task,
            false
          );

        return res.json({
          ...taskObj,
          gamification: rewards,
          userName: user.name,
        });
      }

      res.json(task);
    } catch (err) {
      res.status(500).json({
        error: "Failed to update task",
      });
    }
  }
);

// DELETE TASK
app.delete(
  "/tasks/:id",
  authMiddleware,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const task = await deleteTaskById(
        req.params.id,
        req.user.id
      );

      if (!task) {
        return res.status(404).json({
          error: "Task not found",
        });
      }

      res.json({
        message: "Deleted",
      });
    } catch (err) {
      res.status(500).json({
        error: "Failed to delete task",
      });
    }
  }
);

// ================= DASHBOARD =================
app.get(
  "/dashboard",
  authMiddleware,
  async (req, res) => {
    try {
      const userId = req.user.id;

      const user = await findUserById(userId);

      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      const userTasks = await findTasks({
        userId,
      });

      const completedTasks =
        userTasks.filter((t) => t.completed);

      const pendingTasks =
        userTasks.filter((t) => !t.completed);

      const completionRate = userTasks.length
        ? Math.round(
            (completedTasks.length /
              userTasks.length) *
              100
          )
        : 0;

      const nextLevelXp = user.level * 100;

      // Sort tasks: latest updated first, limit to 5
      const recentTasks = [...userTasks]
        .sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt || 0);
          const dateB = new Date(b.updatedAt || b.createdAt || 0);
          return dateB - dateA;
        })
        .slice(0, 5);

      // Calculate insights
      let topPriority = "medium";
      const priorityCounts = { high: 0, medium: 0, low: 0 };
      completedTasks.forEach((t) => {
        if (priorityCounts[t.priority] !== undefined) {
          priorityCounts[t.priority]++;
        }
      });
      if (priorityCounts.high >= priorityCounts.medium && priorityCounts.high >= priorityCounts.low) {
        topPriority = "high";
      } else if (priorityCounts.low >= priorityCounts.medium && priorityCounts.low >= priorityCounts.high) {
        topPriority = "low";
      }

      let productivityMessage = "Start by completing a task to boost your level!";
      if (completionRate >= 80) {
        productivityMessage = "Excellent focus! You're crushing your goals today.";
      } else if (completionRate >= 50) {
        productivityMessage = "Solid progress. Keep pushing to clear your list.";
      } else if (userTasks.length > 0) {
        productivityMessage = "Try starting with a high priority task to build momentum.";
      }

      const insights = {
        topPriority,
        completionRateSummary: `You have completed ${completedTasks.length} out of ${userTasks.length} tasks (${completionRate}%).`,
        productivityMessage,
      };

      res.json({
        userName: user.name,
        email: user.email,
        recentTasks,
        insights,

        stats: {
          totalTasks: userTasks.length,
          completedTasks:
            completedTasks.length,
          pendingTasks: pendingTasks.length,
          completionRate,
        },

        gamification: {
          levelInfo: {
            level: user.level,
            levelTitle: getLevelTitle(
              user.level
            ),
            progressPercent: Math.round(
              (user.xp / nextLevelXp) * 100
            ),
            currentLevelXp: user.xp,
            nextLevelXp,
          },

          streak: user.streak,
          unlockedBadgesCount:
            user.unlockedBadges.length,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: "Failed to load dashboard",
      });
    }
  }
);

// ================= ANALYTICS =================
app.get(
  "/analytics",
  authMiddleware,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const user = await findUserById(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const userTasks = await findTasks({ userId });
      const completedTasks = userTasks.filter((t) => t.completed);
      const pendingTasks = userTasks.filter((t) => !t.completed);
      const completionRate = userTasks.length
        ? Math.round((completedTasks.length / userTasks.length) * 100)
        : 0;
      const nextLevelXp = user.level * 100;

      res.json({
        totalTasks: userTasks.length,
        completedTasks: completedTasks.length,
        pendingTasks: pendingTasks.length,
        completionRate,
        streak: user.streak,
        levelInfo: {
          level: user.level,
          levelTitle: getLevelTitle(user.level),
          progressPercent: Math.round((user.xp / nextLevelXp) * 100),
          currentLevelXp: user.xp,
          nextLevelXp,
        },
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to load analytics" });
    }
  }
);

// ================= NOTIFICATIONS (in-memory mock) =================
const getUserNotifications = (userId) => {
  if (!userNotifications.has(userId)) {
    userNotifications.set(userId, [
      {
        _id: `welcome-${userId}`,
        title: "Welcome to Flow Nest",
        message: "Your task reminders and updates will appear here.",
        createdAt: new Date().toISOString(),
        isRead: false,
        type: "info",
      },
    ]);
  }
  return userNotifications.get(userId);
};

app.get(
  "/notifications",
  authMiddleware,
  (req, res) => {
    const items = getUserNotifications(req.user.id);
    const unreadCount = items.filter((n) => !n.isRead).length;
    res.json({ notifications: items, unreadCount });
  }
);

app.put(
  "/notifications/:id/read",
  authMiddleware,
  (req, res) => {
    const items = getUserNotifications(req.user.id);
    const note = items.find((n) => n._id === req.params.id);

    if (!note) {
      return res.status(404).json({ error: "Notification not found" });
    }

    note.isRead = true;
    const unreadCount = items.filter((n) => !n.isRead).length;
    res.json({ message: "Marked as read", unreadCount });
  }
);

// ================= PUSH (in-memory) =================
app.get(
  "/push/vapidPublicKey",
  authMiddleware,
  (req, res) => {
    res.json({
      publicKey:
        process.env.VAPID_PUBLIC_KEY ||
        "BEl62iUYgUivxIkv69yViEuiBIa1HxFbN8jZ8jZ8jZ8jZ8jZ8jZ8jZ8jZ8jZ8jZ8",
    });
  }
);

app.post(
  "/push/subscribe",
  authMiddleware,
  (req, res) => {
    const { subscription } = req.body || {};

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Valid push subscription required" });
    }

    const userId = String(req.user.id);
    const endpoint = subscription.endpoint;

    if (!pushSubscriptions.has(userId)) {
      pushSubscriptions.set(userId, new Map());
    }

    const userSubs = pushSubscriptions.get(userId);

    if (userSubs.has(endpoint)) {
      return res.json({ message: "Already subscribed", duplicate: true });
    }

    userSubs.set(endpoint, subscription);
    res.status(201).json({ message: "Subscribed to push notifications" });
  }
);

// ==========================================
// FLOWNEST REMINDER SYSTEM DATABASE MODELS
// ==========================================

const notificationSettingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    unique: true,
    required: true
  },
  emailEnabled: {
    type: Boolean,
    default: true
  },
  pushEnabled: {
    type: Boolean,
    default: true
  }
});

const notificationLogSchema = new mongoose.Schema({
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Task",
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  offsetMinutes: {
    type: Number,
    required: true
  },
  sentAt: {
    type: Date,
    default: Date.now
  }
});

// Compound unique index to prevent duplicate deliveries under race conditions
notificationLogSchema.index({ taskId: 1, offsetMinutes: 1, userId: 1 }, { unique: true });
notificationLogSchema.index({ userId: 1 });
notificationLogSchema.index({ taskId: 1, offsetMinutes: 1 });

const NotificationSettings = mongoose.model("NotificationSettings", notificationSettingsSchema);
const NotificationLog = mongoose.model("NotificationLog", notificationLogSchema);

// ==========================================
// FLOWNEST NODEMAILER SMTP TRANSPORTER
// ==========================================
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify((error, success) => {
  if (error) {
    console.warn("⚠️ SMTP connection failed. Email reminders are offline:", error.message);
  } else {
    console.log("🚀 SMTP connection successful. Mailer is ready.");
  }
});

// ==========================================
// GLOBAL NOTIFICATION SENDER (FCM / PWA Ready)
// ==========================================
async function sendNotification(userId, title, body) {
  try {
    let settings = await NotificationSettings.findOne({ userId });
    if (!settings) {
      settings = await NotificationSettings.create({ userId });
    }

    const user = await findUserById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    let emailSent = false;
    let pushSent = false;

    // Email dispatch channel
    if (settings.emailEnabled && user.email) {
      const mailOptions = {
        from: process.env.FROM_EMAIL || `"FlowNest Reminders" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: title,
        html: `
          <div style="font-family: 'Inter', sans-serif; background-color: #f8fafc; padding: 32px 16px; color: #1e293b;">
            <div style="max-width: 580px; margin: 0 auto; background: white; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03); overflow: hidden;">
              <div style="background: linear-gradient(135deg, #E2AFFF, #D0D1FF); padding: 32px 24px; text-align: center; border-bottom: 1px solid #e2e8f0;">
                <h1 style="margin: 0; color: #1e293b; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Flow Nest</h1>
                <p style="margin: 4px 0 0 0; color: #475569; font-size: 14px;">Plan today. Achieve tomorrow.</p>
              </div>
              <div style="padding: 32px 24px;">
                <h3 style="margin-top: 0; color: #0f172a; font-size: 18px; font-weight: 600;">${title}</h3>
                <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 0;">${body}</p>
              </div>
              <div style="background: #f8fafc; padding: 20px 24px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
                <p style="margin: 0;">You are receiving this because you enabled email reminders on Flow Nest.</p>
                <p style="margin: 6px 0 0 0;"><a href="file:///d:/Smarttodo/frontend/pages/settings.html" style="color: #8B5CF6; text-decoration: none; font-weight: 600;">Manage Notification Preferences</a></p>
              </div>
            </div>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      emailSent = true;
      console.log(`✉️ Notification email sent to ${user.email}`);
    }

    // Push Notification placeholder for future FCM/PWA token registration integration
    if (settings.pushEnabled) {
      // Future FCM hook goes here:
      // await admin.messaging().sendToDevice(user.fcmToken, { ... });
      pushSent = true;
      console.log(`📱 Native Push placeholder triggered for user ${user.name}`);
    }

    return { emailSent, pushSent };
  } catch (error) {
    console.error(`❌ sendNotification failed for user ${userId}:`, error.message);
    throw error;
  }
}

// ==========================================
// SCHEDULER SWEEP & PROCESSING LOGIC
// ==========================================
async function processReminderQueues() {
  const now = new Date();
  
  // Find all incomplete tasks
  const tasks = await Task.find({ completed: false });
  console.log(`[Scheduler] Sweeping ${tasks.length} active tasks for reminders...`);

  // Target offsets: 3 days (4320m), 2 days (2880m), 1 day (1440m), 3 hours (180m), 1 hour (60m)
  const TARGET_OFFSETS = [
    { label: "3 days", minutes: 4320, windowMin: 15 },
    { label: "2 days", minutes: 2880, windowMin: 15 },
    { label: "1 day", minutes: 1440, windowMin: 15 },
    { label: "3 hours", minutes: 180, windowMin: 10 },
    { label: "1 hour", minutes: 60, windowMin: 10 }
  ];

  let taskRemindersSent = 0;

  for (const task of tasks) {
    if (!task.dueDate) continue;

    const dueDate = new Date(task.dueDate);
    const msUntilDue = dueDate - now;
    const minutesUntilDue = Math.round(msUntilDue / (60 * 1000));

    // Skip overdue tasks (handled collectively in the daily digest)
    if (minutesUntilDue <= 0) continue;

    for (const offset of TARGET_OFFSETS) {
      const diff = Math.abs(minutesUntilDue - offset.minutes);

      // If task is within target trigger time window
      if (diff <= offset.windowMin) {
        try {
          // Double check database log to enforce strict idempotency
          const existing = await NotificationLog.findOne({
            taskId: task._id,
            offsetMinutes: offset.minutes,
            userId: task.userId
          });

          if (existing) continue;

          // Dispatch notification
          const subject = `⏰ Reminder: "${task.title}" is due in ${offset.label}!`;
          const body = `Your task <strong>"${task.title}"</strong> is due in <strong>${offset.label}</strong> (on ${dueDate.toLocaleString()}). Get it done to keep your momentum going!`;

          await sendNotification(task.userId, subject, body);

          // Write log entry only after successful dispatch
          await NotificationLog.create({
            taskId: task._id,
            userId: task.userId,
            offsetMinutes: offset.minutes
          });

          taskRemindersSent++;
        } catch (err) {
          if (err.code === 11000) {
            console.log(`[Scheduler] Suppressed duplicate send under unique constraint (Task: ${task._id}, Offset: ${offset.minutes})`);
          } else {
            console.error(`[Scheduler] Error handling task reminder ${task._id}:`, err.message);
          }
        }
      }
    }
  }

  // --- DAILY OVERDUE SUMMARY DIGEST ---
  // Overdue summaries use a custom offsetMinutes sentinel: 99999
  let overdueDigestSent = 0;
  const activeUsers = await User.find({});

  for (const user of activeUsers) {
    try {
      const overdueTasks = await Task.find({
        userId: user._id,
        completed: false,
        dueDate: { $lt: now }
      });

      if (overdueTasks.length === 0) continue;

      // Check if user was already alerted today (since local midnight)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const existingDigestLog = await NotificationLog.findOne({
        userId: user._id,
        offsetMinutes: 99999,
        sentAt: { $gte: todayStart }
      });

      if (existingDigestLog) continue;

      // Compile items into HTML format
      const taskListHtml = overdueTasks.map(t => {
        const dueStr = t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "No date";
        const pLabel = (t.priority || "medium").toUpperCase();
        return `<li style="margin-bottom: 8px;"><strong>${t.title}</strong> (Due: ${dueStr} | Priority: ${pLabel})</li>`;
      }).join("");

      const subject = `🔥 Action Required: You have ${overdueTasks.length} overdue tasks!`;
      const body = `
        <p>Hi ${user.name},</p>
        <p>You have <strong>${overdueTasks.length}</strong> tasks that are currently overdue. Here is your daily summary:</p>
        <ul style="padding-left: 20px; color: #475569;">
          ${taskListHtml}
        </ul>
        <p>Complete them today to maintain your streak and earn extra XP!</p>
      `;

      await sendNotification(user._id, subject, body);

      // Log daily digest send event
      await NotificationLog.create({
        taskId: user._id, // User ID used as placeholder taskId for user-level daily digest logs
        userId: user._id,
        offsetMinutes: 99999
      });

      overdueDigestSent++;
    } catch (err) {
      if (err.code === 11000) {
        console.log(`[Scheduler] Suppressed duplicate daily digest (User: ${user._id})`);
      } else {
        console.error(`[Scheduler] Error handling daily digest for user ${user._id}:`, err.message);
      }
    }
  }

  return {
    taskRemindersSent,
    overdueDigestSent
  };
}

// ==========================================
// REMINDER SYSTEM API ENDPOINTS
// ==========================================

// 1. GET /notifications/settings - returns user configuration
app.get("/notifications/settings", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    let settings = await NotificationSettings.findOne({ userId });
    if (!settings) {
      settings = await NotificationSettings.create({ userId });
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to load notification settings" });
  }
});

// 2. POST /notifications/settings - creates or updates configuration
app.post("/notifications/settings", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { emailEnabled, pushEnabled } = req.body;

    const settings = await NotificationSettings.findOneAndUpdate(
      { userId },
      { emailEnabled: Boolean(emailEnabled), pushEnabled: Boolean(pushEnabled) },
      { new: true, upsert: true }
    );

    res.json({ message: "Settings updated successfully", settings });
  } catch (err) {
    res.status(500).json({ error: "Failed to save notification settings" });
  }
});

// 3. GET /reminders/process - cron endpoint
app.get("/reminders/process", async (req, res) => {
  const cronSecret = req.headers["x-cron-secret"];
  
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: "Forbidden: Invalid cron secret header" });
  }

  try {
    const results = await processReminderQueues();
    res.json({ status: "success", summary: results });
  } catch (err) {
    console.error("Cron reminders processing failed:", err);
    res.status(500).json({ error: "Reminders process execution failed", message: err.message });
  }
});

// ================= AI CHAT HELPERS =================

const AI_ACTION_TYPES = [
  "none",
  "create_task",
  "create_multiple_tasks",
  "complete_task",
  "list_tasks",
  "daily_plan",
  "schedule_tasks",
];

const normalizeTaskTitle = (title) =>
  String(title || "").toLowerCase().trim();

const buildCreateTaskPayload = (item, userId) => {
  const title = String(item.title || "").trim();
  const payload = {
    title,
    userId,
    priority: ["high", "medium", "low"].includes(
      item.priority
    )
      ? item.priority
      : "medium",
    tags: Array.isArray(item.tags) ? item.tags : [],
  };

  if (item.dueDate) {
    const due = new Date(item.dueDate);
    if (!Number.isNaN(due.getTime())) {
      payload.dueDate = due;
    }
  }

  return payload;
};

const parseAiAssistantJson = (raw) => {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fenced) {
    text = fenced[1].trim();
  }

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed.reply !== "string") {
      return null;
    }

    const action = parsed.action || { type: "none", data: {} };
    const type = AI_ACTION_TYPES.includes(action.type)
      ? action.type
      : "none";

    return {
      reply: parsed.reply.trim(),
      action: {
        type,
        data:
          action.data && typeof action.data === "object"
            ? action.data
            : {},
      },
    };
  } catch {
    return null;
  }
};

const buildTaskContextForAi = (tasks) => {
  const pending = tasks.filter((t) => !t.completed);

  if (pending.length === 0) {
    return "No pending tasks";
  }

  return pending
    .map((t) => {
      const due = t.dueDate
        ? new Date(t.dueDate).toISOString().split("T")[0]
        : "no due date";
      return `- id: ${t._id} | title: ${t.title} | priority: ${t.priority || "medium"} | due: ${due}`;
    })
    .join("\n");
};

const executeAiAction = async (
  action,
  userId,
  user,
  tasks
) => {
  const type = action?.type || "none";
  const data = action?.data || {};
  const pending = tasks.filter((t) => !t.completed);
  const existingTitles = new Set(
    pending.map((t) => normalizeTaskTitle(t.title))
  );

  const resolvePendingTask = (item) => {
    const taskId = item?.taskId
      ? String(item.taskId)
      : "";
    if (taskId) {
      return (
        pending.find((t) => String(t._id) === taskId) ||
        null
      );
    }
    const name = String(
      item?.taskName || item?.title || ""
    )
      .toLowerCase()
      .trim();
    if (!name) {
      return null;
    }
    return (
      pending.find((t) =>
        t.title.toLowerCase().includes(name)
      ) || null
    );
  };

  if (type === "none") {
    return {
      action: { type: "none", data: {} },
      reply: null,
    };
  }

  if (type === "create_task") {
    const title = String(data.title || "").trim();
    const norm = normalizeTaskTitle(title);

    if (title.length < 3) {
      return {
        action: {
          type: "create_task",
          data: { ...data, executed: false },
        },
        reply:
          "I couldn't create that task — please provide a clearer title (at least 3 characters).",
      };
    }

    if (existingTitles.has(norm)) {
      return {
        action: {
          type: "create_task",
          data: { ...data, executed: false, reason: "duplicate" },
        },
        reply: `A task titled "${title}" already exists in your pending list.`,
      };
    }

    const payload = buildCreateTaskPayload(data, userId);
    const created = await createTask(payload);
    existingTitles.add(norm);

    return {
      action: {
        type: "create_task",
        data: {
          title,
          dueDate: payload.dueDate || null,
          taskId: String(created._id),
          executed: true,
        },
      },
      reply: null,
    };
  }

  if (type === "create_multiple_tasks") {
    const tasksInput = Array.isArray(data.tasks)
      ? data.tasks
      : [];
    const batchTitles = new Set();
    const created = [];
    const skipped = [];

    for (const item of tasksInput) {
      const title = String(item?.title || "").trim();
      const norm = normalizeTaskTitle(title);

      if (title.length < 3) {
        skipped.push({ title, reason: "invalid_title" });
        continue;
      }

      if (
        existingTitles.has(norm) ||
        batchTitles.has(norm)
      ) {
        skipped.push({ title, reason: "duplicate" });
        continue;
      }

      const payload = buildCreateTaskPayload(
        item,
        userId
      );
      const task = await createTask(payload);

      batchTitles.add(norm);
      existingTitles.add(norm);
      created.push({
        taskId: String(task._id),
        title,
        priority: payload.priority,
        dueDate: payload.dueDate || null,
      });
    }

    if (created.length === 0) {
      return {
        action: {
          type: "create_multiple_tasks",
          data: {
            created,
            skipped,
            executed: false,
          },
        },
        reply:
          "No new tasks were created — they may already exist or titles were too short.",
      };
    }

    return {
      action: {
        type: "create_multiple_tasks",
        data: {
          created,
          skipped,
          executed: true,
        },
      },
      reply: null,
    };
  }

  if (type === "complete_task") {
    const search = String(
      data.taskName || data.title || ""
    )
      .toLowerCase()
      .trim();
    const taskId = data.taskId
      ? String(data.taskId)
      : "";

    let matching = null;

    if (taskId) {
      matching = pending.find(
        (t) => String(t._id) === taskId
      );
    }

    if (!matching && search) {
      matching = pending.find((t) =>
        t.title.toLowerCase().includes(search)
      );
    }

    if (!matching) {
      return {
        action: {
          type: "complete_task",
          data: {
            ...data,
            executed: false,
          },
        },
        reply: `I couldn't find a pending task matching "${data.taskName || data.title || taskId || "that name"}".`,
      };
    }

    if (!matching.completed) {
      await updateTask(matching._id, userId, {
        completed: true,
      });
      await calculateGamification(
        user,
        matching,
        true
      );
    }

    return {
      action: {
        type: "complete_task",
        data: {
          taskId: String(matching._id),
          title: matching.title,
          executed: true,
        },
      },
      reply: null,
    };
  }

  if (type === "list_tasks") {
    const taskItems = pending.map((t) => ({
      id: String(t._id),
      title: t.title,
      priority: t.priority || "medium",
      dueDate: t.dueDate || null,
    }));

    return {
      action: {
        type: "list_tasks",
        data: { tasks: taskItems, executed: true },
      },
      reply: null,
    };
  }

  if (type === "daily_plan") {
    const planInput = data.plan || {};
    const slots = ["morning", "afternoon", "evening"];
    const plan = {
      morning: [],
      afternoon: [],
      evening: [],
    };
    const assignedIds = new Set();

    for (const slot of slots) {
      const items = Array.isArray(planInput[slot])
        ? planInput[slot]
        : [];

      for (const item of items) {
        const task = resolvePendingTask(item);
        if (!task) {
          continue;
        }

        const id = String(task._id);
        if (assignedIds.has(id)) {
          continue;
        }

        assignedIds.add(id);
        plan[slot].push({
          taskId: id,
          title: task.title,
          priority: task.priority || "medium",
          dueDate: task.dueDate || null,
        });
      }
    }

    const unassigned = pending
      .filter((t) => !assignedIds.has(String(t._id)))
      .map((t) => ({
        taskId: String(t._id),
        title: t.title,
        priority: t.priority || "medium",
        dueDate: t.dueDate || null,
      }));

    return {
      action: {
        type: "daily_plan",
        data: {
          plan,
          unassigned,
          executed: true,
        },
      },
      reply: null,
    };
  }

  if (type === "schedule_tasks") {
    const scheduleInput = Array.isArray(data.schedule)
      ? data.schedule
      : [];
    const applyUpdates = data.applyUpdates === true;
    const schedule = [];
    const updatedIds = new Set();

    for (const slot of scheduleInput) {
      const task = resolvePendingTask(slot);
      if (!task) {
        continue;
      }

      const taskId = String(task._id);
      const entry = {
        taskId,
        title: task.title,
        suggestedTime:
          slot.suggestedTime || slot.time || null,
        suggestedDueDate:
          slot.suggestedDueDate || null,
        currentDueDate: task.dueDate || null,
        updated: false,
      };

      if (
        applyUpdates &&
        slot.suggestedDueDate &&
        !updatedIds.has(taskId)
      ) {
        const hasDue = Boolean(task.dueDate);
        const force =
          slot.forceOverwrite === true ||
          data.forceOverwrite === true;

        if (!hasDue || force) {
          const due = new Date(slot.suggestedDueDate);
          if (!Number.isNaN(due.getTime())) {
            await updateTask(task._id, userId, {
              dueDate: due,
            });
            entry.updated = true;
            entry.appliedDueDate = due.toISOString();
            updatedIds.add(taskId);
          }
        } else {
          entry.skippedUpdate =
            "existing_due_date_preserved";
        }
      }

      schedule.push(entry);
    }

    return {
      action: {
        type: "schedule_tasks",
        data: {
          schedule,
          applyUpdates,
          executed: true,
        },
      },
      reply: null,
    };
  }

  return {
    action: { type: "none", data: {} },
    reply: null,
  };
};

// ================= AI CHAT =================
app.post(
  "/tasks/ai/chat",
  authMiddleware,
  aiLimiter,
  validateBody("aiChat"),
  async (req, res) => {
    const respondAiUnavailable = () =>
      res.status(503).json({
        error: "AI service unavailable",
        fallback: true,
      });

    try {
      const { message } = req.body;
      const userId = req.user.id;

      if (!process.env.GEMINI_API_KEY || !genAI) {
        return respondAiUnavailable();
      }

      let user = await findUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const tasks = await findTasks({ userId });
      const taskContext = buildTaskContextForAi(tasks);

      const systemPrompt = `You are SmartTodo AI, a task management assistant.

User profile:
- name: ${user.name}
- level: ${user.level}
- XP: ${user.xp}
- streak: ${user.streak}

Pending tasks (use exact id when completing by id):
${taskContext}

Allowed actions (set action.type to one of these):
- none — conversation only, no database change
- create_task — one new task (data.title required; optional dueDate ISO, priority)
- create_multiple_tasks — several new tasks (data.tasks: [{title, priority?, dueDate?}])
- complete_task — mark done (data.taskId preferred, or data.taskName / data.title)
- list_tasks — show pending tasks (server attaches list)
- daily_plan — organize pending tasks into Morning / Afternoon / Evening (data.plan: { morning: [{taskId, title?}], afternoon: [], evening: [] }) — NO database writes
- schedule_tasks — suggest time slots for pending tasks (data.schedule: [{taskId, title?, suggestedTime, suggestedDueDate}]; data.applyUpdates: false unless user explicitly asks to save/apply schedule)

You MUST respond with ONLY valid JSON (no markdown, no code fences) in this exact shape:
{
  "reply": "short human-readable message for the user",
  "action": {
    "type": "none | create_task | create_multiple_tasks | complete_task | list_tasks | daily_plan | schedule_tasks",
    "data": {
      "title": "",
      "dueDate": "",
      "priority": "medium",
      "taskName": "",
      "taskId": "",
      "tasks": [],
      "plan": { "morning": [], "afternoon": [], "evening": [] },
      "schedule": [],
      "applyUpdates": false,
      "forceOverwrite": false
    }
  }
}

Rules:
- Never suggest creating tasks that duplicate titles already in the pending list.
- For "plan my day" use daily_plan and assign each pending task to exactly one time block when possible.
- For "schedule my tasks" use schedule_tasks with applyUpdates false unless the user says apply/save/update my calendar.
- For "create 5 tasks" use create_multiple_tasks with up to 5 unique titles in data.tasks.
- When completing, prefer action.data.taskId from the pending list.
- Be short, clear, and friendly.
- ONLY return valid JSON.`;

      const modelsToTry = [
        "gemini-2.5-flash",
        "gemini-flash-latest",
        "gemini-flash-lite-latest"
      ];

      let response;
      let errorMsgs = [];

      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig: {
              temperature: 0.3,
              responseMimeType: "application/json",
            }
          });
          const result = await model.generateContent([
            { text: systemPrompt },
            { text: message }
          ]);
          response = result.response;
          console.log(`✓ AI response successfully generated using model: ${modelName}`);
          break;
        } catch (geminiErr) {
          console.warn(`⚠️ Model ${modelName} failed: ${geminiErr.message}`);
          errorMsgs.push(`${modelName}: ${geminiErr.message}`);
        }
      }

      if (!response) {
        console.error("All Gemini models failed:", errorMsgs.join(" | "));
        return respondAiUnavailable();
      }

      const rawContent = response.text() || "";

      let parsed = parseAiAssistantJson(rawContent);
      let reply;
      let action = { type: "none", data: {} };

      if (!parsed) {
        reply =
          "I had trouble processing that request. Please try rephrasing.";
        action = { type: "none", data: {} };
      } else {
        reply = parsed.reply;
        action = parsed.action;

        try {
          const result = await executeAiAction(
            action,
            userId,
            user,
            tasks
          );

          action = result.action;
          if (result.reply) {
            reply = result.reply;
          }
        } catch (actionErr) {
          console.error("AI action execution error:", actionErr.message);
          reply =
            "I couldn't complete that action right now. Please try again.";
          action = { type: "none", data: {} };
        }
      }

      user = await findUserById(userId);

      res.json({
        reply,
        action,
        userState: {
          xp: user?.xp ?? 0,
          level: user?.level ?? 1,
          streak: user?.streak ?? 0,
        },
      });
    } catch (err) {
      console.error("AI chat error:", err.message);
      return respondAiUnavailable();
    }
  }
);

// ================= HEALTH CHECK =================
app.get("/health", (req, res) => {
  const database = isDatabaseUnavailable
    ? "unavailable"
    : isOfflineMode
      ? "offline-failover"
      : "mongodb";

  res.json({
    status: isDatabaseUnavailable ? "degraded" : "ok",
    service: "smarttodo-api",
    database,
    ai: Boolean(process.env.GEMINI_API_KEY && genAI),
    timestamp: new Date().toISOString(),
  });
});

// Health check under /api prefix for consistency
app.get("/api/health", (req, res) => {
  const database = isDatabaseUnavailable
    ? "unavailable"
    : isOfflineMode
      ? "offline-failover"
      : "mongodb";

  res.json({
    status: isDatabaseUnavailable ? "degraded" : "ok",
    service: "smarttodo-api",
    database,
    ai: Boolean(process.env.GEMINI_API_KEY && genAI),
    timestamp: new Date().toISOString(),
  });
});

// ================= STATUS / DIAGNOSTICS =================
app.get("/status", (req, res) => {
  const database = isDatabaseUnavailable
    ? "unavailable"
    : isOfflineMode
      ? "offline-failover"
      : "mongodb";

  res.json({
    status: isDatabaseUnavailable ? "degraded" : "ok",
    service: "smarttodo-api",
    database,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    platform: process.platform,
    nodeVersion: process.version,
    environment: {
      NODE_ENV: process.env.NODE_ENV || "development",
      PORT: PORT,
      hasJwtSecret: Boolean(process.env.JWT_SECRET),
      hasCookieSecret: Boolean(process.env.COOKIE_SECRET),
      hasClientUrl: Boolean(process.env.CLIENT_URL || process.env.FRONTEND_URL),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY)
    },
    timestamp: new Date().toISOString(),
  });
});

// ================= GLOBAL ERROR HANDLER =================
app.use((err, req, res, next) => {
  console.error(err);

  failover.logSecurityEvent(
    "unhandled_error",
    {
      message: err.message,
      path: req.path,
      method: req.method,
      ip: req.ip,
    }
  );

  res.status(500).json({
    error:
      "An unexpected server error occurred",
  });
});

// ================= GRACEFUL SHUTDOWN =================
const shutdown = async (signal) => {
  console.log(`\n🛑 ${signal} received — shutting down...`);

  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }

  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ================= SERVER =================
const PORT = process.env.PORT || 5003;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 SmartTodo Backend running on port ${PORT}`);
  console.log(`   Managed by PM2? Run: npm run pm2:status`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n🚨 Port ${PORT} is already in use (EADDRINUSE).`);
    console.error("   Only ONE backend instance should run on this port.");
    console.error("\n   Fix:");
    console.error("     npm run pm2:status     # see if PM2 already runs smarttodo");
    console.error("     npm run pm2:restart    # restart the PM2 instance");
    console.error("     npm run pm2:stop       # stop PM2, then npm start\n");
    process.exit(1);
  }

  console.error("Server failed to start:", err);
  process.exit(1);
});

// Process-wide unhandled promise rejections and uncaught exception handlers
process.on("unhandledRejection", (reason, promise) => {
  console.error("🚨 Unhandled Promise Rejection at:", promise, "reason:", reason);
  try {
    failover.logSecurityEvent("unhandled_rejection", {
      message: String(reason?.message || reason),
      stack: String(reason?.stack || "")
    });
  } catch (err) {}
});

process.on("uncaughtException", (err) => {
  console.error("🚨 Uncaught Exception:", err.message);
  try {
    failover.logSecurityEvent("uncaught_exception", {
      message: err.message,
      stack: err.stack
    });
  } catch (logErr) {}
  
  if (process.env.NODE_ENV !== "production") {
    process.exit(1);
  }
});