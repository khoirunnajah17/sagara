const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');

// GET dashboard summary
router.get('/dashboard', auth, async (req, res) => {
    try {
        const [[totalAsset]]     = await pool.query(`SELECT SUM(balance) as total FROM accounts WHERE type='ASSET'`);
        const [[totalLiability]] = await pool.query(`SELECT SUM(balance) as total FROM accounts WHERE type='LIABILITY'`);
        const [[totalRevenue]]   = await pool.query(`SELECT COALESCE(SUM(total),0) as total FROM sales WHERE status != 'CANCELLED'`);
        const [[totalPurchase]]  = await pool.query(`SELECT COALESCE(SUM(total),0) as total FROM purchases WHERE status != 'CANCELLED'`);
        const [[lowStock]]       = await pool.query(`SELECT COUNT(*) as count FROM products WHERE stock <= 5`);
        const [recentSales]      = await pool.query(`SELECT * FROM sales ORDER BY created_at DESC LIMIT 5`);

        res.json({
            success: true,
            data: {
                totalAsset:    parseFloat(totalAsset.total    || 0),
                totalLiability: parseFloat(totalLiability.total || 0),
                totalRevenue:  parseFloat(totalRevenue.total  || 0),
                totalPurchase: parseFloat(totalPurchase.total || 0),
                lowStock:      lowStock.count,
                recentSales
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dashboard.' });
    }
});

// GET Balance Sheet (Neraca)
router.get('/balance-sheet', auth, async (req, res) => {
    try {
        const [assets]      = await pool.query(`SELECT * FROM accounts WHERE type='ASSET' ORDER BY code`);
        const [liabilities] = await pool.query(`SELECT * FROM accounts WHERE type='LIABILITY' ORDER BY code`);
        const [equities]    = await pool.query(`SELECT * FROM accounts WHERE type='EQUITY' ORDER BY code`);

        const totalAssets      = assets.reduce((s, a)      => s + parseFloat(a.balance), 0);
        const totalLiabilities = liabilities.reduce((s, a) => s + parseFloat(a.balance), 0);
        const totalEquity      = equities.reduce((s, a)    => s + parseFloat(a.balance), 0);

        res.json({
            success: true,
            data: { assets, liabilities, equities, totalAssets, totalLiabilities, totalEquity }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil neraca.' });
    }
});

// GET Income Statement (Laba Rugi)
router.get('/income-statement', auth, async (req, res) => {
    try {
        const { from, to } = req.query;
        let salesWhere = "WHERE status != 'CANCELLED'";
        let salesParams = [];
        if (from) { salesWhere += ' AND date >= ?'; salesParams.push(from); }
        if (to)   { salesWhere += ' AND date <= ?'; salesParams.push(to); }

        const [[revenue]]  = await pool.query(`SELECT COALESCE(SUM(total),0) as total FROM sales ${salesWhere}`, salesParams);
        const [revenues]   = await pool.query(`SELECT * FROM accounts WHERE type='REVENUE' ORDER BY code`);
        const [expenses]   = await pool.query(`SELECT * FROM accounts WHERE type='EXPENSE' ORDER BY code`);

        const totalRevenue = parseFloat(revenue.total || 0);
        const totalExpense = expenses.reduce((s, a) => s + parseFloat(a.balance), 0);
        const netIncome    = totalRevenue - totalExpense;

        res.json({
            success: true,
            data: { revenues, expenses, totalRevenue, totalExpense, netIncome, from, to }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil laba rugi.' });
    }
});

// GET Trial Balance (Neraca Saldo)
router.get('/trial-balance', auth, async (req, res) => {
    try {
        const [accounts] = await pool.query(`
            SELECT a.*, 
                COALESCE(SUM(jd.debit),0) as total_debit,
                COALESCE(SUM(jd.credit),0) as total_credit
            FROM accounts a
            LEFT JOIN journal_details jd ON jd.account_id = a.id
            GROUP BY a.id
            ORDER BY a.code`
        );
        const totalDebit  = accounts.reduce((s, a) => s + parseFloat(a.total_debit),  0);
        const totalCredit = accounts.reduce((s, a) => s + parseFloat(a.total_credit), 0);
        res.json({ success: true, data: accounts, totalDebit, totalCredit });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil neraca saldo.' });
    }
});

module.exports = router;
