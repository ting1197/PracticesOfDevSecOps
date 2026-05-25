import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Custom metrics
const errorRate = new Rate('error_rate');
const productListDuration = new Trend('product_list_duration');

export const options = {
  scenarios: {
    // Scenario 1: Single frontend (baseline)
    single_frontend: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 10 },
        { duration: '30s', target: 25 },
        { duration: '30s', target: 50 },
        { duration: '15s', target: 0 },
      ],
      tags: { scenario: 'browse' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.05'],
    error_rate: ['rate<0.05'],
  },
};

export default function () {
  group('Browse Products', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/`);
    productListDuration.add(Date.now() - start);
    
    const success = check(res, {
      'status is 200': (r) => r.status === 200,
      'page contains products': (r) => r.body.includes('product') || r.body.includes('Product'),
      'response time < 500ms': (r) => r.timings.duration < 500,
    });
    errorRate.add(!success);
  });

  group('View Product Detail', () => {
    const productId = Math.floor(Math.random() * 10) + 1;
    const res = http.get(`${BASE_URL}/product/${productId}`);
    
    check(res, {
      'product detail status 200': (r) => r.status === 200,
    });
  });

  sleep(Math.random() * 2 + 0.5); // Random 0.5-2.5s think time
}
