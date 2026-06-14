const mongoose = require("mongoose");
const path = require("path");
const { spawn } = require("child_process");
const bcrypt = require("bcryptjs");

const MONGO_URI = "mongodb://127.0.0.1:27017/flownest";
const API_URL = "http://localhost:5003/api";

const User = require("../models/User");
const PasswordResetToken = require("../models/PasswordResetToken");

async function run() {
  console.log("=== FlowNest Password Reset API Integration Test ===");

  // Connect Mongoose for direct database checks
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.");

  const testEmail = "reset.tester@example.com";

  // Clear previous test records
  console.log("Cleaning up old test users & tokens...");
  const oldUser = await User.findOne({ email: testEmail });
  if (oldUser) {
    await PasswordResetToken.deleteMany({ userId: oldUser._id });
    await User.deleteOne({ _id: oldUser._id });
  }

  // Create test user with original password
  const originalPassword = "originalpassword123";
  const hashedPassword = await bcrypt.hash(originalPassword, 10);
  const testUser = new User({
    name: "Reset Tester",
    email: testEmail,
    password: hashedPassword,
    xp: 0,
    level: 1,
    streak: 0
  });
  await testUser.save();
  console.log(`Test User created with ID: ${testUser._id}`);

  // Spawn backend server process
  console.log("Spawning backend server on port 5003...");
  const server = spawn("node", ["server.js"], { cwd: path.join(__dirname, "..") });

  // Await server startup
  await new Promise((resolve) => {
    server.stdout.on("data", (data) => {
      const output = data.toString();
      if (output.includes("SmartTodo Backend running")) {
        resolve();
      }
    });
    // Fallback timer
    setTimeout(resolve, 3000);
  });
  console.log("Backend server is online.");

  try {
    // 1. Trigger forgot-password endpoint
    console.log("\n1. Testing POST /api/auth/forgot-password...");
    const forgotRes = await fetch(`${API_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail })
    });
    
    const forgotData = await forgotRes.json();
    console.log("Response:", forgotData);
    if (!forgotRes.ok) throw new Error("Forgot password request failed.");

    // Retrieve generated token from database
    const resetTokenDoc = await PasswordResetToken.findOne({ userId: testUser._id });
    if (!resetTokenDoc) {
      throw new Error("Reset token was not created in MongoDB!");
    }
    console.log(`Token successfully persisted in database: ${resetTokenDoc.token}`);

    // 2. Reject invalid token
    console.log("\n2. Testing POST /api/auth/reset-password (Invalid Token)...");
    const invalidRes = await fetch(`${API_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "invalid_token_signature_here",
        password: "newpassword123"
      })
    });
    const invalidData = await invalidRes.json();
    console.log("Response (Expected 400):", invalidRes.status, invalidData);
    if (invalidRes.status !== 400 || !invalidData.error.includes("Invalid or expired")) {
      throw new Error("Should have rejected invalid token with 400");
    }

    // 3. Reject expired token
    console.log("\n3. Testing POST /api/auth/reset-password (Expired Token)...");
    // Manually set token expiration in database to 10 seconds ago
    resetTokenDoc.expiresAt = new Date(Date.now() - 10000);
    await resetTokenDoc.save();

    const expiredRes = await fetch(`${API_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: resetTokenDoc.token,
        password: "newpassword123"
      })
    });
    const expiredData = await expiredRes.json();
    console.log("Response (Expected 400):", expiredRes.status, expiredData);
    if (expiredRes.status !== 400 || !expiredData.error.includes("Invalid or expired")) {
      throw new Error("Should have rejected expired token with 400");
    }

    // Verify token is deleted upon expired request attempt
    const expiredDoc = await PasswordResetToken.findOne({ token: resetTokenDoc.token });
    if (expiredDoc) {
      throw new Error("Expired token was not removed from the database.");
    }
    console.log("Expired token document was successfully cleaned from DB.");

    // 4. Reset Password successfully
    console.log("\n4. Testing POST /api/auth/reset-password (Successful Reset)...");
    // Generate a fresh token manually in database
    const freshToken = "freshtoken123456789";
    const freshTokenDoc = new PasswordResetToken({
      userId: testUser._id,
      token: freshToken,
      expiresAt: new Date(Date.now() + 3600000)
    });
    await freshTokenDoc.save();

    const newPassword = "newpassword123";
    const successRes = await fetch(`${API_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: freshToken,
        password: newPassword
      })
    });
    const successData = await successRes.json();
    console.log("Response (Expected 200):", successRes.status, successData);
    if (!successRes.ok) throw new Error("Valid password reset failed.");

    // 5. Invalidation / One-time use check
    console.log("\n5. Testing Token Invalidation / One-time use...");
    const searchTokenDoc = await PasswordResetToken.findOne({ token: freshToken });
    if (searchTokenDoc) {
      throw new Error("Reset token was not deleted after use!");
    }
    console.log("Success. Token has been deleted/invalidated.");

    // Retrying same token should fail
    const retryRes = await fetch(`${API_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: freshToken,
        password: "anotherpassword123"
      })
    });
    console.log("Retry Response (Expected 400):", retryRes.status);
    if (retryRes.status !== 400) throw new Error("Retry with same token should have failed.");

    // 6. Login check after reset
    console.log("\n6. Verifying login with old and new credentials...");
    // Login with old password (should fail)
    const oldLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: originalPassword
      })
    });
    console.log("Old password login response (Expected 400):", oldLoginRes.status);
    if (oldLoginRes.status !== 400) throw new Error("Login with old password should have been blocked.");

    // Login with new password (should succeed)
    const newLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: newPassword
      })
    });
    const newLoginData = await newLoginRes.json();
    console.log("New password login response (Expected 200):", newLoginRes.status);
    if (!newLoginRes.ok || !newLoginData.token) {
      throw new Error("Login with new password failed.");
    }
    console.log("Login successful. JWT retrieved.");

    // Clean up
    console.log("\nCleaning up test user & tokens...");
    await PasswordResetToken.deleteMany({ userId: testUser._id });
    await User.deleteOne({ _id: testUser._id });
    console.log("Test user database records cleaned up.");

    console.log("\n🎉 ALL PASSWORD RESET TESTS PASSED SUCCESSFULLY! 🎉");

  } catch (err) {
    console.error("\n❌ TEST FAILED:", err.message);
    // Ensure child process is killed and Mongoose disconnected
    server.kill();
    await mongoose.disconnect();
    process.exit(1);
  }

  // Shut down server and mongoose
  server.kill();
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
