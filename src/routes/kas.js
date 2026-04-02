const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');

// Account IDs for journal integration
const AKUN_KAS_TUNAI      = 3;  // 1-1001 Kas Tunai
const AKUN_PENDAPATAN     = 16; // 4-2000 Pendapatan Lain-lain
const AKUN_BEBAN_OPS      = 19; // 5-2000 Beban Operasional
const AKUN_PERSEDIAAN     = 6;  // 1-3000 Persediaan Barang
const AKUN_PENDAPATAN_JUAL = 15; // 4-1000 Pendapatan Penjualan

// Helper: create journal entry for kas transaction
async function createKasJournal(conn, { date, description, reference, amount, type, userId, isPurchase, isSale }) {
    const [result] = await conn.query(
        'INSERT INTO journal_entries (date, description, reference, created_by) VALUES (?, ?, ?, ?)',
        [date, `Kas: ${description || reference}`, reference, userId]
    );
    const journalId = result.insertId;

    let debitAccount, creditAccount;
    if (type === 'MASUK') {
        debitAccount  = AKUN_KAS_TUNAI;
        creditAccount = isSale ? AKUN_PENDAPATAN_JUAL : AKUN_PENDAPATAN;
    } else {
        debitAccount  = isPurchase ? AKUN_PERSEDIAAN : AKUN_BEBAN_OPS;
        creditAccount = AKUN_KAS_TUNAI;
    }

    await conn.query(
        'INSERT INTO journal_details (journal_entry_id, account_id, debit, credit) VALUES (?, ?, ?, 0), (?, ?, 0, ?)',
        [journalId, debitAccount, amount, journalId, creditAccount, amount]
    );
    // Update account balances
    await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, debitAccount]);
    await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, creditAccount]);

    return journalId;
}

// Helper: delete journal entry by reference and reverse account balances
async function deleteKasJournal(conn, reference) {
    const [entries] = await conn.query('SELECT id FROM journal_entries WHERE reference = ?', [reference]);
    for (const entry of entries) {
        const [details] = await conn.query('SELECT * FROM journal_details WHERE journal_entry_id = ?', [entry.id]);
        for (const d of details) {
            const balanceChange = parseFloat(d.debit) - parseFloat(d.credit);
            await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [balanceChange, d.account_id]);
        }
        await conn.query('DELETE FROM journal_entries WHERE id = ?', [entry.id]);
    }
}

// GET all kas transactions
router.get('/', auth, async (req, res) => {
    try {
        const { type, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let where = [], params = [];
        if (type) { where.push('k.type = ?'); params.push(type); }
        const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const [rows] = await pool.query(
            `SELECT k.*, u.username as created_by_name
             FROM kas k LEFT JOIN users u ON k.created_by = u.id
             ${whereSQL} ORDER BY k.date DESC, k.id DESC LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );
        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM kas k ${whereSQL}`, params);
        res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data kas.' });
    }
});

// GET summary
router.get('/summary', auth, async (req, res) => {
    try {
        const [[masuk]] = await pool.query(
            `SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM kas WHERE type = 'MASUK'`
        );
        const [[keluar]] = await pool.query(
            `SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM kas WHERE type = 'KELUAR'`
        );
        const saldo = parseFloat(masuk.total) - parseFloat(keluar.total);
        res.json({
            success: true,
            data: {
                masuk:  { count: masuk.count,  total: parseFloat(masuk.total) },
                keluar: { count: keluar.count, total: parseFloat(keluar.total) },
                saldo
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil ringkasan kas.' });
    }
});

// GET single kas
router.get('/:id', auth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM kas WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Transaksi kas tidak ditemukan.' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil detail kas.' });
    }
});

// POST create kas transaction
router.post('/', auth, async (req, res) => {
    const { reference, date, type, counterparty, description, amount } = req.body;
    if (!reference || !date || !type || !counterparty || !amount)
        return res.status(400).json({ success: false, message: 'Data transaksi kas tidak lengkap.' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [result] = await conn.query(
            `INSERT INTO kas (reference, date, type, counterparty, description, amount, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [reference, date, type, counterparty, description || null, parseFloat(amount), req.session.user.id]
        );
        // Auto-create journal entry
        await createKasJournal(conn, {
            date, description: description || counterparty, reference,
            amount: parseFloat(amount), type, userId: req.session.user.id
        });
        await conn.commit();
        res.json({ success: true, message: 'Transaksi kas berhasil disimpan.', id: result.insertId });
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Nomor referensi sudah ada.' });
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal menyimpan transaksi kas.' });
    } finally {
        conn.release();
    }
});

// DELETE kas transaction
router.delete('/:id', auth, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query('SELECT reference FROM kas WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
        // Reverse journal entry
        await deleteKasJournal(conn, rows[0].reference);
        await conn.query('DELETE FROM kas WHERE id = ?', [req.params.id]);
        await conn.commit();
        res.json({ success: true, message: 'Transaksi kas berhasil dihapus.' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: 'Gagal menghapus transaksi kas.' });
    } finally {
        conn.release();
    }
});

module.exports = router;
module.exports.createKasJournal = createKasJournal;
module.exports.deleteKasJournal = deleteKasJournal;
