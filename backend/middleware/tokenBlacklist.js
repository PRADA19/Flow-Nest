const blacklistedTokens = new Set();

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

function blacklistToken(token) {
  if (token) {
    blacklistedTokens.add(token);
  }
}

function isTokenBlacklisted(token) {
  return Boolean(token && blacklistedTokens.has(token));
}

module.exports = {
  extractToken,
  blacklistToken,
  isTokenBlacklisted,
};
