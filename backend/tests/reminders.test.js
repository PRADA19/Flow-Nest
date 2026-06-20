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
process.env.CRON_SECRET = 'flownest_cron_secure_token_19';

const app = require('../server');

jest.setTimeout(30000);

describe('Reminders API Endpoints', () => {
  beforeAll(async () => {
    // Wait/reconnect mongoose connection
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 30000,
        maxPoolSize: 15,
      });
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

  it('should return 403 when processing reminders without the cron secret header', async () => {
    const res = await request(app)
      .get('/api/reminders/process');

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden: Invalid cron secret header');
  });

  it('should return 403 when processing reminders with an invalid cron secret header', async () => {
    const res = await request(app)
      .get('/api/reminders/process')
      .set('x-cron-secret', 'wrong_secret');

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden: Invalid cron secret header');
  });

  it('should process reminders successfully with the correct cron secret header', async () => {
    const res = await request(app)
      .get('/api/reminders/process')
      .set('x-cron-secret', process.env.CRON_SECRET);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'success');
    expect(res.body).toHaveProperty('summary');
  });
});
