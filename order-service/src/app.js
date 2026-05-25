const express = require('express');
const morgan = require('morgan');
const axios = require('axios');
const { register, metricsMiddleware } = require('./middleware/metrics');
const ordersRouter = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 3001;
const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:3002';

// Middleware
app.use(morgan('combined'));
app.use(express.json());
app.use(metricsMiddleware);

// Health check - liveness
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'order-service', timestamp: new Date().toISOString() });
});

// Health check - readiness (checks if inventory service is reachable)
app.get('/readyz', async (req, res) => {
  try {
    await axios.get(`${INVENTORY_SERVICE_URL}/healthz`, { timeout: 3000 });
    res.status(200).json({
      status: 'ready',
      service: 'order-service',
      dependencies: {
        inventoryService: 'reachable',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      service: 'order-service',
      dependencies: {
        inventoryService: 'unreachable',
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
app.use(ordersRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`Order service listening on port ${PORT}`);
  console.log(`Inventory service URL: ${INVENTORY_SERVICE_URL}`);
});

module.exports = app;
