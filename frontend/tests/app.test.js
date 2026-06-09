const request = require('supertest');
const app = require('../src/app');

describe('Frontend Health Check', () => {
  it('should return 200 for /healthz', async () => {
    const response = await request(app).get('/healthz');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
