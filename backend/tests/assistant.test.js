const request = require('supertest');
const mongoose = require('mongoose');

// Mock nodemailer before importing server/app to prevent open handles and network SMTP calls
jest.mock('nodemailer', () => ({
  createTransport: () => ({
    verify: (cb) => cb(null, true),
    sendMail: () => Promise.resolve({ messageId: 'mock-id' })
  })
}));

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb+srv://flownest19:flownest19@cluster0.9fsqcsb.mongodb.net/flow_nest_test?appName=Cluster0';

// Save original key to restore
const originalKey = process.env.GEMINI_API_KEY;

const app = require('../server');

jest.setTimeout(30000);

describe('AI Assistant API Endpoints', () => {
  let token;
  const testUser = {
    name: 'Test AI User',
    email: `testai_${Date.now()}@example.com`,
    password: 'Password123'
  };

  beforeAll(async () => {
    // Wait/reconnect mongoose connection robustly
    while (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGO_URI, {
          serverSelectionTimeoutMS: 30000,
          maxPoolSize: 15,
        });
      } else {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Register and login to obtain a JWT token
    await request(app)
      .post('/api/auth/register')
      .send(testUser);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      });

    token = loginRes.body.token;
  });

  afterAll(async () => {
    // Restore original key
    process.env.GEMINI_API_KEY = originalKey;

    if (mongoose.connection.readyState !== 0) {
      try {
        const collections = Object.keys(mongoose.connection.collections);
        for (const colName of collections) {
          await mongoose.connection.collections[colName].deleteMany({});
        }
      } catch (err) {
        console.warn("Failed to clean up collections:", err.message);
      }
      await mongoose.connection.close();
    }
  });

  it('should call the AI Chat endpoint and return a valid action structure or fallback', async () => {
    const res = await request(app)
      .post('/api/tasks/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        message: 'Hello assistant! I need to plan my day.'
      });

    // If Gemini key is valid and succeeds, it should be 200.
    // If Gemini key fails, or quota limits hit, it might fall back.
    // Let's assert that it's either 200 (success) or 503 (service unavailable / fallback).
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('reply');
      expect(res.body).toHaveProperty('action');
    } else {
      expect(res.body).toHaveProperty('error', 'AI service unavailable');
    }
  });

  it('should return 503 AI service unavailable if GEMINI_API_KEY is empty', async () => {
    process.env.GEMINI_API_KEY = '';

    const res = await request(app)
      .post('/api/tasks/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        message: 'Hello assistant!'
      });

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('error', 'AI service unavailable');
  });

  it('should fail validation (400) if message is missing or too short', async () => {
    // Restore key for this test
    process.env.GEMINI_API_KEY = originalKey;

    const res = await request(app)
      .post('/api/tasks/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        message: ''
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });
});
