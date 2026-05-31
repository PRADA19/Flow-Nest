/**
 * Production example — copy to env.config.js and set your API URL.
 *
 * Option A — separate API host:
 *   API_BASE: "https://api.yourdomain.com"
 *
 * Option B — same origin reverse proxy (Nginx /api → backend):
 *   API_BASE: "https://yourdomain.com/api"
 *
 * Option C — local dev (default, no file needed):
 *   auto-detects http://localhost:5003
 */
window.__SMARTTODO_CONFIG__ = {
    API_BASE: "https://api.yourdomain.com",
};
