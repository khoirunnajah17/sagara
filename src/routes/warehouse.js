const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════
// WAREHOUSES CRUD
// ═══════════════════════════════════════════════════════════════

// GET all warehouses
router.get('/', auth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM warehouses ORDER BY name');
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data gudang.' });
    }
});

// GET single warehouse with stock
router.get('/:id', auth, async (req, res) => {
    try {
        const [wh] = await pool.query('SELECT * FROM warehouses WHERE id = ?', [req.params.id]);
        if (!wh.length) return res.status(404).json({ success: false, message: 'Gudang tidak ditemukan.' });
        const [stock] = await pool.query(
            `SELECT ws.*, p.code, p.name AS product_name, p.unit, p.sell_price, p.cost_price
             FROM warehouse_stock ws
             JOIN products p ON p.id = ws.product_id
             WHERE ws.warehouse_id = ?
             ORDER BY p.name`, [req.params.id]);
        res.json({ success: true, data: { ...wh[0], stock } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data gudang.' });
    }
});

// POST create warehouse
router.post('/', auth, async (req, res) => {
    const { name, address, phone } = req.body;
    if (!name || !name.trim())
        return res.status(400).json({ success: false, message: 'Nama gudang wajib diisi.' });
    try {
        const [result] = await pool.query(
            'INSERT INTO warehouses (name, address, phone) VALUES (?, ?, ?)',
            [name.trim(), address || null, phone || null]
        );
        res.json({ success: true, message: 'Gudang berhasil ditambahkan.', id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Nama gudang sudah ada.' });
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal menambahkan gudang.' });
    }
});

// PUT update warehouse
router.put('/:id', auth, async (req, res) => {
    const { name, address, phone, is_active } = req.body;
    if (!name || !name.trim())
        return res.status(400).json({ success: false, message: 'Nama gudang wajib diisi.' });
    try {
        await pool.query(
            'UPDATE warehouses SET name=?, address=?, phone=?, is_active=? WHERE id=?',
            [name.trim(), address || null, phone || null, is_active !== undefined ? is_active : 1, req.params.id]
        );
        res.json({ success: true, message: 'Gudang berhasil diperbarui.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Nama gudang sudah ada.' });
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal memperbarui gudang.' });
    }
});

// DELETE warehouse
router.delete('/:id', auth, async (req, res) => {
    try {
        const [stock] = await pool.query('SELECT SUM(stock) AS total FROM warehouse_stock WHERE warehouse_id = ?', [req.params.id]);
        if (stock[0] && parseFloat(stock[0].total) > 0)
            return res.status(400).json({ success: false, message: 'Gudang masih memiliki stok. Pindahkan stok terlebih dahulu.' });
        await pool.query('DELETE FROM warehouses WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Gudang berhasil dihapus.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal menghapus gudang.' });
    }
});

// ═══════════════════════════════════════════════════════════════
// WAREHOUSE STOCK
// ═══════════════════════════════════════════════════════════════

// GET stock per warehouse (all warehouses, all products)
router.get('/stock/all', auth, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT ws.warehouse_id, ws.product_id, ws.stock,
                    w.name AS warehouse_name,
                    p.code AS product_code, p.name AS product_name, p.unit, p.stock AS total_stock
             FROM warehouse_stock ws
             JOIN warehouses w ON w.id = ws.warehouse_id
             JOIN products p ON p.id = ws.product_id
             ORDER BY w.name, p.name`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil stok gudang.' });
    }
});

// PUT set stock for a product in a warehouse (manual adjust)
// Also syncs products.stock = SUM of all warehouse_stock for that product
router.put('/stock/set', auth, async (req, res) => {
    const { warehouse_id, product_id, stock } = req.body;
    if (!warehouse_id || !product_id) return res.status(400).json({ success: false, message: 'Warehouse dan produk wajib.' });
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(
            `INSERT INTO warehouse_stock (warehouse_id, product_id, stock) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE stock = ?`,
            [warehouse_id, product_id, parseFloat(stock) || 0, parseFloat(stock) || 0]
        );
        // Sync products.stock = SUM of all warehouse_stock for this product
        const [[sum]] = await conn.query(
            'SELECT COALESCE(SUM(stock), 0) AS total FROM warehouse_stock WHERE product_id = ?',
            [product_id]
        );
        await conn.query('UPDATE products SET stock = ? WHERE id = ?', [parseFloat(sum.total), product_id]);
        await conn.commit();
        res.json({ success: true, message: 'Stok gudang berhasil diperbarui.' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal memperbarui stok gudang.' });
    } finally {
        conn.release();
    }
});

// ═══════════════════════════════════════════════════════════════
// STOCK TRANSFERS
// ═══════════════════════════════════════════════════════════════

// GET all transfers
router.get('/transfers/list', auth, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT st.*,
                    wf.name AS from_warehouse_name, wt.name AS to_warehouse_name,
                    u.username AS created_by_name,
                    (SELECT COUNT(*) FROM stock_transfer_items WHERE transfer_id = st.id) AS item_count
             FROM stock_transfers st
             JOIN warehouses wf ON wf.id = st.from_warehouse_id
             JOIN warehouses wt ON wt.id = st.to_warehouse_id
             LEFT JOIN users u ON u.id = st.created_by
             ORDER BY st.date DESC, st.id DESC`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data transfer.' });
    }
});

// GET single transfer with items
router.get('/transfers/:id', auth, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT st.*,
                    wf.name AS from_warehouse_name, wt.name AS to_warehouse_name,
                    u.username AS created_by_name
             FROM stock_transfers st
             JOIN warehouses wf ON wf.id = st.from_warehouse_id
             JOIN warehouses wt ON wt.id = st.to_warehouse_id
             LEFT JOIN users u ON u.id = st.created_by
             WHERE st.id = ?`, [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Transfer tidak ditemukan.' });
        const [items] = await pool.query(
            `SELECT sti.*, p.code AS product_code, p.name AS product_name, p.unit
             FROM stock_transfer_items sti
             JOIN products p ON p.id = sti.product_id
             WHERE sti.transfer_id = ?`, [req.params.id]
        );
        res.json({ success: true, data: { ...rows[0], items } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil detail transfer.' });
    }
});

// POST create transfer
router.post('/transfers', auth, async (req, res) => {
    const { from_warehouse_id, to_warehouse_id, date, items, notes } = req.body;
    if (!from_warehouse_id || !to_warehouse_id || !items || !items.length)
        return res.status(400).json({ success: false, message: 'Data transfer tidak lengkap.' });
    if (from_warehouse_id == to_warehouse_id)
        return res.status(400).json({ success: false, message: 'Gudang asal dan tujuan tidak boleh sama.' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Generate transfer number
        const [last] = await conn.query(
            "SELECT transfer_number FROM stock_transfers WHERE transfer_number LIKE ? ORDER BY id DESC LIMIT 1",
            [`TRF-${new Date().getFullYear()}-%`]
        );
        let num = 1;
        if (last.length) {
            const parts = last[0].transfer_number.split('-');
            num = parseInt(parts[parts.length - 1]) + 1;
        }
        const transfer_number = `TRF-${new Date().getFullYear()}-${String(num).padStart(3, '0')}`;

        // Check stock availability in source warehouse for each item
        for (const item of items) {
            const qty = parseFloat(item.quantity);
            if (!qty || qty <= 0) throw new Error(`Quantity harus lebih dari 0.`);
            const [ws] = await conn.query(
                'SELECT stock FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
                [from_warehouse_id, item.product_id]
            );
            const available = ws.length ? parseFloat(ws[0].stock) : 0;
            if (available < qty) {
                const [prod] = await conn.query('SELECT name FROM products WHERE id = ?', [item.product_id]);
                const pname = prod.length ? prod[0].name : item.product_id;
                throw new Error(`Stok "${pname}" di gudang asal tidak cukup (tersedia: ${available}).`);
            }
        }

        // Insert transfer header
        const userId = req.session && req.session.user ? req.session.user.id : null;
        const [result] = await conn.query(
            'INSERT INTO stock_transfers (transfer_number, date, from_warehouse_id, to_warehouse_id, status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [transfer_number, date || new Date().toISOString().slice(0, 10), from_warehouse_id, to_warehouse_id, 'CONFIRMED', notes || null, userId]
        );
        const transferId = result.insertId;

        // Insert items + move stock
        for (const item of items) {
            const qty = parseFloat(item.quantity);
            await conn.query(
                'INSERT INTO stock_transfer_items (transfer_id, product_id, quantity) VALUES (?, ?, ?)',
                [transferId, item.product_id, qty]
            );
            // Decrease source warehouse
            await conn.query(
                `INSERT INTO warehouse_stock (warehouse_id, product_id, stock) VALUES (?, ?, -?)
                 ON DUPLICATE KEY UPDATE stock = stock - ?`,
                [from_warehouse_id, item.product_id, qty, qty]
            );
            // Increase destination warehouse
            await conn.query(
                `INSERT INTO warehouse_stock (warehouse_id, product_id, stock) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE stock = stock + ?`,
                [to_warehouse_id, item.product_id, qty, qty]
            );
        }

        await conn.commit();
        res.json({ success: true, message: 'Transfer berhasil dibuat.', id: transferId, transfer_number });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(400).json({ success: false, message: err.message || 'Gagal membuat transfer.' });
    } finally {
        conn.release();
    }
});

// DELETE transfer (only DRAFT)
router.delete('/transfers/:id', auth, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query('SELECT * FROM stock_transfers WHERE id = ?', [req.params.id]);
        if (!rows.length) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Transfer tidak ditemukan.' }); }

        const transfer = rows[0];
        // If CONFIRMED, reverse the stock movement
        if (transfer.status === 'CONFIRMED') {
            const [items] = await conn.query('SELECT * FROM stock_transfer_items WHERE transfer_id = ?', [transfer.id]);
            for (const item of items) {
                const qty = parseFloat(item.quantity);
                // Return stock to source
                await conn.query(
                    `INSERT INTO warehouse_stock (warehouse_id, product_id, stock) VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE stock = stock + ?`,
                    [transfer.from_warehouse_id, item.product_id, qty, qty]
                );
                // Remove stock from destination
                await conn.query(
                    `INSERT INTO warehouse_stock (warehouse_id, product_id, stock) VALUES (?, ?, -?)
                     ON DUPLICATE KEY UPDATE stock = stock - ?`,
                    [transfer.to_warehouse_id, item.product_id, qty, qty]
                );
            }
        }

        await conn.query('DELETE FROM stock_transfers WHERE id = ?', [req.params.id]);
        await conn.commit();
        res.json({ success: true, message: 'Transfer berhasil dihapus.' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal menghapus transfer.' });
    } finally {
        conn.release();
    }
});

module.exports = router;
