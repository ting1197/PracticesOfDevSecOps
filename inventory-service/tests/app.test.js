const request = require('supertest');

// Mock pg before importing app to prevent real DB connections and open handles
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    on: jest.fn(),
    end: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

const app = require('../src/app');

describe('Inventory Service Health Check', () => {
  it('should return 200 for /healthz', async () => {
    const response = await request(app).get('/healthz');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('inventory-service');
  });
});
