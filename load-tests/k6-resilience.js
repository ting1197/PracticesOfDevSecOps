import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Custom metrics
const errorRate = new Rate('error_rate');
const responseDuration = new Trend('response_duration');

export const options = {
  // Long-running test to allow manual pod killing during execution
  scenarios: {
    constant_load: {
      executor: 'constant-vus',
      vus: 20,
      duration: '3m',  // Run for 3 minutes - kill pods during this time
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],  // More lenient for resilience test
    error_rate: ['rate<0.15'],          // Allow up to 15% errors during pod restart
  },
};

export default function () {
  // Continuously hit the frontend
  const res = http.get(`${BASE_URL}/`, {
    timeout: '10s',
  });

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 3s': (r) => r.timings.duration < 3000,
    'body is not empty': (r) => r.body && r.body.length > 0,
  });

  errorRate.add(!success);
  responseDuration.add(res.timings.duration);

  if (!success) {
    console.log(`ERROR: status=${res.status} duration=${res.timings.duration}ms`);
  }

  sleep(0.5);
}

// Instructions for resilience testing:
// 1. Start this K6 test: k6 run load-tests/k6-resilience.js
// 2. In another terminal, kill a frontend pod:
//    kubectl delete pod -l app=frontend -n ecommerce --field-selector=status.phase=Running | head -1
// 3. Observe K6 metrics - errors should be temporary
// 4. Check Kubernetes auto-restarts the pod:
//    kubectl get pods -n ecommerce -l app=frontend -w
