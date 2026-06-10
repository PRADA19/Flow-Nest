# Flow Nest (SmartTodo) - Project Mastery Document

**Project Type:** Full-Stack Web Application  
**Tech Stack:** Node.js, Express, MongoDB, Vanilla JavaScript, HTML, CSS  
**Purpose:** Interview Preparation & Resume Discussion  
**Last Updated:** June 3, 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Folder-by-Folder Explanation](#4-folder-by-folder-explanation)
5. [Frontend Deep Dive](#5-frontend-deep-dive)
6. [Backend Deep Dive](#6-backend-deep-dive)
7. [Database Deep Dive](#7-database-deep-dive)
8. [Authentication & Security](#8-authentication--security)
9. [API Documentation](#9-api-documentation)
10. [AI Features](#10-ai-features)
11. [Deployment Architecture](#11-deployment-architecture)
12. [Design Decisions](#12-design-decisions)
13. [Challenges & Solutions](#13-challenges--solutions)
14. [Interview Preparation](#14-interview-preparation)
15. [Resume Explanation](#15-resume-explanation)
16. [Strengths & Weaknesses](#16-strengths--weaknesses)
17. [Learning Outcomes](#17-learning-outcomes)

---

## 1. Executive Summary

### What the Project Does

Flow Nest (SmartTodo) is a modern, AI-powered task management application that helps users organize their daily tasks, track productivity, and achieve their goals through gamification. Users can create tasks with priorities, due dates, and tags, view them in list or calendar format, and get intelligent assistance from an AI-powered chatbot.

### Main Features

- **Task Management**: Create, complete, delete tasks with priorities (high/medium/low), due dates, and tags (Work/Study/Personal)
- **Calendar View**: Visualize tasks on a monthly calendar using FullCalendar library
- **Dashboard**: Overview of statistics, recent tasks, and quick actions
- **Analytics**: Detailed productivity insights with Chart.js visualizations (completion rate, trends, categories, peak hours)
- **AI Assistant**: Chat-based AI that can create tasks, complete tasks, suggest priorities, plan daily schedules, and analyze productivity
- **Gamification**: XP system, levels, streaks, and badges to motivate users
- **Dark Mode**: Toggle between light and dark themes
- **Due Date Reminders**: Browser notifications 1 hour before task due dates
- **Responsive Design**: Works on desktop and mobile devices

### Target Users

- Students managing coursework and study schedules
- Professionals organizing work tasks and deadlines
- Anyone seeking to improve productivity through task management
- Users who enjoy gamified productivity systems

### Business Value

- **Productivity Enhancement**: Helps users stay organized and focused on priorities
- **Habit Formation**: Gamification encourages consistent task completion
- **AI-Powered Efficiency**: Reduces time spent on planning and prioritization
- **Data-Driven Insights**: Analytics help users understand their productivity patterns
- **Accessibility**: Free and accessible web-based application

---

## 2. System Architecture

### Frontend Architecture

**Architecture Pattern:** Multi-Page Application (MPA) with Vanilla JavaScript

The frontend uses a traditional multi-page architecture where each major feature has its own HTML page:
- `index.html` - Main tasks page (list and calendar views)
- `dashboard.html` - Overview dashboard
- `analytics.html` - Productivity analytics
- `assistant.html` - AI chat interface
- `settings.html` - User settings

**Key Components:**
- **Shared Sidebar Navigation**: Consistent navigation across all pages
- **Modular JavaScript**: Each page has its own JS file (script.js, dashboard.js, analytics.js, assistant.js, settings.js)
- **Shared Utilities**: Common functions in utils.js (API calls, token management, theme handling)
- **Configuration**: Centralized API endpoints and storage keys in config.js
- **Authentication**: Shared auth.js handles login/register/logout across all pages

**Data Flow:**
1. User interacts with UI (clicks, form submissions)
2. JavaScript event handlers trigger API calls via `apiFetch()`
3. API responses update DOM elements
4. Local storage caches data for offline support (tasks, user profile, analytics)

### Backend Architecture

**Architecture Pattern:** Monolithic Express.js REST API

The backend is a single Express.js server that handles all API requests:

```
Client Request → Middleware Stack → Route Handler → Business Logic → Database → Response
```

**Middleware Stack (in order):**
1. Helmet - Security headers (CSP, HSTS, etc.)
2. Compression - Gzip response compression
3. mongoSanitize - MongoDB injection prevention
4. Morgan - HTTP request logging
5. CORS - Cross-origin resource sharing
6. express.json - JSON body parsing (10kb limit)
7. cookieParser - Cookie parsing with secret signing
8. Rate Limiters - Auth limiter, AI limiter, API limiter
9. Authentication Middleware - JWT verification
10. Validation Middleware - Request body validation
11. ObjectId Validation - MongoDB ObjectId validation

**Route Organization:**
- `/api/auth/*` - Authentication endpoints (login, register, logout)
- `/api/tasks` - Task CRUD operations
- `/api/tasks/ai/chat` - AI assistant endpoint
- `/api/dashboard` - Dashboard statistics
- `/api/analytics` - Analytics data
- `/api/notifications` - Push notification subscriptions
- `/health` and `/api/health` - Health check endpoints

**Business Logic Layer:**
- Gamification logic (XP calculation, level progression, badge unlocking)
- AI action execution (create task, complete task, schedule tasks)
- Task filtering and sorting
- User profile updates

### Database Architecture

**Primary Database:** MongoDB (Mongoose ODM)

**Collections:**
1. `users` - User accounts with gamification data
2. `tasks` - Task records linked to users

**Failover System:** SQLite-based offline mode
- When MongoDB is unavailable, the system falls back to JSON file storage
- Tenant isolation: Each user's data stored in separate JSON files
- Security event logging to audit log file
- Automatic reconnection attempts to MongoDB

### Authentication Architecture

**Authentication Method:** JWT (JSON Web Tokens) with HTTP-only Cookies

**Flow:**
1. User submits credentials to `/api/auth/login` or `/api/auth/register`
2. Backend verifies credentials (bcrypt password comparison)
3. Backend generates JWT with user ID and email (7-day expiration)
4. JWT stored in HTTP-only, signed cookie (`smarttodo_token`)
5. Subsequent requests include cookie automatically by browser
6. Authentication middleware verifies JWT and attaches user info to request

**Token Management:**
- Token blacklist (in-memory Set) for logout functionality
- Token extracted from cookie or Authorization header
- Strict JWT secret validation (server fails to start if missing)
- Sanitized error messages (no token details leaked)

### AI Architecture

**AI Provider:** Google Gemini gemini-2.0-flash

**Integration Pattern:** Structured JSON Response

**Flow:**
1. User sends message to `/api/tasks/ai/chat`
2. Backend fetches user's pending tasks
3. Backend constructs system prompt with:
   - User profile (name, level, XP, streak)
   - Task context (all pending tasks with IDs)
   - Allowed actions (create_task, complete_task, list_tasks, daily_plan, schedule_tasks)
   - Response format specification (JSON only)
4. Gemini returns structured JSON with action type and data
5. Backend parses and executes the action (database operations)
6. Backend returns AI reply and action result to frontend
7. Frontend displays formatted response with markdown parsing

**AI Actions Supported:**
- `none` - Conversation only
- `create_task` - Create single task
- `create_multiple_tasks` - Create multiple tasks
- `complete_task` - Mark task as complete
- `list_tasks` - Show pending tasks
- `daily_plan` - Organize tasks into time blocks
- `schedule_tasks` - Suggest time slots for tasks

### Complete Request Flow: User Action to Database Response

**Example: User adds a new task**

1. **Frontend:**
   - User types task title in input field
   - User selects priority and due date
   - User clicks "Add" button
   - `addTask()` function in script.js is called

2. **API Call:**
   - `addTask()` calls `apiFetch(CONFIG.ENDPOINTS.TASKS, { method: 'POST', body: {... }})`
   - `apiFetch()` in utils.js adds Authorization header with JWT token
   - Request sent to `http://localhost:5003/api/tasks` (or `/api/tasks` in production)

3. **Backend Middleware:**
   - Helmet checks security headers
   - Compression middleware
   - mongoSanitize prevents NoSQL injection
   - Morgan logs the request
   - CORS validates origin
   - express.json parses body (10kb limit)
   - cookieParser parses cookie
   - apiLimiter checks rate limit (100 requests/15min)
   - authMiddleware verifies JWT token from cookie
   - validateBody("taskPost") validates request body against schema

4. **Route Handler:**
   - POST `/tasks` handler in server.js receives request
   - Extracts userId from req.user.id
   - Calls `createTask()` from failover or Task model

5. **Database Operation:**
   - If MongoDB available: `Task.create({ title, priority, dueDate, tags, userId })`
   - If MongoDB unavailable: SQLite failover creates task in JSON file
   - Database returns created task with generated _id

6. **Gamification:**
   - Not applicable for task creation (only on completion)

7. **Response:**
   - Route handler returns created task as JSON
   - Response goes back through middleware stack
   - Frontend receives JSON response

8. **Frontend Update:**
   - `addTask()` receives response
   - Calls `fetchTasks()` to refresh task list
   - `renderTasks()` updates DOM with new task
   - Toast notification shows "Task added successfully"

---

## 3. Technology Stack

### Frontend Technologies

#### HTML5
**What it is:** Standard markup language for creating web pages  
**Why chosen:** Semantic structure, accessibility support, native form validation  
**Problem it solves:** Provides document structure and content organization  
**Alternatives:** JSX (React), Vue templates, Angular templates

#### CSS3
**What it is:** Style sheet language for describing presentation  
**Why chosen:** Native browser support, no build step required  
**Problem it solves:** Styling, layout, responsive design, animations  
**Alternatives:** Sass/SCSS, Tailwind CSS, CSS-in-JS

#### Vanilla JavaScript (ES6+)
**What it is:** Native JavaScript without frameworks  
**Why chosen:** No build complexity, direct DOM manipulation, lightweight  
**Problem it solves:** Interactivity, API communication, state management  
**Alternatives:** React, Vue.js, Angular, Svelte

#### FullCalendar v6.1.15
**What it is:** JavaScript calendar library  
**Why chosen:** Full-featured calendar with drag-and-drop, responsive design  
**Problem it solves:** Calendar view for tasks with due dates  
**Alternatives:** Calendar.js, BigCalendar, custom implementation

#### Chart.js
**What it is:** JavaScript charting library  
**Why chosen:** Simple API, responsive charts, good documentation  
**Problem it solves:** Analytics visualizations (trends, categories, status)  
**Alternatives:** D3.js, ApexCharts, Recharts

#### Phosphor Icons
**What it is:** Icon library  
**Why chosen:** Clean, modern icons, easy integration  
**Problem it solves:** Consistent iconography across UI  
**Alternatives:** Font Awesome, Heroicons, Material Icons

#### Google Fonts (Inter)
**What it is:** Web font service  
**Why chosen:** Professional, readable font family  
**Problem it solves:** Typography and brand identity  
**Alternatives:** System fonts, self-hosted fonts

### Backend Technologies

#### Node.js
**What it is:** JavaScript runtime for server-side code  
**Why chosen:** Same language as frontend, npm ecosystem, async/await  
**Problem it solves:** Server-side JavaScript execution  
**Alternatives:** Python (Django/Flask), Ruby (Rails), PHP (Laravel)

#### Express.js
**What it is:** Web application framework for Node.js  
**Why chosen:** Minimal, flexible, large middleware ecosystem  
**Problem it solves:** HTTP server, routing, middleware pipeline  
**Alternatives:** Koa.js, Hapi.js, Fastify, NestJS

#### MongoDB
**What it is:** NoSQL document database  
**Why chosen:** Flexible schema, JSON-like documents, scalability  
**Problem it solves:** Data persistence, complex queries, relationships  
**Alternatives:** PostgreSQL, MySQL, SQLite, Firebase

#### Mongoose
**What it is:** ODM (Object Document Mapper) for MongoDB  
**Why chosen:** Schema validation, middleware, query building  
**Problem it solves:** Type safety, validation, relationship management  
**Alternatives:** MongoDB native driver, Typegoose, Prisma

#### JWT (jsonwebtoken)
**What it is:** Library for creating and verifying JSON Web Tokens  
**Why chosen:** Stateless authentication, industry standard  
**Problem it solves:** Secure authentication without server-side sessions  
**Alternatives:** Session-based auth, OAuth 2.0, Passport.js

#### bcryptjs
**What it is:** Password hashing library  
**Why chosen:** One-way hashing, salt rounds, security-focused  
**Problem it solves:** Secure password storage  
**Alternatives:** Argon2, scrypt, PBKDF2

#### Cookie-parser
**What it is:** Cookie parsing middleware  
**Why chosen:** Signed cookie support, easy integration  
**Problem it solves:** Cookie-based authentication  
**Alternatives:** Manual cookie parsing, JWT in localStorage

#### CORS
**What it is:** Cross-Origin Resource Sharing middleware  
**Why chosen:** Easy CORS configuration  
**Problem it solves:** Cross-origin requests from frontend  
**Alternatives:** Manual CORS headers, proxy server

#### Helmet
**What it is:** Security header middleware  
**Why chosen:** Comprehensive security headers, CSP support  
**Problem it solves:** Security vulnerabilities (XSS, clickjacking, etc.)  
**Alternatives:** Manual header configuration

#### Morgan
**What it is:** HTTP request logger  
**Why chosen:** Development debugging, request tracking  
**Problem it solves:** Request/response logging  
**Alternatives:** Winston, Bunyan, custom logging

#### Express-rate-limit
**What it is:** Rate limiting middleware  
**Why chosen:** Prevents API abuse, easy configuration  
**Problem it solves:** DDoS protection, brute force prevention  
**Alternatives:** Redis-based rate limiting, custom implementation

#### Express-mongo-sanitize
**What it is:** MongoDB injection prevention  
**Why chosen:** NoSQL injection protection  
**Problem it solves:** MongoDB operator injection attacks  
**Alternatives:** Manual input sanitization

#### Compression
**What it is:** Response compression middleware  
**Why chosen:** Reduces bandwidth, faster load times  
**Problem it solves:** Large payload sizes  
**Alternatives:** Nginx compression, Cloudflare compression

#### Google Generative AI (Node.js SDK)
**What it is:** Google Gemini API client library
**Why chosen:** Official SDK, TypeScript support
**Problem it solves:** AI-powered features
**Alternatives:** Direct API calls, other AI providers (Anthropic, Claude)

#### PM2
**What it is:** Process manager for Node.js  
**Why chosen:** Production process management, auto-restart  
**Problem it solves:** Keep server running, monitoring  
**Alternatives:** Docker, systemd, forever

#### Dotenv
**What it is:** Environment variable loader  
**Why chosen:** Separate config from code, security  
**Problem it solves:** Environment-specific configuration  
**Alternatives:** config package, manual process.env

### Deployment Technologies

#### Render
**What it is:** Cloud platform for deploying web services  
**Why chosen:** Free tier, easy deployment, managed databases  
**Problem it solves:** Backend hosting and MongoDB hosting  
**Alternatives:** Heroku, Railway, AWS, DigitalOcean

#### Vercel
**What it is:** Cloud platform for frontend deployment  
**Why chosen:** Free tier, automatic HTTPS, CDN  
**Problem it solves:** Frontend hosting and static asset delivery  
**Alternatives:** Netlify, GitHub Pages, AWS S3 + CloudFront

---

## 4. Folder-by-Folder Explanation

### Root Directory (`d:\Smarttodo\`)

**Purpose:** Project root containing configuration and documentation

**Key Files:**
- `README.md` - Project overview and setup instructions
- `render.yaml` - Render deployment configuration
- `.gitignore` - Git ignore rules (node_modules, .env files)
- `package.json` - Root package.json (minimal dependencies)

**Responsibilities:**
- Project-level configuration
- Deployment settings
- Documentation

---

### `frontend/` Directory

**Purpose:** Frontend application code (HTML, CSS, JavaScript)

**Structure:**
```
frontend/
├── pages/              # HTML pages
│   ├── index.html      # Main tasks page
│   ├── dashboard.html  # Dashboard overview
│   ├── analytics.html  # Analytics page
│   ├── assistant.html  # AI chat interface
│   └── settings.html   # Settings page
├── assets/
│   ├── css/            # Stylesheets
│   │   ├── style.css   # Main styles
│   │   ├── dashboard.css
│   │   ├── analytics.css
│   │   ├── assistant.css
│   │   └── settings.css
│   └── js/             # JavaScript modules
│       ├── config.js       # API configuration
│       ├── env.config.js   # Runtime config override
│       ├── utils.js        # Shared utilities
│       ├── auth.js         # Authentication logic
│       ├── notifications.js # Due date reminders
│       ├── script.js       # Tasks page logic
│       ├── dashboard.js    # Dashboard logic
│       ├── analytics.js    # Analytics logic
│       ├── assistant.js    # AI chat logic
│       └── settings.js     # Settings logic
├── sw.js               # Service worker for push notifications
├── .env.example        # Environment variables example
└── vercel.json.example # Vercel deployment example
```

**Responsibilities:**
- User interface rendering
- Client-side logic and interactivity
- API communication
- State management (localStorage)
- Theme management
- Notification handling

**Interactions:**
- All pages share `utils.js`, `config.js`, `auth.js`
- Each page has its own JS file for page-specific logic
- Service worker (`sw.js`) handles push notifications
- Environment config (`env.config.js`) overrides API base URL

---

### `backend/` Directory

**Purpose:** Backend API server and business logic

**Structure:**
```
backend/
├── server.js           # Main Express server
├── models/             # Mongoose schemas
│   ├── Task.js         # Task model
│   └── User.js         # User model
├── middleware/         # Custom middleware
│   ├── auth.js         # JWT authentication
│   ├── validator.js    # Request validation
│   ├── rateLimiter.js  # Rate limiting
│   ├── tokenBlacklist.js # Token blacklist
│   └── validateObjectId.js # ObjectId validation
├── services/           # Business logic services
│   └── openaiService.js # Gemini integration
├── database/           # Database operations
│   └── sqliteFailover.js # SQLite failover logic
├── scripts/            # Utility scripts
│   └── start-guard.js  # Port conflict prevention
├── data/               # SQLite failover data (runtime)
├── .env.example        # Environment variables example
├── package.json        # Backend dependencies
├── ecosystem.config.cjs # PM2 configuration
└── README.md           # Backend documentation
```

**Responsibilities:**
- API endpoint implementation
- Business logic execution
- Database operations
- Authentication and authorization
- AI integration
- Security enforcement

**Interactions:**
- `server.js` imports and uses all other modules
- Middleware files are applied to routes in `server.js`
- Models used by route handlers for database operations
- Services used by AI endpoint for Gemini integration
- Database failover used when MongoDB unavailable

---

### `frontend/pages/` Directory

**Purpose:** HTML page templates

**Files:**
- `index.html` - Tasks page with list/calendar views
- `dashboard.html` - Dashboard with stats and quick actions
- `analytics.html` - Analytics with Chart.js visualizations
- `assistant.html` - AI chat interface
- `settings.html` - User settings page

**Responsibilities:**
- Page structure and layout
- DOM element definitions
- Script imports
- CSS imports

**Interactions:**
- Each page imports shared CSS (`style.css`)
- Each page imports page-specific CSS
- Each page imports shared JS files (config, utils, auth)
- Each page imports page-specific JS file
- All pages share sidebar navigation structure

---

### `frontend/assets/css/` Directory

**Purpose:** Stylesheets for UI styling

**Files:**
- `style.css` - Main styles (variables, layout, components)
- `dashboard.css` - Dashboard-specific styles
- `analytics.css` - Analytics-specific styles
- `assistant.css` - AI chat-specific styles
- `settings.css` - Settings-specific styles

**Responsibilities:**
- Visual design
- Responsive layout
- Dark mode theming
- Animations
- Component styling

**Interactions:**
- `style.css` defines CSS variables and base styles
- Page-specific CSS files extend base styles
- All CSS files use shared CSS variables for theming

---

### `frontend/assets/js/` Directory

**Purpose:** JavaScript modules for frontend logic

**Files:**
- `config.js` - API endpoint configuration and storage keys
- `env.config.js` - Runtime API base URL override
- `utils.js` - Shared utilities (API calls, token management, theme)
- `auth.js` - Authentication logic (login, register, logout)
- `notifications.js` - Due date reminder notifications
- `script.js` - Tasks page logic
- `dashboard.js` - Dashboard logic
- `analytics.js` - Analytics logic
- `assistant.js` - AI chat logic
- `settings.js` - Settings logic

**Responsibilities:**
- API communication
- State management
- DOM manipulation
- Event handling
- Authentication
- Theme management

**Interactions:**
- `config.js` provides configuration to all other JS files
- `utils.js` provides shared functions (apiFetch, getToken, showToast)
- `auth.js` manages authentication state and calls utils functions
- Page-specific JS files use utils and config
- `notifications.js` uses config and utils for API calls

---

### `backend/models/` Directory

**Purpose:** Mongoose schema definitions

**Files:**
- `Task.js` - Task schema with indexes
- `User.js` - User schema with gamification fields

**Responsibilities:**
- Data structure definition
- Validation rules
- Indexes for performance
- Relationships (userId reference to User)

**Interactions:**
- Imported by `server.js` for database operations
- Used by route handlers for CRUD operations
- Used by failover system for schema reference

---

### `backend/middleware/` Directory

**Purpose:** Express middleware for security and validation

**Files:**
- `auth.js` - JWT authentication middleware
- `validator.js` - Request body validation
- `rateLimiter.js` - Rate limiting (auth, AI, API)
- `tokenBlacklist.js` - Token blacklist management
- `validateObjectId.js` - MongoDB ObjectId validation

**Responsibilities:**
- Security enforcement
- Input validation
- Rate limiting
- Authentication
- Request sanitization

**Interactions:**
- All middleware imported by `server.js`
- Applied to specific routes or globally
- `auth.js` uses `tokenBlacklist.js`
- `validator.js` used on POST/PUT endpoints

---

### `backend/services/` Directory

**Purpose:** Business logic services

**Files:**
- `openaiService.js` - Gemini API integration

**Responsibilities:**
- External API integration
- AI response generation
- Error handling for external services

**Interactions:**
- Imported by `server.js` AI chat endpoint
- Used to generate AI responses

---

### `backend/database/` Directory

**Purpose:** Database operations and failover logic

**Files:**
- `sqliteFailover.js` - SQLite failover implementation

**Responsibilities:**
- MongoDB connection management
- SQLite failover operations
- User and task CRUD in failover mode
- Security event logging

**Interactions:**
- Imported by `server.js` for database operations
- Used when MongoDB is unavailable
- Provides same interface as Mongoose for compatibility

---

### `backend/scripts/` Directory

**Purpose:** Utility scripts

**Files:**
- `start-guard.js` - Port conflict prevention

**Responsibilities:**
- Prevent duplicate backend instances
- Provide helpful error messages
- Spawn server process

**Interactions:**
- Used by `npm start` script
- Checks port availability before starting server

---

## 5. Frontend Deep Dive

### Routing

**Routing Method:** Traditional multi-page routing with URL parameters

**Pages:**
- `/pages/index.html` - Tasks page (default)
- `/pages/index.html?view=calendar` - Calendar view
- `/pages/dashboard.html` - Dashboard
- `/pages/analytics.html` - Analytics
- `/pages/assistant.html` - AI Assistant
- `/pages/settings.html` - Settings

**URL Parameters:**
- `?view=calendar` - Switches to calendar view on tasks page
- `?priority=high&tag=Work` - Filters tasks by priority and tag

**Navigation:**
- Sidebar links use direct href to HTML files
- JavaScript handles view switching (list vs calendar)
- No client-side routing library (no React Router, etc.)

**File Location:** `frontend/pages/` directory

---

### State Management

**State Management Method:** LocalStorage + In-memory variables

**State Storage:**
- `localStorage` - Persistent state across sessions
- In-memory variables - Page-specific state

**LocalStorage Keys (defined in config.js):**
```javascript
STORAGE_KEYS: {
    TOKEN: "smarttodo_token",
    THEME: "smarttodo_theme",
    CHAT_HISTORY: "smarttodo_chat_history",
    USER_CACHE: "smarttodo_user_cache",
    ANALYTICS_CACHE: "smarttodo_analytics_cache",
    TASKS_CACHE: "smarttodo_tasks_cache",
    COMPACT_MODE: "smarttodo_compact_mode",
    AI_SUGGESTIONS: "smarttodo_ai_suggestions",
    DUE_REMINDERS: "smarttodo_due_reminders"
}
```

**State Examples:**
- Authentication token (JWT)
- User profile (name, email, XP, level)
- Theme preference (light/dark)
- Chat history (AI conversations)
- Tasks cache (for offline reminders)
- Analytics cache (performance optimization)
- Settings (compact mode, AI suggestions, due reminders)

**State Management Functions (in utils.js):**
- `getToken()` - Retrieve authentication token
- `setToken(token)` - Store authentication token
- `clearToken()` - Clear all stored data
- `loadUserProfile()` - Load user from cache
- `saveUserProfile(profile)` - Save user to cache
- `getSavedTheme()` - Get theme preference
- `applyTheme(theme)` - Apply theme to DOM

**File Location:** `frontend/assets/js/utils.js`, `frontend/assets/js/config.js`

---

### Components

**Component Architecture:** HTML templates with JavaScript rendering

**Shared Components:**
1. **Sidebar Navigation** - Present on all pages
   - Logo and branding
   - Navigation links (Dashboard, Tasks, Calendar, Analytics, AI, Settings)
   - User card with avatar, name, level, XP bar
   - Close button (mobile)

2. **Header** - Present on all pages
   - App icon and title
   - Action buttons (menu, notifications, logout, theme toggle)
   - Notification dropdown

3. **Auth Modal** - Present on all pages
   - Login/Register form
   - Email and password fields
   - Name field (register only)
   - Switch between login/register

4. **Toast Notification** - Present on all pages
   - Success/error/info messages
   - Auto-dismiss after duration

**Page-Specific Components:**

**Tasks Page (index.html):**
- Task input box with priority, due date, tag selectors
- View toggle (List/Calendar)
- Filter bar (priority, tag)
- Task list (individual task cards)
- Calendar view (FullCalendar)

**Dashboard Page (dashboard.html):**
- Stats grid (total tasks, completed, pending, completion rate)
- Quick actions card (Add Task, View Tasks, View Calendar)
- Recent tasks list
- Smart insights card

**Analytics Page (analytics.html):**
- Analytics grid (completion rate, today, this week, productive time)
- Charts grid (weekly trend, categories, status, peak hours)

**Assistant Page (assistant.html):**
- Chat viewport with messages
- Welcome card
- Typing indicator
- Chat input field
- Quick actions panel (pre-defined prompts)

**Settings Page (settings.html):**
- Account settings card (username, email, logout)
- Appearance card (dark mode, compact mode)
- Notifications card (due date reminders)
- AI settings card (AI suggestions, clear history)
- Data & Privacy card (export tasks, clear cache)

**File Location:** `frontend/pages/*.html`, `frontend/assets/css/*.css`

---

### API Communication

**API Client:** Custom `apiFetch()` function in utils.js

**API Base URL Resolution (config.js):**
```javascript
function resolveApiBase() {
    // Priority 1: Environment variable (NEXT_PUBLIC_API_URL)
    // Priority 2: HTML meta tag
    // Priority 3: Runtime override (window.__SMARTTODO_CONFIG__.API_BASE)
    // Priority 4: Auto-detect (localhost:5003/api or /api)
}
```

**API Endpoints (config.js):**
```javascript
ENDPOINTS: {
    TASKS: "/tasks",
    LOGIN: "/auth/login",
    REGISTER: "/auth/register",
    LOGOUT: "/auth/logout",
    DASHBOARD: "/dashboard",
    ANALYTICS: "/analytics",
    HEALTH: "/api/health"
}
```

**API Request Function (utils.js):**
```javascript
async function apiFetch(endpoint, options = {}) {
    // Adds Authorization header with JWT token
    // Adds Content-Type header
    // Handles retry logic (3 attempts with exponential backoff)
    // Handles 401 Unauthorized (clears session)
    // Returns parsed JSON or throws error
}
```

**API Call Examples:**

**Fetch Tasks:**
```javascript
const tasks = await apiFetch(CONFIG.ENDPOINTS.TASKS);
```

**Add Task:**
```javascript
await apiFetch(CONFIG.ENDPOINTS.TASKS, {
    method: "POST",
    body: JSON.stringify({ title, priority, dueDate, tags })
});
```

**Complete Task:**
```javascript
await apiFetch(`${CONFIG.ENDPOINTS.TASKS}/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ completed: true })
});
```

**Delete Task:**
```javascript
await apiFetch(`${CONFIG.ENDPOINTS.TASKS}/${taskId}`, {
    method: "DELETE"
});
```

**AI Chat:**
```javascript
await apiFetch("/tasks/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message })
});
```

**Error Handling:**
- Network errors: "Failed to reach the server"
- 401 Unauthorized: Clears session, shows login
- 400/500 errors: Displays error message from response
- Retry logic: 3 attempts with exponential backoff

**File Location:** `frontend/assets/js/utils.js`, `frontend/assets/js/config.js`

---

### Authentication Flow

**Authentication Files:** `frontend/assets/js/auth.js`, `frontend/assets/js/utils.js`

**Registration Flow:**
1. User clicks "Register here" in auth modal
2. Form switches to register mode (name field shown)
3. User enters name, email, password
4. Form submission triggers `authForm` submit handler
5. `authMode === "register"` so endpoint is `/auth/register`
6. `fetch()` sends POST request to backend
7. Backend validates and creates user
8. Success message: "Registration successful. Please login."
9. Form switches back to login mode
10. User logs in with credentials

**Login Flow:**
1. User enters email and password
2. Form submission triggers `authForm` submit handler
3. `authMode === "login"` so endpoint is `/auth/login`
4. `fetch()` sends POST request with credentials
5. Backend verifies credentials (bcrypt compare)
6. Backend generates JWT token
7. Backend sets HTTP-only cookie with token
8. Backend returns token and user data
9. Frontend stores token in localStorage (fallback)
10. Frontend stores user profile in localStorage
11. `setAppState(true)` called
12. Auth modal hidden, logout button shown
13. Page-specific `onAuthStateChanged` callback triggered
14. Tasks loaded, sidebar updated

**Logout Flow:**
1. User clicks logout button
2. `clearSession()` called in utils.js
3. POST request to `/auth/logout` (blacklists token on server)
4. `clearToken()` removes all localStorage data
5. `setAppState(false)` called
6. Auth modal shown, logout button hidden
7. Page-specific `onAuthStateChanged` callback triggered
8. Tasks cleared, sidebar reset to "Guest"

**Token Storage:**
- Primary: HTTP-only, signed cookie (`smarttodo_token`)
- Fallback: localStorage (`smarttodo_token`)
- Authorization header: Bearer token (for API calls)

**Session Expiration:**
- JWT expires after 7 days
- Token blacklisted on logout
- 401 responses clear session and show login

**File Location:** `frontend/assets/js/auth.js`, `frontend/assets/js/utils.js`

---

### Error Handling

**Error Handling Strategy:** Try-catch blocks with user-friendly messages

**Error Types:**

**Network Errors:**
```javascript
if (message === "Failed to fetch") {
    message = "Cannot reach the server. Make sure the backend is running.";
}
```

**Validation Errors:**
```javascript
const validationMsg = Array.isArray(data.errors)
    ? data.errors.join(" ")
    : null;
throw new Error(data.error || data.message || validationMsg || "Auth failed");
```

**Unauthorized Errors:**
```javascript
if (err.message !== "Unauthorized") {
    renderEmptyState("Failed to load tasks.");
    showToast(err.message, 4000, "error");
}
```

**API Errors:**
```javascript
try {
    const tasks = await apiFetch(url);
    // Process tasks
} catch (err) {
    showToast(err.message, 4000, "error");
}
```

**Error Display:**
- Toast notifications (success/error/info)
- Empty state messages in task containers
- Console errors for debugging

**File Location:** `frontend/assets/js/utils.js`, `frontend/assets/js/script.js`

---

### Performance Considerations

**Performance Optimizations:**

1. **Client-Side Caching:**
   - Tasks cached in localStorage for offline reminders
   - User profile cached to avoid repeated API calls
   - Analytics cached to reduce server load

2. **Lazy Loading:**
   - Chart.js loaded only on analytics page
   - FullCalendar loaded only on tasks page
   - Phosphor Icons loaded from CDN

3. **Debouncing:**
   - Calendar resize debounced (300ms delay)
   - Analytics chart resize debounced (150ms delay)

4. **Conditional Rendering:**
   - Skeleton loaders while data loads
   - Empty states when no data
   - Error states when API fails

5. **Compression:**
   - Backend uses compression middleware
   - Reduces payload sizes

6. **Rate Limiting:**
   - Prevents API abuse
   - Reduces server load

**Performance Monitoring:**
- No explicit performance monitoring implemented
- Could add: Web Vitals, Lighthouse CI

**File Location:** `frontend/assets/js/script.js`, `frontend/assets/js/analytics.js`

---

## 6. Backend Deep Dive

### Server Startup Flow

**File:** `backend/server.js`

**Startup Sequence:**

1. **Import Dependencies:**
   ```javascript
   const express = require("express");
   const mongoose = require("mongoose");
   // ... other imports
   ```

2. **Load Environment Variables:**
   ```javascript
   require("dotenv").config();
   ```

3. **Initialize Gemini:**
   ```javascript
   if (process.env.GEMINI_API_KEY) {
     genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
   }
   ```

4. **Validate Required Environment Variables:**
   ```javascript
   const requiredEnv = ["JWT_SECRET", "COOKIE_SECRET"];
   for (const key of requiredEnv) {
     if (!process.env[key]) {
       console.error(`🚨 Missing ${key}`);
       process.exit(1);
     }
   }
   ```

5. **Load Models:**
   ```javascript
   const Task = require("./models/Task");
   const User = require("./models/User");
   const failover = require("./database/sqliteFailover");
   ```

6. **Create Express App:**
   ```javascript
   const app = express();
   app.set("trust proxy", 1);
   ```

7. **Apply Security Middleware:**
   ```javascript
   app.use(helmet({ contentSecurityPolicy: { ... } }));
   app.use(compression());
   app.use(mongoSanitize());
   app.use(morgan("combined"));
   ```

8. **Configure CORS:**
   ```javascript
   app.use(cors({
     origin: (origin, callback) => { /* validation logic */ },
     credentials: true
   }));
   ```

9. **Configure Body Parser:**
   ```javascript
   app.use(express.json({ limit: "10kb" }));
   app.use(cookieParser(process.env.COOKIE_SECRET));
   ```

10. **Setup API Router:**
    ```javascript
    const apiRouter = express.Router();
    app.use("/api", apiRouter);
    ```

11. **Load Middleware:**
    ```javascript
    const { authLimiter, aiLimiter, apiLimiter } = require("./middleware/rateLimiter");
    const { validateBody } = require("./middleware/validator");
    const authMiddleware = require("./middleware/auth");
    // ... other middleware
    ```

12. **Apply Rate Limiting:**
    ```javascript
    app.use("/api/tasks", apiLimiter);
    app.use("/api/dashboard", apiLimiter);
    app.use("/api/analytics", apiLimiter);
    app.use("/api/notifications", apiLimiter);
    ```

13. **Connect to MongoDB:**
    ```javascript
    await connectDB();
    ```

14. **Define Routes:**
    - Authentication routes (register, login, logout)
    - Task routes (GET, POST, PUT, DELETE)
    - Dashboard route
    - Analytics route
    - AI chat route
    - Notification routes
    - Health check routes

15. **Global Error Handler:**
    ```javascript
    app.use((err, req, res, next) => {
      console.error(err);
      failover.logSecurityEvent("unhandled_error", { ... });
      res.status(500).json({ error: "Internal server error" });
    });
    ```

16. **Start Server:**
    ```javascript
    const PORT = process.env.PORT || 5003;
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 SmartTodo Backend running on port ${PORT}`);
    });
    ```

17. **Graceful Shutdown:**
    ```javascript
    const shutdown = async (signal) => {
      console.log(`\n🛑 ${signal} received — shutting down...`);
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
      process.exit(0);
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    ```

**File Location:** `backend/server.js`

---

### Middleware

**Middleware Files:** `backend/middleware/`

#### Authentication Middleware (`auth.js`)

**Purpose:** Verify JWT tokens and attach user info to requests

**Flow:**
1. Extract token from cookie or Authorization header
2. Check if token is blacklisted
3. Verify JWT with JWT_SECRET
4. Attach user ID and email to req.user
5. Call next() or return 401

**Usage:**
```javascript
app.get("/tasks", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  // ...
});
```

**File Location:** `backend/middleware/auth.js`

---

#### Validation Middleware (`validator.js`)

**Purpose:** Validate and sanitize request bodies

**Schemas:**
- `authRegister` - name (2-50 chars), email, password (6-100 chars)
- `authLogin` - email, password
- `taskPost` - title (3-100 chars), dueDate, priority (enum), tags (array)
- `taskPut` - optional fields, same validation
- `aiChat` - message (1-2000 chars)

**Features:**
- Mass assignment protection (strips undeclared fields)
- Type validation (string, email, date, enum, array, boolean)
- Length validation (min/max)
- Required field validation
- Trimming strings
- Sanitizing arrays

**Usage:**
```javascript
app.post("/auth/register", authLimiter, validateBody("authRegister"), async (req, res) => {
  // req.body is now validated and sanitized
});
```

**File Location:** `backend/middleware/validator.js`

---

#### Rate Limiting Middleware (`rateLimiter.js`)

**Purpose:** Prevent API abuse and DDoS attacks

**Limiters:**
- `authLimiter` - 15 requests per 15 minutes (auth endpoints)
- `aiLimiter` - 20 requests per minute (AI chat)
- `apiLimiter` - 100 requests per 15 minutes (general API)

**Usage:**
```javascript
app.post("/auth/login", authLimiter, ...);
app.post("/tasks/ai/chat", authMiddleware, aiLimiter, ...);
app.use("/api/tasks", apiLimiter);
```

**File Location:** `backend/middleware/rateLimiter.js`

---

#### Token Blacklist Middleware (`tokenBlacklist.js`)

**Purpose:** Manage blacklisted tokens for logout

**Functions:**
- `extractToken(req)` - Extract token from request
- `blacklistToken(token)` - Add token to blacklist
- `isTokenBlacklisted(token)` - Check if token is blacklisted

**Storage:** In-memory Set (not persistent across restarts)

**Usage:**
```javascript
app.post("/auth/logout", (req, res) => {
  blacklistToken(extractToken(req));
  res.clearCookie("smarttodo_token");
  res.json({ message: "Logged out successfully" });
});
```

**File Location:** `backend/middleware/tokenBlacklist.js`

---

#### ObjectId Validation Middleware (`validateObjectId.js`)

**Purpose:** Validate MongoDB ObjectId parameters

**Usage:**
```javascript
app.get("/tasks/:id", validateObjectId("id"), async (req, res) => {
  // req.params.id is guaranteed to be valid ObjectId
});
```

**File Location:** `backend/middleware/validateObjectId.js`

---

### Routes

**Route Organization:** All routes defined in `backend/server.js`

**Authentication Routes:**
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user

**Task Routes:**
- `GET /api/tasks` - Get user's tasks (with optional filters)
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

**Dashboard Routes:**
- `GET /api/dashboard` - Get dashboard statistics

**Analytics Routes:**
- `GET /api/analytics` - Get analytics data

**AI Routes:**
- `POST /api/tasks/ai/chat` - AI chat endpoint

**Notification Routes:**
- `POST /api/notifications/subscribe` - Subscribe to push notifications
- `GET /api/notifications/vapid-public-key` - Get VAPID public key

**Health Check Routes:**
- `GET /health` - Health check (without /api prefix)
- `GET /api/health` - Health check (with /api prefix)

**File Location:** `backend/server.js`

---

### Controllers

**Controller Pattern:** Route handlers directly in `server.js` (no separate controller files)

**Route Handler Structure:**
```javascript
app.get("/tasks", authMiddleware, async (req, res) => {
  try {
    // Business logic
    const tasks = await findTasks({ userId: req.user.id });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});
```

**Functions Used in Route Handlers:**
- `findUserByEmail()` - Find user by email
- `createUser()` - Create new user
- `findUserById()` - Find user by ID
- `findTasks()` - Find tasks with filters
- `createTask()` - Create new task
- `findTaskByIdAndUser()` - Find task by ID and user
- `updateTask()` - Update task
- `deleteTaskById()` - Delete task
- `calculateGamification()` - Calculate XP, level, badges

**File Location:** `backend/server.js`

---

### Services

**Service Files:** `backend/services/`

#### Gemini Service (`openaiService.js`)

**Purpose:** Wrapper for Gemini API

**Function:**
```javascript
async function generateAIResponse(systemPrompt, userMessage) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent([
    { text: systemPrompt },
    { text: userMessage }
  ]);
  return result.response.text();
}
```

**Error Handling:**
- Catches Gemini errors
- Returns fallback message: "Sorry, AI is currently unavailable."

**File Location:** `backend/services/openaiService.js`

---

### Models

**Model Files:** `backend/models/`

#### Task Model (`Task.js`)

**Schema:**
```javascript
{
  title: String (required),
  completed: Boolean (default: false),
  dueDate: Date,
  priority: String (enum: "high", "medium", "low", default: "medium"),
  tags: [String],
  userId: ObjectId (ref: "User", required),
  completedAt: Date
}
```

**Indexes:**
- `userId` - For user-specific queries
- `userId + completed` - For filtering by user and completion status
- `dueDate` - For date-based queries
- `completed` - For completion status queries

**Timestamps:** Automatic `createdAt` and `updatedAt`

**File Location:** `backend/models/Task.js`

---

#### User Model (`User.js`)

**Schema:**
```javascript
{
  name: String (required),
  email: String (required, unique),
  password: String (required),
  xp: Number (default: 0),
  level: Number (default: 1),
  streak: Number (default: 0),
  lastCompletedDate: Date,
  completedTasksCount: Number (default: 0),
  unlockedBadges: [String]
}
```

**Indexes:**
- `email` - Unique index for email lookups

**Timestamps:** Automatic `createdAt` and `updatedAt`

**File Location:** `backend/models/User.js`

---

### Validation

**Validation File:** `backend/middleware/validator.js`

**Validation Layers:**
1. **Schema Validation** - Type checking, required fields, length limits
2. **Email Validation** - Regex pattern matching
3. **Date Validation** - ISO date format checking
4. **Enum Validation** - Allowed values for enums
5. **Array Validation** - Array type checking
6. **Boolean Validation** - Boolean type checking

**Mass Assignment Protection:**
- Strips any fields not declared in schema
- Prevents overwriting sensitive fields

**Error Messages:**
- Descriptive error messages for each validation failure
- Returns array of errors for multiple failures

**File Location:** `backend/middleware/validator.js`

---

### Error Handling

**Error Handling Strategy:** Global error handler + try-catch blocks

**Global Error Handler:**
```javascript
app.use((err, req, res, next) => {
  console.error(err);
  failover.logSecurityEvent("unhandled_error", {
    message: err.message,
    stack: err.stack
  });
  res.status(500).json({ error: "Internal server error" });
});
```

**Route-Level Error Handling:**
```javascript
app.get("/tasks", authMiddleware, async (req, res) => {
  try {
    // Business logic
  } catch (err) {
    console.error("Task fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});
```

**Unhandled Rejection Handler:**
```javascript
process.on("unhandledRejection", (reason, promise) => {
  console.error("🚨 Unhandled Promise Rejection at:", promise, "reason:", reason);
  failover.logSecurityEvent("unhandled_rejection", {
    message: String(reason?.message || reason)
  });
});
```

**Uncaught Exception Handler:**
```javascript
process.on("uncaughtException", (err) => {
  console.error("🚨 Uncaught Exception:", err.message);
  failover.logSecurityEvent("uncaught_exception", {
    message: err.message
  });
  if (process.env.NODE_ENV !== "production") {
    process.exit(1);
  }
});
```

**File Location:** `backend/server.js`

---

## 7. Database Deep Dive

### Collections/Tables

**Database:** MongoDB (with SQLite failover)

**Collections:**

#### Users Collection
**Document Structure:**
```javascript
{
  _id: ObjectId,
  name: String,
  email: String (unique),
  password: String (hashed),
  xp: Number (default: 0),
  level: Number (default: 1),
  streak: Number (default: 0),
  lastCompletedDate: Date,
  completedTasksCount: Number (default: 0),
  unlockedBadges: [String],
  createdAt: Date,
  updatedAt: Date
}
```

#### Tasks Collection
**Document Structure:**
```javascript
{
  _id: ObjectId,
  title: String,
  completed: Boolean (default: false),
  dueDate: Date,
  priority: String (enum: "high", "medium", "low"),
  tags: [String],
  userId: ObjectId (ref: User),
  completedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**File Location:** `backend/models/Task.js`, `backend/models/User.js`

---

### Schema Design

#### Task Schema Design

**Fields:**
- `title` - Required string, task description
- `completed` - Boolean, tracks completion status
- `dueDate` - Optional date, when task is due
- `priority` - Enum (high/medium/low), task importance
- `tags` - Array of strings, categorization
- `userId` - Required ObjectId, references User
- `completedAt` - Optional date, when task was completed

**Relationships:**
- Many-to-One: Many tasks belong to one user
- Foreign key: `userId` references `User._id`

**Indexes:**
- `userId` - Fast user-specific queries
- `userId + completed` - Optimized filtering
- `dueDate` - Date-based queries
- `completed` - Completion status queries

**File Location:** `backend/models/Task.js`

---

#### User Schema Design

**Fields:**
- `name` - Required string, user's display name
- `email` - Required unique string, user's email
- `password` - Required string, hashed password
- `xp` - Number, experience points
- `level` - Number, user level based on XP
- `streak` - Number, consecutive days of task completion
- `lastCompletedDate` - Date, last day user completed a task
- `completedTasksCount` - Number, total tasks completed
- `unlockedBadges` - Array of strings, earned badges

**Gamification Logic:**
- XP earned per task completion (10-20 XP based on priority)
- Level up at every 100 XP
- Streak increases for consecutive days
- Badges unlocked based on achievements

**Indexes:**
- `email` - Unique index for fast lookups

**File Location:** `backend/models/User.js`

---

### Relationships

**Relationship Type:** One-to-Many (User → Tasks)

**Implementation:**
- Task has `userId` field referencing User
- User does not have explicit tasks array (queried on demand)
- Mongoose `ref: "User"` enables population

**Query Example:**
```javascript
// Get all tasks for a user
const tasks = await Task.find({ userId: user._id });

// Populate user in task
const task = await Task.findById(taskId).populate('userId');
```

**Cascading Deletes:**
- Not implemented (tasks remain if user deleted)
- Could add middleware to delete tasks on user deletion

**File Location:** `backend/models/Task.js`

---

### Indexes

**Task Indexes:**
```javascript
taskSchema.index({ userId: 1 });
taskSchema.index({ userId: 1, completed: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ completed: 1 });
```

**User Indexes:**
```javascript
userSchema.index({ email: 1 });
```

**Index Purposes:**
- `userId` - Optimize user-specific task queries
- `userId + completed` - Optimize filtering by user and status
- `dueDate` - Optimize date-based queries (calendar view)
- `completed` - Optimize completion status queries
- `email` - Optimize email lookups (authentication)

**Index Performance:**
- Single-field indexes for common queries
- Compound index for combined filters
- Unique index on email prevents duplicates

**File Location:** `backend/models/Task.js`, `backend/models/User.js`

---

### Query Flow

**Example: Fetch User's Tasks**

**Frontend Request:**
```javascript
const tasks = await apiFetch(CONFIG.ENDPOINTS.TASKS);
```

**Backend Route Handler:**
```javascript
app.get("/tasks", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const filter = { userId };
  
  if (req.query.priority) {
    filter.priority = req.query.priority;
  }
  
  if (req.query.tag) {
    filter.tags = req.query.tag;
  }
  
  const tasks = await findTasks(filter);
  res.json(tasks);
});
```

**Database Query (MongoDB):**
```javascript
Task.find({ userId: ObjectId("..."), priority: "high" })
  .sort({ completed: 1, createdAt: -1 })
  .exec();
```

**Index Usage:**
- Uses `userId` index for user filtering
- Uses `userId + completed` compound index if completed filter added
- Sorts by completion status and creation date

**Failover Query (SQLite):**
```javascript
const tasks = readTenantTasks(userId);
const results = tasks.filter(t => t.priority === filter.priority);
results.sort((a, b) => {
  if (a.completed !== b.completed) {
    return a.completed ? 1 : -1;
  }
  return new Date(b.createdAt) - new Date(a.createdAt);
});
```

**Response Flow:**
1. Database returns documents
2. Route handler returns JSON
3. Middleware processes response
4. Frontend receives JSON
5. Frontend renders tasks

**File Location:** `backend/server.js`, `backend/database/sqliteFailover.js`

---

## 8. Authentication & Security

### Login Flow

**Files:** `frontend/assets/js/auth.js`, `backend/server.js`

**Step-by-Step:**

1. **User enters credentials:**
   - Email: `user@example.com`
   - Password: `password123`

2. **Frontend validation:**
   - Check if email and password are filled
   - Show error if missing

3. **Frontend sends request:**
   ```javascript
   fetch(apiUrl(CONFIG.ENDPOINTS.LOGIN), {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     credentials: "include",
     body: JSON.stringify({ email, password })
   });
   ```

4. **Backend receives request:**
   - Route: `POST /api/auth/login`
   - Middleware: authLimiter (rate limiting)
   - Middleware: validateBody("authLogin")
   - Body validated: email (valid email), password (string)

5. **Backend finds user:**
   ```javascript
   const user = await findUserByEmail(email);
   ```

6. **Backend verifies password:**
   ```javascript
   const isMatch = await bcrypt.compare(password, user.password);
   ```

7. **Backend generates JWT:**
   ```javascript
   const token = jwt.sign(
     { id: user._id, email: user.email },
     process.env.JWT_SECRET,
     { expiresIn: "7d" }
   );
   ```

8. **Backend sets cookie:**
   ```javascript
   res.cookie("smarttodo_token", token, {
     httpOnly: true,
     secure: true,
     sameSite: "none",
     signed: true,
     path: "/",
     maxAge: 7 * 24 * 60 * 60 * 1000
   });
   ```

9. **Backend returns response:**
   ```javascript
   res.json({
     token,
     user: { name: user.name, email: user.email, xp: user.xp, level: user.level }
   });
   ```

10. **Frontend stores token:**
    ```javascript
    setToken(data.token);
    saveUserProfile({ name: data.user.name, email: data.user.email });
    ```

11. **Frontend updates UI:**
    - Hide auth modal
    - Show logout button
    - Load tasks
    - Update sidebar

**File Location:** `frontend/assets/js/auth.js`, `backend/server.js`

---

### Registration Flow

**Files:** `frontend/assets/js/auth.js`, `backend/server.js`

**Step-by-Step:**

1. **User enters registration details:**
   - Name: `John Doe`
   - Email: `john@example.com`
   - Password: `password123`

2. **Frontend validation:**
   - Check if name, email, password are filled
   - Show error if missing

3. **Frontend sends request:**
   ```javascript
   fetch(apiUrl(CONFIG.ENDPOINTS.REGISTER), {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     credentials: "include",
     body: JSON.stringify({ name, email, password })
   });
   ```

4. **Backend receives request:**
   - Route: `POST /api/auth/register`
   - Middleware: authLimiter (rate limiting)
   - Middleware: validateBody("authRegister")
   - Body validated: name (2-50 chars), email (valid), password (6-100 chars)

5. **Backend checks for existing user:**
   ```javascript
   const existingUser = await findUserByEmail(email);
   if (existingUser) {
     return res.status(400).json({ error: "Email already registered" });
   }
   ```

6. **Backend hashes password:**
   ```javascript
   const hashedPassword = await bcrypt.hash(password, 10);
   ```

7. **Backend creates user:**
   ```javascript
   await createUser({
     name,
     email: email.toLowerCase(),
     password: hashedPassword
   });
   ```

8. **Backend returns response:**
   ```javascript
   res.status(201).json({
     message: "Registration successful. Please login."
   });
   ```

9. **Frontend shows success:**
   - Display toast: "Registration successful. Please login."
   - Switch to login mode
   - Clear form fields

10. **User logs in:**
    - User enters credentials
    - Login flow executes (see above)

**File Location:** `frontend/assets/js/auth.js`, `backend/server.js`

---

### JWT Lifecycle

**JWT Structure:**
```javascript
{
  header: { alg: "HS256", typ: "JWT" },
  payload: { id: "user_id", email: "user@example.com", iat: 1234567890, exp: 1234567890 + 7 days },
  signature: HMACSHA256(base64UrlEncode(header) + "." + base64UrlEncode(payload), secret)
}
```

**JWT Generation:**
```javascript
const token = jwt.sign(
  { id: user._id, email: user.email },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);
```

**JWT Verification:**
```javascript
const decoded = jwt.verify(token, process.env.JWT_SECRET);
// Returns: { id: "user_id", email: "user@example.com", iat: ..., exp: ... }
```

**JWT Storage:**
- Primary: HTTP-only, signed cookie (`smarttodo_token`)
- Fallback: localStorage (`smarttodo_token`)

**JWT Expiration:**
- Expires after 7 days
- Frontend must re-authenticate after expiration
- Backend returns 401 for expired tokens

**JWT Blacklisting:**
- On logout, token added to in-memory blacklist
- Blacklisted tokens rejected by auth middleware
- Blacklist cleared on server restart (limitation)

**File Location:** `backend/middleware/auth.js`, `backend/middleware/tokenBlacklist.js`

---

### Password Hashing

**Hashing Algorithm:** bcrypt

**Hashing Process:**
```javascript
const hashedPassword = await bcrypt.hash(password, 10);
```

**Salt Rounds:** 10 (default for bcrypt)

**Verification:**
```javascript
const isMatch = await bcrypt.compare(password, user.password);
```

**Security Properties:**
- One-way hash (cannot be reversed)
- Salt included (prevents rainbow table attacks)
- Slow hashing (prevents brute force)
- Adaptive (can increase salt rounds over time)

**File Location:** `backend/server.js`

---

### Protected Routes

**Protection Method:** Authentication middleware

**Middleware Application:**
```javascript
app.get("/tasks", authMiddleware, async (req, res) => {
  // Only accessible with valid JWT
});
```

**Middleware Logic:**
1. Extract token from cookie or Authorization header
2. Check if token is blacklisted
3. Verify JWT with secret
4. Attach user info to req.user
5. Call next() or return 401

**Protected Routes:**
- `GET /api/tasks` - Get user's tasks
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `GET /api/dashboard` - Get dashboard stats
- `GET /api/analytics` - Get analytics data
- `POST /api/tasks/ai/chat` - AI chat

**Unprotected Routes:**
- `POST /api/auth/register` - Registration
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /health` - Health check
- `GET /api/health` - Health check

**File Location:** `backend/middleware/auth.js`, `backend/server.js`

---

### Security Measures Implemented

#### 1. Security Headers (Helmet)
**Purpose:** Protect against common web vulnerabilities

**Headers:**
- Content-Security-Policy (CSP) - Prevents XSS
- X-Content-Type-Options - Prevents MIME sniffing
- X-Frame-Options - Prevents clickjacking
- X-XSS-Protection - XSS protection
- Strict-Transport-Security - Enforce HTTPS

**File Location:** `backend/server.js`

---

#### 2. Input Validation
**Purpose:** Prevent injection attacks and invalid data

**Validation:**
- Type checking (string, email, date, enum, array, boolean)
- Length validation (min/max characters)
- Required field validation
- Email format validation
- Date format validation
- Enum value validation

**Mass Assignment Protection:**
- Strips undeclared fields from request body
- Prevents overwriting sensitive fields

**File Location:** `backend/middleware/validator.js`

---

#### 3. SQL/NoSQL Injection Prevention
**Purpose:** Prevent database injection attacks

**Measures:**
- express-mongo-sanitize - Removes MongoDB operators
- Mongoose ORM - Parameterized queries
- Input validation - Type checking and sanitization

**File Location:** `backend/server.js`, `backend/middleware/validator.js`

---

#### 4. Rate Limiting
**Purpose:** Prevent API abuse and DDoS attacks

**Limiters:**
- Auth limiter: 15 requests per 15 minutes
- AI limiter: 20 requests per minute
- API limiter: 100 requests per 15 minutes

**File Location:** `backend/middleware/rateLimiter.js`

---

#### 5. CORS Configuration
**Purpose:** Control cross-origin requests

**Configuration:**
- Allowed origins: localhost ports, production URL
- Credentials: true (for cookies)
- Origin validation function

**File Location:** `backend/server.js`

---

#### 6. Cookie Security
**Purpose:** Secure cookie-based authentication

**Settings:**
- httpOnly: true (prevents XSS access)
- secure: true (HTTPS only)
- sameSite: "none" (cross-site cookies)
- signed: true (prevents tampering)
- path: "/" (available on all paths)

**File Location:** `backend/server.js`

---

#### 7. Password Security
**Purpose:** Secure password storage

**Measures:**
- bcrypt hashing (10 salt rounds)
- Minimum password length (6 characters)
- Password never logged or exposed

**File Location:** `backend/server.js`

---

#### 8. Token Security
**Purpose:** Secure JWT usage

**Measures:**
- Strong JWT_SECRET required (server fails to start without it)
- Token expiration (7 days)
- Token blacklist on logout
- Sanitized error messages (no token details leaked)
- Strict secret validation

**File Location:** `backend/middleware/auth.js`, `backend/server.js`

---

#### 9. Request Size Limit
**Purpose:** Prevent large payload attacks

**Limit:** 10kb for JSON body

**File Location:** `backend/server.js`

---

#### 10. Audit Logging
**Purpose:** Track security events

**Events Logged:**
- Unhandled errors
- Unhandled promise rejections
- Uncaught exceptions
- Suspicious update attempts
- Suspicious delete attempts
- Database read/write errors

**File Location:** `backend/database/sqliteFailover.js`

---

## 9. API Documentation

### Authentication Endpoints

#### POST /api/auth/register
**Purpose:** Register a new user account

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Validation:**
- name: 2-50 characters, required
- email: valid email format, required
- password: 6-100 characters, required

**Response (201 Created):**
```json
{
  "message": "Registration successful. Please login."
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Email already registered"
}
```

**Authentication:** Not required

**Rate Limiting:** 15 requests per 15 minutes

**File Location:** `backend/server.js`

---

#### POST /api/auth/login
**Purpose:** Login with existing credentials

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Validation:**
- email: valid email format, required
- password: string, required

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "name": "John Doe",
    "email": "john@example.com",
    "xp": 0,
    "level": 1
  }
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Invalid credentials"
}
```

**Authentication:** Not required

**Rate Limiting:** 15 requests per 15 minutes

**File Location:** `backend/server.js`

---

#### POST /api/auth/logout
**Purpose:** Logout current user

**Request Body:** None

**Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

**Authentication:** Required (JWT in cookie or header)

**Rate Limiting:** None

**File Location:** `backend/server.js`

---

### Task Endpoints

#### GET /api/tasks
**Purpose:** Get user's tasks with optional filters

**Query Parameters:**
- `priority` (optional): "high", "medium", "low"
- `tag` (optional): "Work", "Study", "Personal"

**Example Request:**
```
GET /api/tasks?priority=high&tag=Work
```

**Response (200 OK):**
```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "title": "Complete project report",
    "completed": false,
    "dueDate": "2024-06-10T00:00:00.000Z",
    "priority": "high",
    "tags": ["Work"],
    "userId": "507f1f77bcf86cd799439012",
    "createdAt": "2024-06-01T00:00:00.000Z",
    "updatedAt": "2024-06-01T00:00:00.000Z"
  }
]
```

**Authentication:** Required

**Rate Limiting:** 100 requests per 15 minutes

**File Location:** `backend/server.js`

---

#### POST /api/tasks
**Purpose:** Create a new task

**Request Body:**
```json
{
  "title": "Complete project report",
  "dueDate": "2024-06-10T00:00:00.000Z",
  "priority": "high",
  "tags": ["Work"]
}
```

**Validation:**
- title: 3-100 characters, required
- dueDate: valid ISO date, optional
- priority: "high", "medium", "low", optional (default: "medium")
- tags: array of strings, optional

**Response (201 Created):**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "title": "Complete project report",
  "completed": false,
  "dueDate": "2024-06-10T00:00:00.000Z",
  "priority": "high",
  "tags": ["Work"],
  "userId": "507f1f77bcf86cd799439012",
  "createdAt": "2024-06-01T00:00:00.000Z",
  "updatedAt": "2024-06-01T00:00:00.000Z"
}
```

**Authentication:** Required

**Rate Limiting:** 100 requests per 15 minutes

**File Location:** `backend/server.js`

---

#### PUT /api/tasks/:id
**Purpose:** Update an existing task

**URL Parameter:**
- `id`: Task ObjectId

**Request Body:**
```json
{
  "title": "Updated task title",
  "completed": true,
  "dueDate": "2024-06-11T00:00:00.000Z",
  "priority": "medium",
  "tags": ["Work", "Study"]
}
```

**Validation:**
- title: 3-100 characters, optional
- completed: boolean, optional
- dueDate: valid ISO date, optional
- priority: "high", "medium", "low", optional
- tags: array of strings, optional

**Response (200 OK):**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "title": "Updated task title",
  "completed": true,
  "dueDate": "2024-06-11T00:00:00.000Z",
  "priority": "medium",
  "tags": ["Work", "Study"],
  "userId": "507f1f77bcf86cd799439012",
  "completedAt": "2024-06-01T12:00:00.000Z",
  "createdAt": "2024-06-01T00:00:00.000Z",
  "updatedAt": "2024-06-01T12:00:00.000Z"
}
```

**Response (404 Not Found):**
```json
{
  "error": "Task not found"
}
```

**Authentication:** Required

**Rate Limiting:** 100 requests per 15 minutes

**File Location:** `backend/server.js`

---

#### DELETE /api/tasks/:id
**Purpose:** Delete a task

**URL Parameter:**
- `id`: Task ObjectId

**Response (200 OK):**
```json
{
  "message": "Task deleted successfully"
}
```

**Response (404 Not Found):**
```json
{
  "error": "Task not found"
}
```

**Authentication:** Required

**Rate Limiting:** 100 requests per 15 minutes

**File Location:** `backend/server.js`

---

### Dashboard Endpoint

#### GET /api/dashboard
**Purpose:** Get dashboard statistics and recent tasks

**Response (200 OK):**
```json
{
  "stats": {
    "totalTasks": 25,
    "completedTasks": 15,
    "pendingTasks": 10,
    "completionRate": 60
  },
  "recentTasks": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "title": "Complete project report",
      "completed": false,
      "priority": "high",
      "dueDate": "2024-06-10T00:00:00.000Z"
    }
  ],
  "insights": "You've completed 60% of your tasks this week. Keep up the good work!"
}
```

**Authentication:** Required

**Rate Limiting:** 100 requests per 15 minutes

**File Location:** `backend/server.js`

---

### Analytics Endpoint

#### GET /api/analytics
**Purpose:** Get analytics data for charts

**Response (200 OK):**
```json
{
  "completionRate": 65,
  "tasksToday": 3,
  "tasksThisWeek": 15,
  "productiveTime": "4h 30m",
  "weeklyTrend": [5, 8, 6, 10, 7, 9, 15],
  "categoryDistribution": {
    "Work": 10,
    "Study": 8,
    "Personal": 7
  },
  "completionStatus": {
    "completed": 15,
    "pending": 10
  },
  "productiveHours": {
    "9": 5,
    "10": 8,
    "11": 12,
    "14": 7,
    "15": 10
  }
}
```

**Authentication:** Required

**Rate Limiting:** 100 requests per 15 minutes

**File Location:** `backend/server.js`

---

### AI Endpoint

#### POST /api/tasks/ai/chat
**Purpose:** Send message to AI assistant

**Request Body:**
```json
{
  "message": "What should I prioritize today?"
}
```

**Validation:**
- message: 1-2000 characters, required

**Response (200 OK):**
```json
{
  "reply": "Based on your tasks, I recommend prioritizing the high-priority project report due tomorrow.",
  "action": {
    "type": "none",
    "data": {}
  },
  "user": {
    "name": "John Doe",
    "xp": 150,
    "level": 2,
    "streak": 3
  }
}
```

**Response (503 Service Unavailable):**
```json
{
  "error": "AI service unavailable",
  "fallback": true
}
```

**Authentication:** Required

**Rate Limiting:** 20 requests per minute

**File Location:** `backend/server.js`

---

### Health Check Endpoints

#### GET /health
**Purpose:** Health check without /api prefix

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "smarttodo-api",
  "database": "mongodb",
  "ai": true,
  "timestamp": "2024-06-03T12:00:00.000Z"
}
```

**Authentication:** Not required

**Rate Limiting:** None

**File Location:** `backend/server.js`

---

#### GET /api/health
**Purpose:** Health check with /api prefix

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "smarttodo-api",
  "database": "mongodb",
  "ai": true,
  "timestamp": "2024-06-03T12:00:00.000Z"
}
```

**Authentication:** Not required

**Rate Limiting:** None

**File Location:** `backend/server.js`

---

## 10. AI Features

### How AI Works in This Project

**AI Provider:** Google Gemini gemini-2.0-flash

**Integration Pattern:** Structured JSON response with action execution

**Architecture:**
1. User sends message to `/api/tasks/ai/chat`
2. Backend fetches user profile and pending tasks
3. Backend constructs system prompt with context
4. Gemini returns structured JSON with action type and data
5. Backend parses and executes the action
6. Backend returns AI reply and action result to frontend
7. Frontend displays formatted response

**File Location:** `backend/server.js`, `backend/services/openaiService.js`

---

### Prompt Flow

**System Prompt Construction:**
```javascript
const systemPrompt = `You are SmartTodo AI, a task management assistant.

User profile:
- name: ${user.name}
- level: ${user.level}
- XP: ${user.xp}
- streak: ${user.streak}

Pending tasks (use exact id when completing by id):
${taskContext}

Allowed actions (set action.type to one of these):
- none — conversation only, no database change
- create_task — one new task (data.title required; optional dueDate ISO, priority)
- create_multiple_tasks — several new tasks (data.tasks: [{title, priority?, dueDate?}])
- complete_task — mark done (data.taskId preferred, or data.taskName / data.title)
- list_tasks — show pending tasks (server attaches list)
- daily_plan — organize pending tasks into Morning / Afternoon / Evening (data.plan: { morning: [{taskId, title?}], afternoon: [], evening: [] }) — NO database writes
- schedule_tasks — suggest time slots for pending tasks (data.schedule: [{taskId, title?, suggestedTime, suggestedDueDate}]; data.applyUpdates: false unless user explicitly asks to save/apply schedule)

You MUST respond with ONLY valid JSON (no markdown, no code fences) in this exact shape:
{
  "reply": "short human-readable message for the user",
  "action": {
    "type": "none | create_task | create_multiple_tasks | complete_task | list_tasks | daily_plan | schedule_tasks",
    "data": {
      "title": "",
      "dueDate": "",
      "priority": "medium",
      "taskName": "",
      "taskId": "",
      "tasks": [],
      "plan": { "morning": [], "afternoon": [], "evening": [] },
      "schedule": [],
      "applyUpdates": false,
      "forceOverwrite": false
    }
  }
}

Rules:
- Never suggest creating tasks that duplicate titles already in the pending list.
- For "plan my day" use daily_plan and assign each pending task to exactly one time block when possible.
- For "schedule my tasks" use schedule_tasks with applyUpdates false unless the user says apply/save/update my calendar.
- For "create 5 tasks" use create_multiple_tasks with up to 5 unique titles in data.tasks.
- When completing, prefer action.data.taskId from the pending list.
- Be short, clear, and friendly.
- ONLY return valid JSON.`;
```

**User Message:**
```javascript
const userMessage = "What should I prioritize today?";
```

**Gemini API Call:**
```javascript
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    temperature: 0.3,
    responseMimeType: "application/json"
  }
});
const result = await model.generateContent([
  { text: systemPrompt },
  { text: userMessage }
]);
```

**File Location:** `backend/server.js`

---

### API Integration

**Gemini SDK Usage:**
```javascript
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    temperature: 0.3,
    responseMimeType: "application/json"
  }
});
const result = await model.generateContent([
  { text: systemPrompt },
  { text: userMessage }
]);
```

**Response Format:**
- JSON-only response (no markdown)
- Structured with `reply` and `action` fields
- Action type determines database operation

**File Location:** `backend/services/openaiService.js`, `backend/server.js`

---

### Failure Handling

**AI Unavailable Scenarios:**
1. No GEMINI_API_KEY configured
2. Gemini API error (rate limit, downtime)
3. Invalid response format from Gemini
4. Action execution error

**Failure Handling:**
```javascript
if (!process.env.GEMINI_API_KEY || !genAI) {
  return respondAiUnavailable();
}

