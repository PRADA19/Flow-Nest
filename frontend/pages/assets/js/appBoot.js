// ==========================================
// SYSTEM BOOTSTRAP AND EXECUTION BLOCKER
// ==========================================

(function() {
    // Fast synchronous pre-pass check to reject anonymous users instantly
    if (typeof window.AuthGuard !== "undefined") {
        window.AuthGuard.enforceRouteGuard();
    }

    // Set up a global promise to freeze page-specific execution until authenticated
    window.appBootPromise = new Promise((resolve) => {
        document.addEventListener("DOMContentLoaded", async () => {
            const overlay = document.getElementById("authLoadingOverlay");
            const layout = document.querySelector(".app-layout");

            if (typeof window.verifySessionOnStartup !== "function") {
                console.error("[BOOT ERROR] verifySessionOnStartup function not found.");
                if (overlay) overlay.style.display = "none";
                if (layout) layout.style.setProperty("display", "flex", "important");
                resolve(false);
                return;
            }

            // Run the async backend handshake
            const isValidSession = await window.verifySessionOnStartup();

            if (!isValidSession) {
                // verifySessionOnStartup handles redirecting unauthorized requests, but we resolve false
                resolve(false);
                return;
            }

            // Secondary guard validation using fresh server role
            if (typeof window.AuthGuard !== "undefined") {
                const passesGuard = window.AuthGuard.enforceRouteGuard(true);
                if (!passesGuard) {
                    resolve(false);
                    return;
                }
            }

            // Handshake passed: hide loading screen and reveal main view
            if (overlay) overlay.style.display = "none";
            if (layout) layout.style.setProperty("display", "flex", "important");

            resolve(true);
        });
    });
})();
