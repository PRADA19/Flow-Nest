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

const app = require('../server');

jest.setTimeout(30000);

describe('Auth API Endpoints', () => {
  const testUser = {
    name: 'Test Auth User',
    email: `testauth_${Date.now()}@example.com`,
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
  });

  afterAll(async () => {
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

  it('should register a new user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('message');
  });

  it('should not register a user with an already registered email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Email already registered');
  });

  it('should not register a user with invalid inputs (short password)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Short Pwd',
        email: 'short@example.com',
        password: '123'
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  it('should login user and return a JWT token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('email', testUser.email.toLowerCase());
  });

  it('should not login with incorrect password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: 'WrongPassword'
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid credentials');
  });
});
