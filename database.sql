-- Sagara Meat House Database Schema
CREATE DATABASE IF NOT EXISTS sagara_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sagara_db;

-- Users
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin','user') NOT NULL DEFAULT 'user',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Role Access (default permissions per role)
CREATE TABLE IF NOT EXISTS role_access (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role ENUM('admin','user') NOT NULL,
    menu VARCHAR(50) NOT NULL,
    can_view TINYINT(1) NOT NULL DEFAULT 1,
    can_create TINYINT(1) NOT NULL DEFAULT 0,
    can_edit TINYINT(1) NOT NULL DEFAULT 0,
    can_delete TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY unique_role_menu (role, menu)
);

-- User Access (per-user override, takes priority over role_access)
CREATE TABLE IF NOT EXISTS user_access (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    menu VARCHAR(50) NOT NULL,
    can_view TINYINT(1) NOT NULL DEFAULT 1,
    can_create TINYINT(1) NOT NULL DEFAULT 0,
    can_edit TINYINT(1) NOT NULL DEFAULT 0,
    can_delete TINYINT(1) NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_menu (user_id, menu)
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
    unit VARCHAR(20) DEFAULT 'kg',
    buy_unit VARCHAR(20) DEFAULT 'kg',
    sell_unit VARCHAR(20) DEFAULT 'pcs',
    buy_content DECIMAL(10,3) DEFAULT 1.000,
    sell_content DECIMAL(10,3) DEFAULT 1.000,
    stock DECIMAL(12,3) NOT NULL DEFAULT 0.000,
    cost_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    sell_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    image VARCHAR(255)
);

-- Sales (header)
CREATE TABLE IF NOT EXISTS sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    date DATE NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    channel ENUM('DIRECT') NOT NULL DEFAULT 'DIRECT',
    platform_order_id VARCHAR(100),
    subtotal DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    discount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    shipping_cost DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    status ENUM('DRAFT','CONFIRMED','SHIPPED','DONE','CANCELLED') NOT NULL DEFAULT 'DRAFT',
    notes TEXT,
    created_by INT,
    warehouse_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);

-- Sale Items (lines)
CREATE TABLE IF NOT EXISTS sale_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity DECIMAL(12,3) NOT NULL DEFAULT 1.000,
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
    warehouse_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);

-- Purchase Items (lines)
CREATE TABLE IF NOT EXISTS purchase_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity DECIMAL(12,3) NOT NULL DEFAULT 1.000,
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
('admin', 'admin@sagara.id', '$2a$10$aEchA07QT1/pwaANT0kNiugTQ3xmITLRysdRV6xcsOjOdwrvS8gcy', 'admin');

-- Default role access: admin = full access, user = view + create only
INSERT INTO role_access (role, menu, can_view, can_create, can_edit, can_delete) VALUES
('admin', 'dashboard',  1, 1, 1, 1),
('admin', 'accounts',   1, 1, 1, 1),
('admin', 'journal',    1, 1, 1, 1),
('admin', 'sales',      1, 1, 1, 1),
('admin', 'purchases',  1, 1, 1, 1),
('admin', 'inventory',  1, 1, 1, 1),
('admin', 'kas',        1, 1, 1, 1),
('admin', 'hutang',     1, 1, 1, 1),
('admin', 'reports',    1, 1, 1, 1),
('admin', 'users',      1, 1, 1, 1),
('user',  'dashboard',  1, 0, 0, 0),
('user',  'accounts',   1, 0, 0, 0),
('user',  'journal',    1, 1, 0, 0),
('user',  'sales',      1, 1, 0, 0),
('user',  'purchases',  1, 1, 0, 0),
('user',  'inventory',  1, 0, 0, 0),
('user',  'kas',        1, 0, 0, 0),
('user',  'hutang',     1, 0, 0, 0),
('user',  'reports',    1, 0, 0, 0),
('user',  'users',      0, 0, 0, 0);

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
('INV-2024-002', '2024-01-12', 'Dewi Rahayu',       'DIRECT',    NULL,              185000,  0,      15000, 200000,  'DONE',      1),
('INV-2024-003', '2024-01-15', 'Rina Kusuma',       'DIRECT',    NULL,              520000,  20000,  10000, 510000,  'SHIPPED',   1),
('INV-2024-004', '2024-01-18', 'Ahmad Fauzi',       'DIRECT',    NULL,              370000,  0,      20000, 390000,  'CONFIRMED', 1),
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

