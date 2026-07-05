const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { isTokenBlacklisted } = require("./tokenBlacklist");

const User = require("../models/User");
const UserSession = require("../models/UserSession");

const authenticateUser = async (req, res, next) => {
  try {
    // 1. Extract token from cookie (signed or unsigned) or Authorization header fallback
    let token = req.cookies?.smarttodo_token || req.signedCookies?.smarttodo_token;
    
    if (!token) {
      const authHeader = req.header("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.replace("Bearer ", "");
      }
    }

    if (!token) {
      return res.status(401).json({ error: "Access denied. Please log in to proceed." });
    }

    if (await isTokenBlacklisted(token)) {
      return res.status(401).json({ error: "Your session has expired. Please log in again." });
    }

    // 2. Enforce strict JWT secret key requirements
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      // Audit log critical failure on server configuration
      console.error("⛔ [SECURITY VIOLATION] Server is running without JWT_SECRET environment configuration!");
      return res.status(500).json({ error: "Server authentication engine misconfigured." });
    }

    // 3. Verify JWT
    const decoded = jwt.verify(token, secret);
    
    // 4. Validate DB-based state (session status and account status) if MongoDB is connected
    if (mongoose.connection.readyState === 1) {
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      
      const [user, session] = await Promise.all([
        User.findById(decoded.id),
        UserSession.findOne({ tokenHash, status: "active" })
      ]);

      if (!user) {
        return res.status(401).json({ error: "Account no longer exists." });
      }

      // Validate JWT token version against DB to support instant global revocation (JWT Versioning)
      if (decoded.version !== undefined && decoded.version !== user.tokenVersion) {
        return res.status(401).json({ error: "Your session has expired due to privilege changes. Please log in again." });
      }

      if (user.status === "suspended") {
        return res.status(403).json({ error: "Access denied. Your account has been suspended." });
      }

      if (!session) {
        return res.status(401).json({ error: "Session expired or terminated. Please log in again." });
      }

      // Asynchronously update last active timestamp (limit updates to once per minute to reduce DB writes)
      if (Date.now() - new Date(session.lastActive).getTime() > 60000) {
        session.lastActive = new Date();
        session.save().catch(err => console.warn("Failed to update session activity time:", err.message));
      }
      
      req.user = {
        id: user._id.toString(),
        email: user.email,
        role: user.role || "user",
        tokenVersion: user.tokenVersion || 1,
        status: user.status || "active"
      };
    } else {
      // Offline fallback
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: "user",
        tokenVersion: decoded.version || 1,
        status: "active"
      };
    }
    
    next();
  } catch (err) {
    // Sanitized output blocking token details leak
    res.status(401).json({ error: "Your session has expired. Please log in again." });
  }
};

module.exports = authenticateUser;
