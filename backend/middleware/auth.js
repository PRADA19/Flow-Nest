const jwt = require("jsonwebtoken");
const { isTokenBlacklisted } = require("./tokenBlacklist");

const authenticateUser = (req, res, next) => {
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

    if (isTokenBlacklisted(token)) {
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
    
    // 4. Bind decoded scope to requests
    req.user = {
      id: decoded.id,
      email: decoded.email
    };
    
    next();
  } catch (err) {
    // Sanitized output blocking token details leak
    res.status(401).json({ error: "Your session has expired. Please log in again." });
  }
};

module.exports = authenticateUser;
