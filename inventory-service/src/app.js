const express = require('express');
const morgan = require('morgan');
const { Pool } = require('pg');
const { register, metricsMiddleware, updateStockGauge } = require('./middleware/metrics');
const createInventoryRouter = require('./routes/inventory');

const app = express();
const PORT = process.env.PORT || 3002;

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'ecommerce',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Log pool errors
pool.on('error', (err) => {
  console.error('Unexpected pool error:', err.message);
});

// Middleware
app.use(morgan('combined'));
app.use(express.json());
app.use(metricsMiddleware);

// Health check - liveness
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'inventory-service', timestamp: new Date().toISOString() });
});

// Health check - readiness (checks DB connection)
app.get('/readyz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({
      status: 'ready',
      service: 'inventory-service',
      dependencies: {
        database: 'connected',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      service: 'inventory-service',
      dependencies: {
        database: 'disconnected',
      },
      error: error.message,
    });
  }
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error.message);
  }
});

// Routes
app.use(createInventoryRouter(pool));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Update stock gauge periodically (every 30 seconds)
const stockGaugeInterval = setInterval(() => updateStockGauge(pool), 30000);

// Initial stock gauge update
updateStockGauge(pool).catch((err) => {
  console.error('Initial stock gauge update failed:', err.message);
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Inventory service listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  clearInterval(stockGaugeInterval);

  server.close(async () => {
    console.log('HTTP server closed');
    try {
      await pool.end();
      console.log('Database pool closed');
    } catch (err) {
      console.error('Error closing database pool:', err.message);
    }
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

module.exports = app;
