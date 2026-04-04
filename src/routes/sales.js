const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');
const { createKasJournal, deleteKasJournal } = require('./kas');

// GET customer list for POS
router.get('/customers', auth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name, phone, email FROM customers ORDER BY name');
        // Also get unique customer names from past sales
        const [salesCustomers] = await pool.query(
            `SELECT DISTINCT customer_name as name FROM sales WHERE customer_name IS NOT NULL AND customer_name != '' ORDER BY customer_name`
        );
        // Merge: customers table + unique sales names (dedup)
        const customerNames = new Set(rows.map(r => r.name));
        const fromSales = salesCustomers.filter(s => !customerNames.has(s.name)).map(s => ({ id: null, name: s.name, phone: '', email: '' }));
        res.json({ success: true, data: [...rows, ...fromSales] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data pelanggan.' });
    }
});

// GET sales with optional channel filter
router.get('/', auth, async (req, res) => {
    try {
        const { channel, status, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let where = [];
        let params = [];

        if (channel && channel !== 'ALL') { where.push('s.channel = ?'); params.push(channel); }
        if (status)  { where.push('s.status = ?');  params.push(status); }

        const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const [rows] = await pool.query(
            `SELECT s.*, u.username as created_by_name
             FROM sales s LEFT JOIN users u ON s.created_by = u.id
             ${whereSQL} ORDER BY s.date DESC, s.id DESC LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );
        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM sales s ${whereSQL}`, params);
        res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data penjualan.' });
    }
});

// GET channel summary stats
router.get('/summary', auth, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT channel,
                    COUNT(*) as count,
                    SUM(total) as total_amount
             FROM sales
             WHERE status != 'CANCELLED'
             GROUP BY channel`
        );
        const summary = { DIRECT: { count: 0, total: 0 } };
        rows.forEach(r => { summary[r.channel] = { count: r.count, total: parseFloat(r.total_amount) }; });
        const [[grand]] = await pool.query(`SELECT COUNT(*) as count, SUM(total) as total FROM sales WHERE status != 'CANCELLED'`);
        res.json({ success: true, data: summary, grand: { count: grand.count, total: parseFloat(grand.total || 0) } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil ringkasan penjualan.' });
    }
});

// GET single sale with items
router.get('/:id', auth, async (req, res) => {
    try {
        const [sales] = await pool.query('SELECT * FROM sales WHERE id = ?', [req.params.id]);
        if (!sales.length) return res.status(404).json({ success: false, message: 'Penjualan tidak ditemukan.' });
        const [items] = await pool.query(
            `SELECT si.*, p.name as product_name, p.code as product_code
             FROM sale_items si JOIN products p ON si.product_id = p.id
             WHERE si.sale_id = ?`, [req.params.id]
        );
        res.json({ success: true, data: { ...sales[0], items } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil detail penjualan.' });
    }
});

// Helper: deduct stock for sale items (products.stock + warehouse_stock)
async function deductSaleStock(conn, items, warehouseId) {
    for (const item of items) {
        const qty = parseFloat(item.quantity);
        const [[prod]] = await conn.query('SELECT sell_content FROM products WHERE id = ?', [item.product_id]);
        const sellContent = parseFloat(prod?.sell_content) || 1;
        const totalQty = qty * sellContent;
        // Deduct global stock
        await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [totalQty, item.product_id]);
        // Deduct warehouse stock
        if (warehouseId) {
            await conn.query(
                `INSERT INTO warehouse_stock (warehouse_id, product_id, stock) VALUES (?, ?, -?)
                 ON DUPLICATE KEY UPDATE stock = stock - ?`,
                [warehouseId, item.product_id, totalQty, totalQty]
            );
        }
    }
}

// Helper: restore stock for sale items (products.stock + warehouse_stock)
async function restoreSaleStock(conn, items, warehouseId) {
    for (const item of items) {
        const qty = parseFloat(item.quantity);
        const [[prod]] = await conn.query('SELECT sell_content FROM products WHERE id = ?', [item.product_id]);
        const sellContent = parseFloat(prod?.sell_content) || 1;
        const totalQty = qty * sellContent;
        // Restore global stock
        await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [totalQty, item.product_id]);
        // Restore warehouse stock
        if (warehouseId) {
            await conn.query(
                `INSERT INTO warehouse_stock (warehouse_id, product_id, stock) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE stock = stock + ?`,
                [warehouseId, item.product_id, totalQty, totalQty]
            );
        }
    }
}

// Statuses that should deduct stock
const SALE_STOCK_ACTIVE = ['CONFIRMED', 'SHIPPED', 'DONE'];

// POST create sale
router.post('/', auth, async (req, res) => {
    const { invoice_number, date, customer_name, customer_address, channel, platform_order_id, discount, shipping_cost, status, notes, items, warehouse_id } = req.body;
    if (!invoice_number || !date || !customer_name || !items || !items.length)
        return res.status(400).json({ success: false, message: 'Data penjualan tidak lengkap.' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const subtotal = items.reduce((s, i) => s + parseFloat(i.unit_price) * parseFloat(i.quantity), 0);
        const total    = subtotal - parseFloat(discount || 0) + parseFloat(shipping_cost || 0);
        const saleStatus = status || 'DRAFT';

        const [result] = await conn.query(
            `INSERT INTO sales (invoice_number, date, customer_name, customer_address, channel, platform_order_id, subtotal, discount, shipping_cost, total, status, notes, created_by, warehouse_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [invoice_number, date, customer_name, customer_address || null, channel || 'DIRECT', platform_order_id || null,
             subtotal, parseFloat(discount || 0), parseFloat(shipping_cost || 0), total,
             saleStatus, notes || null, req.session.user.id, warehouse_id || null]
        );
        const saleId = result.insertId;

        for (const item of items) {
            const itemSubtotal = parseFloat(item.unit_price) * parseFloat(item.quantity);
            await conn.query(
                'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
                [saleId, item.product_id, item.quantity, item.unit_price, itemSubtotal]
            );
        }

        // Only deduct stock if status is active (not DRAFT/CANCELLED)
        if (SALE_STOCK_ACTIVE.includes(saleStatus)) {
            await deductSaleStock(conn, items, warehouse_id);
            // Kas masuk otomatis + jurnal
            await conn.query(
                `INSERT INTO kas (reference, date, type, counterparty, description, amount, created_by)
                 VALUES (?, ?, 'MASUK', ?, ?, ?, ?)`,
                [invoice_number, date, customer_name, `Penjualan ${invoice_number}`, total, req.session.user.id]
            );
            await createKasJournal(conn, {
                date, description: `Penjualan ${invoice_number}`, reference: invoice_number,
                amount: total, type: 'MASUK', userId: req.session.user.id, isSale: true
            });
        }

        await conn.commit();
        res.json({ success: true, message: 'Penjualan berhasil disimpan.', id: saleId });
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Nomor invoice sudah ada.' });
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal menyimpan penjualan.' });
    } finally {
        conn.release();
    }
});

