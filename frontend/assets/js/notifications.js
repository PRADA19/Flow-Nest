// ==========================================
// DUE DATE BROWSER REMINDERS (local, tab-open)
// ==========================================

const DUE_REMINDERS_KEY = "smarttodo_due_reminders";
const SENT_REMINDERS_KEY = "smarttodo_due_reminders_sent";
const ONE_HOUR_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
const REMINDER_WINDOW_MS = 60 * 1000;

let reminderIntervalId = null;

function isDueRemindersEnabled() {
    return localStorage.getItem(DUE_REMINDERS_KEY) === "true";
}

function setDueRemindersEnabled(enabled) {
    localStorage.setItem(DUE_REMINDERS_KEY, String(Boolean(enabled)));
    if (enabled) {
        startDueReminderScheduler();
    } else {
        stopDueReminderScheduler();
    }
}

function saveTasksCache(tasks) {
    if (!Array.isArray(tasks)) {
        return;
    }
    localStorage.setItem(
        CONFIG.STORAGE_KEYS.TASKS_CACHE,
        JSON.stringify({
            tasks,
            updatedAt: Date.now(),
        })
    );
}

function getTasksFromCache() {
    try {
        const raw = localStorage.getItem(
            CONFIG.STORAGE_KEYS.TASKS_CACHE
        );
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        return Array.isArray(parsed.tasks) ? parsed.tasks : [];
    } catch {
        return [];
    }
}

function getSentReminders() {
    try {
        const raw = localStorage.getItem(SENT_REMINDERS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function reminderSentKey(taskId, dueDate) {
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) {
        return null;
    }
    return `${String(taskId)}|${due.toISOString()}`;
}

function wasReminderSent(taskId, dueDate) {
    const key = reminderSentKey(taskId, dueDate);
    if (!key) {
        return true;
    }
    return Boolean(getSentReminders()[key]);
}

function markReminderSent(taskId, dueDate) {
    const key = reminderSentKey(taskId, dueDate);
    if (!key) {
        return;
    }
    const sent = getSentReminders();
    sent[key] = Date.now();
    localStorage.setItem(SENT_REMINDERS_KEY, JSON.stringify(sent));
}

function pruneSentReminders() {
    const sent = getSentReminders();
    const now = Date.now();
    let changed = false;

    for (const key of Object.keys(sent)) {
        const duePart = key.split("|")[1];
        const due = new Date(duePart);
        if (Number.isNaN(due.getTime()) || due.getTime() < now - ONE_HOUR_MS) {
            delete sent[key];
            changed = true;
        }
    }

    if (changed) {
        localStorage.setItem(
            SENT_REMINDERS_KEY,
            JSON.stringify(sent)
        );
    }
}

function isNotificationSupported() {
    return typeof window !== "undefined" && "Notification" in window;
}

async function requestNotificationPermissionSafe() {
    if (!isNotificationSupported()) {
        return "unsupported";
    }
    if (Notification.permission === "granted") {
        return "granted";
    }
    if (Notification.permission === "denied") {
        return "denied";
    }
    try {
        return await Notification.requestPermission();
    } catch {
        return "denied";
    }
}

function showDueSoonNotification(taskTitle) {
    if (!isNotificationSupported()) {
        return;
    }
    if (Notification.permission !== "granted") {
        return;
    }

    const title = String(taskTitle || "Untitled task").trim();
    const body = `🔔 Task Due Soon: ${title} is due in 1 hour`;

    try {
        new Notification("Flow Nest Reminder", {
            body,
            tag: `due-soon-${title.slice(0, 40)}`,
        });
    } catch (err) {
        console.warn("Could not show due reminder notification:", err);
    }
}

function shouldNotifyForTask(task) {
    if (!task || task.completed) {
        return false;
    }
    if (!task.dueDate) {
        return false;
    }

    const due = new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) {
        return false;
    }

    const msUntilDue = due.getTime() - Date.now();
    if (msUntilDue <= 0) {
        return false;
    }

    const diffFromOneHour = Math.abs(msUntilDue - ONE_HOUR_MS);
    return diffFromOneHour <= REMINDER_WINDOW_MS;
}

async function refreshTasksCacheIfOnline() {
    if (typeof getToken !== "function" || !getToken()) {
        return;
    }
    if (typeof apiFetch !== "function") {
        return;
    }

    try {
        const tasks = await apiFetch(CONFIG.ENDPOINTS.TASKS);
        saveTasksCache(tasks);
    } catch {
        // Offline or API error — use existing TASKS_CACHE
    }
}

function checkDueReminders() {
    if (!isDueRemindersEnabled()) {
        return;
    }
    if (!isNotificationSupported()) {
        return;
    }
    if (Notification.permission !== "granted") {
        return;
    }

    pruneSentReminders();

    const tasks = getTasksFromCache();

    for (const task of tasks) {
        const taskId = task._id || task.id;
        if (!taskId) {
            continue;
        }
        if (!shouldNotifyForTask(task)) {
            continue;
        }
        if (wasReminderSent(taskId, task.dueDate)) {
            continue;
        }

        showDueSoonNotification(task.title);
        markReminderSent(taskId, task.dueDate);
    }
}

async function runDueReminderCheck() {
    await refreshTasksCacheIfOnline();
    checkDueReminders();
}

function startDueReminderScheduler() {
    stopDueReminderScheduler();

    if (!isDueRemindersEnabled()) {
        return;
    }

    runDueReminderCheck();
    reminderIntervalId = window.setInterval(
        runDueReminderCheck,
        CHECK_INTERVAL_MS
    );
}

function stopDueReminderScheduler() {
    if (reminderIntervalId !== null) {
        window.clearInterval(reminderIntervalId);
        reminderIntervalId = null;
    }
}

window.DueReminders = {
    isEnabled: isDueRemindersEnabled,
    setEnabled: setDueRemindersEnabled,
    saveTasksCache,
    getTasksFromCache,
    requestPermissionSafe: requestNotificationPermissionSafe,
    start: startDueReminderScheduler,
    stop: stopDueReminderScheduler,
    checkNow: runDueReminderCheck,
};

window.saveTasksCache = saveTasksCache;

document.addEventListener("DOMContentLoaded", () => {
    if (isDueRemindersEnabled()) {
        startDueReminderScheduler();
    }
});
