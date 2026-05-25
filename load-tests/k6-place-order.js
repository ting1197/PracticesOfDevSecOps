import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Custom metrics
const orderSuccessRate = new Rate('order_success_rate');
const ordersFailed = new Counter('orders_failed');
const ordersSucceeded = new Counter('orders_succeeded');
const checkoutDuration = new Trend('checkout_duration');

export const options = {
  scenarios: {
    // Flash sale / spike scenario
    flash_sale: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 100,
      stages: [
        { duration: '10s', target: 5 },   // Warm up
        { duration: '20s', target: 30 },   // Spike
        { duration: '30s', target: 50 },   // Peak (flash sale)
        { duration: '20s', target: 10 },   // Cool down
        { duration: '10s', target: 0 },    // Drain
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    order_success_rate: ['rate>0.8'],
    http_req_failed: ['rate<0.2'],
  },
};

export default function () {
  // Simulate: browse -> add to cart -> checkout
  group('Flash Sale Order Flow', () => {
    // Step 1: Browse products
    const browseRes = http.get(`${BASE_URL}/`);
    check(browseRes, { 'browse ok': (r) => r.status === 200 });

    sleep(0.5);

    // Step 2: Add random product to cart
    const productId = Math.floor(Math.random() * 10) + 1;
    const addRes = http.post(`${BASE_URL}/cart/add`, 
      JSON.stringify({ productId: productId, quantity: 1 }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    sleep(0.3);

    // Step 3: Checkout
    const start = Date.now();
    const checkoutRes = http.post(`${BASE_URL}/checkout`, null, {
      headers: { 'Content-Type': 'application/json' },
      redirects: 0, // Don't follow redirects
    });
    checkoutDuration.add(Date.now() - start);

    const success = check(checkoutRes, {
      'checkout succeeded': (r) => r.status === 200 || r.status === 302,
    });

    if (success) {
      ordersSucceeded.add(1);
    } else {
      ordersFailed.add(1);
    }
    orderSuccessRate.add(success);
  });

  sleep(Math.random() * 1);
}
