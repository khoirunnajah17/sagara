const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');

// GET all purchases
router.get('/', auth, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let where = [], params = [];
        if (status) { where.push('p.status = ?'); params.push(status); }
        const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const [rows] = await pool.query(
            `SELECT p.*, u.username as created_by_name
             FROM purchases p LEFT JOIN users u ON p.created_by = u.id
             ${whereSQL} ORDER BY p.date DESC LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );
        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM purchases p ${whereSQL}`, params);
        res.json({ success: true, data: rows, total });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data pembelian.' });
    }
});

// GET single purchase with items
router.get('/:id', auth, async (req, res) => {
    try {
        const [purchases] = await pool.query('SELECT * FROM purchases WHERE id = ?', [req.params.id]);
        if (!purchases.length) return res.status(404).json({ success: false, message: 'Pembelian tidak ditemukan.' });
        const [items] = await pool.query(
            `SELECT pi.*, p.name as product_name, p.code as product_code
             FROM purchase_items pi JOIN products p ON pi.product_id = p.id
             WHERE pi.purchase_id = ?`, [req.params.id]
        );
        res.json({ success: true, data: { ...purchases[0], items } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil detail pembelian.' });
    }
});

// POST create purchase
router.post('/', auth, async (req, res) => {
    const { po_number, date, supplier_name, status, notes, items } = req.body;
    if (!po_number || !date || !supplier_name || !items || !items.length)
        return res.status(400).json({ success: false, message: 'Data pembelian tidak lengkap.' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const subtotal = items.reduce((s, i) => s + parseFloat(i.unit_price) * parseInt(i.quantity), 0);

        const [result] = await conn.query(
            `INSERT INTO purchases (po_number, date, supplier_name, subtotal, total, status, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [po_number, date, supplier_name, subtotal, subtotal, status || 'DRAFT', notes || null, req.session.user.id]
        );
        const purchaseId = result.insertId;

        for (const item of items) {
            const itemSubtotal = parseFloat(item.unit_price) * parseInt(item.quantity);
            await conn.query(
                'INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
                [purchaseId, item.product_id, item.quantity, item.unit_price, itemSubtotal]
            );
            if ((status || 'DRAFT') === 'RECEIVED') {
                await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
            }
        }

        await conn.commit();
        res.json({ success: true, message: 'Pembelian berhasil disimpan.', id: purchaseId });
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Nomor PO sudah ada.' });
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal menyimpan pembelian.' });
    } finally {
        conn.release();
    }
});

// PUT update purchase status
router.put('/:id/status', auth, async (req, res) => {
    const { status } = req.body;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [old] = await conn.query('SELECT status FROM purchases WHERE id = ?', [req.params.id]);
        if (!old.length) return res.status(404).json({ success: false, message: 'Pembelian tidak ditemukan.' });

        await conn.query('UPDATE purchases SET status = ? WHERE id = ?', [status, req.params.id]);

        // Receive stock only when transitioning to RECEIVED
        if (status === 'RECEIVED' && old[0].status !== 'RECEIVED') {
            const [items] = await conn.query('SELECT * FROM purchase_items WHERE purchase_id = ?', [req.params.id]);
            for (const item of items) {
                await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
            }
        }
        await conn.commit();
        res.json({ success: true, message: 'Status pembelian diperbarui.' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: 'Gagal memperbarui status.' });
    } finally {
        conn.release();
    }
});

// DELETE purchase
router.delete('/:id', auth, async (req, res) => {
    try {
        await pool.query('DELETE FROM purchases WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Pembelian berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal menghapus pembelian.' });
    }
});

module.exports = router;