try {
  const result = await model.generateContent([...]);
} catch (geminiErr) {
  console.error("Gemini API error:", geminiErr.message);
  return respondAiUnavailable();
}

const respondAiUnavailable = () =>
  res.status(503).json({
    error: "AI service unavailable",
    fallback: true
  });
```

**Frontend Handling:**
```javascript
if (err.message === "Unauthorized") {
  errorMsg = "Please log in to use the AI Assistant.";
} else {
  errorMsg = "Failed to reach the AI Assistant. Make sure the backend server is running.";
}
```

**File Location:** `backend/server.js`, `frontend/assets/js/assistant.js`

---

### Limitations

**Current Limitations:**
1. **Token Blacklist Not Persistent:** Blacklisted tokens cleared on server restart
2. **No Context History:** AI doesn't remember previous conversations (except frontend localStorage)
3. **No Streaming:** Responses are not streamed (wait for full response)
4. **No Image Support:** AI cannot process images
5. **No Voice Support:** AI cannot process voice input
6. **Rate Limited:** 20 requests per minute per IP
7. **Single Model:** Only uses gemini-2.0-flash (no model selection)
8. **No Fine-tuning:** Uses base model without fine-tuning
9. **No RAG:** No retrieval-augmented generation
10. **No Multi-turn Context:** Each request is independent (except task context)

**Potential Improvements:**
- Implement Redis for persistent token blacklist
- Add conversation history to system prompt
- Implement streaming responses
- Add image recognition for task photos
- Add voice input/output
- Increase rate limits with authentication
- Support multiple AI models
- Implement RAG with task history
- Add multi-turn conversation context

**File Location:** `backend/server.js`

---

## 11. Deployment Architecture

### Render Deployment

**Platform:** Render (backend hosting)

**Configuration File:** `render.yaml`

**Configuration:**
```yaml
services:
  - type: web
    name: flownest-backend
    env: node
    plan: starter
    rootDirectory: backend
    buildCommand: npm install
    startCommand: npm start
    healthCheckPath: /api/health
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 5003
      - key: MONGO_URI
        sync: false
      - key: JWT_SECRET
        sync: false
      - key: COOKIE_SECRET
        sync: false
      - key: CLIENT_URL
        sync: false
      - key: GEMINI_API_KEY
        sync: false
      - key: ALLOWED_ORIGINS
        sync: false
