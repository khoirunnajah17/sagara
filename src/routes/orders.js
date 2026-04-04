const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');

// GET /api/orders — Admin: list all orders
router.get('/', auth, async (req, res) => {
    try {
        const { status } = req.query;
        let where = '';
        let params = [];
        if (status) { where = 'WHERE o.status = ?'; params.push(status); }
        const [rows] = await pool.query(`
            SELECT o.*, GROUP_CONCAT(CONCAT(p.name,' x',oi.qty) SEPARATOR ', ') as items_summary
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN products p ON p.id = oi.product_id
            ${where}
            GROUP BY o.id
            ORDER BY o.created_at DESC`, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data pesanan.' });
    }
});

// GET /api/orders/stats — Admin: count by status
router.get('/stats', auth, async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT status, COUNT(*) as count FROM orders GROUP BY status`);
        const stats = { PENDING: 0, CONFIRMED: 0, DONE: 0, CANCELLED: 0 };
        rows.forEach(r => { stats[r.status] = r.count; });
        res.json({ success: true, data: stats });
    } catch (err) {
        res.status(500).json({ success: false, data: {} });
    }
});

// GET /api/orders/pending-count — Admin: count pending orders
router.get('/pending-count', auth, async (req, res) => {
    try {
        const [[{ count }]] = await pool.query("SELECT COUNT(*) as count FROM orders WHERE status = 'PENDING'");
        res.json({ success: true, count });
    } catch (err) {
        res.status(500).json({ success: false, count: 0 });
    }
});

// GET /api/orders/:id — Admin: order detail with items
router.get('/:id', auth, async (req, res) => {
    try {
        const [[order]] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
        if (!order) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
        const [items] = await pool.query(`
            SELECT oi.*, p.name as product_name, p.code as product_code
            FROM order_items oi
            LEFT JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = ?`, [req.params.id]);
        res.json({ success: true, data: { ...order, items } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil detail pesanan.' });
    }
});

// PUT /api/orders/:id/status — Admin: update order status
router.put('/:id/status', auth, async (req, res) => {
    const { status } = req.body;
    const valid = ['PENDING', 'CONFIRMED', 'DONE', 'CANCELLED'];
    if (!valid.includes(status))
        return res.status(400).json({ success: false, message: 'Status tidak valid.' });
    try {
        // If cancelling, restore stock
        if (status === 'CANCELLED') {
            const [items] = await pool.query('SELECT product_id, qty FROM order_items WHERE order_id = ?', [req.params.id]);
            for (const item of items) {
                const [[prod]] = await pool.query('SELECT sell_content FROM products WHERE id = ?', [item.product_id]);
                const sellContent = parseFloat(prod?.sell_content) || 1;
                await pool.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.qty * sellContent, item.product_id]);
            }
        }
        await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ success: true, message: 'Status pesanan diperbarui.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal update status.' });
    }
});

// POST /api/orders — Requires customer login
router.post('/', async (req, res) => {
    if (!req.session || !req.session.customer)
        return res.status(401).json({ success: false, message: 'Silakan login terlebih dahulu.' });

    const customer = req.session.customer;
    const { notes, items } = req.body;
    if (!items || !items.length)
        return res.status(400).json({ success: false, message: 'Keranjang kosong.' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Validate stock
        for (const item of items) {
            const [rows] = await conn.query('SELECT id, stock, sell_price FROM products WHERE id = ? FOR UPDATE', [item.product_id]);
            if (!rows.length) throw new Error(`Produk ID ${item.product_id} tidak ditemukan.`);
            if (rows[0].stock < item.qty) throw new Error(`Stok produk tidak mencukupi.`);
        }

        // Generate order number
        const order_number = 'ORD-' + Date.now().toString(36).toUpperCase();
        const total = items.reduce((s, i) => s + i.price * i.qty, 0);

        const [orderResult] = await conn.query(
            'INSERT INTO orders (order_number, customer_id, customer_name, customer_phone, notes, total, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [order_number, customer.id, customer.name, customer.phone, notes || null, total, 'PENDING']
        );
        const orderId = orderResult.insertId;

        // Insert items & reduce stock
        for (const item of items) {
            await conn.query(
                'INSERT INTO order_items (order_id, product_id, qty, price, subtotal) VALUES (?, ?, ?, ?, ?)',
                [orderId, item.product_id, item.qty, item.price, item.price * item.qty]
            );
            // Stock -= qty * sell_content (isi jual)
            const [[prod]] = await conn.query('SELECT sell_content FROM products WHERE id = ?', [item.product_id]);
            const sellContent = parseFloat(prod?.sell_content) || 1;
            await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [item.qty * sellContent, item.product_id]);
        }

        await conn.commit();
        res.json({ success: true, message: 'Pesanan berhasil.', order_number, total });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(400).json({ success: false, message: err.message || 'Gagal membuat pesanan.' });
    } finally {
        conn.release();
    }
});

module.exports = router;
