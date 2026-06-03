/**
 * Prevents duplicate backend instances on the same port.
 * PM2 runs server.js directly; npm start uses this guard first.
 */
const net = require("net");
const { spawn } = require("child_process");
const path = require("path");

const PORT = Number(process.env.PORT) || 5003;

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });

    socket.setTimeout(1500);

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.once("error", () => {
      resolve(false);
    });
  });
}

async function main() {
  if (await isPortInUse(PORT)) {
    console.error(`\nPort ${PORT} is already in use — another backend instance is running.\n`);
    console.error("Do NOT run a second copy. Use PM2 instead:\n");
    console.error("  npm run pm2:status    # check running instance");
    console.error("  npm run pm2:restart   # restart after code changes");
    console.error("  npm run pm2:stop      # stop the backend");
    console.error("  npm run pm2:logs      # view logs\n");
    process.exit(1);
  }

  const serverPath = path.join(__dirname, "..", "server.js");
  const child = spawn(process.execPath, [serverPath], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error("Failed to start backend:", err.message);
  process.exit(1);
});
