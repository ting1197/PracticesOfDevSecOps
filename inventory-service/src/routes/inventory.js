const express = require('express');
const router = express.Router();
const { dbQueryDuration } = require('../middleware/metrics');

module.exports = function createInventoryRouter(pool) {
  // GET /api/inventory - List all products with stock levels
  router.get('/api/inventory', async (req, res) => {
    const end = dbQueryDuration.startTimer({ query: 'select_all_products' });
    try {
      const result = await pool.query(
        'SELECT id, name, description, price, stock, image_url, created_at FROM products ORDER BY id'
      );
      end();
      res.json(result.rows);
    } catch (error) {
      end();
      console.error('Error fetching inventory:', error.message);
      res.status(500).json({ error: 'Failed to fetch inventory' });
    }
  });

  // GET /api/inventory/:id - Get single product
  router.get('/api/inventory/:id', async (req, res) => {
    const end = dbQueryDuration.startTimer({ query: 'select_product_by_id' });
    try {
      const result = await pool.query(
        'SELECT id, name, description, price, stock, image_url, created_at FROM products WHERE id = $1',
        [req.params.id]
      );
      end();

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      end();
      console.error(`Error fetching product ${req.params.id}:`, error.message);
      res.status(500).json({ error: 'Failed to fetch product' });
    }
  });

  // POST /api/inventory/reserve - Reserve stock
  router.post('/api/inventory/reserve', async (req, res) => {
    const { productId, quantity, reservationId } = req.body;

    if (!productId || !quantity || !reservationId) {
      return res.status(400).json({ error: 'productId, quantity, and reservationId are required' });
    }

    const end = dbQueryDuration.startTimer({ query: 'reserve_stock' });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Lock the row for update
      const result = await client.query(
        'SELECT id, name, stock FROM products WHERE id = $1 FOR UPDATE',
        [productId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        end();
        return res.status(404).json({ error: 'Product not found' });
      }

      const product = result.rows[0];

      if (product.stock < quantity) {
        await client.query('ROLLBACK');
        end();
        return res.status(409).json({
          error: 'Insufficient stock',
          available: product.stock,
          requested: quantity,
        });
      }

      // Decrease stock
      await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2',
        [quantity, productId]
      );

      await client.query('COMMIT');
      end();

      console.log(
        `Reserved ${quantity} units of product ${productId} (reservation: ${reservationId})`
      );

      res.json({
        reservationId,
        productId,
        quantity,
        status: 'reserved',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      end();
      console.error('Error reserving stock:', error.message);
      res.status(500).json({ error: 'Failed to reserve stock' });
    } finally {
      client.release();
    }
  });

  // POST /api/inventory/confirm - Confirm reservation
  router.post('/api/inventory/confirm', async (req, res) => {
    const { reservationId } = req.body;

    if (!reservationId) {
      return res.status(400).json({ error: 'reservationId is required' });
    }

    console.log(`Confirmed reservation: ${reservationId}`);

    res.json({
      reservationId,
      status: 'confirmed',
    });
  });

  // POST /api/inventory/release - Release reservation (add stock back)
  router.post('/api/inventory/release', async (req, res) => {
    const { reservationId, productId, quantity } = req.body;

    if (!reservationId || !productId || !quantity) {
      return res
        .status(400)
        .json({ error: 'reservationId, productId, and quantity are required' });
    }

    const end = dbQueryDuration.startTimer({ query: 'release_stock' });

    try {
      await pool.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [
        quantity,
        productId,
      ]);

      end();
      console.log(
        `Released ${quantity} units of product ${productId} (reservation: ${reservationId})`
      );

      res.json({
        reservationId,
        productId,
        quantity,
        status: 'released',
      });
    } catch (error) {
      end();
      console.error('Error releasing stock:', error.message);
      res.status(500).json({ error: 'Failed to release stock' });
    }
  });

  // POST /api/orders/save - Save order to database
  router.post('/api/orders/save', async (req, res) => {
    const { orderId, totalAmount, items } = req.body;

    if (!orderId || totalAmount === undefined || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'orderId, totalAmount, and items are required' });
    }

    const end = dbQueryDuration.startTimer({ query: 'save_order' });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Insert order
      await client.query(
        'INSERT INTO orders (id, status, total_amount) VALUES ($1, $2, $3)',
        [orderId, 'confirmed', totalAmount]
      );

      // Insert order items
      for (const item of items) {
        await client.query(
          'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
          [orderId, item.productId, item.quantity, item.price]
        );
      }

      await client.query('COMMIT');
      end();

      console.log(`Order ${orderId} saved successfully`);

      res.status(201).json({
        orderId,
        status: 'saved',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      end();
      console.error('Error saving order:', error.message);
      res.status(500).json({ error: 'Failed to save order' });
    } finally {
      client.release();
    }
  });

  // GET /api/orders - List all orders with items
  router.get('/api/orders', async (req, res) => {
    const end = dbQueryDuration.startTimer({ query: 'select_all_orders' });
    try {
      const ordersResult = await pool.query(
        'SELECT id, status, total_amount, created_at FROM orders ORDER BY created_at DESC'
      );

      const orders = [];
      for (const order of ordersResult.rows) {
        const itemsResult = await pool.query(
          `SELECT oi.id, oi.product_id, oi.quantity, oi.price, p.name as product_name
           FROM order_items oi
           LEFT JOIN products p ON oi.product_id = p.id
           WHERE oi.order_id = $1`,
          [order.id]
        );

        orders.push({
          ...order,
          items: itemsResult.rows,
        });
      }

      end();
      res.json(orders);
    } catch (error) {
      end();
      console.error('Error fetching orders:', error.message);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  // GET /api/orders/:id - Get order with items
  router.get('/api/orders/:id', async (req, res) => {
    const end = dbQueryDuration.startTimer({ query: 'select_order_by_id' });
    try {
      const orderResult = await pool.query(
        'SELECT id, status, total_amount, created_at FROM orders WHERE id = $1',
        [req.params.id]
      );

      if (orderResult.rows.length === 0) {
        end();
        return res.status(404).json({ error: 'Order not found' });
      }

      const order = orderResult.rows[0];

      const itemsResult = await pool.query(
        `SELECT oi.id, oi.product_id, oi.quantity, oi.price, p.name as product_name
         FROM order_items oi
         LEFT JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = $1`,
        [order.id]
      );

      end();
      res.json({
        ...order,
        items: itemsResult.rows,
      });
    } catch (error) {
      end();
      console.error(`Error fetching order ${req.params.id}:`, error.message);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });

  return router;
};
