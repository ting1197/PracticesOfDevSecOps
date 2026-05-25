-- Create tables
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    image_url VARCHAR(512),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(36) PRIMARY KEY,
    status VARCHAR(50) DEFAULT 'pending',
    total_amount DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(36) REFERENCES orders(id),
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL
);

-- Seed data: 10 products
INSERT INTO products (name, description, price, stock) VALUES
('Mechanical Keyboard', 'Cherry MX Blue switches, RGB backlit, hot-swappable', 89.99, 50),
('Wireless Mouse', 'Ergonomic design, 16000 DPI, USB-C charging', 45.99, 100),
('4K Monitor', '27-inch IPS panel, 144Hz, HDR600, USB-C hub', 399.99, 25),
('USB-C Hub', '7-in-1: HDMI, SD card, USB 3.0 x3, PD 100W', 34.99, 200),
('Laptop Stand', 'Aluminum alloy, adjustable height, foldable', 29.99, 150),
('Webcam HD', '1080p/60fps, auto-focus, built-in mic, privacy cover', 59.99, 75),
('Noise Cancelling Headphones', 'ANC, 30h battery, Bluetooth 5.3, multipoint', 199.99, 40),
('Desk Mat', 'XXL 900x400mm, water-resistant, stitched edges', 19.99, 300),
('Smart Power Strip', 'Wi-Fi, 4 outlets + 2 USB-C, energy monitoring', 24.99, 120),
('Portable SSD', '1TB NVMe, 1050MB/s read, USB 3.2 Gen 2, IP55', 79.99, 60);
