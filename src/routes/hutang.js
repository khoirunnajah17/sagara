const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');

// GET all hutang
router.get('/', auth, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let where = [], params = [];
        if (status) { where.push('h.status = ?'); params.push(status); }
        const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const [rows] = await pool.query(
            `SELECT h.*, u.username as created_by_name
             FROM hutang h LEFT JOIN users u ON h.created_by = u.id
             ${whereSQL} ORDER BY h.due_date ASC, h.id DESC LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );
        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM hutang h ${whereSQL}`, params);
        res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data hutang.' });
    }
});

// GET summary
router.get('/summary', auth, async (req, res) => {
    try {
        const [[summary]] = await pool.query(
            `SELECT COUNT(*) as count,
                    SUM(amount) as total_amount,
                    SUM(paid) as total_paid,
                    SUM(amount - paid) as total_sisa
             FROM hutang WHERE status = 'BELUM_LUNAS'`
        );
        const [[lunas]] = await pool.query(`SELECT COUNT(*) as count FROM hutang WHERE status = 'LUNAS'`);
        res.json({
            success: true,
            data: {
                belum_lunas: { count: summary.count || 0, total: parseFloat(summary.total_amount || 0), sisa: parseFloat(summary.total_sisa || 0) },
                lunas: { count: lunas.count || 0 }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil ringkasan hutang.' });
    }
});

// GET single hutang
router.get('/:id', auth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM hutang WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Hutang tidak ditemukan.' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil detail hutang.' });
    }
});

// POST create hutang
router.post('/', auth, async (req, res) => {
    const { reference, date, due_date, counterparty, description, amount } = req.body;
    if (!reference || !date || !due_date || !counterparty || !amount)
        return res.status(400).json({ success: false, message: 'Data hutang tidak lengkap.' });

    try {
        const [result] = await pool.query(
            `INSERT INTO hutang (reference, date, due_date, counterparty, description, amount, paid, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, 0, 'BELUM_LUNAS', ?)`,
            [reference, date, due_date, counterparty, description || null, parseFloat(amount), req.session.user.id]
        );
        res.json({ success: true, message: 'Hutang berhasil ditambahkan.', id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Nomor referensi sudah ada.' });
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal menyimpan hutang.' });
    }
});

// PUT bayar hutang
router.put('/:id/bayar', auth, async (req, res) => {
    const { jumlah } = req.body;
    if (!jumlah || parseFloat(jumlah) <= 0)
        return res.status(400).json({ success: false, message: 'Jumlah pembayaran tidak valid.' });

    try {
        const [rows] = await pool.query('SELECT * FROM hutang WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Hutang tidak ditemukan.' });

        const hutang = rows[0];
        const sisa = parseFloat(hutang.amount) - parseFloat(hutang.paid);
        const bayar = Math.min(parseFloat(jumlah), sisa);
        const newPaid = parseFloat(hutang.paid) + bayar;
        const newStatus = newPaid >= parseFloat(hutang.amount) ? 'LUNAS' : 'BELUM_LUNAS';

        await pool.query('UPDATE hutang SET paid = ?, status = ? WHERE id = ?', [newPaid, newStatus, req.params.id]);
        res.json({ success: true, message: `Pembayaran Rp ${bayar.toLocaleString('id-ID')} berhasil.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal memproses pembayaran.' });
    }
});

// DELETE hutang
router.delete('/:id', auth, async (req, res) => {
    try {
        await pool.query('DELETE FROM hutang WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Hutang berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal menghapus hutang.' });
    }
});

module.exports = router;
