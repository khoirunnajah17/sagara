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

// GET low stock products
router.get('/low-stock', auth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, code, name, stock, category FROM products WHERE stock <= 5 ORDER BY stock ASC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil data stok rendah.' });
    }
});

// GET Sales Report (Laporan Penjualan)
router.get('/sales-report', auth, async (req, res) => {
    try {
        const { from, to } = req.query;
        let where = "WHERE s.status != 'CANCELLED'";
        let params = [];
        if (from) { where += ' AND s.date >= ?'; params.push(from); }
        if (to)   { where += ' AND s.date <= ?'; params.push(to); }

        // Sales (admin/offline)
        const [sales] = await pool.query(`
            SELECT s.id, s.invoice_number as nomor, s.date as tanggal, s.customer_name as pelanggan,
                   'Penjualan Langsung' as sumber, s.subtotal, s.discount as diskon, s.total, s.status
            FROM sales s ${where} ORDER BY s.date DESC, s.id DESC`, params);

        // Orders (online/customer)
        let orderWhere = "WHERE o.status != 'CANCELLED'";
        let orderParams = [];
        if (from) { orderWhere += ' AND DATE(o.created_at) >= ?'; orderParams.push(from); }
        if (to)   { orderWhere += ' AND DATE(o.created_at) <= ?'; orderParams.push(to); }

        const [orders] = await pool.query(`
            SELECT o.id, o.order_number as nomor, DATE(o.created_at) as tanggal, o.customer_name as pelanggan,
                   'Order Online' as sumber, o.total as subtotal, 0 as diskon, o.total, o.status
            FROM orders o ${orderWhere} ORDER BY o.created_at DESC`, orderParams);

        const combined = [...sales, ...orders].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
        const totalSales = sales.reduce((s, r) => s + parseFloat(r.total), 0);
        const totalOrders = orders.reduce((s, r) => s + parseFloat(r.total), 0);
        const grandTotal = totalSales + totalOrders;

        // Product summary (top products)
        const [topProducts] = await pool.query(`
            SELECT p.name, p.code, SUM(si.quantity) as qty, SUM(si.subtotal) as revenue
            FROM sale_items si
            JOIN products p ON p.id = si.product_id
            JOIN sales s ON s.id = si.sale_id ${where}
            GROUP BY si.product_id ORDER BY revenue DESC LIMIT 10`, params);

        // Daily summary
        const [dailySummary] = await pool.query(`
            SELECT s.date as tanggal, COUNT(*) as jumlah_transaksi, SUM(s.total) as total
            FROM sales s ${where}
            GROUP BY s.date ORDER BY s.date DESC LIMIT 30`, params);

        res.json({
            success: true,
            data: {
                transactions: combined,
                totalSales, totalOrders, grandTotal,
                salesCount: sales.length, ordersCount: orders.length,
                topProducts, dailySummary, from, to
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil laporan penjualan.' });
    }
});

// GET Sales per User Report
router.get('/sales-per-user', auth, async (req, res) => {
    try {
        const { from, to } = req.query;
        let where = "WHERE s.status != 'CANCELLED'";
        let params = [];
        if (from) { where += ' AND s.date >= ?'; params.push(from); }
        if (to)   { where += ' AND s.date <= ?'; params.push(to); }

        // Summary per user
        const [perUser] = await pool.query(`
            SELECT u.id as user_id, u.username, u.email,
                   COUNT(s.id) as jumlah_transaksi,
                   COALESCE(SUM(s.total), 0) as total_penjualan,
                   MIN(s.date) as tanggal_pertama,
                   MAX(s.date) as tanggal_terakhir
            FROM sales s
            LEFT JOIN users u ON s.created_by = u.id
            ${where}
            GROUP BY u.id, u.username, u.email
            ORDER BY total_penjualan DESC`, params);

        // Detail per user (recent transactions)
        const [details] = await pool.query(`
            SELECT s.id, s.invoice_number, s.date, s.customer_name, s.total, s.status,
                   u.username as created_by_name
            FROM sales s
            LEFT JOIN users u ON s.created_by = u.id
            ${where}
            ORDER BY s.date DESC, s.id DESC`, params);

        const grandTotal = perUser.reduce((s, u) => s + parseFloat(u.total_penjualan), 0);
        const totalTransaksi = perUser.reduce((s, u) => s + u.jumlah_transaksi, 0);

        res.json({
            success: true,
            data: { perUser, details, grandTotal, totalTransaksi, from, to }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil laporan penjualan per user.' });
    }
});

// GET Monthly Sales & Purchases Report (Manajemen Bulanan)
router.get('/monthly', auth, async (req, res) => {
    try {
        const { year } = req.query;
        const filterYear = parseInt(year) || new Date().getFullYear();

        // Monthly sales summary
        const [monthlySales] = await pool.query(`
            SELECT 
                MONTH(date) as bulan,
                COUNT(*) as jumlah_transaksi,
                COALESCE(SUM(subtotal), 0) as subtotal,
                COALESCE(SUM(discount), 0) as total_diskon,
                COALESCE(SUM(shipping_cost), 0) as total_ongkir,
                COALESCE(SUM(total), 0) as total
            FROM sales 
            WHERE status != 'CANCELLED' AND YEAR(date) = ?
            GROUP BY MONTH(date)
            ORDER BY bulan`, [filterYear]);

        // Monthly purchases summary
        const [monthlyPurchases] = await pool.query(`
            SELECT 
                MONTH(date) as bulan,
                COUNT(*) as jumlah_transaksi,
                COALESCE(SUM(total), 0) as total
            FROM purchases 
            WHERE status != 'CANCELLED' AND YEAR(date) = ?
            GROUP BY MONTH(date)
            ORDER BY bulan`, [filterYear]);

        // Monthly online orders summary
        const [monthlyOrders] = await pool.query(`
            SELECT 
                MONTH(created_at) as bulan,
                COUNT(*) as jumlah_order,
                COALESCE(SUM(total), 0) as total
            FROM orders 
            WHERE status != 'CANCELLED' AND YEAR(created_at) = ?
            GROUP BY MONTH(created_at)
            ORDER BY bulan`, [filterYear]);

        // Build 12-month array
        const months = [];
        for (let m = 1; m <= 12; m++) {
            const sale = monthlySales.find(s => s.bulan === m) || {};
            const purchase = monthlyPurchases.find(p => p.bulan === m) || {};
            const order = monthlyOrders.find(o => o.bulan === m) || {};
            const penjualan = parseFloat(sale.total || 0);
            const pembelian = parseFloat(purchase.total || 0);
            const orderTotal = parseFloat(order.total || 0);
            months.push({
                bulan: m,
                penjualan_count: sale.jumlah_transaksi || 0,
                penjualan_subtotal: parseFloat(sale.subtotal || 0),
                penjualan_diskon: parseFloat(sale.total_diskon || 0),
                penjualan_ongkir: parseFloat(sale.total_ongkir || 0),
                penjualan_total: penjualan,
                pembelian_count: purchase.jumlah_transaksi || 0,
                pembelian_total: pembelian,
                order_count: order.jumlah_order || 0,
                order_total: orderTotal,
                laba_kotor: penjualan + orderTotal - pembelian
            });
        }

        // Year totals
        const totalPenjualan = months.reduce((s, m) => s + m.penjualan_total, 0);
        const totalPembelian = months.reduce((s, m) => s + m.pembelian_total, 0);
        const totalOrder = months.reduce((s, m) => s + m.order_total, 0);
        const totalLabaKotor = months.reduce((s, m) => s + m.laba_kotor, 0);
        const totalTxSales = months.reduce((s, m) => s + m.penjualan_count, 0);
        const totalTxPurchases = months.reduce((s, m) => s + m.pembelian_count, 0);
        const totalTxOrders = months.reduce((s, m) => s + m.order_count, 0);

        // Top products for the year
        const [topProducts] = await pool.query(`
            SELECT p.code, p.name, SUM(si.quantity) as qty, SUM(si.subtotal) as revenue
            FROM sale_items si
            JOIN products p ON p.id = si.product_id
            JOIN sales s ON s.id = si.sale_id
            WHERE s.status != 'CANCELLED' AND YEAR(s.date) = ?
            GROUP BY si.product_id ORDER BY revenue DESC LIMIT 10`, [filterYear]);

        // Top suppliers for the year
        const [topSuppliers] = await pool.query(`
            SELECT supplier_name, COUNT(*) as jumlah_po, COALESCE(SUM(total), 0) as total
            FROM purchases
            WHERE status != 'CANCELLED' AND YEAR(date) = ?
            GROUP BY supplier_name ORDER BY total DESC LIMIT 10`, [filterYear]);

        // Available years
        const [years] = await pool.query(`
            SELECT DISTINCT YEAR(date) as y FROM sales
            UNION SELECT DISTINCT YEAR(date) FROM purchases
            ORDER BY y DESC`);

        res.json({
            success: true,
            data: {
                year: filterYear,
                months,
                totalPenjualan, totalPembelian, totalOrder, totalLabaKotor,
                totalTxSales, totalTxPurchases, totalTxOrders,
                topProducts, topSuppliers,
                availableYears: years.map(y => y.y)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil laporan bulanan.' });
    }
});

module.exports = router;
