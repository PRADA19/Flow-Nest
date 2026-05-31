# SmartTodo Backend

## Run with PM2 (recommended — single instance, auto-restart)

```powershell
cd backend

# First time
npm run pm2:start
npm run pm2:save

# After code or .env changes
npm run pm2:restart

# Check status / logs
npm run pm2:status
npm run pm2:logs

# Stop
npm run pm2:stop
```

## Run without PM2 (local dev only)

```powershell
npm start
```

If port 5003 is already in use, the start guard exits with instructions instead of crashing with `EADDRINUSE`.

## Fix duplicate / port conflict

```powershell
npm run pm2:status          # confirm one smarttodo instance
npm run pm2:stop              # stop PM2 instance
netstat -ano | findstr :5003  # find orphan PID if any
taskkill /PID <pid> /F        # kill orphan only if PM2 is stopped
npm run pm2:start             # start clean single instance
```

## Environment

Copy `.env.example` to `.env` and set `JWT_SECRET`, `COOKIE_SECRET`, `MONGODB_URI`, `OPENAI_API_KEY`.
