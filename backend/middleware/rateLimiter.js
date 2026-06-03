const rateLimit = require("express-rate-limit");

// 1. Strict limit for authentication endpoints (auth abuse prevention)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 login/register requests per windowMs
  message: { error: "Too many authentication attempts. Please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// 2. Focused limit for conversational AI endpoints (AI query abuse prevention)
const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Limit each IP to 20 chat queries per minute
  message: { error: "AI chat quota exceeded. Please wait a minute before sending more queries." },
  standardHeaders: true,
  legacyHeaders: false,
});

// 3. General global API rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 API operations per 15 minutes
  message: { error: "API rate limit exceeded. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  aiLimiter,
  apiLimiter
};
