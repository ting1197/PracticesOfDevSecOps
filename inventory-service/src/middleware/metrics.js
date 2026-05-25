const client = require('prom-client');

// Create a custom registry
const register = new client.Registry();

// Collect default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// HTTP request counter
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// HTTP request duration histogram
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 5, 10],
  registers: [register],
});

// Database query duration histogram
const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['query'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// Inventory stock level gauge
const inventoryStockLevel = new client.Gauge({
  name: 'inventory_stock_level',
  help: 'Current stock level for each product',
  labelNames: ['product_id', 'product_name'],
  registers: [register],
});

// Function to update stock gauge from DB periodically
async function updateStockGauge(pool) {
  try {
    const result = await pool.query('SELECT id, name, stock FROM products');
    result.rows.forEach((product) => {
      inventoryStockLevel.set(
        { product_id: String(product.id), product_name: product.name },
        product.stock
      );
    });
  } catch (err) {
    console.error('Error updating stock gauge:', err.message);
  }
}

// Middleware to track HTTP metrics
function metricsMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;

    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode,
    });

    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode,
      },
      duration
    );
  });

  next();
}

module.exports = {
  register,
  metricsMiddleware,
  httpRequestsTotal,
  httpRequestDuration,
  dbQueryDuration,
  inventoryStockLevel,
  updateStockGauge,
};
