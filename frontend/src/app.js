const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const morgan = require('morgan');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:3001';
const HOSTNAME = process.env.HOSTNAME || 'unknown-pod';

// ---------------------
// Prometheus Metrics
// ---------------------
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ---------------------
// Middleware
// ---------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(morgan('combined'));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'shopk8s-secret-key-change-in-prod',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
  })
);

// Prometheus metrics middleware
app.use((req, res, next) => {
  if (req.path === '/metrics' || req.path === '/healthz' || req.path === '/readyz') {
    return next();
  }
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    httpRequestsTotal.inc(labels);
    end(labels);
  });
  next();
});

// Make session cart and hostname available to all views
app.use((req, res, next) => {
  if (!req.session.cart) {
    req.session.cart = [];
  }
  res.locals.cart = req.session.cart;
  res.locals.hostname = HOSTNAME;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

// ---------------------
// Health Check Endpoints
// ---------------------
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/readyz', async (req, res) => {
  try {
    await axios.get(`${ORDER_SERVICE_URL}/healthz`, { timeout: 3000 });
    res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch {
    // Still report ready even if order service is down — frontend can still serve cached/static pages
    res.status(200).json({
      status: 'ready',
      warning: 'order-service unreachable',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------
// Prometheus Metrics Endpoint
// ---------------------
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// ---------------------
// Routes
// ---------------------

// GET / — Product list page
app.get('/', async (req, res) => {
  try {
    const response = await axios.get(`${ORDER_SERVICE_URL}/api/products`, { timeout: 5000 });
    const products = response.data;
    res.render('index', { products, title: 'Products' });
  } catch (err) {
    console.error('Error fetching products:', err.message);
    res.render('index', { products: [], title: 'Products', error: 'Unable to load products. The product service may be unavailable.' });
  }
});

// GET /product/:id — Product detail page
app.get('/product/:id', async (req, res) => {
  try {
    const response = await axios.get(`${ORDER_SERVICE_URL}/api/products/${req.params.id}`, { timeout: 5000 });
    const product = response.data;
    res.render('product', { product, title: product.name });
  } catch (err) {
    console.error('Error fetching product:', err.message);
    res.status(404).render('error', {
      title: 'Product Not Found',
      message: 'The product you are looking for could not be found.',
      statusCode: 404,
    });
  }
});

// POST /cart/add — Add item to cart
app.post('/cart/add', async (req, res) => {
  try {
    const { productId, productName, price, quantity } = req.body;
    const qty = parseInt(quantity) || 1;
    const existingItem = req.session.cart.find((item) => item.productId === productId);

    if (existingItem) {
      existingItem.quantity += qty;
    } else {
      req.session.cart.push({
        productId,
        productName,
        price: parseFloat(price),
        quantity: qty,
      });
    }

    req.session.flash = { type: 'success', message: `${productName} added to cart!` };
    res.redirect('back');
  } catch (err) {
    console.error('Error adding to cart:', err.message);
    req.session.flash = { type: 'error', message: 'Failed to add item to cart.' };
    res.redirect('back');
  }
});

// GET /cart — View cart
app.get('/cart', (req, res) => {
  const cart = req.session.cart || [];
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  res.render('cart', { cart, total, title: 'Shopping Cart' });
});

// POST /cart/remove — Remove item from cart
app.post('/cart/remove', (req, res) => {
  const { productId } = req.body;
  req.session.cart = req.session.cart.filter((item) => item.productId !== productId);
  req.session.flash = { type: 'success', message: 'Item removed from cart.' };
  res.redirect('/cart');
});

// POST /checkout — Submit order
app.post('/checkout', async (req, res) => {
  try {
    const cart = req.session.cart || [];
    if (cart.length === 0) {
      req.session.flash = { type: 'error', message: 'Your cart is empty.' };
      return res.redirect('/cart');
    }

    const orderData = {
      items: cart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    };

    const response = await axios.post(`${ORDER_SERVICE_URL}/api/orders`, orderData, { timeout: 10000 });

    // Clear cart after successful order
    req.session.cart = [];
    req.session.flash = {
      type: 'success',
      message: `Order #${response.data.id || response.data.orderId || 'N/A'} placed successfully!`,
    };
    res.redirect('/orders');
  } catch (err) {
    console.error('Error placing order:', err.message);
    const errorMsg = err.response?.data?.error || 'Failed to place order. Please try again.';
    req.session.flash = { type: 'error', message: errorMsg };
    res.redirect('/cart');
  }
});

// GET /orders — View all orders
app.get('/orders', async (req, res) => {
  try {
    const response = await axios.get(`${ORDER_SERVICE_URL}/api/orders`, { timeout: 5000 });
    const orders = response.data;
    res.render('orders', { orders, title: 'My Orders' });
  } catch (err) {
    console.error('Error fetching orders:', err.message);
    res.render('orders', { orders: [], title: 'My Orders', error: 'Unable to load orders.' });
  }
});

// ---------------------
// 404 Handler
// ---------------------
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page Not Found',
    message: 'The page you are looking for does not exist.',
    statusCode: 404,
  });
});

// ---------------------
// Error Handler
// ---------------------
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).render('error', {
    title: 'Server Error',
    message: 'Something went wrong on our end. Please try again later.',
    statusCode: 500,
  });
});

// ---------------------
// Start Server
// ---------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🛒 ShopK8s Frontend running on port ${PORT}`);
    console.log(`   Pod hostname: ${HOSTNAME}`);
    console.log(`   Order service: ${ORDER_SERVICE_URL}`);
  });
}

module.exports = app;
