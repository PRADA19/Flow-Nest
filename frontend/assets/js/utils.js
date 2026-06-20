// ==========================================
// UTILITIES & API WRAPPERS
// ==========================================

function getToken() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
}

function setToken(token) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, token);
}

function clearToken() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.CHAT_HISTORY);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.USER_CACHE);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.ANALYTICS_CACHE);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.TASKS_CACHE);
}

function loadUserProfile() {
    try {
        const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.USER_CACHE);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveUserProfile(profile) {
    if (!profile) {
        return;
    }
    localStorage.setItem(
        CONFIG.STORAGE_KEYS.USER_CACHE,
        JSON.stringify(profile)
    );
}

function getProfileFromToken() {
    const token = getToken();
    if (!token) {
        return null;
    }

    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        if (!payload?.email) {
            return null;
        }
        return { email: payload.email };
    } catch {
        return null;
    }
}

async function clearSession() {
    try {
        await fetch(apiUrl(CONFIG.ENDPOINTS.LOGOUT), {
            method: "POST",
            credentials: "include",
            headers: authHeaders()
        });
    } catch {
        // Session may already be invalid; still clear local state.
    }

    clearToken();
    notificationsState.items = [];
    notificationsState.unreadCount = 0;
    notificationsState.dropdownOpen = false;
}

function authHeaders() {
    const headers = { "Content-Type": "application/json" };
    const token = getToken();
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showToast(message, duration = 2500, type = "info") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    
    // Clear previous state
    toast.classList.remove("error", "success", "show");
    
    // Add current state
    if (type === "error") toast.classList.add("error");
    else if (type === "success") toast.classList.add("success");
    
    toast.classList.add("show");
    
    setTimeout(() => {
        toast.classList.remove("show", "error", "success");
    }, duration);
}

// Wrapper to handle API requests and standard error logic universally
async function apiFetch(endpoint, options = {}, retries = 3, backoff = 1000) {
    // Default headers
    const headers = authHeaders();
    if (options.headers) {
        Object.assign(headers, options.headers);
    }
    
    const config = {
        credentials: "include",
        ...options,
        headers
    };

    for (let i = 1; i <= retries; i++) {
        try {
            const response = await fetch(apiUrl(endpoint), config);
            
            // Handle unauthorized universally
            if (response.status === 401) {
                handleUnauthorized();
                throw new Error("Unauthorized");
            }

            const data = await parseJsonResponse(response);

            if (!response.ok) {
                throw new Error(formatApiError(data, response.status));
            }

            return data;
        } catch (error) {
            // If it's unauthorized or if it's the last retry, throw the error
            if (error.message === "Unauthorized" || i === retries) {
                if (error.message === "Failed to fetch") {
                    throw new Error("Cannot reach the server. Make sure the backend is running.");
                }
                throw error;
            }
            
            console.warn(`[API] Attempt ${i} failed. Retrying in ${backoff * i}ms...`, error.message);
            await new Promise((resolve) => setTimeout(resolve, backoff * i));
        }
    }
}

async function parseJsonResponse(res) {
    const text = await res.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`Invalid server response (${res.status})`);
    }
}

function formatApiError(data, status) {
    if (Array.isArray(data.errors) && data.errors.length > 0) {
        return data.errors.join(" ");
    }
    return data.error || data.message || `API Error: ${status}`;
}

function apiUrl(endpoint) {
    const base = CONFIG.API_BASE.replace(/\/$/, "");
    const path = String(endpoint || "").startsWith("/")
        ? endpoint
        : `/${endpoint}`;
    return `${base}${path}`;
}

async function verifyBackendConnection() {
    try {
        const response = await fetch(apiUrl(CONFIG.ENDPOINTS.HEALTH), {
            method: "GET",
            credentials: "include",
        });
        if (!response.ok) {
            throw new Error(`Health check failed (${response.status})`);
        }
        const data = await parseJsonResponse(response);
        console.info(
            `[SmartTodo] API connected: ${CONFIG.API_BASE} (${data.database})`
        );
        return data;
    } catch (err) {
        console.error(
            `[SmartTodo] API unreachable at ${CONFIG.API_BASE}:`,
            err.message
        );
        if (!sessionStorage.getItem("smarttodo_api_warned")) {
            showToast(
                `Cannot reach API at ${CONFIG.API_BASE}. Is the backend running?`,
                6000,
                "error"
            );
            sessionStorage.setItem("smarttodo_api_warned", "1");
        }
        return null;
    }
}

