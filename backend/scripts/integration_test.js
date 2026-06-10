const { spawn } = require("child_process");
const path = require("path");
require(path.join(__dirname, "..", "node_modules", "dotenv")).config({ path: path.join(__dirname, "..", ".env") });

const PORT = 5004;
const BASE_URL = `http://localhost:${PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log("=========================================");
  console.log("SMARTTODO INTEGRATION TEST RUNNER");
  console.log("=========================================");

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("🚨 MONGO_URI is missing from environment. Cannot run tests.");
    process.exit(1);
  }

  // 1. Spin up server on port 5004
  console.log(`📡 Starting backend server on port ${PORT}...`);
  const serverProcess = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "pipe"
  });

  let serverStarted = false;
  serverProcess.stdout.on("data", (data) => {
    const output = data.toString();
    console.log(`[Server] ${output.trim()}`);
    if (output.includes(`SmartTodo Backend running on port ${PORT}`)) {
      serverStarted = true;
    }
  });

  serverProcess.stderr.on("data", (data) => {
    console.error(`[Server Error] ${data.toString().trim()}`);
  });

  // Wait for server to start (up to 8 seconds)
  for (let i = 0; i < 8; i++) {
    if (serverStarted) break;
    await wait(1000);
  }

  if (!serverStarted) {
    console.warn("⚠️ Server start output not matched, proceeding to check connection...");
  }

  let exitCode = 0;
  try {
    // Phase 1: Health check
    console.log("\n--- PHASE 1: health check ---");
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    console.log("Response status:", healthRes.status);
    if (healthRes.status !== 200) throw new Error("Health check failed");
    const healthData = await healthRes.json();
    console.log("✓ Health Check Passed:", JSON.stringify(healthData));

    // Check database connection state from health response
    if (healthData.database === "unavailable") {
      throw new Error("Database is unavailable according to health check");
    }
    console.log(`✓ Database Status: ${healthData.database}`);

    // Phase 2: User registration
    console.log("\n--- PHASE 2: User registration ---");
    const randomId = Math.floor(Math.random() * 1000000);
    const testUser = {
      name: `Auditor_${randomId}`,
      email: `audit_${randomId}@smarttodo.test`,
      password: "strong_password_123"
    };

    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser)
    });
    const regData = await regRes.json();
    console.log("Registration Status:", regRes.status, regData);
    if (regRes.status !== 201) throw new Error("Registration failed");
    console.log("✓ User Registration Passed");

    // Phase 3: User login
    console.log("\n--- PHASE 3: User login ---");
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testUser.email, password: testUser.password })
    });
    const loginData = await loginRes.json();
    console.log("Login Status:", loginRes.status);
    if (loginRes.status !== 200 || !loginData.token) {
      throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }
    const token = loginData.token;
    console.log("✓ User Login Passed, Token retrieved");

    const authHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };

    // Phase 4: Create Task (CRUD)
    console.log("\n--- PHASE 4: Create Task ---");
    const taskPayload = {
      title: "E2E Integration Task",
      priority: "high",
      tags: ["audit"]
    };
    const createRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(taskPayload)
    });
    const taskData = await createRes.json();
    console.log("Create Task Status:", createRes.status, taskData);
    if (createRes.status !== 201 || !taskData._id) {
      throw new Error("Create task failed");
    }
    const taskId = taskData._id;
    console.log("✓ Create Task Passed (ID:", taskId, ")");

    // Phase 5: Read Task (CRUD)
    console.log("\n--- PHASE 5: Read Tasks ---");
    const readRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: "GET",
      headers: authHeaders
    });
    const tasks = await readRes.json();
    console.log("Read Tasks Status:", readRes.status, "Count:", tasks.length);
    if (readRes.status !== 200) throw new Error("Read tasks failed");
    const foundTask = tasks.find(t => t._id === taskId);
    if (!foundTask) throw new Error("Created task not returned in task list");
    console.log("✓ Read Tasks Passed");

    // Phase 6: Update Task (CRUD)
    console.log("\n--- PHASE 6: Update Task ---");
    const updateRes = await fetch(`${BASE_URL}/api/tasks/${taskId}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ completed: true })
    });
    const updateData = await updateRes.json();
    console.log("Update Task Status:", updateRes.status, "Completed:", updateData.completed);
    if (updateRes.status !== 200 || !updateData.completed) {
      throw new Error("Update task failed");
    }
    console.log("✓ Update Task Passed");

    // Phase 7: Delete Task (CRUD)
    console.log("\n--- PHASE 7: Delete Task ---");
    const deleteRes = await fetch(`${BASE_URL}/api/tasks/${taskId}`, {
      method: "DELETE",
      headers: authHeaders
    });
    const deleteData = await deleteRes.json();
    console.log("Delete Task Status:", deleteRes.status, deleteData);
    if (deleteRes.status !== 200) throw new Error("Delete task failed");
    console.log("✓ Delete Task Passed");

    // Phase 8: AI Assistant Chat
    console.log("\n--- PHASE 8: AI Assistant Chat ---");
    console.log("Sending chat prompt: 'Create a task called Study Python'...");
    const aiRes = await fetch(`${BASE_URL}/api/tasks/ai/chat`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ message: "Create a task called Study Python" })
    });
    const aiData = await aiRes.json();
    console.log("AI Chat Status:", aiRes.status);
    console.log("AI Chat Reply:", aiData.reply);
    console.log("AI Chat Action:", JSON.stringify(aiData.action));
    if (aiRes.status !== 200 || !aiData.reply || !aiData.action) {
      throw new Error(`AI Chat failed: ${JSON.stringify(aiData)}`);
    }
    if (aiData.action.type !== "create_task") {
      console.warn("⚠️ AI action type is not 'create_task'. Got:", aiData.action.type);
    }
    console.log("✓ AI Assistant Chat Passed");

    console.log("\n=========================================");
    console.log("🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!");
    console.log("=========================================");
  } catch (err) {
    console.error("\n❌ INTEGRATION TEST FAILED:", err.message);
    exitCode = 1;
  } finally {
    console.log("\n🛑 Stopping backend server...");
    serverProcess.kill();
    await wait(2000);
    process.exit(exitCode);
  }
}

runTests();
