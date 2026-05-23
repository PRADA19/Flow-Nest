/**
 * Analytics Module
 * Separates API handling, metric calculations, and UI rendering.
 * Designed to be scalable for future Chart.js or AI insights integration.
 */

// --- UI Rendering Layer ---
const UI = {
    elements: {
        completionRate: document.getElementById("statCompletionRate"),
        completedToday: document.getElementById("statToday"),
        thisWeek: document.getElementById("statThisWeek"),
        productiveTime: document.getElementById("statProductiveTime"),
        lastUpdated: document.getElementById("lastUpdatedTime"),
        analyticsGrid: document.getElementById("analyticsGrid")
    },

    updateLastUpdated() {
        if (!this.elements.lastUpdated) return;
        const now = new Date();
        this.elements.lastUpdated.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },

    renderLoadingState() {
        const loaders = ['completionRate', 'completedToday', 'thisWeek', 'productiveTime'];
        loaders.forEach(id => {
            if (this.elements[id]) {
                this.elements[id].innerHTML = `<i class="ph ph-spinner-gap spinner" style="font-size: 1.2rem;"></i>`;
            }
        });
    },

    renderEmptyState() {
        if (!this.elements.analyticsGrid) return;
        this.elements.analyticsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; padding: var(--spacing-xl); text-align: center;">
                <i class="ph-fill ph-chart-line-down" style="font-size: 3rem; color: var(--text-muted); margin-bottom: var(--spacing-sm);"></i>
                <h3>No Data Available</h3>
                <p>Complete some tasks to generate your productivity analytics.</p>
            </div>
        `;
        this.updateLastUpdated();
        ChartRenderer.destroyAll();
    },

    renderErrorState(message) {
        if (!this.elements.analyticsGrid) return;
        this.elements.analyticsGrid.innerHTML = `
            <div class="empty-state error" style="grid-column: 1 / -1; padding: var(--spacing-xl); text-align: center;">
                <i class="ph-fill ph-warning-circle" style="font-size: 3rem; color: var(--danger); margin-bottom: var(--spacing-sm);"></i>
                <h3>Failed to load analytics</h3>
                <p>${escapeHtml(message)}</p>
            </div>
        `;
        this.updateLastUpdated();
        ChartRenderer.destroyAll();
    },

    renderMetrics(metrics) {
        if (this.elements.completionRate) this.elements.completionRate.textContent = `${metrics.completionRate}%`;
        if (this.elements.completedToday) this.elements.completedToday.textContent = metrics.completedToday;
        if (this.elements.thisWeek) this.elements.thisWeek.textContent = metrics.completedThisWeek;
        if (this.elements.productiveTime) this.elements.productiveTime.textContent = metrics.mostProductiveHour;
        this.updateLastUpdated();
    },

    resetToDefaultGrid() {
        if (!this.elements.analyticsGrid) return;
        // Restore the original grid HTML if it was overwritten by empty/error states
        this.elements.analyticsGrid.innerHTML = `
            <div class="analytics-card">
                <div class="card-icon"><i class="ph-fill ph-target"></i></div>
                <div class="card-info">
                    <h3>Completion Rate</h3>
                    <p id="statCompletionRate" class="stat-value">--%</p>
                </div>
            </div>
            <div class="analytics-card">
                <div class="card-icon"><i class="ph-fill ph-calendar-check"></i></div>
                <div class="card-info">
                    <h3>Completed Today</h3>
                    <p id="statToday" class="stat-value">--</p>
                </div>
            </div>
            <div class="analytics-card">
                <div class="card-icon"><i class="ph-fill ph-calendar-blank"></i></div>
                <div class="card-info">
                    <h3>This Week</h3>
                    <p id="statThisWeek" class="stat-value">--</p>
                </div>
            </div>
            <div class="analytics-card">
                <div class="card-icon"><i class="ph-fill ph-clock"></i></div>
                <div class="card-info">
                    <h3>Productive Time</h3>
                    <p id="statProductiveTime" class="stat-value text-small">--</p>
                </div>
            </div>
        `;
        // Re-bind elements
        this.elements.completionRate = document.getElementById("statCompletionRate");
        this.elements.completedToday = document.getElementById("statToday");
        this.elements.thisWeek = document.getElementById("statThisWeek");
        this.elements.productiveTime = document.getElementById("statProductiveTime");
    }
};

// --- ChartRenderer Layer ---
const ChartRenderer = {
    instances: {},

    destroyChart(id) {
        if (this.instances[id]) {
            this.instances[id].destroy();
            delete this.instances[id];
        }
    },

    destroyAll() {
        Object.keys(this.instances).forEach(id => this.destroyChart(id));
    },

    getCommonOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#64748b',
                        font: { family: "'Outfit', sans-serif", size: 12 }
                    }
                }
            }
        };
    },

    renderWeeklyTrend(data) {
        this.destroyChart('weeklyTrendChart');
        const ctx = document.getElementById('weeklyTrendChart');
        if (!ctx) return;
        
        this.instances['weeklyTrendChart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Tasks Completed',
                    data: data.values,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                ...this.getCommonOptions(),
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 } }
                }
            }
        });
    },

    renderCategoryDistribution(data) {
        this.destroyChart('categoryChart');
        const ctx = document.getElementById('categoryChart');
        if (!ctx) return;

        this.instances['categoryChart'] = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.values,
                    backgroundColor: [
                        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#94a3b8'
                    ],
                    borderWidth: 0
                }]
            },
            options: this.getCommonOptions()
        });
    },

    renderStatusOverview(data) {
        this.destroyChart('statusChart');
        const ctx = document.getElementById('statusChart');
        if (!ctx) return;

        this.instances['statusChart'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.values,
                    backgroundColor: ['#10b981', '#94a3b8'],
                    borderWidth: 0
                }]
            },
            options: {
                ...this.getCommonOptions(),
                cutout: '70%'
            }
        });
    },

    renderProductiveHours(data) {
        this.destroyChart('productiveHoursChart');
        const ctx = document.getElementById('productiveHoursChart');
        if (!ctx) return;

        this.instances['productiveHoursChart'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Tasks Completed',
                    data: data.values,
                    backgroundColor: '#8b5cf6',
                    borderRadius: 4
                }]
            },
            options: {
                ...this.getCommonOptions(),
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 } }
                }
            }
        });
    }
};

// --- Analytics Adapter Layer (Calculations) ---
const AnalyticsAdapter = {
    
    normalizeAnalyticsData(dashboardStats, tasks) {
        // Core metrics from backend /analytics endpoint
        const completionRate = dashboardStats.completionRate || 0;
        
        // Advanced metrics derived from raw tasks
        const timeMetrics = this.buildCompletionMetrics(tasks);
        const productivityMetrics = this.buildProductivityMetrics(tasks);

        return {
            completionRate: completionRate,
            completedToday: timeMetrics.today,
            completedThisWeek: timeMetrics.thisWeek,
            mostProductiveHour: productivityMetrics.peakHour
        };
    },

    buildCompletionMetrics(tasks) {
        const completedTasks = tasks.filter(t => t.completed && t.completedAt);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        let completedToday = 0;
        let completedThisWeek = 0;

        completedTasks.forEach(task => {
            const compDate = new Date(task.completedAt);
            if (compDate >= today) completedToday++;
            if (compDate >= oneWeekAgo) completedThisWeek++;
        });

        return {
            today: completedToday,
            thisWeek: completedThisWeek,
            totalCompleted: completedTasks.length
        };
    },

    buildProductivityMetrics(tasks) {
        const completedTasks = tasks.filter(t => t.completed && t.completedAt);
        const hourCounts = {};

        completedTasks.forEach(task => {
            const hour = new Date(task.completedAt).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });

        let mostProductiveHour = "--";
        if (Object.keys(hourCounts).length > 0) {
            const topHour = Object.keys(hourCounts).reduce((a, b) => hourCounts[a] > hourCounts[b] ? a : b);
            const ampm = topHour >= 12 ? 'PM' : 'AM';
            const displayHour = topHour % 12 || 12;
            mostProductiveHour = `${displayHour} ${ampm}`;
        }

        // Format for Chart.js
        const chartLabels = [];
        const chartValues = [];
        // Sort hours properly 0-23
        const sortedHours = Object.keys(hourCounts).sort((a,b) => Number(a) - Number(b));
        sortedHours.forEach(hr => {
            const num = Number(hr);
            const ampm = num >= 12 ? 'PM' : 'AM';
            const display = num % 12 || 12;
            chartLabels.push(`${display} ${ampm}`);
            chartValues.push(hourCounts[hr]);
        });

        return {
            peakHour: mostProductiveHour,
            chartData: { labels: chartLabels, values: chartValues }
        };
    },

    buildWeeklyTrend(tasks, period = 'weekly') {
        const completedTasks = tasks.filter(t => t.completed && t.completedAt);
        
        // For 'weekly', get last 7 days
        const days = 7;
        const labels = [];
        const values = [];
        const countsByDay = {};

        // Initialize array for the past X days
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            d.setHours(0,0,0,0);
            
            // Format like 'Mon', 'Tue' or MM/DD
            const label = d.toLocaleDateString([], { weekday: 'short' });
            labels.push(label);
            countsByDay[d.toDateString()] = 0;
        }

        completedTasks.forEach(task => {
            const d = new Date(task.completedAt);
            d.setHours(0,0,0,0);
            const dateStr = d.toDateString();
            if (countsByDay[dateStr] !== undefined) {
                countsByDay[dateStr]++;
            }
        });

        labels.forEach((label, index) => {
            // Re-fetch the date string for this index to get the value
            const d = new Date();
            d.setDate(d.getDate() - (days - 1 - index));
            d.setHours(0,0,0,0);
            values.push(countsByDay[d.toDateString()]);
        });

        return { labels, values };
    },

    buildCategoryDistribution(tasks) {
        const counts = {};
        
        tasks.forEach(task => {
            let tags = task.tags || [];
            if (!Array.isArray(tags)) tags = [tags];
            if (tags.length === 0) tags = ["Uncategorized"];

            tags.forEach(rawTag => {
                const tag = (rawTag || "").trim();
                const lower = tag.toLowerCase();
                if (!lower) return;
                
                // Capitalize first letter for readable label
                const readable = lower.charAt(0).toUpperCase() + lower.slice(1);
                counts[readable] = (counts[readable] || 0) + 1;
            });
        });

        // Convert to array and sort by count descending
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        
        // Limit to Top 5 + "Other"
        const top = sorted.slice(0, 5);
        const others = sorted.slice(5);
        
        let otherCount = 0;
        others.forEach(([_, count]) => otherCount += count);
        
        if (otherCount > 0) {
            top.push(["Other", otherCount]);
        }

        const labels = top.map(item => item[0]);
        const values = top.map(item => item[1]);

        return { labels, values };
    },

    buildStatusOverview(tasks) {
        let completed = 0;
        let pending = 0;

        tasks.forEach(task => {
            if (task.completed) completed++;
            else pending++;
        });

        return {
            labels: ['Completed', 'Pending'],
            values: [completed, pending]
        };
    }
};

// --- API Handling Layer ---
async function fetchAnalyticsData() {
    UI.resetToDefaultGrid();
    UI.renderLoadingState();

    try {
        // Fetch base stats and full tasks array concurrently
        const [dashboardStats, tasks] = await Promise.all([
            apiFetch(CONFIG.ENDPOINTS.ANALYTICS),
            apiFetch(CONFIG.ENDPOINTS.TASKS)
        ]);

        if (!tasks || tasks.length === 0) {
            UI.renderEmptyState();
            return;
        }

        // Render Top Metrics
        const metrics = AnalyticsAdapter.normalizeAnalyticsData(dashboardStats, tasks);
        UI.renderMetrics(metrics);

        // Render Charts
        const weeklyData = AnalyticsAdapter.buildWeeklyTrend(tasks, 'weekly');
        const categoryData = AnalyticsAdapter.buildCategoryDistribution(tasks);
        const statusData = AnalyticsAdapter.buildStatusOverview(tasks);
        const productivityData = AnalyticsAdapter.buildProductivityMetrics(tasks);

        ChartRenderer.renderWeeklyTrend(weeklyData);
        ChartRenderer.renderCategoryDistribution(categoryData);
        ChartRenderer.renderStatusOverview(statusData);
        ChartRenderer.renderProductiveHours(productivityData.chartData);

    } catch (error) {
        console.error("Failed to load analytics:", error);
        if (error.message !== "Unauthorized") {
            UI.renderErrorState(error.message || "Unable to fetch analytics data.");
            showToast("Failed to load analytics.", 4000, "error");
        }
    }
}

// --- Lifecycle ---
window.onAuthStateChanged = (loggedIn) => {
    if (loggedIn) {
        fetchAnalyticsData();
    } else {
        UI.resetToDefaultGrid();
        ChartRenderer.destroyAll();
        UI.elements.lastUpdated.textContent = "--";
        if (UI.elements.completionRate) UI.elements.completionRate.textContent = "--%";
        if (UI.elements.completedToday) UI.elements.completedToday.textContent = "--";
        if (UI.elements.thisWeek) UI.elements.thisWeek.textContent = "--";
        if (UI.elements.productiveTime) UI.elements.productiveTime.textContent = "--";
    }
};