function getSavedTheme() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.THEME) || "light";
}

function applyTheme(theme) {
    const root = document.documentElement;
    const themeButton = document.getElementById("themeToggleBtn");

    if (theme === "dark") {
        root.setAttribute("data-theme", "dark");
        if (themeButton) {
            themeButton.innerHTML = '<i class="ph-bold ph-sun"></i>';
            themeButton.setAttribute("aria-label", "Switch to light mode");
        }
    } else {
        root.removeAttribute("data-theme");
        if (themeButton) {
            themeButton.innerHTML = '<i class="ph-bold ph-moon"></i>';
            themeButton.setAttribute("aria-label", "Switch to dark mode");
        }
    }
    localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, theme);
}

function toggleTheme() {
    const nextTheme = getSavedTheme() === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
}

function handleUnauthorized() {
    clearToken();
    notificationsState.items = [];
    notificationsState.unreadCount = 0;
    notificationsState.dropdownOpen = false;
    showToast("Session expired. Please log in again.", 4000, "error");
    if (typeof window.setAppState === "function") {
        window.setAppState(false);
    }
}

const notificationsState = {
    items: [],
    unreadCount: 0,
    dropdownOpen: false,
    swRegistration: null
};

async function initNotifications() {
    if (!getToken()) return;

    try {
        await fetchNotifications();
    } catch (err) {
        console.warn("Notifications unavailable");
    }

    try {
        await registerNotificationServiceWorker();
    } catch (err) {
        console.warn("Service worker unavailable");
    }
}
async function fetchNotifications() {
    try {
        const data = await apiFetch("/notifications");

        notificationsState.items = data.notifications || [];
        notificationsState.unreadCount = data.unreadCount || 0;

        renderNotificationBell();

        if (
            !window._notificationsLoadToastShown &&
            notificationsState.unreadCount > 0
        ) {
            showToast(
                `You have ${notificationsState.unreadCount} unread reminder${notificationsState.unreadCount === 1 ? "" : "s"}.`,
                4500,
                "info"
            );
            window._notificationsLoadToastShown = true;
        }

    } catch (err) {
        console.warn("Notifications endpoint not available");

        notificationsState.items = [];
        notificationsState.unreadCount = 0;

        renderNotificationBell();
    }
}
function renderNotificationBell() {
    const badge = document.getElementById("notificationBadge");
    const dropdown = document.getElementById("notificationDropdown");

    if (badge) {
        if (notificationsState.unreadCount > 0) {
            badge.textContent = notificationsState.unreadCount;
            badge.classList.remove("hidden");
        } else {
            badge.classList.add("hidden");
        }
    }

    if (!dropdown) return;

    if (notificationsState.items.length === 0) {
        dropdown.innerHTML = `<div class="notifications-empty">No notifications yet.</div>`;
        return;
    }

    dropdown.innerHTML = `
        <div class="notifications-header">
            <span>Notifications</span>
            ${notificationsState.unreadCount > 0 ? '<button type="button" class="notifications-mark-read-btn" id="markAllReadBtn">Mark all as read</button>' : ""}
        </div>
        <ul class="notifications-list">
            ${notificationsState.items
                .map((note) => {
                    const noteType = note.type === "due" ? "Due Today" : note.type === "reminder" ? "Reminder" : "Info";
                    const statusClass = note.isRead ? "" : " unread";
                    return `
                        <li class="notification-item${statusClass}">
                            <button type="button" class="notification-link" onclick="handleNotificationClick('${note._id}')">
                                <strong>${escapeHtml(noteType)}</strong>
                                <span>${escapeHtml(note.message)}</span>
                                <time>${new Date(note.createdAt).toLocaleString()}</time>
                            </button>
                        </li>
                    `;
                })
                .join("")}
        </ul>
    `;

    const markAllBtn = document.getElementById("markAllReadBtn");
    if (markAllBtn) {
        markAllBtn.addEventListener("click", markAllNotificationsRead);
    }
}

