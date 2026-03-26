const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');

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
        const summary = { DIRECT: { count: 0, total: 0 }, SHOPEE: { count: 0, total: 0 }, TOKOPEDIA: { count: 0, total: 0 } };
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

// POST create sale
router.post('/', auth, async (req, res) => {
    const { invoice_number, date, customer_name, channel, platform_order_id, discount, shipping_cost, status, notes, items } = req.body;
    if (!invoice_number || !date || !customer_name || !items || !items.length)
        return res.status(400).json({ success: false, message: 'Data penjualan tidak lengkap.' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const subtotal = items.reduce((s, i) => s + parseFloat(i.unit_price) * parseInt(i.quantity), 0);
        const total    = subtotal - parseFloat(discount || 0) + parseFloat(shipping_cost || 0);

        const [result] = await conn.query(
            `INSERT INTO sales (invoice_number, date, customer_name, channel, platform_order_id, subtotal, discount, shipping_cost, total, status, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [invoice_number, date, customer_name, channel || 'DIRECT', platform_order_id || null,
             subtotal, parseFloat(discount || 0), parseFloat(shipping_cost || 0), total,
             status || 'DRAFT', notes || null, req.session.user.id]
        );
        const saleId = result.insertId;

        for (const item of items) {
            const itemSubtotal = parseFloat(item.unit_price) * parseInt(item.quantity);
            await conn.query(
                'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
                [saleId, item.product_id, item.quantity, item.unit_price, itemSubtotal]
            );
            await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
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
    try {
        await pool.query('UPDATE sales SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ success: true, message: 'Status penjualan diperbarui.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal memperbarui status.' });
    }
});

// DELETE sale
router.delete('/:id', auth, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [items] = await conn.query('SELECT * FROM sale_items WHERE sale_id = ?', [req.params.id]);
        for (const item of items) {
            await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
        }
        await conn.query('DELETE FROM sales WHERE id = ?', [req.params.id]);
        await conn.commit();
        res.json({ success: true, message: 'Penjualan berhasil dihapus.' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: 'Gagal menghapus penjualan.' });
    } finally {
        conn.release();
    }
});

module.exports = router;
