const request = require('supertest');
const app = require('../src/app');

describe('Order Service Health Check', () => {
  it('should return 200 for /healthz', async () => {
    const response = await request(app).get('/healthz');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('order-service');
  });
});
