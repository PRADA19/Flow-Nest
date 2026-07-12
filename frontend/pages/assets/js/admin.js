// =========================================================
// FLOWNEST ADMIN DASHBOARD CORE JAVASCRIPT
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
    // 1. Inspect access role cache
    const cache = loadUserProfile();
    const userRole = cache?.role || "user";

    // Set user visual identity in sidebar
    if (cache?.name) {
        updateSidebarUserName(cache.name);
    }

    // Toggle superadmin UI visibility
    if (userRole === "owner") {
        document.querySelectorAll(".superadmin-only").forEach(el => {
            el.classList.remove("hidden");
        });
    }

    // 2. Tab switching logic
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabPanels = document.querySelectorAll(".tab-panel");

    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");

            // Toggle active buttons
            tabBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            // Toggle active panels
            tabPanels.forEach(panel => {
                panel.classList.remove("active");
                if (panel.id === `panel-${targetTab}`) {
                    panel.classList.add("active");
                }
            });

            // Trigger specific tab loads
            loadTabContent(targetTab);
        });
    });

    // 3. Load initial dashboard summary and active tab (users)
    loadSummaryStats();
    loadTabContent("users");

    // Initialize Event Listeners for Filters
    setupFilterListeners();
});

// Cache chart instances to avoid canvas conflicts
let gardenChartInstance = null;
let aiChartInstance = null;

// Tab loading router
function loadTabContent(tabName) {
    switch (tabName) {
        case "users":
            fetchUsers(1);
            break;
        case "garden":
            fetchGardenAnalytics();
            break;
        case "ai":
            fetchAiAnalytics();
            break;
        case "tickets":
            fetchSupportTickets();
            break;
        case "sessions":
            fetchSessions(1);
            break;
        case "health":
            fetchSystemHealth();
            break;
        case "audit":
            fetchAuditLogs(1);
            break;
    }
}

// =========================================================
// API 1: SUMMARY STATISTICS
// =========================================================
async function loadSummaryStats() {
    try {
        const stats = await apiFetch("/admin/summary");
        
        document.getElementById("statTotalUsers").textContent = stats.totalUsers ?? 0;
        document.getElementById("statActiveUsers").textContent = stats.activeUsers ?? 0;
        document.getElementById("statTotalTasks").textContent = stats.totalTasks ?? 0;
        document.getElementById("statCompletedTasks").textContent = stats.completedTasks ?? 0;
        document.getElementById("statOpenTickets").textContent = stats.openTickets ?? 0;
        document.getElementById("statAiChats").textContent = stats.aiConversations ?? 0;
        document.getElementById("statActiveSessions").textContent = stats.activeSessions ?? 0;
        
        // Format DB Size nicely
        const sizeMb = (stats.dbSize / (1024 * 1024)).toFixed(2);
        document.getElementById("statDbSize").textContent = `${sizeMb} MB`;
    } catch (err) {
        console.error("Failed to fetch admin stats summary:", err);
        showToast("Error loading statistics summary panel.", 3000, "error");
    }
}

// =========================================================
// API 2: USER MANAGEMENT
// =========================================================
let currentUsersPage = 1;
let currentSelectedUserId = null;

