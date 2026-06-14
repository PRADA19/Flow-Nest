const fs = require("fs");
const path = require("path");
const { Types } = require("mongoose");

const DATA_DIR = path.join(__dirname, "..", "data");

// Ensure physical directories exist securely
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const USERS_FILE = path.join(DATA_DIR, "users.json");
const AUDIT_LOG_FILE = path.join(DATA_DIR, "audit_log.txt");

// Initialize users file securely
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]), "utf8");
}

// ==========================================
// SECURITY AUDIT LOGGER
// ==========================================
const logSecurityEvent = (eventType, details) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${eventType.toUpperCase()}] ${JSON.stringify(details)}\n`;
  
  if (process.env.NODE_ENV === "production") {
    console.log(`[AUDIT_LOG] ${logEntry.trim()}`);
    return;
  }

  // Secure append-only logs on disk in development
  fs.appendFile(AUDIT_LOG_FILE, logEntry, (err) => {
    if (err) console.error("🚨 [FAILSAFE FAILURE] Failed to write to audit log:", err);
  });
};

// ==========================================
// HELPER FOR TENANT FILE PATHS (PHYSICAL ISOLATION)
// ==========================================
const getTenantTasksPath = (userId) => {
  // Enforce strong sanitized file pathing namespaced strictly by user ID
  const sanitizedId = String(userId).replace(/[^a-zA-Z0-9]/g, "");
  return path.join(DATA_DIR, `tasks_${sanitizedId}.json`);
};

const readTenantTasks = (userId) => {
  const filePath = getTenantTasksPath(userId);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    logSecurityEvent("db_read_error", { userId, error: err.message });
    return [];
  }
};

const writeTenantTasks = (userId, tasks) => {
  const filePath = getTenantTasksPath(userId);
  try {
    fs.writeFileSync(filePath, JSON.stringify(tasks, null, 2), "utf8");
    return true;
  } catch (err) {
    logSecurityEvent("db_write_error", { userId, error: err.message });
    return false;
  }
};

// ==========================================
// FAILOVER OPERATIONS
// ==========================================

const findUserByEmail = async (email) => {
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    const users = JSON.parse(raw || "[]");
    return users.find(u => u.email === email.toLowerCase());
  } catch (err) {
    return null;
  }
};

const createUser = async (userData) => {
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    const users = JSON.parse(raw || "[]");

    const newUser = {
      _id: new Types.ObjectId().toString(),
      name: userData.name,
      email: userData.email.toLowerCase(),
      password: userData.password,
      xp: 0,
      level: 1,
      streak: 0,
      unlockedBadges: [],
      completedTasksCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    users.push(newUser);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
    
    logSecurityEvent("user_registration_offline", { userId: newUser._id, email: newUser.email });
    return newUser;
  } catch (err) {
    logSecurityEvent("user_registration_fail", { error: err.message });
    throw err;
  }
};

const findUserById = async (id) => {
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    const users = JSON.parse(raw || "[]");
    const user = users.find(u => u._id.toString() === id.toString());
    
    if (user) {
      // Mock Mongoose .save() function to write profile changes back securely
      user.save = async function() {
        user.updatedAt = new Date();
        const freshRaw = fs.readFileSync(USERS_FILE, "utf8");
        const freshUsers = JSON.parse(freshRaw || "[]");
        const idx = freshUsers.findIndex(u => u._id.toString() === user._id.toString());
        if (idx !== -1) {
          freshUsers[idx] = { ...user };
          delete freshUsers[idx].save; // strip mock function
          fs.writeFileSync(USERS_FILE, JSON.stringify(freshUsers, null, 2), "utf8");
        }
        return user;
      };
    }
    return user;
  } catch (err) {
    return null;
  }
};

const findTasks = async (filter) => {
  const userId = filter.userId;
  if (!userId) return [];

  // Read tasks exclusively from physical tenant isolation file!
  let results = readTenantTasks(userId);

  if (filter.priority) {
    results = results.filter(t => t.priority === filter.priority);
  }
  if (filter.tags) {
    results = results.filter(t => Array.isArray(t.tags) && t.tags.includes(filter.tags));
  }

  // Sort: incomplete first, then descending by id (latest first)
  results.sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return results;
};

const createTask = async (taskData) => {
  const userId = taskData.userId;
  const tasks = readTenantTasks(userId);

  const newTask = {
    _id: new Types.ObjectId().toString(),
    title: taskData.title,
    dueDate: taskData.dueDate,
    priority: taskData.priority || "medium",
    tags: taskData.tags || [],
    userId: userId.toString(),
    completed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    toJSON: function() { return this; }
  };

  tasks.push(newTask);
  writeTenantTasks(userId, tasks);
  return newTask;
};

const findTaskByIdAndUser = async (id, userId) => {
  const tasks = readTenantTasks(userId);
  return tasks.find(t => t._id.toString() === id.toString());
};

const updateTask = async (id, userId, updateData) => {
  // Strip out read-only elements
  const { _id, userId: clientUserId, ...cleanData } = updateData;

  const tasks = readTenantTasks(userId);
  const idx = tasks.findIndex(t => t._id.toString() === id.toString());
  if (idx === -1) {
    logSecurityEvent("suspicious_update_attempt", { id, userId, data: cleanData });
    return null;
  }

  tasks[idx] = {
    ...tasks[idx],
    ...cleanData,
    updatedAt: new Date(),
    toJSON: function() { return this; }
  };

  writeTenantTasks(userId, tasks);
  return tasks[idx];
};

const deleteTaskById = async (id, userId) => {
  const tasks = readTenantTasks(userId);
  const idx = tasks.findIndex(t => t._id.toString() === id.toString());
  if (idx === -1) {
    logSecurityEvent("suspicious_delete_attempt", { id, userId });
    return null;
  }

  const removed = tasks.splice(idx, 1);
  writeTenantTasks(userId, tasks);
  return removed[0];
};

module.exports = {
  logSecurityEvent,
  findUserByEmail,
  createUser,
  findUserById,
  findTasks,
  createTask,
  findTaskByIdAndUser,
  updateTask,
  deleteTaskById
};
