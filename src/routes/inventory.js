const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');

// GET all products
router.get('/', auth, async (req, res) => {
    try {
        const { search, category } = req.query;
        let where = [], params = [];
        if (search)   { where.push('(name LIKE ? OR code LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
        if (category) { where.push('category = ?'); params.push(category); }
        const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const [rows] = await pool.query(`SELECT * FROM products ${whereSQL} ORDER BY name`, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data produk.' });
    }
});

// GET single product
router.get('/:id', auth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil produk.' });
    }
});

// POST create product
router.post('/', auth, async (req, res) => {
    const { code, name, category, unit, stock, cost_price, sell_price } = req.body;
    if (!code || !name)
        return res.status(400).json({ success: false, message: 'Kode dan nama produk wajib diisi.' });
    try {
        const [result] = await pool.query(
            'INSERT INTO products (code, name, category, unit, stock, cost_price, sell_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [code, name, category || null, unit || 'pcs', parseInt(stock || 0), parseFloat(cost_price || 0), parseFloat(sell_price || 0)]
        );
        res.json({ success: true, message: 'Produk berhasil ditambahkan.', id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Kode produk sudah ada.' });
        res.status(500).json({ success: false, message: 'Gagal menambahkan produk.' });
    }
});

// PUT update product
router.put('/:id', auth, async (req, res) => {
    const { code, name, category, unit, stock, cost_price, sell_price } = req.body;
    try {
        await pool.query(
            'UPDATE products SET code=?, name=?, category=?, unit=?, stock=?, cost_price=?, sell_price=? WHERE id=?',
            [code, name, category, unit, parseInt(stock), parseFloat(cost_price), parseFloat(sell_price), req.params.id]
        );
        res.json({ success: true, message: 'Produk berhasil diperbarui.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Kode produk sudah ada.' });
        res.status(500).json({ success: false, message: 'Gagal memperbarui produk.' });
    }
});

// PUT adjust stock
router.put('/:id/stock', auth, async (req, res) => {
    const { adjustment, notes } = req.body;
    try {
        await pool.query('UPDATE products SET stock = stock + ? WHERE id = ?', [parseInt(adjustment), req.params.id]);
        res.json({ success: true, message: 'Stok berhasil disesuaikan.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal menyesuaikan stok.' });
    }
});

// DELETE product
router.delete('/:id', auth, async (req, res) => {
    try {
        await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Produk berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal menghapus produk.' });
    }
});

module.exports = router;
