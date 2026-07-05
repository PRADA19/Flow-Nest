# FlowNest Authentication and Authorization Architecture

This document defines the production-grade authentication flow, role-based access control, session invalidation strategy, and startup bootstrapping guidelines for FlowNest.

---

## ⚠️ SECURITY BOUNDARY RULE
> [!IMPORTANT]
> **The frontend (JavaScript UI layer) is NEVER trusted for security decisions or authorization checks.**
> * All client-side guards, route redirection checks, and local storage variables (such as `role` or `tokenVersion` caches) are strictly for **User Experience (UX) layout toggle purposes only**.
> * The **Express Backend API** is the **ONLY security boundary**. Every protected API transaction validates the request's JSON Web Token (JWT) directly against the MongoDB database of record on every single request.
> * There are no exceptions to this rule. Any client-side adjustment or manipulation of local state variables will not bypass backend endpoint validations.

---

## 1. Role Hierarchy & Access Rules

FlowNest implements three distinct user roles:

1. **User (`user`)**: The default role. Can manage their own tasks, view dashboard, and update their profile.
2. **Admin (`admin`)**: Intermediate administrative access. Can view dashboard metrics, user summaries, and moderate basic ticket queues. Must be explicitly approved by the Owner.
3. **Owner (`owner`)**: The root administrative supervisor. The first registered user automatically bootstraps as the `owner`. Has absolute control, including the ability to toggle admin request status, suspend/activate user accounts, force invalidating sessions, and execute database tasks.

---

## 2. Session Invalidation Strategy (JWT Versioning)

FlowNest relies on **JWT Versioning** to support instantaneous, global session invalidation without maintaining database blacklist states or using memory caches like Redis:

* Every user document in MongoDB stores a `tokenVersion` field (defaulting to `1`).
* When a user logs in, their current `tokenVersion` is signed into the JWT payload as the `version` claim.
* During any administrative action (suspension, role changes, manually revoking device sessions), the `tokenVersion` is incremented by 1 in MongoDB.
* The backend authentication middleware checks if `decoded.version === user.tokenVersion` on every request. If they do not match, the token is treated as stale, and the request is rejected with `401 Unauthorized`.

---

## 3. Core Flow Diagrams

### A. Login Flow

```
[Client App] ──(POST /api/auth/login)──> [Backend Server]
                                               │
                                      [Verify password hash]
                                               │
                                      [Sign JWT with version claim]
                                               │
               ┌───────────────────────────────┴──────────────────────────────┐
               ▼ (Browser Web Client)                                         ▼ (Mobile Native Client)
      [Set HttpOnly Cookie]                                          [Return JWT in JSON body]
               │                                                              │
               ▼                                                              ▼
    [Save profile to cache]                                        [Save JWT to SecureStore]
```

### B. Startup Handshake Flow (`appBoot.js`)

To prevent any UI flickering or premature script execution, the frontend uses a **Gatekeeper Boot Pattern**:
1. Page elements are styled as hidden (`display: none !important`) and a full-screen verification spinner (`#authLoadingOverlay`) renders.
2. An async handshake runs immediately, query fetching `GET /api/auth/me`.
3. If successful, the verified backend role is written to local cache, the loader is hidden, and `.app-layout` displays.
4. If it fails (e.g. `401` due to a demotion or session revocation), the client cache is cleared, and the page is redirected to `/` or `/dashboard` without ever displaying the layout contents.

---

## 4. Backend Access Control (Unified Middleware)

All protected controllers use the unified `authenticateUser` middleware which extracts tokens from **either** signed cookies or the `Authorization` header:

```javascript
// backend/middleware/auth.js
let token = req.cookies?.smarttodo_token || req.signedCookies?.smarttodo_token;

if (!token) {
  const authHeader = req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "");
  }
}
```

On success, it binds a **normalized user object** to the request:
```javascript
req.user = {
  id: user._id.toString(),
  email: user.email,
  role: user.role,
  tokenVersion: user.tokenVersion,
  status: user.status
};
```
This is fully compatible with both web (cookie-based) and mobile (bearer header-based) clients.