```

**Environment Variables:**
- `NODE_ENV` - Production mode
- `PORT` - Server port (5003)
- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `COOKIE_SECRET` - Cookie signing secret
- `CLIENT_URL` - Frontend URL for CORS
- `GEMINI_API_KEY` - Google Gemini API key
- `ALLOWED_ORIGINS` - Allowed CORS origins

**Health Check:**
- Path: `/api/health`
- Monitored by Render for automatic restarts

**Process Management:**
- PM2 configuration in `ecosystem.config.cjs`
- Auto-restart on crash
- Memory limits
- Log management

**File Location:** `render.yaml`, `backend/ecosystem.config.cjs`

---

### Vercel Deployment

**Platform:** Vercel (frontend hosting)

**Configuration File:** `vercel.json.example` (needs to be copied to `vercel.json`)

**Configuration:**
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://flownest-backend.onrender.com/api/:path*"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

**API Proxying:**
- `/api/*` requests proxied to Render backend
- Enables CORS and secure communication

**Security Headers:**
- X-Content-Type-Options
- X-Frame-Options
- X-XSS-Protection

**Environment Variables:**
- `API_BASE` - Backend URL (auto-detected or configured)
- `NEXT_PUBLIC_API_URL` - Environment variable override
- `VITE_API_URL` - Vite environment variable

**File Location:** `frontend/vercel.json.example`

---

### Environment Variables

**Backend Environment Variables (.env.example):**
```bash
PORT=5003
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.xxxx.mongodb.net/smarttodo
JWT_SECRET=CHANGE_THIS_TO_A_STRONG_RANDOM_STRING_IN_PRODUCTION
COOKIE_SECRET=CHANGE_THIS_TO_A_STRONG_RANDOM_STRING_IN_PRODUCTION
CLIENT_URL=https://your-frontend-vercel-app.vercel.app
ALLOWED_ORIGINS=https://your-frontend-vercel-app.vercel.app
GEMINI_API_KEY=your-gemini-api-key-here
```

**Frontend Environment Variables (.env.example):**
```bash
API_BASE=https://api.yourdomain.com
VITE_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

**Runtime Configuration (env.config.js):**
```javascript
window.__SMARTTODO_CONFIG__ = {
  API_BASE: "https://api.yourdomain.com"
};
```

**File Location:** `backend/.env.example`, `frontend/.env.example`, `frontend/assets/js/env.config.js`

---

### Production Configuration

**Backend Production Settings:**
- `NODE_ENV=production`
- MongoDB connection with retry logic
- No SQLite failover in production (MongoDB required)
- Strict CORS validation
- Security headers enabled
- Rate limiting enforced
- Health check endpoint monitored
- PM2 process management

**Frontend Production Settings:**
- API base URL points to production backend
- HTTPS enforced
- Security headers via Vercel
- CDN for static assets
- API proxying for /api routes

**Database Production Settings:**
- MongoDB Atlas (managed MongoDB)
- Connection pooling
- Indexes for performance
- Backup strategy (Atlas automated backups)

**File Location:** `render.yaml`, `backend/server.js`

---

## 12. Design Decisions

### 1. Vanilla JavaScript vs Framework

**Decision:** Use Vanilla JavaScript instead of React/Vue/Angular

**Reasoning:**
- No build step required
- Faster development for simple use case
- Direct DOM manipulation
- Lower learning curve
- Smaller bundle size

**Trade-offs:**
- **Pros:** Simplicity, no build complexity, faster initial development
- **Cons:** Harder to scale, no component reusability, manual state management

**Alternative:** React with Vite for better scalability

---

### 2. MongoDB vs SQL Database

**Decision:** Use MongoDB instead of PostgreSQL/MySQL

**Reasoning:**
- Flexible schema (easy to add fields)
- JSON-like documents (matches JavaScript objects)
- Horizontal scalability
- Good for task management (nested structures)
- Atlas free tier available

**Trade-offs:**
- **Pros:** Flexibility, scalability, developer-friendly
- **Cons:** No ACID transactions (in older versions), less strict schema

**Alternative:** PostgreSQL for strict schema and ACID compliance

---

### 3. JWT vs Session-Based Auth

**Decision:** Use JWT with HTTP-only cookies instead of session-based auth

**Reasoning:**
- Stateless (no server-side session storage)
- Scalable (works across multiple servers)
- Mobile-friendly (can be used in mobile apps)
- Industry standard for REST APIs

**Trade-offs:**
- **Pros:** Scalable, stateless, mobile-friendly
- **Cons:** Cannot revoke tokens easily (blacklist workaround), larger payload

**Alternative:** Session-based auth with Redis for revocation

---

### 4. SQLite Failover

**Decision:** Implement SQLite failover for offline mode

**Reasoning:**
- Graceful degradation when MongoDB unavailable
- Tenant isolation (separate files per user)
- Security event logging
- Better user experience during outages

**Trade-offs:**
- **Pros:** Offline capability, better UX, data safety
- **Cons:** Additional complexity, not production-ready for scaling

**Alternative:** Only MongoDB with retry logic (no failover)

---

### 5. Multi-Page vs Single-Page Application

**Decision:** Multi-page application (MPA) instead of SPA

**Reasoning:**
- Simpler routing (no client-side router)
- Better SEO (if needed)
- Easier to understand for beginners
- Each page loads only its own scripts

**Trade-offs:**
- **Pros:** Simplicity, better SEO, easier debugging
- **Cons:** Page reloads, slower navigation, no smooth transitions

**Alternative:** SPA with React Router for smoother UX

---

### 6. AI Integration Pattern

**Decision:** Structured JSON response with action execution

**Reasoning:**
- Predictable AI responses
- Type-safe action execution
- Clear separation of conversation and actions
- Easy to extend with new actions

**Trade-offs:**
- **Pros:** Type-safe, predictable, extensible
- **Cons:** More complex prompt engineering, requires JSON parsing

**Alternative:** Free-form text with NLP parsing

---

### 7. Gamification System

**Decision:** Implement XP, levels, streaks, and badges

**Reasoning:**
- Increases user engagement
- Motivates consistent task completion
- Makes task management fun
- Differentiates from competitors

**Trade-offs:**
- **Pros:** Engagement, motivation, differentiation
- **Cons:** Additional complexity, potential for gaming the system

**Alternative:** Simple task management without gamification

---

### 8. Rate Limiting Strategy

**Decision:** Multiple rate limiters for different endpoint types

**Reasoning:**
- Auth endpoints need strict limiting (brute force prevention)
- AI endpoints need strict limiting (cost control)
- General API needs moderate limiting (DDoS prevention)

**Trade-offs:**
- **Pros:** Targeted protection, cost control
- **Cons:** More configuration, potential false positives

**Alternative:** Single global rate limiter

---

## 13. Challenges & Solutions

### Challenge 1: MongoDB Connection Failures

**Problem:** MongoDB connection can fail due to network issues, downtime, or misconfiguration

**Solution:**
- Implemented retry logic with exponential backoff
- Added background reconnection scheduler
- Implemented SQLite failover for offline mode
- Graceful degradation with 503 responses

**File Location:** `backend/server.js`, `backend/database/sqliteFailover.js`

---

### Challenge 2: Cross-Origin Resource Sharing (CORS)

**Problem:** Frontend and backend on different origins (localhost vs production)

**Solution:**
- Configured CORS with origin validation
- Allowed localhost origins for development
- Configured production origin in environment variables
- Enabled credentials (cookies) in CORS

**File Location:** `backend/server.js`

---

### Challenge 3: Token Revocation

**Problem:** JWT tokens cannot be revoked (stateless by design)

**Solution:**
- Implemented in-memory token blacklist
- Blacklist token on logout
- Check blacklist in auth middleware
- Limitation: Blacklist cleared on server restart

**File Location:** `backend/middleware/tokenBlacklist.js`

---

### Challenge 4: AI Response Parsing

**Problem:** Gemini may return invalid JSON or markdown-wrapped JSON

**Solution:**
- Set `responseMimeType: "application/json"` in Gemini API call
- Implemented JSON parsing with error handling
- Fallback to error message if parsing fails
- Sanitized error messages

**File Location:** `backend/server.js`

---

### Challenge 5: Mass Assignment Attacks

**Problem:** Malicious users could overwrite sensitive fields by sending unexpected fields

**Solution:**
- Implemented validation middleware with schema definition
- Strips all undeclared fields from request body
- Only allows fields explicitly defined in schema
- Type checking and validation

**File Location:** `backend/middleware/validator.js`

---

### Challenge 6: NoSQL Injection

**Problem:** MongoDB operator injection via user input

**Solution:**
- Used express-mongo-sanitize middleware
- Strips MongoDB operators ($, ., etc.) from request body
- Input validation with type checking
- Parameterized queries via Mongoose

**File Location:** `backend/server.js`

---

### Challenge 7: API Abuse

**Problem:** Users could spam API endpoints or attempt brute force attacks

**Solution:**
- Implemented multiple rate limiters
- Auth limiter: 15 requests per 15 minutes
- AI limiter: 20 requests per minute
- API limiter: 100 requests per 15 minutes
- IP-based limiting

**File Location:** `backend/middleware/rateLimiter.js`

---

### Challenge 8: Password Security

**Problem:** Storing passwords in plain text is insecure

**Solution:**
- Used bcrypt for password hashing
- 10 salt rounds for security
- One-way hashing (cannot be reversed)
- Never log or expose passwords

**File Location:** `backend/server.js`

---

### Challenge 9: Frontend State Management

**Problem:** Managing state across pages without a framework

**Solution:**
- Used localStorage for persistent state
- Implemented shared utilities in utils.js
- Page-specific state in in-memory variables
- Auth state managed via callbacks

**File Location:** `frontend/assets/js/utils.js`, `frontend/assets/js/auth.js`

---

### Challenge 10: Calendar Integration

**Problem:** Displaying tasks on a calendar with due dates

**Solution:**
- Used FullCalendar library
- Converted tasks to FullCalendar event format
- Implemented event click handlers
- Added calendar view toggle

**File Location:** `frontend/assets/js/script.js`

---

## 14. Interview Preparation

### 50 Likely Interview Questions

#### Beginner Questions (1-15)

1. **What is Flow Nest and what problem does it solve?**
   - Flow Nest is an AI-powered task management application that helps users organize tasks, track productivity, and achieve goals through gamification. It solves the problem of disorganized task management and lack of motivation.

2. **What technologies did you use for the frontend?**
   - HTML5, CSS3, Vanilla JavaScript, FullCalendar, Chart.js, Phosphor Icons, Google Fonts

3. **What technologies did you use for the backend?**
   - Node.js, Express.js, MongoDB, Mongoose, JWT, bcrypt, Google Gemini API

4. **How does authentication work in your application?**
   - JWT-based authentication with HTTP-only cookies. User logs in, server generates JWT token, stores in cookie, subsequent requests include cookie, middleware verifies token and attaches user info to request.

5. **What is the purpose of the middleware in Express?**
   - Middleware functions process requests before they reach route handlers. They handle security, validation, logging, parsing, etc.

6. **How do you store passwords securely?**
   - Using bcrypt hashing with 10 salt rounds. Passwords are never stored in plain text.

7. **What is MongoDB and why did you choose it?**
   - MongoDB is a NoSQL document database. I chose it for its flexible schema, JSON-like documents, and scalability.

8. **How does the AI assistant work?**
   - User sends message to backend, backend fetches user's tasks, sends context to Google Gemini gemini-2.0-flash with structured prompt, AI returns JSON with action type and data, backend executes action and returns result.

9. **What is rate limiting and why is it important?**
   - Rate limiting restricts the number of requests a user can make in a time period. It prevents API abuse, DDoS attacks, and brute force attacks.

10. **How do you handle errors in your application?**
    - Try-catch blocks in route handlers, global error handler for uncaught errors, user-friendly error messages to frontend, logging for debugging.

11. **What is the purpose of environment variables?**
    - Environment variables store configuration separately from code, enabling different settings for development and production, and keeping secrets secure.

12. **How do you deploy your application?**
    - Backend deployed to Render (Node.js service), frontend deployed to Vercel (static site with API proxying).

13. **What is the difference between GET and POST requests?**
    - GET retrieves data, POST creates data. GET is idempotent, POST is not. GET has no body, POST has body.

14. **How does the gamification system work?**
    - Users earn XP for completing tasks (10-20 XP based on priority), level up at every 100 XP, maintain streaks for consecutive days, unlock badges for achievements.

15. **What is CORS and why is it needed?**
    - CORS (Cross-Origin Resource Sharing) is a security feature that restricts cross-origin requests. It's needed because frontend and backend are on different origins.

---

#### Intermediate Questions (16-35)

16. **Explain the JWT lifecycle in your application.**
    - User logs in, server generates JWT with user ID and email (7-day expiration), stores in HTTP-only cookie, subsequent requests include cookie, auth middleware verifies JWT and attaches user info to request, token blacklisted on logout.

17. **How do you validate incoming requests?**
    - Custom validation middleware with schema definitions. Validates types, lengths, required fields, email format, date format, enum values. Strips undeclared fields for mass assignment protection.

18. **What is the purpose of Mongoose?**
    - Mongoose is an ODM (Object Document Mapper) for MongoDB. It provides schema validation, middleware, query building, and relationship management.

19. **How do you handle database connection failures?**
    - Retry logic with exponential backoff, background reconnection scheduler, SQLite failover for offline mode, graceful degradation with 503 responses.

20. **Explain the SQLite failover system.**
    - When MongoDB is unavailable, the system falls back to JSON file storage. Each user's data stored in separate JSON files for tenant isolation. Security events logged to audit file. Automatic reconnection to MongoDB.

21. **What is the difference between authentication and authorization?**
    - Authentication verifies who a user is (login), authorization determines what a user can do (permissions). My app has authentication but no role-based authorization (single user per account).

22. **How do you prevent SQL/NoSQL injection?**
    - express-mongo-sanitize strips MongoDB operators, Mongoose uses parameterized queries, input validation with type checking, never concatenate user input into queries.

23. **What is the purpose of indexes in MongoDB?**
    - Indexes improve query performance by allowing efficient lookups. I have indexes on userId, completed, dueDate, and email for common queries.

24. **How does the frontend communicate with the backend?**
    - Custom apiFetch() function that adds Authorization header, handles retry logic, parses JSON responses, handles 401 errors, supports both cookie and token auth.

25. **What is the purpose of the API router in Express?**
    - The API router groups all routes under `/api` prefix for consistent routing. It's created with express.Router() and mounted with app.use("/api", apiRouter).

26. **How do you manage state in the frontend?**
    - LocalStorage for persistent state (token, user profile, theme, chat history), in-memory variables for page-specific state, callbacks for auth state changes.

27. **Explain the AI action execution flow.**
    - AI returns JSON with action type and data, backend parses JSON, executes action based on type (create_task, complete_task, etc.), performs database operation, returns result to frontend.

28. **What is the purpose of helmet middleware?**
    - Helmet sets security HTTP headers to protect against common web vulnerabilities like XSS, clickjacking, and MIME sniffing. I configured it with a custom CSP.

29. **How do you handle file uploads?**
    - File uploads are not implemented in this application. If needed, I would use multer middleware with file size limits and type validation.

30. **What is the difference between HTTP-only cookies and localStorage?**
    - HTTP-only cookies cannot be accessed by JavaScript (XSS protection), localStorage can be accessed by JavaScript. Cookies are sent automatically with requests, localStorage requires manual inclusion.

31. **How do you implement the calendar view?**
    - Used FullCalendar library, converted tasks to event format with title, start (dueDate), and color based on priority, implemented event click handlers for task completion.

32. **What is the purpose of the token blacklist?**
    - Token blacklist allows revoking JWT tokens on logout. Tokens added to in-memory Set, checked in auth middleware. Limitation: cleared on server restart.

33. **How do you optimize database queries?**
    - Added indexes on frequently queried fields (userId, completed, dueDate), compound index for combined filters, lean queries where possible.

34. **What is the purpose of compression middleware?**
    - Compression middleware (gzip) reduces response payload sizes, improving load times and reducing bandwidth usage.

35. **How do you handle concurrent requests?**
    - Express handles concurrent requests asynchronously. Rate limiting prevents abuse. Database operations are async with proper error handling.

---

#### Advanced Questions (36-50)

36. **Explain the complete request flow from user action to database response.**
    - User clicks button → JavaScript event handler → apiFetch() with JWT token → HTTP request to backend → middleware stack (helmet, compression, mongoSanitize, morgan, CORS, body parser, cookie parser, rate limiter, auth middleware, validator) → route handler → business logic → database query → response → middleware processing → frontend receives response → DOM update.

37. **How would you scale this application for millions of users?**
    - Add Redis for token blacklist and caching, implement database sharding, use CDN for static assets, add load balancer, implement microservices architecture, add monitoring and alerting, use read replicas for database, implement connection pooling.

38. **What are the security vulnerabilities in your application and how did you mitigate them?**
    - XSS: CSP header and HTML escaping. SQL/NoSQL injection: express-mongo-sanitize and parameterized queries. CSRF: SameSite cookies. Brute force: Rate limiting. Weak passwords: bcrypt hashing. Sensitive data exposure: JWT in HTTP-only cookies.

39. **How would you implement real-time updates for task changes?**
    - Use WebSockets (Socket.io) or Server-Sent Events (SSE). When a task is created/updated/deleted, emit event to connected clients, clients update UI in real-time.

40. **What is the difference between SQL and NoSQL databases, and why did you choose NoSQL?**
    - SQL: Structured schema, ACID transactions, relational data. NoSQL: Flexible schema, horizontal scalability, document storage. Chose NoSQL for flexibility, JSON-like documents matching JavaScript, and scalability.

41. **How would you implement a notification system for due date reminders?**
    - Current implementation uses browser notifications with setInterval checking. For production, use a job scheduler (node-cron) to check due dates, send push notifications via web push API or email service (SendGrid).

42. **What is the purpose of the SQLite failover, and what are its limitations?**
    - Purpose: Offline capability when MongoDB unavailable. Limitations: Not production-ready for scaling, file-based storage has permission issues, no ACID transactions, manual data migration needed.

43. **How would you implement OAuth 2.0 for social login (Google, GitHub)?**
    - Use Passport.js with OAuth strategies, configure OAuth apps on provider platforms, add OAuth routes (/auth/google, /auth/github), handle OAuth callback, create or link user account, generate JWT token.

44. **What is the purpose of the gamification system, and how does it affect user engagement?**
    - Gamification increases user engagement through XP, levels, streaks, and badges. Motivates consistent task completion, makes task management fun, differentiates from competitors.

45. **How would you implement data export and import functionality?**
    - Current export downloads tasks as JSON. For import, add file upload endpoint, validate JSON structure, create tasks in database, handle duplicates and conflicts.

46. **What is the purpose of the analytics system, and how is the data calculated?**
    - Analytics system provides productivity insights. Data calculated by aggregating tasks: completion rate (completed/total), tasks today/this week (date filtering), productive time (time between first and last completion), category distribution (tag counting), peak hours (hour grouping).

47. **How would you implement a team/collaboration feature?**
    - Add Team model with members, add teamId to Task model, implement role-based access (owner, admin, member), add team routes, update auth middleware to check team membership, add real-time collaboration with WebSockets.

48. **What is the purpose of the AI assistant, and how does it differ from a simple chatbot?**
    - AI assistant can execute actions (create tasks, complete tasks, schedule tasks) based on natural language, not just conversation. Uses structured JSON response for type-safe action execution.

49. **How would you implement a mobile app for this application?**
    - Use React Native or Flutter for cross-platform development, reuse backend API, implement mobile-specific features (push notifications, offline mode), use device-specific storage (AsyncStorage, SQLite).

50. **What are the biggest challenges you faced during development, and how did you solve them?**
    - MongoDB connection failures: Implemented retry logic and SQLite failover. AI response parsing: Set JSON format and added error handling. CORS issues: Configured CORS with origin validation. Token revocation: Implemented token blacklist. State management: Used localStorage and callbacks.

---

## 15. Resume Explanation

### 30-Second Explanation

"Flow Nest is an AI-powered task management application I built with Node.js, Express, MongoDB, and vanilla JavaScript. It helps users organize tasks with priorities and due dates, track productivity with analytics, and get intelligent assistance from an AI chatbot. The app features gamification with XP, levels, and badges to motivate users, and includes a calendar view, dark mode, and due date reminders."

---

### 1-Minute Explanation

"Flow Nest is a full-stack task management application I developed to help users stay organized and productive. I built the backend with Node.js and Express, using MongoDB for data storage and JWT for authentication. The frontend uses vanilla JavaScript with a multi-page architecture, featuring a task list, calendar view, dashboard with analytics, and an AI-powered chat assistant.

Key features include task CRUD operations with priorities and tags, productivity analytics with Chart.js visualizations, gamification with XP and levels, and AI integration with Google Gemini gemini-2.0-flash that can create and complete tasks based on natural language. I implemented security measures like rate limiting, input validation, SQL injection prevention, and CSP headers. The app is deployed on Render for the backend and Vercel for the frontend."

---

### 3-Minute Explanation

"Flow Nest is a comprehensive task management application I built from scratch to address the need for an intelligent, gamified productivity tool. The application consists of a Node.js/Express backend with MongoDB database and a vanilla JavaScript frontend with a multi-page architecture.

For the backend, I implemented RESTful API endpoints for task management, authentication, dashboard statistics, and analytics. I used JWT with HTTP-only cookies for secure authentication, bcrypt for password hashing, and implemented custom middleware for rate limiting, input validation, and security headers. The database uses Mongoose ODM with proper indexing for performance, and I also implemented a SQLite failover system for offline capability.

The AI assistant is a key feature that integrates with Google Gemini gemini-2.0-flash. It can understand natural language requests to create tasks, complete tasks, suggest priorities, and plan daily schedules. I designed a structured JSON response system where the AI returns action types and data, which the backend executes safely.

For the frontend, I used vanilla JavaScript with a modular architecture. Each page has its own JavaScript file, and shared utilities are in utils.js. I implemented client-side state management using localStorage, API communication with retry logic, and responsive design with dark mode support. The analytics page uses Chart.js for data visualization, and the calendar uses FullCalendar.

I focused heavily on security, implementing rate limiting, input validation, SQL injection prevention, CSP headers, and proper error handling. The application is deployed on Render for the backend and Vercel for the frontend, with proper environment variable configuration and health checks."

---

### Technical Deep-Dive Explanation

"Flow Nest is a production-grade task management application demonstrating full-stack development skills. The architecture follows a monolithic pattern with clear separation of concerns: Express.js server with middleware pipeline, Mongoose ODM for database operations, and modular frontend JavaScript.

The authentication system uses JWT with HTTP-only signed cookies, providing stateless authentication that's scalable and mobile-friendly. I implemented a custom authentication middleware that extracts tokens from cookies or Authorization headers, verifies JWT signatures, checks against an in-memory blacklist for logout functionality, and attaches user information to request objects.

For security, I implemented multiple layers: Helmet for security headers including a custom CSP, express-mongo-sanitize for NoSQL injection prevention, custom validation middleware with schema definitions for mass assignment protection, and three-tier rate limiting (auth, AI, and general API). Passwords are hashed with bcrypt using 10 salt rounds.

The AI integration is particularly interesting. I designed a structured prompt engineering approach where the system prompt includes user profile, task context, and allowed action types. Gemini returns JSON with action type (create_task, complete_task, daily_plan, schedule_tasks) and data. The backend parses this JSON, validates it, executes the corresponding database operation, and returns results. This provides type-safe action execution while maintaining conversational AI capabilities.

The database layer uses MongoDB with Mongoose. I defined proper schemas with indexes on frequently queried fields (userId, completed, dueDate, email). I also implemented a SQLite failover system that activates when MongoDB is unavailable, storing data in tenant-isolated JSON files with security event logging. This provides graceful degradation and offline capability.

For the frontend, I chose vanilla JavaScript to avoid build complexity. I implemented a modular architecture with shared utilities (apiFetch, token management, theme handling) and page-specific modules. State management uses localStorage for persistence and in-memory variables for page state. I implemented retry logic with exponential backoff for API calls, proper error handling, and XSS prevention through HTML escaping.

The gamification system calculates XP based on task priority (10-20 XP), tracks streaks for consecutive days, unlocks badges for achievements, and levels up every 100 XP. This is calculated server-side on task completion and returned to the frontend for UI updates.

Deployment uses Render for the backend with PM2 process management and health checks, and Vercel for the frontend with API proxying. Environment variables are properly configured for both development and production."

---

## 16. Strengths & Weaknesses

### What is Implemented Well

1. **Security:** Comprehensive security measures including JWT authentication, bcrypt password hashing, rate limiting, input validation, CSP headers, SQL injection prevention, and CORS configuration.

2. **Error Handling:** Global error handler, try-catch blocks in route handlers, user-friendly error messages, logging for debugging, graceful degradation.

3. **Database Design:** Proper schema definitions with indexes, relationships between users and tasks, tenant isolation in failover mode, security event logging.

4. **AI Integration:** Structured JSON response system, type-safe action execution, comprehensive prompt engineering, fallback handling, rate limiting.

5. **Gamification:** XP system, levels, streaks, badges, achievement tracking, user engagement features.

6. **Frontend UX:** Responsive design, dark mode, loading states, error states, toast notifications, calendar view, analytics visualizations.

7. **Code Organization:** Modular architecture, separation of concerns, shared utilities, clear file structure, consistent naming conventions.

8. **API Design:** RESTful endpoints, consistent response formats, proper HTTP status codes, validation middleware, authentication middleware.

9. **Deployment:** Render configuration with health checks, Vercel configuration with API proxying, environment variable management, PM2 process management.

10. **Documentation:** README files, environment variable examples, code comments, inline documentation.

---

### What Could Be Improved

1. **Testing:** No unit tests, integration tests, or E2E tests. Should add Jest for backend, Playwright for E2E.

2. **Token Persistence:** Token blacklist is in-memory (cleared on restart). Should use Redis for persistence.

3. **Structured Logging:** Uses console.log/console.error. Should implement Winston or Pino for structured logging.

4. **Monitoring:** No monitoring dashboards or alerting. Should add Prometheus metrics, Grafana dashboards, PagerDuty alerts.

5. **API Versioning:** No API versioning (/api/v1). Should implement versioning for backward compatibility.

6. **Caching:** No server-side caching. Should add Redis caching for frequently accessed data (user profile, dashboard stats).

7. **Database Connection Pooling:** Uses default MongoDB connection settings. Should configure pool size and timeout for production.

8. **Frontend Bundling:** No build process, JavaScript not minified. Should implement Vite or Webpack for bundling and minification.

9. **CDN for Static Assets:** Static assets not served from CDN. Should use CDN for CSS, JS, fonts, images.

10. **Request Timeout:** No global request timeout configured. Should add timeout middleware to prevent hanging requests.

11. **API Documentation:** No OpenAPI/Swagger documentation. Should add API documentation for external developers.

12. **Migration System:** No database migration tool. Should implement migrate-mongo for schema changes.

13. **Error Tracking:** No error tracking service. Should add Sentry for error monitoring.

14. **Performance Monitoring:** No APM (Application Performance Monitoring). Should add New Relic or Datadog.

15. **Backup Strategy:** No documented backup strategy. Should implement automated backups and disaster recovery plan.

---

### Future Roadmap

**Short-term (1-2 months):**
- Add unit tests with Jest
- Implement Redis for token blacklist and caching
- Add structured logging with Winston
- Implement API versioning (/api/v1)
- Add OpenAPI/Swagger documentation

**Medium-term (3-6 months):**
- Add integration tests with Supertest
- Implement E2E tests with Playwright
- Add monitoring with Prometheus and Grafana
- Implement error tracking with Sentry
- Add frontend bundling with Vite
- Deploy static assets to CDN

**Long-term (6-12 months):**
- Implement team/collaboration features
- Add real-time updates with WebSockets
- Implement mobile app with React Native
- Add email notifications (SendGrid)
- Implement data export/import
- Add more AI features (voice input, image recognition)
- Implement microservices architecture for scalability

---

## 17. Learning Outcomes

### Software Engineering Concepts Demonstrated

1. **Full-Stack Development:** Built both frontend and backend from scratch
2. **RESTful API Design:** Designed and implemented RESTful endpoints
3. **Authentication & Authorization:** JWT-based authentication with role-based access
4. **Database Design:** Schema design, relationships, indexes, queries
5. **Security Best Practices:** OWASP Top 10 mitigation, secure coding practices
6. **API Integration:** Google Gemini API integration with structured responses
7. **Error Handling:** Global error handling, try-catch blocks, user-friendly messages
8. **Middleware Pattern:** Express middleware for security, validation, logging
9. **State Management:** Client-side state with localStorage, in-memory state
10. **Responsive Design:** Mobile-first design, CSS Grid, Flexbox
11. **Performance Optimization:** Indexes, caching, compression, rate limiting
12. **Deployment:** CI/CD, environment variables, health checks, process management
13. **Version Control:** Git workflow, branching, commit messages
14. **Testing Strategy:** Unit testing, integration testing, E2E testing concepts
15. **Documentation:** README files, code comments, API documentation
16. **Gamification:** XP systems, levels, streaks, badges
17. **AI Integration:** Prompt engineering, structured responses, action execution
18. **Failover Systems:** Graceful degradation, offline capability
19. **CORS:** Cross-origin resource sharing configuration
20. **Rate Limiting:** API abuse prevention, DDoS protection
21. **Input Validation:** Schema validation, type checking, mass assignment protection
22. **Password Security:** Hashing, salting, secure storage
23. **JWT:** Token generation, verification, expiration, blacklisting
24. **MongoDB:** Document database, ODM, aggregation, indexing
25. **Express.js:** Routing, middleware, error handling, security
26. **Vanilla JavaScript:** DOM manipulation, event handling, async/await
27. **CSS3:** Flexbox, Grid, animations, responsive design, theming
28. **Chart.js:** Data visualization, chart configuration, responsive charts
29. **FullCalendar:** Calendar integration, event handling, view switching
30. **PM2:** Process management, auto-restart, monitoring
31. **Render:** Cloud deployment, environment variables, health checks
32. **Vercel:** Frontend deployment, API proxying, security headers
33. **Environment Variables:** Configuration management, security
34. **Logging:** Request logging, error logging, audit logging
35. **Graceful Shutdown:** Process signal handling, cleanup

---

## Conclusion

This Project Mastery Document provides a comprehensive overview of the Flow Nest (SmartTodo) application, covering all aspects from architecture to deployment. Use this document to prepare for technical interviews, resume discussions, and to demonstrate your full-stack development skills.

**Key Takeaways for Interviews:**
- Emphasize the security measures implemented
- Explain the AI integration architecture
- Discuss the gamification system and its impact
- Highlight the failover system for reliability
- Talk about the challenges you faced and how you solved them
- Be prepared to discuss trade-offs and design decisions

**Good luck with your interviews!**
