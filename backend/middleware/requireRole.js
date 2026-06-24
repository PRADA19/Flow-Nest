const User = require("../models/User");

const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: "Access denied. Please log in to proceed." });
      }

      // Query database directly to get fresh role and status
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(401).json({ error: "User profile not found." });
      }

      if (user.status === "suspended") {
        return res.status(403).json({ error: "Access denied. Your account is suspended." });
      }

      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: "Access denied. Insufficient administrative privileges." });
      }

      // Bind details to request
      req.user.role = user.role;
      req.user.status = user.status;
      req.user.name = user.name;

      next();
    } catch (err) {
      console.error("Authorization middleware error:", err);
      res.status(500).json({ error: "Internal authorization error." });
    }
  };
};

module.exports = requireRole;