async function handleNotificationClick(notificationId) {
    if (!notificationId) return;
    await markNotificationRead(notificationId);
    const note = notificationsState.items.find((item) => item._id === notificationId);
    if (note) {
        showToast(note.message, 4000, note.type === "due" ? "error" : "info");
    }
}

async function markNotificationRead(notificationId) {
    try {
        await apiFetch(`/notifications/${notificationId}/read`, {
            method: "PUT"
        });

        const note = notificationsState.items.find((item) => item._id === notificationId);
        if (note) {
            note.isRead = true;
        }

        notificationsState.unreadCount = notificationsState.items.filter((item) => !item.isRead).length;
        renderNotificationBell();
    } catch (err) {
        console.warn("Failed to mark notification read:", err);
    }
}

async function markAllNotificationsRead() {
    const unreadNotifications = notificationsState.items.filter((item) => !item.isRead);
    for (const note of unreadNotifications) {
        await markNotificationRead(note._id);
    }
}

function toggleNotificationDropdown() {
    const dropdown = document.getElementById("notificationDropdown");
    if (!dropdown) return;

    dropdown.classList.toggle("hidden");
    notificationsState.dropdownOpen = !dropdown.classList.contains("hidden");
    if (notificationsState.dropdownOpen) {
        fetchNotifications();
    }
}

function closeNotificationDropdown() {
    const dropdown = document.getElementById("notificationDropdown");
    if (!dropdown) return;
    dropdown.classList.add("hidden");
    notificationsState.dropdownOpen = false;
}

document.addEventListener("click", (event) => {
    const dropdown = document.getElementById("notificationDropdown");
    const button = document.getElementById("notificationBtn");

    if (!dropdown || !button) return;

    if (!event.target.closest("#notificationDropdown") && event.target.id !== "notificationBtn" && !event.target.closest("#notificationBtn")) {
        closeNotificationDropdown();
    }
});

async function registerNotificationServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    try {
        const response = await fetch("/sw.js");

        if (!response.ok) {
            console.warn("sw.js not found");
            return;
        }

        notificationsState.swRegistration =
            await navigator.serviceWorker.register("/sw.js");

        if ("Notification" in window) {
            requestPushPermission();
        }

    } catch (err) {
        console.warn("Service worker disabled");
    }
}
async function requestPushPermission() {
    if (!getToken()) return;

    if (Notification.permission === "denied") {
        return;
    }

    if (Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
    }

    await subscribeUserToPush();
}

