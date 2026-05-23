// DOM Elements
const taskInput = document.getElementById("taskInput");
const taskContainer = document.getElementById("taskContainer");
const addBtn = document.getElementById("addBtn");
const dueDateInput = document.getElementById("dueDateInput");
const prioritySelect = document.getElementById("prioritySelect");
const tagSelect = document.getElementById("tagSelect");

// Filters
const filterPriority = document.getElementById("filterPriority");
const filterTag = document.getElementById("filterTag");

// View Toggles
const viewListBtn = document.getElementById("viewListBtn");
const viewCalendarBtn = document.getElementById("viewCalendarBtn");
const listViewContainer = document.getElementById("listViewContainer");
const calendarViewContainer = document.getElementById("calendarViewContainer");



// State
let loadedTasks = [];
let calendar = null;
let currentView = "list"; // 'list' or 'calendar'

// Hook into auth state
window.onAuthStateChanged = (loggedIn) => {
    if (loggedIn) {
        taskInput.removeAttribute("disabled");
        addBtn.removeAttribute("disabled");
        dueDateInput.removeAttribute("disabled");
        prioritySelect.removeAttribute("disabled");
        tagSelect.removeAttribute("disabled");
        fetchTasks();
    } else {
        taskInput.setAttribute("disabled", "true");
        addBtn.setAttribute("disabled", "true");
        dueDateInput.setAttribute("disabled", "true");
        prioritySelect.setAttribute("disabled", "true");
        tagSelect.setAttribute("disabled", "true");
        
        loadedTasks = [];
        renderEmptyState("Please login or register to view your tasks.");
        updateCalendar();

    }
};

/* ======================================================
   API & RENDERING LOGIC
====================================================== */

function renderEmptyState(message) {
    taskContainer.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderLoadingState() {
    taskContainer.innerHTML = `
        <div class="loading-state" id="loadingState">
            <i class="ph ph-spinner-gap spinner"></i>
            <p>Loading tasks...</p>
        </div>
    `;
}

async function fetchTasks() {
    renderLoadingState();
    
    let url = CONFIG.ENDPOINTS.TASKS;
    const queryParams = [];
    
    if (filterPriority?.value) queryParams.push(`priority=${encodeURIComponent(filterPriority.value)}`);
    if (filterTag?.value) queryParams.push(`tag=${encodeURIComponent(filterTag.value)}`);
    
    if (queryParams.length > 0) {
        url += `?${queryParams.join("&")}`;
    }

    try {
        const tasks = await apiFetch(url);
        loadedTasks = tasks;
        renderTasks(tasks);
        updateCalendar();
        

    } catch (err) {
        if (err.message !== "Unauthorized") {
            renderEmptyState("Failed to load tasks.");
            showToast(err.message, 4000, "error");
        }
    }
}

function renderTasks(tasks) {
    if (!tasks || tasks.length === 0) {
        renderEmptyState("You have no tasks matching this criteria. Add one to get started.");
        return;
    }

    taskContainer.innerHTML = tasks
        .map(task => {
            const completed = Boolean(task.completed);
            const completedClass = completed ? "completed" : "";
            const dueDateText = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : null;
            const dueHtml = dueDateText
                ? `<span class="task-meta"><i class="ph ph-calendar"></i> Due ${escapeHtml(dueDateText)}</span>`
                : "";
            
            const tagsHtml = (task.tags || [])
                .map(tag => `<span class="tag-pill">${escapeHtml(tag)}</span>`)
                .join("");

            return `
                <article class="task-item ${completedClass}" id="task-card-${task._id}">
                    <div class="task-content" onclick="toggleTaskCompletion('${task._id}', ${!completed})">
                        <div class="task-checkbox" aria-label="${completed ? "Mark incomplete" : "Mark complete"}">
                            ${completed ? '<i class="ph-bold ph-check"></i>' : ""}
                        </div>
                        <div>
                            <div class="task-title">${escapeHtml(task.title)}</div>
                            <div class="task-badges">
                                ${renderPriorityBadge(task.priority)}
                                ${tagsHtml}
                            </div>
                            ${dueHtml}
                        </div>
                    </div>
                    <div class="task-actions">
                        <button class="action-btn delete-btn" onclick="event.stopPropagation(); deleteTask('${task._id}')" aria-label="Delete task">
                            <i class="ph-bold ph-trash"></i>
                        </button>
                    </div>
                </article>
            `;
        })
        .join("");
}

async function addTask() {
    const title = taskInput.value.trim();
    if (!title) {
        showToast("Please enter a task title.");
        return;
    }

    const dueDate = dueDateInput.value || undefined;
    const priority = prioritySelect.value;
    const tagValue = tagSelect.value;
    const tags = tagValue ? [tagValue] : [];

    const originalBtnContent = addBtn.innerHTML;
    addBtn.disabled = true;
    addBtn.innerHTML = '<i class="ph ph-spinner-gap spinner"></i>';

    try {
        await apiFetch(CONFIG.ENDPOINTS.TASKS, {
            method: "POST",
            body: JSON.stringify({ title, dueDate, priority, tags })
        });
        
        taskInput.value = "";
        dueDateInput.value = "";
        prioritySelect.value = "medium";
        tagSelect.value = "";
        
        showToast("Task added successfully", 2000, "success");
        fetchTasks();
    } catch (err) {
        if (err.message !== "Unauthorized") {
            showToast(err.message, 4000, "error");
        }
    } finally {
        addBtn.disabled = false;
        addBtn.innerHTML = originalBtnContent;
    }
}

async function toggleTaskCompletion(id, completed) {
    try {
        const taskCard = document.getElementById(`task-card-${id}`);
        if (taskCard) {
            taskCard.style.pointerEvents = "none";
            taskCard.style.opacity = "0.7";
        }

        const data = await apiFetch(`${CONFIG.ENDPOINTS.TASKS}/${id}`, {
            method: "PUT",
            body: JSON.stringify({ completed })
        });

        if (completed && data.gamification) {
            const { xpEarned, streak, newlyUnlockedBadges, leveledUp, levelInfo } = data.gamification;

            if (taskCard && xpEarned > 0) {
                const bubble = document.createElement("div");
                bubble.className = "floating-xp-bubble";
                bubble.textContent = `+${xpEarned} XP`;
                
                const checkboxEl = taskCard.querySelector(".task-checkbox");
                if (checkboxEl) {
                    const rect = checkboxEl.getBoundingClientRect();
                    const cardRect = taskCard.getBoundingClientRect();
                    bubble.style.left = `${rect.left - cardRect.left + 8}px`;
                    bubble.style.top = `${rect.top - cardRect.top - 12}px`;
                } else {
                    bubble.style.left = "20px";
                    bubble.style.top = "10px";
                }
                
                taskCard.appendChild(bubble);
                setTimeout(() => bubble.remove(), 800);
            }

            let toastMsg = `🎉 Task completed! +${xpEarned} XP.`;
            if (streak > 0) {
                toastMsg += ` Streak: 🔥 ${streak} Day${streak > 1 ? "s" : ""}!`;
            }
            showToast(toastMsg, 3000, "success");

            if (newlyUnlockedBadges && newlyUnlockedBadges.length > 0) {
                newlyUnlockedBadges.forEach(badge => {
                    setTimeout(() => {
                        showToast(`🏆 Achievement Unlocked: ${badge.name}!`, 4000, "success");
                    }, 800);
                });
            }

            if (leveledUp) {
                setTimeout(() => {
                    triggerLevelUpCelebration(levelInfo);
                }, 1000);
            }

            updateSidebarGamification(data.gamification, data.userName);
        } else if (!completed) {
            showToast("Task marked incomplete.", 2000, "info");
            if (data.gamification) {
                updateSidebarGamification(data.gamification, data.userName);
            }
        }

        fetchTasks();
    } catch (err) {
        if (err.message !== "Unauthorized") {
            showToast("Could not update task.", 4000, "error");
        }
        const taskCard = document.getElementById(`task-card-${id}`);
        if (taskCard) {
            taskCard.style.pointerEvents = "auto";
            taskCard.style.opacity = "1";
        }
    }
}

async function deleteTask(id) {
    try {
        await apiFetch(`${CONFIG.ENDPOINTS.TASKS}/${id}`, {
            method: "DELETE"
        });
        showToast("Task deleted", 2000, "info");
        fetchTasks();
    } catch (err) {
        if (err.message !== "Unauthorized") {
            showToast("Could not delete task.", 4000, "error");
        }
    }
}

// Expose to window for inline HTML onclick handlers
window.toggleTaskCompletion = toggleTaskCompletion;
window.deleteTask = deleteTask;

/* ======================================================
   EVENT LISTENERS
====================================================== */

addBtn?.addEventListener("click", addTask);

if (taskInput) {
    taskInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addTask();
        }
    });
}

