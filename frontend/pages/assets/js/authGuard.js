// ==========================================
// CENTRALIZED FRONTEND AUTHENTICATION GUARDS
// ==========================================

const AuthGuard = (function() {
    function loadCachedProfile() {
        try {
            const raw = localStorage.getItem("smarttodo_user_cache");
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function isAuthenticated() {
        const token = localStorage.getItem("smarttodo_token");
        const cache = loadCachedProfile();
        return Boolean(token && cache);
    }

    function isAdmin() {
        const cache = loadCachedProfile();
        return cache?.role === "admin";
    }

    function isOwner() {
        const cache = loadCachedProfile();
        return cache?.role === "owner";
    }

    function hasAdminPrivileges() {
        const cache = loadCachedProfile();
        return cache?.role === "admin" || cache?.role === "owner";
    }

    /**
     * Enforces route protection based on client cache configuration.
     * Note: This is strictly for UX/UI rendering layout gating, backend still validates JWT.
     */
    function enforceRouteGuard(isHandshakeComplete = false) {
        const path = window.location.pathname.toLowerCase();
        
        // If not authenticated, redirect to landing login page
        if (!isAuthenticated()) {
            // Protected paths block
            const isProtectedRoute = path.includes("dashboard") || 
                                     path.includes("admin") || 
                                     path.includes("settings") || 
                                     path.includes("analytics") || 
                                     path.includes("assistant") || 
                                     path.includes("games");
            
            if (isProtectedRoute) {
                console.warn("[AUTH GUARD] Unauthorized access attempt, redirecting to login.");
                window.location.replace("/");
                return false;
            }
            return true;
        }

        // If authenticated, restrict admin paths strictly to admin/owner
        // Only run this role-based redirect check once the async /api/auth/me handshake has resolved and updated client cache
        if (isHandshakeComplete && path.includes("admin") && !hasAdminPrivileges()) {
            console.warn("[AUTH GUARD] Insufficient admin privileges, redirecting to user dashboard.");
            window.location.replace("/dashboard");
            return false;
        }

        return true;
    }

    return {
        isAuthenticated,
        isAdmin,
        isOwner,
        hasAdminPrivileges,
        enforceRouteGuard
    };
})();

// Expose globally
window.AuthGuard = AuthGuard;