-- Hutang (Accounts Payable)
CREATE TABLE IF NOT EXISTS hutang (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reference VARCHAR(50) NOT NULL UNIQUE,
    date DATE NOT NULL,
    due_date DATE NOT NULL,
    counterparty VARCHAR(150) NOT NULL,
    description VARCHAR(255),
    amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    paid DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    status ENUM('BELUM_LUNAS','LUNAS') NOT NULL DEFAULT 'BELUM_LUNAS',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Kas (Cash Transactions)
CREATE TABLE IF NOT EXISTS kas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reference VARCHAR(50) NOT NULL UNIQUE,
    date DATE NOT NULL,
    type ENUM('MASUK','KELUAR') NOT NULL,
    counterparty VARCHAR(150) NOT NULL,
    description VARCHAR(255),
    amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Sample Hutang
INSERT INTO hutang (reference, date, due_date, counterparty, description, amount, paid, status, created_by) VALUES
('HT-2024-001', '2024-01-05', '2024-02-05', 'PT Asus Indonesia', 'Hutang pembelian laptop',  65000000, 65000000, 'LUNAS',       1),
('HT-2024-002', '2024-01-08', '2024-03-08', 'CV Logitech Jaya',  'Hutang pembelian mouse',   6000000,  3000000,  'BELUM_LUNAS', 1),
('HT-2024-003', '2024-01-22', '2024-04-22', 'PT Monitor Global', 'Hutang pembelian monitor', 27000000, 0,        'BELUM_LUNAS', 1);

-- Sample Kas
INSERT INTO kas (reference, date, type, counterparty, description, amount, created_by) VALUES
('KAS-2024-001', '2024-01-02', 'MASUK',  'Modal Awal',       'Setoran modal pemilik',       80000000, 1),
('KAS-2024-002', '2024-01-05', 'KELUAR', 'PT Asus Indonesia', 'Pembayaran hutang laptop',   65000000, 1),
('KAS-2024-003', '2024-01-10', 'MASUK',  'Budi Santoso',      'Penjualan INV-2024-001',      8500000, 1),
('KAS-2024-004', '2024-01-15', 'KELUAR', 'Biaya Operasional', 'Bayar listrik & air',          500000, 1),
('KAS-2024-005', '2024-01-20', 'MASUK',  'Siti Nuraini',      'Penjualan INV-2024-005',      2400000, 1);

-- Warehouses
CREATE TABLE IF NOT EXISTS warehouses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    address VARCHAR(255),
    phone VARCHAR(30),
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Warehouse Stock (stok per gudang per produk)
CREATE TABLE IF NOT EXISTS warehouse_stock (
    id INT AUTO_INCREMENT PRIMARY KEY,
    warehouse_id INT NOT NULL,
    product_id INT NOT NULL,
    stock DECIMAL(12,3) NOT NULL DEFAULT 0.000,
    UNIQUE KEY unique_wh_product (warehouse_id, product_id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Stock Transfers (pindah barang antar gudang)
CREATE TABLE IF NOT EXISTS stock_transfers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transfer_number VARCHAR(50) NOT NULL UNIQUE,
    date DATE NOT NULL,
    from_warehouse_id INT NOT NULL,
    to_warehouse_id INT NOT NULL,
    status ENUM('DRAFT','CONFIRMED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
    notes TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Stock Transfer Items
CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transfer_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity DECIMAL(12,3) NOT NULL DEFAULT 0.000,
    FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

-- Sample Warehouse
INSERT INTO warehouses (name, address, phone) VALUES
('Gudang Utama', 'Palembang', '0811-9699-8881');
