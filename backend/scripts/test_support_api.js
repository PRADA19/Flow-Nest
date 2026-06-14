const mongoose = require("mongoose");
const path = require("path");

const MONGO_URI = "mongodb://127.0.0.1:27017/flownest";
const API_URL = "http://localhost:5003/api";

const User = require("../models/User");
const SupportTicket = require("../models/SupportTicket");

async function run() {
  console.log("=== FlowNest Support API Integration Test ===");

  // Connect Mongoose to verify database state
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB for state verification.");

  // Clear previous test users/tickets if they exist
  const testEmail = `tester.${Date.now()}@example.com`;
  console.log(`Test Email: ${testEmail}`);

  // 1. Register a test user
  console.log("\n1. Registering test user...");
  const registerRes = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Support Tester",
      email: testEmail,
      password: "securepassword123"
    })
  });
  
  const registerData = await registerRes.json();
  if (!registerRes.ok) {
    throw new Error(`Registration failed: ${JSON.stringify(registerData)}`);
  }
  console.log("Registration Response:", registerData);

  // 2. Login to get JWT token
  console.log("\n2. Logging in test user...");
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: testEmail,
      password: "securepassword123"
    })
  });

  const loginData = await loginRes.json();
  if (!loginRes.ok) {
    throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  }
  const token = loginData.token;
  console.log("Login successful. Token retrieved.");

  // Retrieve user document to match IDs later
  const userDoc = await User.findOne({ email: testEmail });
  if (!userDoc) {
    throw new Error("Could not find user document in database!");
  }
  console.log(`Test User MongoDB ID: ${userDoc._id}`);

  // 3. Submit a general support contact ticket
  console.log("\n3. Posting to /api/support/contact...");
  const contactRes = await fetch(`${API_URL}/support/contact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      subject: "Mongoose Sync Failed",
      category: "billing",
      message: "The application is failing to sync tasks on dashboard reload."
    })
  });
  const contactData = await contactRes.json();
  console.log("Contact API Response:", contactData);
  if (!contactRes.ok) throw new Error("Contact ticket submission failed.");

  // 4. Submit a bug report
  console.log("\n4. Posting to /api/support/bug...");
  const bugRes = await fetch(`${API_URL}/support/bug`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      title: "UI Rendering Lag in Safari",
      severity: "medium",
      steps: "1. Open focus garden\n2. Rapidly toggle items\n3. Observed freeze"
    })
  });
  const bugData = await bugRes.json();
  console.log("Bug API Response:", bugData);
  if (!bugRes.ok) throw new Error("Bug report submission failed.");

  // 5. Submit a feature request
  console.log("\n5. Posting to /api/support/feature...");
  const featureRes = await fetch(`${API_URL}/support/feature`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      title: "Calendar drag & drop support",
      description: "Ability to reschedule tasks by dragging them in calendar view."
    })
  });
  const featureData = await featureRes.json();
  console.log("Feature API Response:", featureData);
  if (!featureRes.ok) throw new Error("Feature request submission failed.");

  // 6. Verify MongoDB persistence
  console.log("\n6. Verifying MongoDB persistence of support tickets...");
  const tickets = await SupportTicket.find({ userId: userDoc._id });
  console.log(`Found ${tickets.length} tickets saved for User ID ${userDoc._id}:`);
  tickets.forEach(ticket => {
    console.log(`- Type: ${ticket.type} | Title: ${ticket.title} | Status: ${ticket.status} | CreatedAt: ${ticket.createdAt}`);
  });

  if (tickets.length !== 3) {
    throw new Error(`Expected 3 tickets, but found ${tickets.length} in database.`);
  }

  // 7. Clean up
  console.log("\n7. Cleaning up test data...");
  await SupportTicket.deleteMany({ userId: userDoc._id });
  await User.deleteOne({ _id: userDoc._id });
  console.log("Database cleaned up successfully.");

  await mongoose.disconnect();
  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! MongoDB persistence verified. 🎉");
}

run().catch(async (err) => {
  console.error("\n❌ TEST FAILED:", err.message);
  await mongoose.disconnect();
  process.exit(1);
});
