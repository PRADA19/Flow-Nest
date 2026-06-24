const statsGrid = document.getElementById("statsGrid");
const recentTasksList = document.getElementById("recentTasksList");
const dashboardWelcome = document.getElementById("dashboardWelcome");
const insightsSection = document.getElementById("insightsSection");
const insightsCard = document.getElementById("insightsCard");

let dashboardFetchStarted = false;

const STAT_CONFIG = [
    { key: "totalTasks", label: "Total Tasks", icon: "ph-fill ph-list-checks" },
    { key: "completedTasks", label: "Completed Tasks", icon: "ph-fill ph-check-circle" },
    { key: "pendingTasks", label: "Pending Tasks", icon: "ph-fill ph-hourglass" },
    { key: "completionRate", label: "Completion Rate", icon: "ph-fill ph-target", suffix: "%" }
];

function normalizeDashboardPayload(data) {
    const statsSource = data.stats || data;
    const total = Number(
        statsSource.totalTasks ?? statsSource.total ?? 0
    );
    const completed = Number(
        statsSource.completedTasks ?? statsSource.completed ?? 0
    );
    const pending = Number(
        statsSource.pendingTasks ??
        statsSource.pending ??
        Math.max(0, total - completed)
    );
    let completionRate = statsSource.completionRate;
    if (completionRate === undefined || completionRate === null) {
        completionRate = total ? Math.round((completed / total) * 100) : 0;
    }

    const recentTasks = (
        data.recentTasks ||
        data.recent ||
        data.tasks ||
        []
    ).slice(0, 5);

    const userName =
        data.userName ||
        data.username ||
        data.user?.name ||
        data.name ||
        null;

    const insights = data.insights || data.analytics || null;
    const hasInsights =
        insights &&
        (insights.topPriority ||
            insights.mostCommonPriority ||
            insights.completionRateSummary ||
            insights.productivityMessage ||
            insights.message);

    return {
        userName,
        stats: {
            totalTasks: total,
            completedTasks: completed,
            pendingTasks: pending,
            completionRate: Number(completionRate)
        },
        recentTasks,
        insights: hasInsights ? insights : null
    };
}

function renderWelcome(userName) {
    if (!dashboardWelcome) return;
    dashboardWelcome.textContent = userName
        ? `Welcome back, ${userName} 👋`
        : "Welcome back 👋";
}

function renderStatsSkeleton() {
    if (!statsGrid) return;
    statsGrid.innerHTML = STAT_CONFIG.map(
        () => `<div class="skeleton-card" aria-hidden="true"></div>`
    ).join("");
}

function renderStats(stats, errors = {}) {
    if (!statsGrid) return;

    statsGrid.innerHTML = STAT_CONFIG.map(({ key, label, icon, suffix = "" }) => {
        const err = errors[key];
        const raw = stats[key];
        const value = err ? "—" : raw ?? 0;
        const display = suffix ? `${value}${suffix}` : value;

        return `
            <article class="stat-card analytics-card${err ? " is-error" : ""}">
                <div class="card-icon"><i class="${icon}"></i></div>
                <div class="card-info">
                    <h3>${label}</h3>
                    <p class="stat-value">${escapeHtml(String(display))}</p>
                    ${err ? `<p class="stat-card__error">${escapeHtml(err)}</p>` : ""}
                </div>
            </article>
        `;
    }).join("");
}

function renderRecentTasksSkeleton() {
    if (!recentTasksList) return;
    recentTasksList.innerHTML = Array.from({ length: 3 })
        .map(() => `<div class="skeleton-task" aria-hidden="true"></div>`)
        .join("");
}

function formatDueDate(dueDate) {
    if (!dueDate) return null;
    try {
        return new Date(dueDate).toLocaleDateString();
    } catch {
        return null;
    }
}

function renderPriorityBadge(priority) {
    const p = (priority || "medium").toLowerCase();
    const label = p.charAt(0).toUpperCase() + p.slice(1);
    return `<span class="priority-badge priority-${p}">${escapeHtml(label)}</span>`;
}

function renderRecentTasks(tasks, errorMessage) {
    if (!recentTasksList) return;

    if (errorMessage) {
        recentTasksList.innerHTML = `<div class="empty-state">${escapeHtml(errorMessage)}</div>`;
        return;
    }

    if (!tasks.length) {
        recentTasksList.innerHTML = `<div class="empty-state">No recent tasks available</div>`;
        return;
    }

    recentTasksList.innerHTML = tasks
        .map((task) => {
            const title = escapeHtml(task.title || "Untitled task");
            const completed = Boolean(task.completed);
            const statusClass = completed ? "is-done" : "";
            const statusLabel = completed ? "Completed" : "Pending";
            const due = formatDueDate(task.dueDate);
            const dueHtml = due
                ? `<span class="task-meta"><i class="ph ph-calendar"></i> Due ${escapeHtml(due)}</span>`
                : "";

            return `
                <article class="task-item task-item--preview${completed ? " completed" : ""}">
                    <div class="task-content">
                        <div class="task-checkbox" aria-hidden="true">
                            ${completed ? '<i class="ph-bold ph-check"></i>' : ""}
                        </div>
                        <div>
                            <div class="task-title">${title}</div>
                            <div class="task-badges">
                                ${renderPriorityBadge(task.priority)}
                                <span class="task-status-pill ${statusClass}">${statusLabel}</span>
                            </div>
                            ${dueHtml}
                        </div>
                    </div>
                </article>
            `;
        })
        .join("");
}

