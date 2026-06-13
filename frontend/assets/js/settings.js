// ==========================================
// SETTINGS PAGE LOGIC
// ==========================================

const SETTINGS_KEYS = CONFIG.STORAGE_KEYS;

function getBoolSetting(key, defaultValue = false) {
    const stored = localStorage.getItem(key);
    if (stored === null) {
        return defaultValue;
    }
    return stored === "true";
}

function setBoolSetting(key, value) {
    localStorage.setItem(key, String(Boolean(value)));
}

/**
 * Reusable toggle: sync checkbox, localStorage, and callback.
 */
function initSettingsToggle(checkboxId, storageKey, onChange, defaultValue = false) {
    const input = document.getElementById(checkboxId);
    if (!input) {
        return;
    }

    const initial = getBoolSetting(storageKey, defaultValue);
    input.checked = initial;
    if (typeof onChange === "function") {
        onChange(initial);
    }

    input.addEventListener("change", () => {
        const enabled = input.checked;
        setBoolSetting(storageKey, enabled);
        if (typeof onChange === "function") {
            onChange(enabled);
        }
    });
}

function applyCompactMode(enabled) {
    if (enabled) {
        document.documentElement.setAttribute("data-compact", "true");
    } else {
        document.documentElement.removeAttribute("data-compact");
    }
}

function syncThemeToggleFromApp() {
    const themeToggle = document.getElementById("settingsThemeToggle");
    if (!themeToggle) {
        return;
    }
    themeToggle.checked = getSavedTheme() === "dark";
}

function loadCachedProfile() {
    return loadUserProfile();
}

function saveCachedProfile(profile) {
    saveUserProfile(profile);
}

function renderAccountProfile(profile, isLoggedIn) {
    const usernameEl = document.getElementById("settingsUsername");
    const emailEl = document.getElementById("settingsEmail");
    const logoutBtn = document.getElementById("settingsLogoutBtn");

    if (!isLoggedIn) {
        if (usernameEl) {
            usernameEl.textContent = "Guest";
        }
        if (emailEl) {
            emailEl.textContent = "—";
        }
        if (logoutBtn) {
            logoutBtn.disabled = true;
            logoutBtn.classList.add("is-disabled");
        }
        return;
    }

    if (logoutBtn) {
        logoutBtn.disabled = false;
        logoutBtn.classList.remove("is-disabled");
    }

    if (usernameEl) {
        usernameEl.textContent =
            profile?.name || profile?.userName || "User";
    }
    if (emailEl) {
        emailEl.textContent = profile?.email || "—";
    }
}

async function loadAccountFromDashboard() {
    const isLoggedIn = Boolean(getToken());

    if (!isLoggedIn) {
        renderAccountProfile(null, false);
        return;
    }

    const cached = loadCachedProfile();
    const tokenProfile = getProfileFromToken();
    const initialProfile = cached || tokenProfile;

    if (initialProfile) {
        renderAccountProfile(initialProfile, true);
    }

    try {
        const data = await apiFetch(CONFIG.ENDPOINTS.DASHBOARD);
        const profile = {
            name: data.userName || cached?.name || tokenProfile?.name || "User",
            email: data.email || cached?.email || tokenProfile?.email || "—",
        };
        saveCachedProfile(profile);
        renderAccountProfile(profile, true);
        updateSidebarUserName(profile.name);
    } catch {
        const fallback = cached || tokenProfile;
        if (fallback) {
            renderAccountProfile(fallback, true);
            if (fallback.name) {
                updateSidebarUserName(fallback.name);
            }
        } else {
            renderAccountProfile({ name: "User", email: "—" }, true);
        }
    }
}

function clearAppCache() {
    localStorage.removeItem(SETTINGS_KEYS.USER_CACHE);
    localStorage.removeItem(SETTINGS_KEYS.ANALYTICS_CACHE);
    localStorage.removeItem(SETTINGS_KEYS.TASKS_CACHE);
}

function clearAiHistory() {
    localStorage.removeItem(SETTINGS_KEYS.CHAT_HISTORY);
}

function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

async function exportTasks() {
    if (!getToken()) {
        showToast("Please log in to export your tasks.", 4000, "error");
        document.getElementById("authModal")?.classList.remove("hidden");
        return;
    }

    try {
        const tasks = await apiFetch(CONFIG.ENDPOINTS.TASKS);
        const stamp = new Date().toISOString().slice(0, 10);
        downloadJson(`flownest-tasks-${stamp}.json`, tasks);
        showToast("Tasks exported successfully.", 2500, "success");
    } catch (err) {
        showToast(
            err.message || "Failed to export tasks.",
            4000,
            "error"
        );
    }
}

