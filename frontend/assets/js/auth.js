// ==========================================
// AUTHENTICATION LOGIC
// ==========================================

let authMode = "login";

function updateAuthModeUI() {
    const authTitle = document.getElementById("authTitle");
    const authSwitchText = document.getElementById("authSwitchText");
    const authSwitchLink = document.getElementById("authSwitchLink");
    const authSubmitBtn = document.getElementById("authSubmitBtn");
    const authName = document.getElementById("authName");

    if (!authTitle) return;

    if (authMode === "login") {
        authTitle.textContent = "Welcome Back";
        authSwitchText.textContent = "Don't have an account?";
        authSwitchLink.textContent = "Register here";
        authSubmitBtn.textContent = "Login";
        authName.classList.add("hidden");
        authName.removeAttribute("required");
    } else {
        authTitle.textContent = "Create Account";
        authSwitchText.textContent = "Already have an account?";
        authSwitchLink.textContent = "Login here";
        authSubmitBtn.textContent = "Register";
        authName.classList.remove("hidden");
        authName.setAttribute("required", "");
    }
}

function setAuthSubmitting(isSubmitting) {
    const authSubmitBtn = document.getElementById("authSubmitBtn");
    if (!authSubmitBtn) return;
    authSubmitBtn.disabled = isSubmitting;
    authSubmitBtn.style.opacity = isSubmitting ? "0.7" : "1";
}

// Universal Auth State UI handler
function setAppState(loggedIn) {
    const authModal = document.getElementById("authModal");
    const authBanner = document.getElementById("authBanner");
    const logoutBtn = document.getElementById("logoutBtn");

    if (loggedIn) {
        authModal?.classList.add("hidden");
        authBanner?.classList.add("hidden");
        logoutBtn?.classList.remove("hidden");
    } else {
        authModal?.classList.remove("hidden");
        logoutBtn?.classList.add("hidden");
        if (authBanner) {
            authBanner.classList.remove("hidden");
            authModal?.classList.add("hidden"); // Allow user to click banner to open modal
        }
    }

    // Call page-specific callback if defined
    if (typeof window.onAuthStateChanged === "function") {
        window.onAuthStateChanged(loggedIn);
    }

    if (loggedIn && typeof window.initNotifications === "function") {
        window.initNotifications();
    }
}

// Prevent global conflict, override in utils
window.setAppState = setAppState;

function initAuth() {
    const authForm = document.getElementById("authForm");
    const authSwitchLink = document.getElementById("authSwitchLink");
    const logoutBtn = document.getElementById("logoutBtn");
    const openAuthBtn = document.getElementById("openAuthBtn");
    
    updateAuthModeUI();

    openAuthBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("authModal")?.classList.remove("hidden");
        document.getElementById("authBanner")?.classList.add("hidden");
    });

    authSwitchLink?.addEventListener("click", (e) => {
        e.preventDefault();
        authMode = authMode === "login" ? "register" : "login";
        updateAuthModeUI();
    });

    authForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const email = document.getElementById("authEmail").value.trim();
        const password = document.getElementById("authPassword").value.trim();
        const name = document.getElementById("authName")?.value.trim();

        if (!email || !password || (authMode === "register" && !name)) {
            showToast("Please fill in all required fields.");
            return;
        }

        const endpoint = authMode === "login" ? CONFIG.ENDPOINTS.LOGIN : CONFIG.ENDPOINTS.REGISTER;
        const payload = { email, password };
        if (authMode === "register") payload.name = name;

        setAuthSubmitting(true);
        
        try {
            // Un-authenticated request wrapper bypass for login/register
            const response = await fetch(apiUrl(endpoint), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload)
            });
            
            const data = await parseJsonResponse(response);
            
            if (!response.ok) {
                const validationMsg = Array.isArray(data.errors)
                    ? data.errors.join(" ")
                    : null;
                throw new Error(
                    data.error || data.message || validationMsg || "Auth failed"
                );
            }

            if (authMode === "login") {
                if (!data.token) throw new Error("No token received");
                setToken(data.token);

                if (data.user) {
                    saveUserProfile({
                        name: data.user.name,
                        email: data.user.email,
                    });
                }
                
                // Clear forms
                document.getElementById("authEmail").value = "";
                document.getElementById("authPassword").value = "";
                if (document.getElementById("authName")) {
                    document.getElementById("authName").value = "";
                }
                
                showToast("Logged in successfully.", 2500, "success");
                setAppState(true);
            } else {
                showToast("Registration successful. Please login.", 2500, "success");
                authMode = "login";
                updateAuthModeUI();
            }
        } catch (err) {
            let message = err.message || "Authentication failed.";
            if (message === "Failed to fetch") {
                message = "Cannot reach the server. Make sure the backend is running.";
            }
            showToast(message, 5000, "error");
        } finally {
            setAuthSubmitting(false);
        }
    });

    logoutBtn?.addEventListener("click", async () => {
        await clearSession();
        setAppState(false);
    });

    // Initial check
    const isLoggedIn = Boolean(getToken());
    setAppState(isLoggedIn);
}

document.addEventListener("DOMContentLoaded", initAuth);