async function fetchUsers(page = 1) {
    currentUsersPage = page;
    const search = document.getElementById("userSearchInput").value.trim();
    const role = document.getElementById("userFilterRole").value;
    const status = document.getElementById("userFilterStatus").value;

    const tbody = document.querySelector("#usersTable tbody");
    tbody.innerHTML = `<tr><td colspan="7" class="loading-row"><i class="ph-bold ph-spinner spinner"></i> Loading users...</td></tr>`;

    try {
        const queryParams = new URLSearchParams({
            page,
            limit: 10,
            search,
            role,
            status
        });

        const data = await apiFetch(`/admin/users?${queryParams.toString()}`);
        tbody.innerHTML = "";

        if (!data.users || data.users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="loading-row">No users matching search filters found.</td></tr>`;
            document.getElementById("usersPagination").innerHTML = "";
            return;
        }

        data.users.forEach(user => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${escapeHtml(user.name)}</strong></td>
                <td>${escapeHtml(user.email)}</td>
                <td><span class="badge-role ${user.role}">${user.role}</span></td>
                <td><span class="tag-status ${user.status}"><i class="ph-fill ph-circle"></i> ${user.status}</span></td>
                <td>Lvl ${user.level} (Streak: ${user.streak || 0}d)</td>
                <td>${new Date(user.createdAt).toLocaleDateString()}</td>
                <td>
                    <button type="button" class="btn-action-trigger" onclick="openUserProfileModal('${user._id}')">
                        <i class="ph-bold ph-eye"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        renderPagination("usersPagination", data.pagination, fetchUsers);
    } catch (err) {
        console.error("Error fetching user list:", err);
        tbody.innerHTML = `<tr><td colspan="7" class="loading-row error">Failed to load user records.</td></tr>`;
    }
}

// User Profile Details Modal
async function openUserProfileModal(userId) {
    currentSelectedUserId = userId;
    const modal = document.getElementById("userModal");
    
    // Clear old details
    document.getElementById("userDetailName").textContent = "Loading...";
    document.getElementById("userDetailEmail").textContent = "";
    document.getElementById("userDetailXp").textContent = "—";
    document.getElementById("userDetailLevel").textContent = "—";
    document.getElementById("userDetailStreak").textContent = "—";
    document.getElementById("userDetailCompletion").textContent = "—";
    document.getElementById("userDetailSessionsList").innerHTML = "<p>Loading active sessions...</p>";

    modal.classList.remove("hidden");

    try {
        const data = await apiFetch(`/admin/users/${userId}`);
        const user = data.user;

        document.getElementById("userDetailName").textContent = user.name;
        document.getElementById("userDetailEmail").textContent = user.email;
        
        const roleBadge = document.getElementById("userDetailRole");
        roleBadge.className = `user-role-badge ${user.role}`;
        roleBadge.textContent = user.role;

        document.getElementById("userDetailXp").textContent = user.xp ?? 0;
        document.getElementById("userDetailLevel").textContent = user.level ?? 1;
        document.getElementById("userDetailStreak").textContent = `${user.streak ?? 0} days`;
        document.getElementById("userDetailCompletion").textContent = `${data.metrics.completionRate}%`;

        // Load controls if Owner
        const cache = loadUserProfile();
        if (cache?.role === "owner") {
            const roleSelect = document.getElementById("changeRoleSelect");
            roleSelect.value = user.role;

            const suspendBtn = document.getElementById("btnToggleUserStatus");
            if (user.status === "suspended") {
                suspendBtn.textContent = "Reactivate Account";
                suspendBtn.className = "btn btn--primary";
            } else {
                suspendBtn.textContent = "Suspend Account";
                suspendBtn.className = "btn btn--danger";
            }
        }

        // Render sessions
        const sessionsList = document.getElementById("userDetailSessionsList");
        sessionsList.innerHTML = "";

        if (!data.sessions || data.sessions.length === 0) {
            sessionsList.innerHTML = "<p>No active login sessions found for this user.</p>";
            return;
        }

        data.sessions.forEach(sess => {
            const item = document.createElement("div");
            item.className = `session-mini-item ${sess.status === "active" ? "active" : ""}`;
            item.innerHTML = `
                <div class="session-info">
                    <p>${escapeHtml(sess.device)} • ${escapeHtml(sess.browser)} (${escapeHtml(sess.os)})</p>
                    <span>IP: ${escapeHtml(sess.ipAddress)} • Active: ${new Date(sess.lastActive).toLocaleTimeString()}</span>
                </div>
                ${sess.status === "active" && cache?.role === "owner" ? `
                    <button type="button" class="btn-action-trigger delete" onclick="revokeUserSession('${sess._id}')">
                        <i class="ph-bold ph-power"></i>
                    </button>
                ` : ""}
            `;
            sessionsList.appendChild(item);
        });
    } catch (err) {
        console.error("Failed to load user profile detailed analytics:", err);
        showToast("Error loading user profile.", 3000, "error");
    }
}

// SuperAdmin: Change user roles
document.getElementById("btnApplyRole")?.addEventListener("click", async () => {
    if (!currentSelectedUserId) return;
    const role = document.getElementById("changeRoleSelect").value;

    try {
        await apiFetch(`/admin/users/${currentSelectedUserId}/role`, {
            method: "PATCH",
            body: JSON.stringify({ role })
        });
        showToast("User role modified successfully.", 2500, "success");
        openUserProfileModal(currentSelectedUserId);
        fetchUsers(currentUsersPage);
        loadSummaryStats();
    } catch (err) {
        showToast(err.message || "Failed to update user role", 3000, "error");
    }
});

// SuperAdmin: Suspend / reactivate users
document.getElementById("btnToggleUserStatus")?.addEventListener("click", async () => {
    if (!currentSelectedUserId) return;
    
    const btn = document.getElementById("btnToggleUserStatus");
    const isSuspending = btn.classList.contains("btn--danger");
    const newStatus = isSuspending ? "suspended" : "active";

    const confirmMsg = isSuspending 
        ? "Are you sure you want to suspend this user? They will be logged out immediately." 
        : "Reactivate this account?";

    if (!confirm(confirmMsg)) return;

    try {
        await apiFetch(`/admin/users/${currentSelectedUserId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: newStatus })
        });
        showToast(`User account is now ${newStatus}.`, 2500, "success");
        openUserProfileModal(currentSelectedUserId);
        fetchUsers(currentUsersPage);
        loadSummaryStats();
    } catch (err) {
        showToast(err.message || "Failed to change account status", 3000, "error");
    }
});

