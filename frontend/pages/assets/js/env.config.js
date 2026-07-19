/**
 * Runtime overrides (optional).
 * For production: copy env.config.example.js → env.config.js and set API_BASE.
 * Leave empty to use auto-detection in config.js (localhost:5003 in dev, /api proxy in prod).
 */
window.__SMARTTODO_CONFIG__ = {
    // Select the appropriate API_BASE URL for your environment:

    // Option A: Production backend (default)
    API_BASE: "https://flow-nest-1.onrender.com/api"

    // Option B: Android Emulator (connecting to host machine localhost:5003)
    // API_BASE: "http://10.0.2.2:5003/api"

    // Option C: Physical Android Device (replace with your local PC network IP address)
    // API_BASE: "http://<LOCAL_PC_IP>:5003/api"
};
