const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const BlacklistedToken = require("../models/BlacklistedToken");

function extractToken(req) {
  let token =
    req.cookies?.smarttodo_token || req.signedCookies?.smarttodo_token;

  if (!token) {
    const authHeader = req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
    }
  }

  return token || null;
}

async function blacklistToken(token) {
  if (!token) return;

  try {
    // Decode token to extract userId and exp expiration timestamp
    const decoded = jwt.decode(token);
    
    let userId = null;
    let expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days default fallback

    if (decoded) {
      userId = decoded.id;
      if (decoded.exp) {
        expiresAt = new Date(decoded.exp * 1000);
      }
    }

    // Ensure we have a valid userId value (required by the model schema)
    // If not decoded (e.g. invalid signature), use a placeholder or handle gracefully
    if (!userId) {
      userId = new mongoose.Types.ObjectId(); // fallback placeholder
    }

    await BlacklistedToken.create({
      token,
      userId,
      expiresAt
    });
  } catch (err) {
    if (err.code !== 11000) { // Suppress duplicate key errors to ensure idempotency
      console.error("Failed to blacklist token:", err.message);
    }
  }
}

async function isTokenBlacklisted(token) {
  if (!token) return false;
  try {
    const found = await BlacklistedToken.findOne({ token });
    return Boolean(found);
  } catch (err) {
    console.error("Failed to check token blacklist status:", err.message);
    return false;
  }
}

module.exports = {
  extractToken,
  blacklistToken,
  isTokenBlacklisted,
};
