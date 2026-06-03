/**
 * PM2 process manager — single backend instance on PORT (default 5003).
 *
 * Start:   npm run pm2:start
 * Restart: npm run pm2:restart
 * Stop:    npm run pm2:stop
 * Logs:    npm run pm2:logs
 */
module.exports = {
  apps: [
    {
      name: "smarttodo",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 2000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "development",
        PORT: 5003,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5003,
      },
    },
  ],
};