function initDueRemindersToggle() {
    const input = document.getElementById("settingsDueRemindersToggle");
    if (!input || !window.DueReminders) {
        return;
    }

    input.checked = DueReminders.isEnabled();

    input.addEventListener("change", async () => {
        let enabled = input.checked;

        if (enabled) {
            const permission =
                await DueReminders.requestPermissionSafe();

            if (permission === "unsupported") {
                enabled = false;
                input.checked = false;
                showToast(
                    "This browser does not support notifications.",
                    4000,
                    "error"
                );
            } else if (permission === "denied") {
                enabled = false;
                input.checked = false;
                showToast(
                    "Notification permission was denied. Enable it in your browser settings to use reminders.",
                    5000,
                    "error"
                );
            }
        }

        DueReminders.setEnabled(enabled);

        if (enabled) {
            showToast("Due date reminders enabled.", 2500, "success");
        }
    });
}

async function initServerNotificationToggles() {
    const emailInput = document.getElementById("settingsEmailRemindersToggle");
    const pushInput = document.getElementById("settingsPushRemindersToggle");

    if (!emailInput || !pushInput) return;

    const isLoggedIn = Boolean(getToken());
    if (!isLoggedIn) {
        emailInput.disabled = true;
        pushInput.disabled = true;
        return;
    }

    // Load notification settings from backend
    try {
        const settings = await apiFetch("/notifications/settings");
        emailInput.checked = Boolean(settings.emailEnabled);
        pushInput.checked = Boolean(settings.pushEnabled);
    } catch (err) {
        console.warn("Failed to load server notification settings:", err.message);
        emailInput.checked = false;
        pushInput.checked = false;
    }

    // Sync state changes immediately with the server
    const saveSettings = async () => {
        try {
            await apiFetch("/notifications/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    emailEnabled: emailInput.checked,
                    pushEnabled: pushInput.checked
                })
            });
            showToast("Notification preferences updated.", 2000, "success");
        } catch (err) {
            showToast("Failed to update preferences: " + (err.message || err), 4000, "error");
        }
    };

    emailInput.addEventListener("change", saveSettings);
    pushInput.addEventListener("change", saveSettings);
}

function bindSettingsActions() {
    document
        .getElementById("settingsLogoutBtn")
        ?.addEventListener("click", async () => {
            await clearSession();
            if (typeof window.setAppState === "function") {
                window.setAppState(false);
            }
            renderAccountProfile(null, false);
            showToast("Logged out successfully.", 2500, "success");
        });

    document
        .getElementById("settingsClearAiBtn")
        ?.addEventListener("click", () => {
            clearAiHistory();
            showToast("AI chat history cleared.", 2500, "success");
        });

    document
        .getElementById("settingsClearCacheBtn")
        ?.addEventListener("click", () => {
            clearAppCache();
            showToast("Local cache cleared.", 2500, "success");
        });

    document
        .getElementById("settingsExportBtn")
        ?.addEventListener("click", () => {
            exportTasks();
        });

    const headerThemeBtn = document.getElementById("themeToggleBtn");
    headerThemeBtn?.addEventListener("click", () => {
        setTimeout(syncThemeToggleFromApp, 0);
    });
}

function initSettingsPage() {
    applyCompactMode(
        getBoolSetting(SETTINGS_KEYS.COMPACT_MODE, false)
    );

    const themeToggle = document.getElementById("settingsThemeToggle");
    if (themeToggle) {
        themeToggle.checked = getSavedTheme() === "dark";
        themeToggle.addEventListener("change", () => {
            applyTheme(themeToggle.checked ? "dark" : "light");
        });
    }

    initSettingsToggle(
        "settingsCompactToggle",
        SETTINGS_KEYS.COMPACT_MODE,
        applyCompactMode,
        false
    );

    initSettingsToggle(
        "settingsAiToggle",
        SETTINGS_KEYS.AI_SUGGESTIONS,
        () => {},
        true
    );

    initDueRemindersToggle();
    initServerNotificationToggles();
    bindSettingsActions();
    loadAccountFromDashboard();
}

window.getAiSuggestionsEnabled = function getAiSuggestionsEnabled() {
    return getBoolSetting(SETTINGS_KEYS.AI_SUGGESTIONS, true);
};

window.onAuthStateChanged = function onAuthStateChanged(loggedIn) {
    if (loggedIn) {
        loadAccountFromDashboard();
    } else {
        renderAccountProfile(null, false);
    }
};

document.addEventListener("DOMContentLoaded", initSettingsPage);