// SuperAdmin: Revoke all active sessions for a user
document.getElementById("btnRevokeAllUserSessions")?.addEventListener("click", async () => {
    if (!currentSelectedUserId) return;
    if (!confirm("Are you sure you want to revoke all active sessions for this user? They will be signed out from all devices.")) return;

    try {
        const res = await apiFetch(`/admin/users/${currentSelectedUserId}/sessions`, {
            method: "DELETE"
        });
        showToast(res.message || "All sessions revoked successfully.", 2500, "success");
        openUserProfileModal(currentSelectedUserId);
        loadSummaryStats();
    } catch (err) {
        showToast(err.message || "Failed to revoke sessions", 3000, "error");
    }
});

// Close Modals listeners
document.getElementById("closeUserModalBtn")?.addEventListener("click", () => {
    document.getElementById("userModal").classList.add("hidden");
});

// =========================================================
// API 3: FOCUS GARDEN ANALYTICS
// =========================================================
async function fetchGardenAnalytics() {
    try {
        const snapshots = await apiFetch("/admin/analytics");
        if (snapshots.length === 0) return;

        const latest = snapshots[snapshots.length - 1].metrics.focusGardenStageDistribution;
        
        // Render Text stats list
        const list = document.getElementById("gardenStatsList");
        list.innerHTML = "";

        const stages = [
            { key: "stage0", name: "Seed (Level 1)" },
            { key: "stage1", name: "Sprout (Levels 2-3)" },
            { key: "stage2", name: "Small Plant (Levels 4-5)" },
            { key: "stage3", name: "Sapling (Levels 6-7)" },
            { key: "stage4", name: "Young Tree (Levels 8-9)" },
            { key: "stage5", name: "Growing Tree (Levels 10-12)" },
            { key: "stage6", name: "Mature Tree (Levels 13-15)" },
            { key: "stage7", name: "Fully Bloomed (Level 16+)" }
        ];

        const totalUsers = Object.values(latest).reduce((a, b) => a + b, 0) || 1;

        stages.forEach(st => {
            const count = latest[st.key] || 0;
            const pct = Math.round((count / totalUsers) * 100);
            
            const li = document.createElement("li");
            li.innerHTML = `
                <span><strong>${st.name}</strong></span>
                <span>${count} users (${pct}%)</span>
            `;
            list.appendChild(li);
        });

        // Draw Chart.js Bar Graph
        const ctx = document.getElementById("gardenChart").getContext("2d");
        if (gardenChartInstance) {
            gardenChartInstance.destroy();
        }

        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        const textColor = isDark ? "#cbd5e1" : "#475569";
        const gridColor = isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)";

        gardenChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: stages.map(s => s.name.split(" (")[0]),
                datasets: [{
                    label: 'Active Users',
                    data: stages.map(s => latest[s.key] || 0),
                    backgroundColor: [
                        '#c084fc', '#a78bfa', '#818cf8', '#60a5fa', 
                        '#34d399', '#f472b6', '#f472b6', '#fbbf24'
                    ],
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        ticks: { color: textColor },
                        grid: { display: false }
                    },
                    y: {
                        ticks: { color: textColor, stepSize: 1 },
                        grid: { color: gridColor }
                    }
                }
            }
        });

    } catch (err) {
        console.error("Failed to load Focus Garden distribution analytics:", err);
    }
}

