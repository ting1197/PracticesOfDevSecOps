const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { ordersTotal, orderProcessingDuration } = require('../middleware/metrics');

const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:3002';

// GET /api/products - Proxy to inventory service
router.get('/api/products', async (req, res) => {
  try {
    const response = await axios.get(`${INVENTORY_SERVICE_URL}/api/inventory`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching products:', error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(503).json({ error: 'Inventory service unavailable' });
    }
  }
});

// GET /api/products/:id - Proxy to inventory service
router.get('/api/products/:id', async (req, res) => {
  try {
    const response = await axios.get(`${INVENTORY_SERVICE_URL}/api/inventory/${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching product ${req.params.id}:`, error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(503).json({ error: 'Inventory service unavailable' });
    }
  }
});

// POST /api/orders - Create order with saga pattern
router.post('/api/orders', async (req, res) => {
  const end = orderProcessingDuration.startTimer();
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    ordersTotal.inc({ status: 'failed' });
    end();
    return res.status(400).json({ error: 'Items array is required and must not be empty' });
  }

  const orderId = uuidv4();
  const reservations = [];

  try {
    // Step 1: Reserve stock for each item
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        throw new Error(`Invalid item: productId and positive quantity are required`);
      }

      const reservationId = uuidv4();
      try {
        await axios.post(`${INVENTORY_SERVICE_URL}/api/inventory/reserve`, {
          productId: item.productId,
          quantity: item.quantity,
          reservationId,
        });

        reservations.push({
          reservationId,
          productId: item.productId,
          quantity: item.quantity,
        });
      } catch (error) {
        const errorMsg = error.response
          ? error.response.data.error || error.response.data.message || 'Reservation failed'
          : 'Inventory service unavailable';
        throw new Error(`Failed to reserve product ${item.productId}: ${errorMsg}`);
      }
    }

    // Step 2: Confirm all reservations
    for (const reservation of reservations) {
      try {
        await axios.post(`${INVENTORY_SERVICE_URL}/api/inventory/confirm`, {
          reservationId: reservation.reservationId,
        });
      } catch (error) {
        console.error(`Failed to confirm reservation ${reservation.reservationId}:`, error.message);
        // Continue confirming others even if one fails
      }
    }

    // Step 3: Get product details for order total
    let totalAmount = 0;
    const orderItems = [];

    for (const reservation of reservations) {
      try {
        const productResponse = await axios.get(
          `${INVENTORY_SERVICE_URL}/api/inventory/${reservation.productId}`
        );
        const product = productResponse.data;
        const itemTotal = product.price * reservation.quantity;
        totalAmount += itemTotal;

        orderItems.push({
          productId: reservation.productId,
          quantity: reservation.quantity,
          price: product.price,
          name: product.name,
        });
      } catch (error) {
        console.error(`Failed to get product ${reservation.productId} details:`, error.message);
        orderItems.push({
          productId: reservation.productId,
          quantity: reservation.quantity,
          price: 0,
          name: 'Unknown',
        });
      }
    }

    // Step 4: Save order via inventory service
    try {
      await axios.post(`${INVENTORY_SERVICE_URL}/api/orders/save`, {
        orderId,
        totalAmount,
        items: orderItems,
      });
    } catch (error) {
      console.error('Failed to save order:', error.message);
      // Order was still processed, just not saved
    }

    ordersTotal.inc({ status: 'success' });
    end();

    res.status(201).json({
      id: orderId,
      status: 'confirmed',
      items: orderItems,
      totalAmount: Math.round(totalAmount * 100) / 100,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    // Compensate: release all successful reservations
    console.error('Order creation failed, releasing reservations:', error.message);

    for (const reservation of reservations) {
      try {
        await axios.post(`${INVENTORY_SERVICE_URL}/api/inventory/release`, {
          reservationId: reservation.reservationId,
          productId: reservation.productId,
          quantity: reservation.quantity,
        });
        console.log(`Released reservation ${reservation.reservationId}`);
      } catch (releaseError) {
        console.error(
          `Failed to release reservation ${reservation.reservationId}:`,
          releaseError.message
        );
      }
    }

    ordersTotal.inc({ status: 'failed' });
    end();

    res.status(error.message.includes('Insufficient') || error.message.includes('409') ? 409 : 500).json({
      error: 'Order creation failed',
      message: error.message,
    });
  }
});

// GET /api/orders - List all orders
router.get('/api/orders', async (req, res) => {
  try {
    const response = await axios.get(`${INVENTORY_SERVICE_URL}/api/orders`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching orders:', error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(503).json({ error: 'Inventory service unavailable' });
    }
  }
});

// GET /api/orders/:id - Get order details
router.get('/api/orders/:id', async (req, res) => {
  try {
    const response = await axios.get(`${INVENTORY_SERVICE_URL}/api/orders/${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching order ${req.params.id}:`, error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(503).json({ error: 'Inventory service unavailable' });
    }
  }
});

module.exports = router;