// PUT update sale status
router.put('/:id/status', auth, async (req, res) => {
    const { status } = req.body;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [old] = await conn.query('SELECT status, warehouse_id FROM sales WHERE id = ?', [req.params.id]);
        if (!old.length) return res.status(404).json({ success: false, message: 'Penjualan tidak ditemukan.' });

        const oldStatus = old[0].status;
        const warehouseId = old[0].warehouse_id;
        const wasActive = SALE_STOCK_ACTIVE.includes(oldStatus);
        const isActive  = SALE_STOCK_ACTIVE.includes(status);

        await conn.query('UPDATE sales SET status = ? WHERE id = ?', [status, req.params.id]);

        // Handle stock transitions
        if (!wasActive && isActive) {
            // Transition to active: deduct stock + kas masuk
            const [items] = await conn.query('SELECT * FROM sale_items WHERE sale_id = ?', [req.params.id]);
            await deductSaleStock(conn, items, warehouseId);
            const [[saleData]] = await conn.query('SELECT invoice_number, date, customer_name, total FROM sales WHERE id = ?', [req.params.id]);
            await conn.query(
                `INSERT INTO kas (reference, date, type, counterparty, description, amount, created_by)
                 VALUES (?, ?, 'MASUK', ?, ?, ?, ?)`,
                [saleData.invoice_number, saleData.date, saleData.customer_name, `Penjualan ${saleData.invoice_number}`, saleData.total, req.session.user.id]
            );
            await createKasJournal(conn, {
                date: saleData.date, description: `Penjualan ${saleData.invoice_number}`, reference: saleData.invoice_number,
                amount: parseFloat(saleData.total), type: 'MASUK', userId: req.session.user.id, isSale: true
            });
        } else if (wasActive && !isActive) {
            // Transition from active to inactive (CANCELLED): restore stock + hapus kas
            const [items] = await conn.query('SELECT * FROM sale_items WHERE sale_id = ?', [req.params.id]);
            await restoreSaleStock(conn, items, warehouseId);
            const [[saleData]] = await conn.query('SELECT invoice_number FROM sales WHERE id = ?', [req.params.id]);
            await deleteKasJournal(conn, saleData.invoice_number);
            await conn.query('DELETE FROM kas WHERE reference = ? AND type = ?', [saleData.invoice_number, 'MASUK']);
        }

        await conn.commit();
        res.json({ success: true, message: 'Status penjualan diperbarui.' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal memperbarui status.' });
    } finally {
        conn.release();
    }
});

// DELETE sale
router.delete('/:id', auth, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[sale]] = await conn.query('SELECT status, warehouse_id FROM sales WHERE id = ?', [req.params.id]);
        if (!sale) return res.status(404).json({ success: false, message: 'Penjualan tidak ditemukan.' });

        // Restore stock only if sale was in an active status
        if (SALE_STOCK_ACTIVE.includes(sale.status)) {
            const [items] = await conn.query('SELECT * FROM sale_items WHERE sale_id = ?', [req.params.id]);
            await restoreSaleStock(conn, items, sale.warehouse_id);
            const [[saleData]] = await conn.query('SELECT invoice_number FROM sales WHERE id = ?', [req.params.id]);
            if (saleData) {
                await deleteKasJournal(conn, saleData.invoice_number);
                await conn.query('DELETE FROM kas WHERE reference = ? AND type = ?', [saleData.invoice_number, 'MASUK']);
            }
        }
        await conn.query('DELETE FROM sales WHERE id = ?', [req.params.id]);
        await conn.commit();
        res.json({ success: true, message: 'Penjualan berhasil dihapus.' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal menghapus penjualan.' });
    } finally {
        conn.release();
    }
});

module.exports = router;