function renderInsights(insights) {
    if (!insightsSection || !insightsCard) return;

    if (!insights) {
        insightsSection.classList.add("hidden");
        insightsCard.innerHTML = "";
        return;
    }

    const parts = [];
    const topPriority =
        insights.topPriority || insights.mostCommonPriority;
    if (topPriority) {
        const label =
            String(topPriority).charAt(0).toUpperCase() +
            String(topPriority).slice(1);
        parts.push(
            `<p>You complete most <strong>${escapeHtml(label)}</strong> priority tasks efficiently.</p>`
        );
    }
    if (insights.completionRateSummary) {
        parts.push(`<p>${escapeHtml(insights.completionRateSummary)}</p>`);
    }
    if (insights.productivityMessage || insights.message) {
        parts.push(
            `<p>${escapeHtml(insights.productivityMessage || insights.message)}</p>`
        );
    }

    if (!parts.length) {
        insightsSection.classList.add("hidden");
        return;
    }

    insightsSection.classList.remove("hidden");
    insightsCard.innerHTML = parts.join("");
}

async function cacheTasksForReminders() {
    if (!getToken()) {
        return;
    }
    try {
        const tasks = await apiFetch(CONFIG.ENDPOINTS.TASKS);
        if (typeof window.saveTasksCache === "function") {
            saveTasksCache(tasks);
        }
    } catch (err) {
        console.warn("Could not refresh tasks cache for reminders:", err);
    }
}

function updateFocusGarden(stats) {
    const gardenCard = document.querySelector(".focus-garden");
    if (!gardenCard) return;

    const total = Number(stats.totalTasks ?? 0);
    const completed = Number(stats.completedTasks ?? 0);
    
    // Calculate completion rate
    const completionRate = total ? Math.round((completed / total) * 100) : 0;

    // Growth stages mapping
    let stageClass = "stage-seed";
    let stageTitle = "Seed";
    let stageDesc = "Create and complete tasks to sprout your seed!";

    if (total === 0) {
        stageClass = "stage-seed";
        stageTitle = "Seed";
        stageDesc = "Create and complete tasks to sprout your seed!";
    } else if (completionRate >= 100) {
        stageClass = "stage-mature";
        stageTitle = "Mature Tree";
        stageDesc = "Spectacular! Your garden has bloomed beautifully!";
    } else if (completionRate >= 80) {
        stageClass = "stage-growing";
        stageTitle = "Growing Tree";
        stageDesc = "Your tree is growing tall and lush with green leaves!";
    } else if (completionRate >= 60) {
        stageClass = "stage-young";
        stageTitle = "Young Tree";
        stageDesc = "The branches are growing stronger, creating a great tree structure.";
    } else if (completionRate >= 40) {
        stageClass = "stage-sapling";
        stageTitle = "Sapling";
        stageDesc = "Look! A strong young sapling is taking shape.";
    } else if (completionRate >= 20) {
        stageClass = "stage-plant";
        stageTitle = "Small Plant";
        stageDesc = "Your seed has sprouted a stem. Keep up the good work!";
    } else {
        stageClass = "stage-sprout";
        stageTitle = "Sprout";
        stageDesc = "A tiny sprout has popped out of the soil!";
    }

    // Check if progress has increased to trigger growth animation
    const prevRate = Number(gardenCard.dataset.prevCompletionRate ?? -1);
    gardenCard.dataset.prevCompletionRate = completionRate;
    
    if (prevRate !== -1 && completionRate > prevRate) {
        const treeContainer = gardenCard.querySelector(".garden-tree-container");
        if (treeContainer) {
            treeContainer.classList.remove("growth-pulse-active");
            // Force reflow to restart CSS animation
            void treeContainer.offsetWidth;
            treeContainer.classList.add("growth-pulse-active");
        }
    }

    // Update classes on garden card
    gardenCard.className = `dashboard-section focus-garden ${stageClass}`;

    // Update text content and progress bar
    const titleEl = document.getElementById("gardenStageTitle");
    const descEl = document.getElementById("gardenStageDesc");
    const barEl = document.getElementById("gardenProgressBar");
    const textEl = document.getElementById("gardenProgressText");

    if (titleEl) titleEl.textContent = stageTitle;
    if (descEl) descEl.textContent = stageDesc;
    if (barEl) barEl.style.width = `${completionRate}%`;
    if (textEl) textEl.textContent = `${completed} / ${total} Tasks Completed (${completionRate}% Growth)`;

    // Rewards System (stored in localStorage under key 'focus_garden_rewards_<user>')
    let userKey = "guest";
    try {
        if (typeof loadUserProfile === "function") {
            const profile = loadUserProfile();
            if (profile && profile.email) {
                userKey = profile.email;
            }
        }
    } catch (e) {
        console.warn("Could not retrieve user profile for garden rewards:", e);
    }

    const storageKey = `focus_garden_rewards_${userKey}`;
    let rewards = { coins: 0, xp: 0, streak: 0, lastAwardedCompletedCount: 0 };
    try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
            rewards = JSON.parse(stored);
        }
    } catch (e) {
        console.warn("Failed to parse focus garden rewards from localStorage:", e);
    }

    // Default reward properties check (handling incomplete formats)
    rewards.coins = Number(rewards.coins ?? 0);
    rewards.xp = Number(rewards.xp ?? 0);
    rewards.streak = Number(rewards.streak ?? 0);
    rewards.lastAwardedCompletedCount = Number(rewards.lastAwardedCompletedCount ?? 0);

    const rewardsEl = document.getElementById("gardenRewards");

    if (completionRate === 100 && total > 0) {
        // Grant rewards only if completed task count exceeds the last rewarded count
        if (completed > rewards.lastAwardedCompletedCount) {
            rewards.coins += 100;
            rewards.xp += 25;
            rewards.streak += 1;
            rewards.lastAwardedCompletedCount = completed;
            localStorage.setItem(storageKey, JSON.stringify(rewards));
            
            if (typeof showToast === "function") {
                showToast("🎉 Tree Fully Grown! +100 Coins, +25 XP, Streak +1", 5000, "success");
            }
        }
        if (rewardsEl) {
            rewardsEl.classList.remove("hidden");
        }
    } else {
        if (rewardsEl) {
            rewardsEl.classList.add("hidden");
        }
    }

    // Render floating balance badges inside the card
    const coinsEl = document.getElementById("gardenTotalCoins");
    const xpEl = document.getElementById("gardenTotalXp");
    const streakEl = document.getElementById("gardenTotalStreak");

    if (coinsEl) coinsEl.textContent = rewards.coins;
    if (xpEl) xpEl.textContent = `${rewards.xp} XP`;
    if (streakEl) streakEl.textContent = rewards.streak;
}