// =========================================================
// API 4: AI OPERATIONS & COST METRICS
// =========================================================
async function fetchAiAnalytics() {
    try {
        const snapshots = await apiFetch("/admin/analytics");
        if (snapshots.length === 0) return;

        // Calculate aggregate statistics
        let totalConversations = 0;
        let totalTokens = 0;

        snapshots.forEach(snap => {
            totalConversations += snap.metrics.aiConversationsCount || 0;
            totalTokens += snap.metrics.aiTokenUsage || 0;
        });

        // 1 token in Gemini Flash costs roughly $0.000000075 ($0.075 per 1M input/output tokens average)
        const costEst = (totalTokens * 0.000000075).toFixed(4);

        document.getElementById("kpiConversationsCount").textContent = totalConversations;
        document.getElementById("kpiTokensUsed").textContent = totalTokens.toLocaleString();
        document.getElementById("kpiEstimatedCost").textContent = `$${costEst} USD`;

        // Draw Line Chart for AI Trend
        const ctx = document.getElementById("aiConversationsChart").getContext("2d");
        if (aiChartInstance) {
            aiChartInstance.destroy();
        }

        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        const textColor = isDark ? "#cbd5e1" : "#475569";
        const gridColor = isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)";

        aiChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: snapshots.map(s => new Date(s.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})),
                datasets: [{
                    label: 'Daily Chat Count',
                    data: snapshots.map(s => s.metrics.aiConversationsCount || 0),
                    borderColor: '#8b7cf6',
                    backgroundColor: 'rgba(139, 124, 246, 0.15)',
                    borderWidth: 2,
                    tension: 0.35,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        ticks: { color: textColor },
                        grid: { display: false }
                    },
                    y: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                }
            }
        });

    } catch (err) {
        console.error("Failed to load AI cost analytics:", err);
    }
}

// =========================================================
// API 5: SUPPORT TICKETS & SLA CENTER
// =========================================================
let currentSelectedTicketId = null;

