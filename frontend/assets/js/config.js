/**
 * Resolves API base URL without hardcoding production to localhost.
 * Priority:
 *   1. window.__SMARTTODO_CONFIG__.API_BASE (env.config.js)
 *   2. <meta name="smarttodo-api-base" content="...">
 *   3. Auto: localhost/127.0.0.1 → http://localhost:5003
 *   4. Auto: production → same-origin /api (reverse-proxy pattern)
 */
function resolveApiBase() {
    const injected = window.__SMARTTODO_CONFIG__?.API_BASE;
    if (injected && String(injected).trim()) {
        return String(injected).trim().replace(/\/$/, "");
    }

    const meta = document.querySelector('meta[name="smarttodo-api-base"]');
    if (meta?.content?.trim()) {
        return meta.content.trim().replace(/\/$/, "");
    }

    const { hostname, protocol, origin } = window.location;
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";

    if (isLocal) {
        return "http://localhost:5003";
    }

    return `${origin}/api`;
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
        HEALTH: "/health",
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
        DUE_REMINDERS: "smarttodo_due_reminders",
    },
};