// Filter listeners
filterPriority?.addEventListener("change", fetchTasks);
filterTag?.addEventListener("change", fetchTasks);

/* ======================================================
   VIEW LOGIC (List vs Calendar)
====================================================== */

viewListBtn?.addEventListener("click", () => setView("list"));
viewCalendarBtn?.addEventListener("click", () => setView("calendar"));

function setView(view) {
    currentView = view;
    if (view === "list") {
        viewListBtn.classList.add("active");
        viewCalendarBtn.classList.remove("active");
        listViewContainer.classList.remove("hidden");
        calendarViewContainer.classList.add("hidden");
    } else {
        viewListBtn.classList.remove("active");
        viewCalendarBtn.classList.add("active");
        listViewContainer.classList.add("hidden");
        calendarViewContainer.classList.remove("hidden");
        
        if (!calendar) {
            initCalendar();
        } else {
            calendar.render();
        }
    }
}

function initCalendar() {
    const calendarEl = document.getElementById("calendar");
    if (!calendarEl || !window.FullCalendar) {
        console.warn("Calendar element or FullCalendar library not found");
        return;
    }
    
    calendar = new window.FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        events: getCalendarEvents()
    });
    calendar.render();
}

function getCalendarEvents() {
    return loadedTasks
        .filter(t => t.dueDate)
        .map(t => {
            return {
                id: t._id,
                title: t.title,
                start: t.dueDate,
                allDay: true,
                backgroundColor: t.completed ? "var(--success)" : "var(--primary)",
                borderColor: t.completed ? "var(--success)" : "var(--primary)",
                classNames: t.completed ? ['task-completed-event'] : []
            };
        });
}

function updateCalendar() {
    if (!calendar) return;
    
    // Remove all existing events
    calendar.getEvents().forEach(event => event.remove());
    
    // Add new events
    getCalendarEvents().forEach(eventData => {
        calendar.addEvent(eventData);
    });
}



