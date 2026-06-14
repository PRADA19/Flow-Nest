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

    // 3. Category Filter Buttons (with Product Tour Section Handling)
    const categoryButtons = document.querySelectorAll(".feature-card-btn");
    const tourSection = document.getElementById("tourSection");
    const faqSection = document.getElementById("faqSection");
    const searchSection = document.querySelector(".search-section");

    categoryButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const category = btn.dataset.category;

            // Toggle active card styling
            categoryButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            if (category === "product-tour") {
                tourSection?.classList.remove("hidden");
                faqSection?.classList.add("hidden");
                searchSection?.classList.add("hidden");
            } else {
                tourSection?.classList.add("hidden");
                faqSection?.classList.remove("hidden");
                searchSection?.classList.remove("hidden");
                filterFAQs(document.getElementById("helpSearchInput").value, category);
            }
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

    // 5. Action Modal Handlers & MongoDB API Request / LocalStorage Fallback Submissions
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

        // Bind submission handler with API request & local fallback
        m.form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const submitBtn = m.form.querySelector(".modal-submit-btn");
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting...";

            // Capture all form inputs dynamically
            const payload = {};
            const formData = new FormData(m.form);
            formData.forEach((value, key) => {
                // Strip input tag prefix (e.g. supportSubject -> subject)
                const cleanKey = key.replace(/^(support|bug|feature)/i, "");
                // Lowercase the first letter (e.g. Subject -> subject)
                const fieldName = cleanKey.charAt(0).toLowerCase() + cleanKey.slice(1);
                payload[fieldName] = value;
            });

            // Map modal key to backend support routes
            const endpointSuffix = key === "support" ? "contact" : key === "bug" ? "bug" : "feature";

            try {
                // Check if user is logged in
                const isLoggedIn = Boolean(typeof getToken === "function" && getToken());
                if (!isLoggedIn) {
                    throw new Error("You must be logged in to submit tickets to MongoDB.");
                }

                // Submit to backend REST API
                if (typeof apiFetch !== "function") {
                    throw new Error("apiFetch utility is not defined.");
                }

                const data = await apiFetch(`/support/${endpointSuffix}`, {
                    method: "POST",
                    body: JSON.stringify(payload)
                });

                showToast(`Submitted to MongoDB! Ref: ${data.referenceCode}`, 4000, "success");
                closeModal(m);
                m.form.reset();
            } catch (err) {
                console.warn(`Support API submission failed: ${err.message}. Falling back to localStorage.`);

                // Fallback local storage persistence
                const referenceCode = m.prefix + Math.floor(10000 + Math.random() * 90000);
                const entryData = {
                    id: referenceCode,
                    timestamp: new Date().toISOString(),
                    ...payload
                };

                try {
                    const existingRecords = JSON.parse(localStorage.getItem(m.storageKey) || "[]");
                    existingRecords.push(entryData);
                    localStorage.setItem(m.storageKey, JSON.stringify(existingRecords));

                    showToast(`Saved locally! Ref: ${referenceCode} (Offline Mode)`, 4000, "success");
                    closeModal(m);
                    m.form.reset();
                } catch (localErr) {
                    console.error("Local storage fallback failed:", localErr);
                    showToast("Failed to save submission. Please try again.", 5000, "error");
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
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
    function showToast(message, duration = 2500, type = "info") {
        if (typeof window.showToast === "function") {
            window.showToast(message, duration, type);
        } else {
            const toast = document.getElementById("toast");
            if (!toast) return;
            toast.textContent = message;
            
            // Reset styles
            toast.className = "toast";
            if (type === "success") toast.classList.add("success");
            if (type === "error") toast.classList.add("error");
            
            toast.classList.add("show");
            setTimeout(() => {
                toast.classList.remove("show");
            }, duration);
        }
    }
});
