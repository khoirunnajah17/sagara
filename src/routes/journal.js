const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');

// GET all journal entries (with pagination)
router.get('/', auth, async (req, res) => {
    try {
        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const [rows] = await pool.query(
            `SELECT je.*, u.username as created_by_name
             FROM journal_entries je
             LEFT JOIN users u ON je.created_by = u.id
             ORDER BY je.date DESC, je.id DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM journal_entries');
        res.json({ success: true, data: rows, total, page, limit });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data jurnal.' });
    }
});

// GET single journal entry with details
router.get('/:id', auth, async (req, res) => {
    try {
        const [entries] = await pool.query(
            `SELECT je.*, u.username as created_by_name
             FROM journal_entries je LEFT JOIN users u ON je.created_by = u.id
             WHERE je.id = ?`, [req.params.id]
        );
        if (!entries.length) return res.status(404).json({ success: false, message: 'Jurnal tidak ditemukan.' });

        const [details] = await pool.query(
            `SELECT jd.*, a.code as account_code, a.name as account_name
             FROM journal_details jd
             JOIN accounts a ON jd.account_id = a.id
             WHERE jd.journal_entry_id = ?
             ORDER BY jd.id`, [req.params.id]
        );
        res.json({ success: true, data: { ...entries[0], details } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil detail jurnal.' });
    }
});

// POST create journal entry
router.post('/', auth, async (req, res) => {
    const { date, description, reference, details } = req.body;
    if (!date || !description || !details || !details.length)
        return res.status(400).json({ success: false, message: 'Data jurnal tidak lengkap.' });

    // Validate balanced entry
    const totalDebit  = details.reduce((s, d) => s + parseFloat(d.debit  || 0), 0);
    const totalCredit = details.reduce((s, d) => s + parseFloat(d.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01)
        return res.status(400).json({ success: false, message: 'Total debit dan kredit harus sama.' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [result] = await conn.query(
            'INSERT INTO journal_entries (date, description, reference, created_by) VALUES (?, ?, ?, ?)',
            [date, description, reference || null, req.session.user.id]
        );
        const journalId = result.insertId;

        for (const d of details) {
            await conn.query(
                'INSERT INTO journal_details (journal_entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?)',
                [journalId, d.account_id, parseFloat(d.debit || 0), parseFloat(d.credit || 0)]
            );
            // Update account balance
            const balance_change = parseFloat(d.debit || 0) - parseFloat(d.credit || 0);
            if (balance_change !== 0) {
                await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [balance_change, d.account_id]);
            }
        }

        await conn.commit();
        res.json({ success: true, message: 'Jurnal berhasil disimpan.', id: journalId });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal menyimpan jurnal.' });
    } finally {
        conn.release();
    }
});

// DELETE journal entry
router.delete('/:id', auth, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // Reverse account balances
        const [details] = await conn.query('SELECT * FROM journal_details WHERE journal_entry_id = ?', [req.params.id]);
        for (const d of details) {
            const balance_change = parseFloat(d.debit) - parseFloat(d.credit);
            await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [balance_change, d.account_id]);
        }
        await conn.query('DELETE FROM journal_entries WHERE id = ?', [req.params.id]);
        await conn.commit();
        res.json({ success: true, message: 'Jurnal berhasil dihapus.' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: 'Gagal menghapus jurnal.' });
    } finally {
        conn.release();
    }
});

// GET general ledger by account
router.get('/ledger/account/:accountId', auth, async (req, res) => {
    try {
        const [account] = await pool.query('SELECT * FROM accounts WHERE id = ?', [req.params.accountId]);
        if (!account.length) return res.status(404).json({ success: false, message: 'Akun tidak ditemukan.' });

        const [rows] = await pool.query(
            `SELECT jd.*, je.date, je.description, je.reference
             FROM journal_details jd
             JOIN journal_entries je ON jd.journal_entry_id = je.id
             WHERE jd.account_id = ?
             ORDER BY je.date ASC, je.id ASC`,
            [req.params.accountId]
        );
        res.json({ success: true, account: account[0], data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil buku besar.' });
    }
});

module.exports = router;