async function subscribeUserToPush() {
    try {
        if (!notificationsState.swRegistration) return;

        const data = await apiFetch("/push/vapidPublicKey");
        const applicationServerKey = urlBase64ToUint8Array(data.publicKey);
        const subscription = await notificationsState.swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey
        });

        await apiFetch("/push/subscribe", {
            method: "POST",
            body: JSON.stringify({ subscription })
        });

        showToast("Push notifications enabled.", 3000, "success");
    } catch (err) {
        console.warn("Push subscription failed:", err);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

window.initNotifications = initNotifications;

// Sidebar utility logic
function initSidebar() {
    const sidebar = document.getElementById("sidebar");
    const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
    const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
    const sidebarOverlay = document.getElementById("sidebarOverlay");
    const sidebarNavLinks = sidebar?.querySelectorAll(
        ".sidebar-nav a, .sidebar-nav .sidebar-link"
    );

    const isDrawerMode = () =>
        window.matchMedia("(max-width: 1100px)").matches;

    function openSidebar() {
        if (!isDrawerMode()) {
            return;
        }
        sidebar?.classList.add("active");
        sidebarOverlay?.classList.remove("hidden");
        sidebarOverlay?.setAttribute("aria-hidden", "false");
        document.body.classList.add("sidebar-open");
    }

    function closeSidebar() {
        sidebar?.classList.remove("active");
        sidebarOverlay?.classList.add("hidden");
        sidebarOverlay?.setAttribute("aria-hidden", "true");
        document.body.classList.remove("sidebar-open");
    }

    function toggleSidebar() {
        if (sidebar?.classList.contains("active")) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }

    sidebarToggleBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        toggleSidebar();
    });
    sidebarCloseBtn?.addEventListener("click", closeSidebar);
    sidebarOverlay?.addEventListener("click", closeSidebar);

    sidebarNavLinks?.forEach((link) => {
        link.addEventListener("click", () => {
            if (isDrawerMode()) {
                closeSidebar();
            }
        });
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && sidebar?.classList.contains("active")) {
            closeSidebar();
        }
    });

    window.addEventListener("resize", () => {
        if (!isDrawerMode()) {
            closeSidebar();
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    initSidebar();

    if (
        localStorage.getItem(CONFIG.STORAGE_KEYS.COMPACT_MODE) ===
        "true"
    ) {
        document.documentElement.setAttribute(
            "data-compact",
            "true"
        );
    }

    const currentTheme = getSavedTheme();
    applyTheme(currentTheme);

    const themeToggleBtn = document.getElementById("themeToggleBtn");
    themeToggleBtn?.addEventListener("click", toggleTheme);

    verifyBackendConnection();

    if (getToken()) {
        fetchAndRenderSidebar();
        initNotifications();
    } else {
        hideSidebarGamification();
        resetSidebarUser();
    }
});

// ==========================================
// GAMIFICATION CONFIGS & SIDEBAR HELPERS
// ==========================================

// Shared Badges Configuration for Frontend UI rendering
const BADGES_CONFIG = {
    first_step: {
        id: "first_step",
        name: "First Step",
        description: "Complete your first task!",
        icon: "ph-fill ph-check-square",
        color: "#3b82f6"
    },
    priority_champion: {
        id: "priority_champion",
        name: "Priority Champion",
        description: "Complete a High Priority task!",
        icon: "ph-fill ph-rocket",
        color: "#ef4444"
    },
    streak_starter: {
        id: "streak_starter",
        name: "Streak Starter",
        description: "Achieve a 3-day completion streak!",
        icon: "ph-fill ph-fire",
        color: "#f59e0b"
    },
    focus_master: {
        id: "focus_master",
        name: "Focus Master",
        description: "Achieve a 7-day completion streak!",
        icon: "ph-fill ph-lightning",
        color: "#8b5cf6"
    },
    category_explorer: {
        id: "category_explorer",
        name: "Category Explorer",
        description: "Complete tasks in 3 distinct tags!",
        icon: "ph-fill ph-compass",
        color: "#ec4899"
    },
    century_club: {
        id: "century_club",
        name: "Century Club",
        description: "Complete 100 tasks in total!",
        icon: "ph-fill ph-trophy",
        color: "#10b981"
    }
};

function renderPriorityBadge(priority) {
    const p = (priority || "medium").toLowerCase();
    const label = p.charAt(0).toUpperCase() + p.slice(1);
    return `<span class="priority-badge priority-${p}">${escapeHtml(label)}</span>`;
}

async function fetchAndRenderSidebar() {
    if (!getToken()) {
        hideSidebarGamification();
        resetSidebarUser();
        return;
    }
    // If we are on dashboard.html or /dashboard, let dashboard.js handle rendering to prevent double API requests
    if (window.location.pathname.includes("dashboard")) {
        return;
    }

    const cached = loadUserProfile();
    const tokenProfile = getProfileFromToken();
    if (cached?.name) {
        updateSidebarUserName(cached.name);
    } else if (tokenProfile?.email) {
        updateSidebarUserName(tokenProfile.email.split("@")[0]);
    }

    try {
        const data = await apiFetch(CONFIG.ENDPOINTS.DASHBOARD);
        const profile = {
            name: data.userName || cached?.name || "User",
            email: data.email || cached?.email || "",
        };
        saveUserProfile(profile);
        updateSidebarUserName(profile.name);

        if (data && data.gamification) {
            updateSidebarGamification(data.gamification, profile.name);
        }
    } catch (err) {
        console.error("Failed to load sidebar gamification:", err);
        if (cached?.name) {
            updateSidebarUserName(cached.name);
        }
    }
}

function updateSidebarUserName(userName) {
    const sidebarUserName =
        document.getElementById("sidebarUserName") ||
        document.querySelector(".sidebar-user-card .user-name") ||
        document.querySelector(".user-info .user-name");

    if (sidebarUserName && userName) {
        sidebarUserName.textContent = userName;
    }
}

function updateSidebarGamification(gamification, userName) {
    const sidebarXpContainer = document.getElementById("sidebarXpContainer");
    const sidebarLevelTag = document.getElementById("sidebarLevelTag");
    const sidebarXpBar = document.getElementById("sidebarXpBar");
    const sidebarXpText = document.getElementById("sidebarXpText");

    updateSidebarUserName(userName);

    if (!gamification || !gamification.levelInfo) {
        hideSidebarGamification();
        return;
    }

    const { levelInfo } = gamification;

    if (sidebarLevelTag) {
        sidebarLevelTag.textContent = `Lvl ${levelInfo.level} ${levelInfo.levelTitle}`;
        sidebarLevelTag.classList.remove("hidden");
        sidebarLevelTag.style.display = "inline-block";
    }

    if (sidebarXpBar) {
        sidebarXpBar.style.width = `${levelInfo.progressPercent}%`;
    }

    if (sidebarXpText) {
        sidebarXpText.textContent = `${levelInfo.currentLevelXp} / ${levelInfo.nextLevelXp} XP`;
    }

    if (sidebarXpContainer) {
        sidebarXpContainer.classList.remove("hidden");
    }
}

function hideSidebarGamification() {
    const sidebarXpContainer = document.getElementById("sidebarXpContainer");
    const sidebarLevelTag = document.getElementById("sidebarLevelTag");

    if (sidebarXpContainer) {
        sidebarXpContainer.classList.add("hidden");
    }
    if (sidebarLevelTag) {
        sidebarLevelTag.classList.add("hidden");
    }
}

function resetSidebarUser() {
    const sidebarUserName =
        document.getElementById("sidebarUserName") ||
        document.querySelector(".sidebar-user-card .user-name") ||
        document.querySelector(".user-info .user-name");

    if (sidebarUserName) {
        sidebarUserName.textContent = "Guest";
    }
}

// Hook sidebar initialization into auth state transitions
const originalSetAppState = window.setAppState;
window.setAppState = function(loggedIn) {
    if (typeof originalSetAppState === "function") {
        originalSetAppState(loggedIn);
    }
    if (loggedIn) {
        fetchAndRenderSidebar();
    } else {
        hideSidebarGamification();
        resetSidebarUser();
    }
};

function triggerLevelUpCelebration(levelInfo) {
    // Remove existing celebration modal if any
    const existing = document.querySelector(".level-up-modal-overlay");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.className = "level-up-modal-overlay";
    modal.innerHTML = `
        <div class="level-up-card animate-pop">
            <div class="celebration-confetti"></div>
            <div class="level-up-badge-wrapper">
                <div class="level-up-ring"></div>
                <div class="level-up-number">${levelInfo.level}</div>
            </div>
            <h2 class="celebration-title">LEVEL UP!</h2>
            <p class="celebration-subtitle">You have reached the rank of</p>
            <div class="celebration-rank">${levelInfo.levelTitle}</div>
            <p class="celebration-xp-boost">Next Level: ${levelInfo.nextLevelXp} XP</p>
            <button class="primary-btn celebration-btn" id="closeCelebrationBtn">Keep Crushing It!</button>
        </div>
    `;
    document.body.appendChild(modal);

    const confettiWrapper = modal.querySelector(".celebration-confetti");
    for (let i = 0; i < 40; i++) {
        const piece = document.createElement("div");
        piece.className = "confetti-piece";
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.backgroundColor = ["#DEAAFF", "#C8E7FF", "#FFCBF2", "#E5B3FE", "#FFD23F"][Math.floor(Math.random() * 5)];
        piece.style.animationDelay = `${Math.random() * 0.5}s`;
        piece.style.transform = `rotate(${Math.random() * 360}deg)`;
        confettiWrapper.appendChild(piece);
    }

    const closeBtn = modal.querySelector("#closeCelebrationBtn");
    closeBtn.addEventListener("click", () => {
        modal.classList.add("fade-out");
        setTimeout(() => modal.remove(), 400);
    });
}