async function fetchSupportTickets() {
    const tbody = document.querySelector("#ticketsTable tbody");
    tbody.innerHTML = `<tr><td colspan="7" class="loading-row"><i class="ph-bold ph-spinner spinner"></i> Loading support tickets...</td></tr>`;

    try {
        const tickets = await apiFetch("/admin/tickets");
        tbody.innerHTML = "";

        if (tickets.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="loading-row">No support tickets found in system.</td></tr>`;
            return;
        }

        tickets.forEach(ticket => {
            const userName = ticket.userId ? ticket.userId.name : "Deleted User";
            const userEmail = ticket.userId ? ticket.userId.email : "";

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><code>#${ticket._id.substring(18)}</code></td>
                <td><strong>${escapeHtml(userName)}</strong><br><small>${escapeHtml(userEmail)}</small></td>
                <td><span class="priority-badge-ticket ${ticket.type}">${ticket.type}</span></td>
                <td>${escapeHtml(ticket.title)}</td>
                <td><span class="tag-status ${ticket.status === 'closed' ? 'suspended' : 'active'}">${ticket.status}</span></td>
                <td>${new Date(ticket.createdAt).toLocaleDateString()}</td>
                <td>
                    <button type="button" class="btn-action-trigger" onclick="openTicketModal('${ticket._id}')">
                        <i class="ph-bold ph-chats"></i> Reply
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Failed to retrieve tickets:", err);
        tbody.innerHTML = `<tr><td colspan="7" class="loading-row error">Failed to load support ticket registers.</td></tr>`;
    }
}

async function openTicketModal(ticketId) {
    currentSelectedTicketId = ticketId;
    const modal = document.getElementById("ticketModal");
    modal.classList.remove("hidden");

    try {
        // Find ticket in table details
        const tickets = await apiFetch("/admin/tickets");
        const ticket = tickets.find(t => t._id === ticketId);
        
        if (ticket) {
            const userName = ticket.userId ? ticket.userId.name : "Deleted User";
            const userEmail = ticket.userId ? ticket.userId.email : "";
            
            document.getElementById("ticketUser").textContent = `${userName} (${userEmail})`;
            document.getElementById("ticketSubject").textContent = ticket.title;
            document.getElementById("ticketType").textContent = ticket.type;
            document.getElementById("ticketDescription").textContent = ticket.description;
            document.getElementById("ticketStatusSelect").value = ticket.status;
            document.getElementById("ticketReplyText").value = "";
        }
    } catch (err) {
        console.error("Failed to load support ticket detailed specifications:", err);
    }
}

document.getElementById("submitTicketReplyBtn")?.addEventListener("click", async () => {
    if (!currentSelectedTicketId) return;

    const status = document.getElementById("ticketStatusSelect").value;
    const replyText = document.getElementById("ticketReplyText").value.trim();

    try {
        await apiFetch(`/admin/tickets/${currentSelectedTicketId}`, {
            method: "PATCH",
            body: JSON.stringify({ status, replyText })
        });
        showToast("Support ticket updated successfully.", 2500, "success");
        document.getElementById("ticketModal").classList.add("hidden");
        fetchSupportTickets();
        loadSummaryStats();
    } catch (err) {
        showToast("Failed to respond to ticket", 3000, "error");
    }
});

// Close Ticket Modal triggers
document.getElementById("closeTicketModalBtn")?.addEventListener("click", () => {
    document.getElementById("ticketModal").classList.add("hidden");
});
document.getElementById("cancelTicketReplyBtn")?.addEventListener("click", () => {
    document.getElementById("ticketModal").classList.add("hidden");
});

// =========================================================
// API 6: SESSION REGISTRY & REVOCATION
// =========================================================
async function fetchSessions(page = 1) {
    const tbody = document.querySelector("#sessionsTable tbody");
    tbody.innerHTML = `<tr><td colspan="7" class="loading-row"><i class="ph-bold ph-spinner spinner"></i> Loading active sessions...</td></tr>`;

    try {
        const queryParams = new URLSearchParams({ page, limit: 15 });
        const data = await apiFetch(`/admin/sessions?${queryParams.toString()}`);
        tbody.innerHTML = "";

        if (!data.sessions || data.sessions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="loading-row">No active user login sessions registered.</td></tr>`;
            return;
        }

        const cache = loadUserProfile();

        data.sessions.forEach(sess => {
            const userName = sess.userId ? sess.userId.name : "Unknown User";
            const userEmail = sess.userId ? sess.userId.email : "";

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${escapeHtml(userName)}</strong><br><small>${escapeHtml(userEmail)}</small></td>
                <td>${escapeHtml(sess.device)} / ${escapeHtml(sess.browser)}</td>
                <td>${escapeHtml(sess.os)}</td>
                <td><code>${escapeHtml(sess.ipAddress)}</code></td>
                <td>${new Date(sess.lastActive).toLocaleString()}</td>
                <td><span class="tag-status ${sess.status === 'active' ? 'active' : 'suspended'}">${sess.status}</span></td>
                <td>
                    ${sess.status === 'active' && cache?.role === 'owner' ? `
                        <button type="button" class="btn btn--danger btn--sm" onclick="revokeSession('${sess._id}')">
                            <i class="ph-bold ph-power"></i> Revoke
                        </button>
                    ` : "—"}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Failed to load sessions list:", err);
        tbody.innerHTML = `<tr><td colspan="7" class="loading-row error">Failed to query session configurations.</td></tr>`;
    }
}

async function revokeSession(sessionId) {
    if (!confirm("Revoke this active user session? The user will be signed out immediately.")) return;

    try {
        await apiFetch(`/admin/sessions/${sessionId}`, { method: "DELETE" });
        showToast("Device session revoked successfully.", 2500, "success");
        
        // Reload depending on active panel tab
        const activeTab = document.querySelector(".tab-btn.active").getAttribute("data-tab");
        if (activeTab === "sessions") fetchSessions(1);
        if (activeTab === "users" && currentSelectedUserId) openUserProfileModal(currentSelectedUserId);
        
        loadSummaryStats();
    } catch (err) {
        showToast(err.message || "Failed to revoke active session", 3000, "error");
    }
}

async function revokeUserSession(sessId) {
    await revokeSession(sessId);
}

// Export revocation handlers to global scope for row triggers
window.revokeSession = revokeSession;
window.revokeUserSession = revokeUserSession;
window.openUserProfileModal = openUserProfileModal;
window.openTicketModal = openTicketModal;

// =========================================================
// API 7: SYSTEM DIAGNOSTICS
// =========================================================
async function fetchSystemHealth() {
    try {
        const diagnostics = await apiFetch("/admin/system-health");
        
        // Process specs
        document.getElementById("healthUptime").textContent = `${Math.round(diagnostics.process.uptime / 60)} minutes`;
        document.getElementById("healthNodeVersion").textContent = diagnostics.process.nodeVersion;
        document.getElementById("healthPlatform").textContent = diagnostics.process.platform;
        document.getElementById("healthMemoryRss").textContent = `${diagnostics.process.memoryUsage.rssMb} MB`;
        document.getElementById("healthMemoryHeap").textContent = `${diagnostics.process.memoryUsage.heapUsedMb} MB / ${diagnostics.process.memoryUsage.heapTotalMb} MB`;

        // DB specs
        document.getElementById("healthDbStatus").textContent = diagnostics.database.status;
        document.getElementById("healthDbCollections").textContent = diagnostics.database.totalCollections;
        document.getElementById("healthDbDataSize").textContent = `${diagnostics.database.dataSizeMb} MB`;
        document.getElementById("healthDbIndexSize").textContent = `${diagnostics.database.indexSizeMb} MB`;
        document.getElementById("healthDbStorageSize").textContent = `${diagnostics.database.storageSizeMb} MB`;

        // Collection specs lists
        const collectionsList = document.getElementById("healthDbCollectionsList");
        collectionsList.innerHTML = "";

        Object.entries(diagnostics.collections).forEach(([name, meta]) => {
            const li = document.createElement("li");
            li.innerHTML = `
                <span><strong>${escapeHtml(name)}</strong></span>
                <span>Count: ${meta.count} (${meta.sizeKb} KB, Index: ${meta.indexSizeKb} KB)</span>
            `;
            collectionsList.appendChild(li);
        });

    } catch (err) {
        console.error("Failed to query diagnostics specs:", err);
        showToast("Failed to fetch system diagnostics health indicators.", 3000, "error");
    }
}

// =========================================================
// API 8: IMMUTABLE AUDIT LOGS
// =========================================================
async function fetchAuditLogs(page = 1) {
    const tbody = document.querySelector("#auditTable tbody");
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row"><i class="ph-bold ph-spinner spinner"></i> Loading security logs...</td></tr>`;

    const search = document.getElementById("auditSearchInput").value.trim();
    const action = document.getElementById("auditFilterAction").value;

    try {
        const queryParams = new URLSearchParams({
            page,
            limit: 15,
            search,
            action
        });

        const data = await apiFetch(`/admin/audit-logs?${queryParams.toString()}`);
        tbody.innerHTML = "";

        if (!data.logs || data.logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="loading-row">No system audit logs found.</td></tr>`;
            return;
        }

        data.logs.forEach(log => {
            const actorName = log.actorId ? log.actorId.name : "System Daemon";
            const actorEmail = log.actorId ? log.actorId.email : "cron@flow-nest.com";
            
            const targetName = log.targetId ? log.targetId.name : "N/A";
            
            // Nice action formatter
            const actionClass = log.action.split("_").join("-");

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><small>${new Date(log.createdAt).toLocaleString()}</small></td>
                <td><strong>${escapeHtml(actorName)}</strong><br><small>${escapeHtml(actorEmail)}</small></td>
                <td><span class="badge-role user ${actionClass}">${escapeHtml(log.action)}</span></td>
                <td>${escapeHtml(targetName)}</td>
                <td><code>${escapeHtml(log.ipAddress)}</code></td>
                <td><small style="word-break: break-all;">${JSON.stringify(log.details || {})}</small></td>
            `;
            tbody.appendChild(tr);
        });

        renderPagination("auditPagination", data.pagination, fetchAuditLogs);
    } catch (err) {
        console.error("Failed to read audit logs:", err);
        tbody.innerHTML = `<tr><td colspan="6" class="loading-row error">Failed to load system audit trails.</td></tr>`;
    }
}

// =========================================================
// COMMON HELPERS
// =========================================================

// Setup filter input listeners with debouncing
function setupFilterListeners() {
    // User search debounce
    let userDebounceTimer;
    document.getElementById("userSearchInput")?.addEventListener("input", () => {
        clearTimeout(userDebounceTimer);
        userDebounceTimer = setTimeout(() => fetchUsers(1), 500);
    });

    document.getElementById("userFilterRole")?.addEventListener("change", () => fetchUsers(1));
    document.getElementById("userFilterStatus")?.addEventListener("change", () => fetchUsers(1));

    // Audit search debounce
    let auditDebounceTimer;
    document.getElementById("auditSearchInput")?.addEventListener("input", () => {
        clearTimeout(auditDebounceTimer);
        auditDebounceTimer = setTimeout(() => fetchAuditLogs(1), 500);
    });

    document.getElementById("auditFilterAction")?.addEventListener("change", () => fetchAuditLogs(1));

    // Close modal on clicking outside overlay
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                overlay.classList.add("hidden");
            }
        });
    });
}

