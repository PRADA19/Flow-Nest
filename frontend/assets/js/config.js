/**
 * Resolves API base URL without hardcoding production to localhost.
 */
function resolveApiBase() {
    // Environment variable support
    try {
        if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) {
            return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
        }
    } catch (e) {}

    // HTML meta override
    const meta = document.querySelector('meta[name="smarttodo-api-base"]');
    if (meta?.content?.trim()) {
        return meta.content.trim().replace(/\/$/, "");
    }

    // Runtime override
    const injected = window.__SMARTTODO_CONFIG__?.API_BASE;
    if (injected && String(injected).trim()) {
        return String(injected).trim().replace(/\/$/, "");
    }

    // Local / production detection
    const { hostname, origin } = window.location;
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";

    if (isLocal) {
        return "https://flow-nest-2.onrender.com/api";
    }

    return "https://flow-nest-2.onrender.com/api";
}

const CONFIG = {
    API_BASE: resolveApiBase(),

    ENDPOINTS: {
        TASKS: "/tasks",
        LOGIN: "/auth/login",
        REGISTER: "/auth/register",
        LOGOUT: "/auth/logout",
        DASHBOARD: "/dashboard",
        ANALYTICS: "/analytics",
        HEALTH: "/health"
    },

    STORAGE_KEYS: {
        TOKEN: "smarttodo_token",
        THEME: "smarttodo_theme",
        CHAT_HISTORY: "smarttodo_chat_history",
        USER_CACHE: "smarttodo_user_cache",
        ANALYTICS_CACHE: "smarttodo_analytics_cache",
        TASKS_CACHE: "smarttodo_tasks_cache",
        COMPACT_MODE: "smarttodo_compact_mode",
        AI_SUGGESTIONS: "smarttodo_ai_suggestions",
        DUE_REMINDERS: "smarttodo_due_reminders"
    }
};

window.CONFIG = CONFIG;