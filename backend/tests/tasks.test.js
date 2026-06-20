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

describe('Tasks API Endpoints', () => {
  let token;
  let taskId;
  const testUser = {
    name: 'Test Task User',
    email: `testtask_${Date.now()}@example.com`,
    password: 'Password123'
  };

  beforeAll(async () => {
    // Wait/reconnect mongoose connection
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 30000,
        maxPoolSize: 15,
      });
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

  it('should create a new task successfully', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Learn Jest & Supertest',
        priority: 'high',
        tags: ['Study'],
        dueDate: new Date(Date.now() + 86400000).toISOString()
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('_id');
    expect(res.body).toHaveProperty('title', 'Learn Jest & Supertest');
    expect(res.body).toHaveProperty('priority', 'high');
    expect(res.body.tags).toContain('Study');
    taskId = res.body._id;
  });

  it('should retrieve list of tasks for the authenticated user', async () => {
    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('should edit/update the task details successfully', async () => {
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Master Jest & Supertest Testing',
        priority: 'medium',
        tags: ['Study', 'Work']
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('title', 'Master Jest & Supertest Testing');
    expect(res.body).toHaveProperty('priority', 'medium');
    expect(res.body.tags).toContain('Work');
  });

  it('should complete the task and award XP', async () => {
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        completed: true
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('completed', true);
    expect(res.body).toHaveProperty('gamification');
    expect(res.body.gamification).toHaveProperty('xpEarned');
  });

  it('should delete the task successfully', async () => {
    const res = await request(app)
      .delete(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Deleted');
  });
});