async function fetchDashboardData() {
    if (dashboardFetchStarted) return;

    dashboardFetchStarted = true;
    renderStatsSkeleton();
    renderRecentTasksSkeleton();

    try {
        const data = await apiFetch(CONFIG.ENDPOINTS.DASHBOARD);
        const normalized = normalizeDashboardPayload(data);

        saveUserProfile({
            name: normalized.userName || data.userName || "User",
            email: data.email || loadUserProfile()?.email || "",
            role: data.role || loadUserProfile()?.role || "user"
        });

        if (typeof updateAdminSidebar === "function") {
            updateAdminSidebar(data.role || "user");
        }

        renderWelcome(normalized.userName);
        renderStats(normalized.stats);
        renderRecentTasks(normalized.recentTasks);
        renderInsights(normalized.insights);

        // Update the Focus Garden visualization
        updateFocusGarden(normalized.stats);

        cacheTasksForReminders();
    } catch (err) {
        console.error("Dashboard fetch error:", err);
        const msg = err.message || "Could not load dashboard";
        renderWelcome(null);
        renderStats(
            { totalTasks: 0, completedTasks: 0, pendingTasks: 0, completionRate: 0 },
            {
                totalTasks: msg,
                completedTasks: msg,
                pendingTasks: msg,
                completionRate: msg
            }
        );
        renderRecentTasks([], "Unable to load recent tasks");
        insightsSection?.classList.add("hidden");

        // Clear/reset Focus Garden on error
        updateFocusGarden({ totalTasks: 0, completedTasks: 0, pendingTasks: 0, completionRate: 0 });

        if (msg !== "Unauthorized") {
            showToast(msg, 4000, "error");
        }
    } finally {
        dashboardFetchStarted = false;
    }
}

// Hook into the shared auth state change
window.onAuthStateChanged = (loggedIn) => {
    if (loggedIn) {
        fetchDashboardData();
        if (
            window.DueReminders?.isEnabled?.() &&
            window.DueReminders?.checkNow
        ) {
            DueReminders.checkNow();
        }
    } else {
        dashboardFetchStarted = false;
        renderStatsSkeleton();
        renderRecentTasksSkeleton();
        if (dashboardWelcome) dashboardWelcome.textContent = "Welcome back 👋";
        insightsSection?.classList.add("hidden");

        // Reset Focus Garden visual state when user logs out
        updateFocusGarden({ totalTasks: 0, completedTasks: 0, pendingTasks: 0, completionRate: 0 });
    }
};

