// FlowNest Help Center Logic
document.addEventListener("DOMContentLoaded", () => {
    // 1. Theme Management and Sidebar Init
    const cachedProfile = localStorage.getItem("smarttodo_user_cache");
    if (cachedProfile) {
        try {
            const profile = JSON.parse(cachedProfile);
            if (profile.name) {
                const sidebarName = document.getElementById("sidebarUserName");
                if (sidebarName) sidebarName.textContent = profile.name;
            }
        } catch (e) {
            console.error("Failed to parse cached profile", e);
        }
    }

    // Call fetchAndRenderSidebar if defined in utils.js to load live XP/Level details
    if (typeof fetchAndRenderSidebar === "function") {
        fetchAndRenderSidebar();
    }

    // 2. FAQ Accordion Toggles
    const faqItems = document.querySelectorAll(".faq-item");
    faqItems.forEach(item => {
        const trigger = item.querySelector(".faq-trigger");
        trigger.addEventListener("click", () => {
            const isOpen = item.classList.contains("open");
            
            // Close other open items
            faqItems.forEach(i => {
                if (i !== item) {
                    i.classList.remove("open");
                    i.querySelector(".faq-trigger").setAttribute("aria-expanded", "false");
                    i.querySelector(".faq-content").setAttribute("aria-hidden", "true");
                }
            });

            // Toggle current item
            if (isOpen) {
                item.classList.remove("open");
                trigger.setAttribute("aria-expanded", "false");
                item.querySelector(".faq-content").setAttribute("aria-hidden", "true");
            } else {
                item.classList.add("open");
                trigger.setAttribute("aria-expanded", "true");
                item.querySelector(".faq-content").setAttribute("aria-hidden", "false");
            }
        });
    });

    // 3. Category Filter Buttons
    const categoryButtons = document.querySelectorAll(".feature-card-btn");
    categoryButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const category = btn.dataset.category;

            // Toggle active card styling
            categoryButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            // Filter FAQs
            filterFAQs(document.getElementById("helpSearchInput").value, category);
        });
    });

    // 4. Real-time Search Engine
    const searchInput = document.getElementById("helpSearchInput");
    searchInput.addEventListener("input", (e) => {
        const activeBtn = document.querySelector(".feature-card-btn.active");
        const category = activeBtn ? activeBtn.dataset.category : "all";
        filterFAQs(e.target.value, category);
    });

    function filterFAQs(query, category) {
        const cleanQuery = query.toLowerCase().trim();
        const items = document.querySelectorAll(".faq-item");

        items.forEach(item => {
            const itemCategory = item.dataset.category;
            const questionText = item.querySelector(".faq-trigger span").textContent.toLowerCase();
            const answerText = item.querySelector(".faq-content p").textContent.toLowerCase();

            const matchesCategory = (category === "all" || itemCategory === category);
            const matchesSearch = (!cleanQuery || questionText.includes(cleanQuery) || answerText.includes(cleanQuery));

            if (matchesCategory && matchesSearch) {
                item.style.display = "block";
            } else {
                item.style.display = "none";
                item.classList.remove("open");
                item.querySelector(".faq-trigger").setAttribute("aria-expanded", "false");
                item.querySelector(".faq-content").setAttribute("aria-hidden", "true");
            }
        });
    }

    // 5. Action Modal Handlers & Persistent Storage Submissions
    const modals = {
        support: {
            overlay: document.getElementById("supportModal"),
            openBtn: document.getElementById("openSupportBtn"),
            form: document.getElementById("supportForm"),
            prefix: "TKT-",
            storageKey: "flow_nest_support_tickets"
        },
        bug: {
            overlay: document.getElementById("bugModal"),
            openBtn: document.getElementById("openBugBtn"),
            form: document.getElementById("bugForm"),
            prefix: "BUG-",
            storageKey: "flow_nest_bug_reports"
        },
        feature: {
            overlay: document.getElementById("featureModal"),
            openBtn: document.getElementById("openFeatureBtn"),
            form: document.getElementById("featureForm"),
            prefix: "FTR-",
            storageKey: "flow_nest_feature_requests"
        }
    };

    // Bind open events
    Object.keys(modals).forEach(key => {
        const m = modals[key];
        m.openBtn.addEventListener("click", () => {
            m.overlay.classList.remove("hidden");
            m.overlay.setAttribute("aria-hidden", "false");
            m.overlay.querySelector("input, textarea, select")?.focus();
        });

        // Bind close events on overlay click or X click
        m.overlay.addEventListener("click", (e) => {
            if (e.target === m.overlay || e.target.closest(".close-modal-btn")) {
                closeModal(m);
            }
        });

        // Bind submission handler with LocalStorage persistence
        m.form.addEventListener("submit", (e) => {
            e.preventDefault();

            // Generate deterministic/unique reference code
            const referenceCode = m.prefix + Math.floor(10000 + Math.random() * 90000);
            const entryData = {
                id: referenceCode,
                timestamp: new Date().toISOString()
            };

            // Capture all form inputs dynamically
            const formData = new FormData(m.form);
            formData.forEach((value, key) => {
                // Strip input tag name and save
                const fieldName = key.replace(/^(support|bug|feature)/i, "").toLowerCase();
                entryData[fieldName] = value;
            });

            // Save to LocalStorage
            try {
                const existingRecords = JSON.parse(localStorage.getItem(m.storageKey) || "[]");
                existingRecords.push(entryData);
                localStorage.setItem(m.storageKey, JSON.stringify(existingRecords));

                showToast(`Request submitted successfully! Reference: ${referenceCode}`);
                closeModal(m);
                m.form.reset();
            } catch (err) {
                console.error("Failed to save support request to localStorage", err);
                showToast("An error occurred while saving your request. Please try again.");
            }
        });
    });

    function closeModal(m) {
        m.overlay.classList.add("hidden");
        m.overlay.setAttribute("aria-hidden", "true");
        m.openBtn.focus();
    }

    // Escape Key Modal Dismissal
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            Object.keys(modals).forEach(key => {
                const m = modals[key];
                if (!m.overlay.classList.contains("hidden")) {
                    closeModal(m);
                }
            });
        }
    });

    // Toast Notification Manager
    function showToast(message) {
        const toast = document.getElementById("toast");
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add("show");
        setTimeout(() => {
            toast.classList.remove("show");
        }, 5000);
    }
});