// HTML Escaper for security sanitization
function escapeHtml(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Pagination renderer helper
function renderPagination(elementId, pagination, fetchCallback) {
    const container = document.getElementById(elementId);
    if (!container) return;

    container.innerHTML = "";

    const { page, totalPages } = pagination;
    if (totalPages <= 1) return;

    // Previous Button
    const prevBtn = document.createElement("button");
    prevBtn.className = "page-btn";
    prevBtn.disabled = page === 1;
    prevBtn.innerHTML = '<i class="ph-bold ph-caret-left"></i>';
    prevBtn.onclick = () => fetchCallback(page - 1);
    container.appendChild(prevBtn);

    // Page indicator
    const textSpan = document.createElement("span");
    textSpan.style.margin = "0 8px";
    textSpan.style.fontSize = "13px";
    textSpan.style.color = "var(--text-secondary)";
    textSpan.textContent = `Page ${page} of ${totalPages}`;
    container.appendChild(textSpan);

    // Next Button
    const nextBtn = document.createElement("button");
    nextBtn.className = "page-btn";
    nextBtn.disabled = page === totalPages;
    nextBtn.innerHTML = '<i class="ph-bold ph-caret-right"></i>';
    nextBtn.onclick = () => fetchCallback(page + 1);
    container.appendChild(nextBtn);
}
