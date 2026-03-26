-- Sagara Accounting Database Schema
CREATE DATABASE IF NOT EXISTS sagara_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sagara_db;

-- Users
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin','user') NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chart of Accounts
CREATE TABLE IF NOT EXISTS accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    type ENUM('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE') NOT NULL,
    balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Journal Entries (header)
CREATE TABLE IF NOT EXISTS journal_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date DATE NOT NULL,
    description VARCHAR(255) NOT NULL,
    reference VARCHAR(50),
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Journal Details (lines)
CREATE TABLE IF NOT EXISTS journal_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    journal_entry_id INT NOT NULL,
    account_id INT NOT NULL,
    debit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    credit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT
);

-- Products / Inventory
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(80),
    unit VARCHAR(20) DEFAULT 'pcs',
    stock INT NOT NULL DEFAULT 0,
    cost_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    sell_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales (header)
CREATE TABLE IF NOT EXISTS sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    date DATE NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    channel ENUM('DIRECT','SHOPEE','TOKOPEDIA') NOT NULL DEFAULT 'DIRECT',
    platform_order_id VARCHAR(100),
    subtotal DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    discount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    shipping_cost DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    status ENUM('DRAFT','CONFIRMED','SHIPPED','DONE','CANCELLED') NOT NULL DEFAULT 'DRAFT',
    notes TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Sale Items (lines)
CREATE TABLE IF NOT EXISTS sale_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    subtotal DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

-- Purchases (header)
CREATE TABLE IF NOT EXISTS purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    po_number VARCHAR(50) NOT NULL UNIQUE,
    date DATE NOT NULL,
    supplier_name VARCHAR(150) NOT NULL,
    subtotal DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    status ENUM('DRAFT','ORDERED','RECEIVED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
    notes TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Purchase Items (lines)
CREATE TABLE IF NOT EXISTS purchase_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    subtotal DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

-- ============================================================
-- SAMPLE DATA
-- ============================================================

-- Default admin user: admin / Admin@1234
INSERT INTO users (username, email, password, role) VALUES
('admin', 'admin@sagara.id', '$2a$10$YmHq0N7BdB7a3U7TRc/fLOa6P4b56U/kLfImTNxmv3K1RfLX5Hd9S', 'admin');

-- Sample Chart of Accounts
INSERT INTO accounts (code, name, type, balance) VALUES
('1-0000', 'Aset',                        'ASSET',     0),
('1-1000', 'Kas & Bank',                  'ASSET',     50000000),
('1-1001', 'Kas Tunai',                   'ASSET',     10000000),
('1-1002', 'Bank BCA',                    'ASSET',     40000000),
('1-2000', 'Piutang Usaha',               'ASSET',     5000000),
('1-3000', 'Persediaan Barang',           'ASSET',     20000000),
('1-4000', 'Peralatan',                   'ASSET',     15000000),
('2-0000', 'Kewajiban',                   'LIABILITY', 0),
('2-1000', 'Hutang Usaha',                'LIABILITY', 8000000),
('2-2000', 'Hutang Pajak',                'LIABILITY', 1000000),
('3-0000', 'Ekuitas',                     'EQUITY',    0),
('3-1000', 'Modal Pemilik',               'EQUITY',    80000000),
('3-2000', 'Laba Ditahan',                'EQUITY',    1000000),
('4-0000', 'Pendapatan',                  'REVENUE',   0),
('4-1000', 'Pendapatan Penjualan',        'REVENUE',   0),
('4-2000', 'Pendapatan Lain-lain',        'REVENUE',   0),
('5-0000', 'Beban',                       'EXPENSE',   0),
('5-1000', 'Harga Pokok Penjualan',       'EXPENSE',   0),
('5-2000', 'Beban Operasional',           'EXPENSE',   0),
('5-2001', 'Beban Gaji',                  'EXPENSE',   0),
('5-2002', 'Beban Sewa',                  'EXPENSE',   0),
('5-2003', 'Beban Listrik & Air',         'EXPENSE',   0),
('5-3000', 'Beban Ongkos Kirim',          'EXPENSE',   0);

-- Sample Products
INSERT INTO products (code, name, category, unit, stock, cost_price, sell_price) VALUES
('PRD-001', 'Laptop Asus VivoBook',    'Elektronik',  'unit', 10, 6500000, 8500000),
('PRD-002', 'Mouse Wireless Logitech', 'Aksesoris',   'unit', 50, 120000,  185000),
('PRD-003', 'Keyboard Mechanical',     'Aksesoris',   'unit', 30, 350000,  520000),
('PRD-004', 'Monitor LG 24"',         'Elektronik',  'unit', 15, 1800000, 2500000),
('PRD-005', 'Flash Disk 64GB',         'Aksesoris',   'unit', 100,55000,   95000);

-- Sample Sales
INSERT INTO sales (invoice_number, date, customer_name, channel, platform_order_id, subtotal, discount, shipping_cost, total, status, created_by) VALUES
('INV-2024-001', '2024-01-10', 'Budi Santoso',      'DIRECT',    NULL,              8500000, 0,      0,     8500000, 'DONE',      1),
('INV-2024-002', '2024-01-12', 'Dewi Rahayu',       'SHOPEE',    'SPX-20240112-001',185000,  0,      15000, 200000,  'DONE',      1),
('INV-2024-003', '2024-01-15', 'Rina Kusuma',       'TOKOPEDIA', 'TKP-20240115-001',520000,  20000,  10000, 510000,  'SHIPPED',   1),
('INV-2024-004', '2024-01-18', 'Ahmad Fauzi',       'SHOPEE',    'SPX-20240118-002',370000,  0,      20000, 390000,  'CONFIRMED', 1),
('INV-2024-005', '2024-01-20', 'Siti Nuraini',      'DIRECT',    NULL,              2500000, 100000, 0,     2400000, 'DONE',      1);

INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal) VALUES
(1, 1, 1, 8500000, 8500000),
(2, 2, 1, 185000,  185000),
(3, 3, 1, 520000,  520000),
(4, 2, 2, 185000,  370000),
(5, 4, 1, 2500000, 2500000);

-- Sample Purchases
INSERT INTO purchases (po_number, date, supplier_name, subtotal, total, status, created_by) VALUES
('PO-2024-001', '2024-01-05', 'PT Asus Indonesia',   65000000, 65000000, 'RECEIVED', 1),
('PO-2024-002', '2024-01-08', 'CV Logitech Jaya',    6000000,  6000000,  'RECEIVED', 1),
('PO-2024-003', '2024-01-22', 'PT Monitor Global',   27000000, 27000000, 'ORDERED',  1);

INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_price, subtotal) VALUES
(1, 1, 10, 6500000, 65000000),
(2, 2, 50, 120000,  6000000),
(3, 4, 15, 1800000, 27000000);
