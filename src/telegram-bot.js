/* ============================================================
   Telegram Bot – Kasir Sagara Meat House (Interactive Menu)
   ============================================================
   Full inline keyboard & reply keyboard for easy cashier input.
   No need to type commands — just tap buttons!
   ============================================================ */

const TelegramBot = require('node-telegram-bot-api');
const pool = require('./config/db');
const { createKasJournal } = require('./routes/kas');

// Per-user cart & state
const carts = {};
const userState = {}; // track what input we're waiting for

function getCart(chatId) {
    if (!carts[chatId]) carts[chatId] = { items: [], customer: 'Pelanggan Umum' };
    return carts[chatId];
}

function formatRupiah(n) {
    return 'Rp ' + Number(n).toLocaleString('id-ID');
}

// ── Reply keyboard (persistent bottom menu) ─────────────────
const mainMenu = {
    reply_markup: {
        keyboard: [
            [{ text: '📦 Produk' }, { text: '🔍 Cari Produk' }],
            [{ text: '🛒 Keranjang' }, { text: '💰 Bayar' }],
            [{ text: '👤 Pelanggan' }, { text: '🗑️ Kosongkan' }],
            [{ text: '📋 Riwayat' }, { text: '📒 Hutang' }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
    },
    parse_mode: 'Markdown',
};

function startBot(token) {
    if (!token) {
        console.log('⚠️  TELEGRAM_BOT_TOKEN tidak diset. Telegram bot dinonaktifkan.');
        return null;
    }

    const bot = new TelegramBot(token, { polling: true });
    console.log('🤖 Telegram Bot Kasir aktif! (polling started)');

    bot.on('polling_error', (err) => {
        console.error('Telegram polling error:', err.code, err.message);
    });

    // ── Helper: send product list with inline "Tambah" buttons ──
    async function sendProductList(chatId, products, title) {
        if (!products.length) return bot.sendMessage(chatId, '📦 Tidak ada produk ditemukan.', mainMenu);

        // Send products in groups of 5 for readability
        const PAGE = 5;
        for (let i = 0; i < products.length; i += PAGE) {
            const batch = products.slice(i, i + PAGE);
            let text = i === 0 ? `${title}\n\n` : '';
            const buttons = [];

            batch.forEach(p => {
                const stok = parseFloat(p.stock) || 0;
                const icon = stok <= 0 ? '🔴' : stok <= 5 ? '🟡' : '🟢';
                text += `${icon} \`${p.code}\` *${p.name}*\n`;
                text += `   ${formatRupiah(p.sell_price)}/${p.unit || 'pcs'} — Stok: ${stok}\n`;

                const row = [];
                if (stok > 0) {
                    row.push({ text: `➕ ${p.name}`, callback_data: `add_${p.code}` });
                }
                row.push({ text: `✏️ Harga`, callback_data: `editPrice_${p.code}` });
                buttons.push(row);
            });

            await bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            });
        }
    }

    // ── Helper: send quantity picker for a product ──────────
    function sendQtyPicker(chatId, code, name, price, unit) {
        const qtyOptions = [1, 2, 3, 5, 10, 0.5];
        const rows = [];
        let row = [];
        qtyOptions.forEach(q => {
            row.push({ text: `${q}`, callback_data: `qty_${code}_${q}` });
            if (row.length === 3) { rows.push(row); row = []; }
        });
        if (row.length) rows.push(row);
        rows.push([{ text: '✏️ Jumlah Lain...', callback_data: `qtyCustom_${code}` }]);

        bot.sendMessage(chatId,
            `➕ *${name}*\n${formatRupiah(price)}/${unit}\n\nPilih jumlah:`,
            {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: rows }
            }
        );
    }

    // ── Helper: add item to cart ────────────────────────────
    async function addToCart(chatId, code, qty) {
        try {
            const [[product]] = await pool.query(
                'SELECT id, code, name, sell_price, stock, unit, sell_content FROM products WHERE code = ? LIMIT 1',
                [code]
            );
            if (!product) return bot.sendMessage(chatId, `❌ Produk \`${code}\` tidak ditemukan.`, { parse_mode: 'Markdown' });

            const stok = parseFloat(product.stock) || 0;
            const sellContent = parseFloat(product.sell_content) || 1;
            if (stok < qty * sellContent) {
                return bot.sendMessage(chatId, `⚠️ Stok tidak cukup! Tersedia: ${stok}`);
            }

            const cart = getCart(chatId);
            const existing = cart.items.find(i => i.product_id === product.id);
            if (existing) {
                existing.qty += qty;
            } else {
                cart.items.push({
                    product_id: product.id,
                    code: product.code,
                    name: product.name,
                    qty,
                    price: parseFloat(product.sell_price),
                    unit: product.unit || 'pcs'
                });
            }

            const total = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
            bot.sendMessage(chatId,
                `✅ *${product.name}* x${qty} ditambahkan!\n\n` +
                `🛒 ${cart.items.length} jenis | 💰 *${formatRupiah(total)}*`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📦 Tambah Lagi', callback_data: 'menu_produk' },
                                { text: '🛒 Keranjang', callback_data: 'menu_keranjang' },
                            ],
                            [{ text: '💰 Bayar Sekarang', callback_data: 'menu_bayar' }]
                        ]
                    }
                }
            );
        } catch (e) {
            bot.sendMessage(chatId, '❌ Gagal: ' + e.message);
        }
    }

    // ── Helper: show cart with inline buttons ───────────────
    function showCart(chatId) {
        const cart = getCart(chatId);
        if (!cart.items.length) {
            return bot.sendMessage(chatId, '🛒 Keranjang kosong.\nTekan *📦 Produk* untuk mulai belanja.', mainMenu);
        }

        let text = `🛒 *Keranjang Belanja*\n👤 ${cart.customer}\n━━━━━━━━━━━━━━━━━━━\n`;
        let total = 0;
        const removeButtons = [];

        cart.items.forEach((item, i) => {
            const sub = item.price * item.qty;
            total += sub;
            text += `${i + 1}. *${item.name}*\n`;
            text += `   ${item.qty} ${item.unit} × ${formatRupiah(item.price)} = *${formatRupiah(sub)}*\n`;
            removeButtons.push([
                { text: `➖ ${item.name}`, callback_data: `rmItem_${i}` },
                { text: `➕ 1`, callback_data: `addMore_${item.code}` }
            ]);
        });

        text += `━━━━━━━━━━━━━━━━━━━\n💰 *TOTAL: ${formatRupiah(total)}*`;

        const buttons = [
            ...removeButtons,
            [
                { text: '💰 BAYAR', callback_data: 'menu_bayar' },
                { text: '🗑️ Kosongkan', callback_data: 'menu_hapus' }
            ],
            [{ text: '📦 Tambah Produk', callback_data: 'menu_produk' }]
        ];

        bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        });
    }

    // ── Helper: process payment ─────────────────────────────
    async function processPayment(chatId) {
        const cart = getCart(chatId);
        if (!cart.items.length) {
            return bot.sendMessage(chatId, '🛒 Keranjang kosong. Tambah produk dulu.', mainMenu);
        }

        // Confirm first — show payment method options
        const total = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
        let preview = `💰 *Konfirmasi Pembayaran*\n━━━━━━━━━━━━━━━━━━━\n`;
        preview += `👤 ${cart.customer}\n`;
        preview += `🛒 ${cart.items.length} jenis barang\n`;
        preview += `💰 *Total: ${formatRupiah(total)}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
        preview += `Pilih metode pembayaran:`;

        bot.sendMessage(chatId, preview, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💵 Bayar Tunai', callback_data: 'confirmPay' }],
                    [{ text: '📒 Hutang (Bayar Nanti)', callback_data: 'confirmPayHutang' }],
                    [{ text: '❌ Batal', callback_data: 'menu_keranjang' }]
                ]
            }
        });
    }

    // ── Helper: execute payment (after confirm) ─────────────
    async function executePayment(chatId) {
        const cart = getCart(chatId);
        if (!cart.items.length) return bot.sendMessage(chatId, '🛒 Keranjang kosong.', mainMenu);

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const items = cart.items.map(i => ({
                product_id: i.product_id, quantity: i.qty, unit_price: i.price
            }));
            const subtotal = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
            const total = subtotal;
            const invoiceNum = 'TG-' + Date.now();
            const today = new Date().toISOString().slice(0, 10);

            // 1. Insert sale
            const [result] = await conn.query(
                `INSERT INTO sales (invoice_number, date, customer_name, channel, subtotal, discount, shipping_cost, total, status, notes, created_by)
                 VALUES (?, ?, ?, 'DIRECT', ?, 0, 0, ?, 'DONE', 'Via Telegram Bot', 1)`,
                [invoiceNum, today, cart.customer, subtotal, total]
            );
            const saleId = result.insertId;

            // 2. Insert sale items
            for (const item of items) {
                const itemSub = parseFloat(item.unit_price) * parseFloat(item.quantity);
                await conn.query(
                    'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
                    [saleId, item.product_id, item.quantity, item.unit_price, itemSub]
                );
            }

            // 3. Deduct stock
            for (const item of cart.items) {
                const [[prod]] = await conn.query('SELECT sell_content FROM products WHERE id = ?', [item.product_id]);
                const sellContent = parseFloat(prod?.sell_content) || 1;
                const totalQty = item.qty * sellContent;
                await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [totalQty, item.product_id]);
            }

            // 4. Kas masuk
            await conn.query(
                `INSERT INTO kas (reference, date, type, counterparty, description, amount, created_by)
                 VALUES (?, ?, 'MASUK', ?, ?, ?, 1)`,
                [invoiceNum, today, cart.customer, `Penjualan ${invoiceNum} (Telegram)`, total]
            );

            // 5. Journal entry
            await createKasJournal(conn, {
                date: today, description: `Penjualan ${invoiceNum} (Telegram)`,
                reference: invoiceNum, amount: total, type: 'MASUK', userId: 1, isSale: true
            });

            await conn.commit();

            // Build receipt
            let receipt = `🧾 *NOTA PENJUALAN*\n`;
            receipt += `━━━━━━━━━━━━━━━━━━━\n`;
            receipt += `📋 ${invoiceNum}\n`;
            receipt += `📅 ${today}\n`;
            receipt += `👤 ${cart.customer}\n`;
            receipt += `━━━━━━━━━━━━━━━━━━━\n`;
            cart.items.forEach(item => {
                receipt += `${item.name}\n`;
                receipt += `  ${item.qty} ${item.unit} × ${formatRupiah(item.price)} = ${formatRupiah(item.price * item.qty)}\n`;
            });
            receipt += `━━━━━━━━━━━━━━━━━━━\n`;
            receipt += `💰 *TOTAL: ${formatRupiah(total)}*\n`;
            receipt += `━━━━━━━━━━━━━━━━━━━\n`;
            receipt += `✅ Pembayaran berhasil!\n`;
            receipt += `_Terima kasih_ 🙏`;

            bot.sendMessage(chatId, receipt, mainMenu);

            // Clear cart
            carts[chatId] = { items: [], customer: 'Pelanggan Umum' };

        } catch (e) {
            await conn.rollback();
            bot.sendMessage(chatId, '❌ Gagal proses pembayaran: ' + e.message, mainMenu);
        } finally {
            conn.release();
        }
    }

    // ── Helper: execute payment as HUTANG (credit) ──────────
    async function executePaymentHutang(chatId) {
        const cart = getCart(chatId);
        if (!cart.items.length) return bot.sendMessage(chatId, '🛒 Keranjang kosong.', mainMenu);

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const items = cart.items.map(i => ({
                product_id: i.product_id, quantity: i.qty, unit_price: i.price
            }));
            const subtotal = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
            const total = subtotal;
            const invoiceNum = 'TG-' + Date.now();
            const today = new Date().toISOString().slice(0, 10);

            // 1. Insert sale (status DONE, notes mention hutang)
            const [result] = await conn.query(
                `INSERT INTO sales (invoice_number, date, customer_name, channel, subtotal, discount, shipping_cost, total, status, notes, created_by)
                 VALUES (?, ?, ?, 'DIRECT', ?, 0, 0, ?, 'DONE', 'Via Telegram Bot - HUTANG', 1)`,
                [invoiceNum, today, cart.customer, subtotal, total]
            );
            const saleId = result.insertId;

            // 2. Insert sale items
            for (const item of items) {
                const itemSub = parseFloat(item.unit_price) * parseFloat(item.quantity);
                await conn.query(
                    'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
                    [saleId, item.product_id, item.quantity, item.unit_price, itemSub]
                );
            }

            // 3. Deduct stock
            for (const item of cart.items) {
                const [[prod]] = await conn.query('SELECT sell_content FROM products WHERE id = ?', [item.product_id]);
                const sellContent = parseFloat(prod?.sell_content) || 1;
                const totalQty = item.qty * sellContent;
                await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [totalQty, item.product_id]);
            }

            // 4. Create hutang record (NO kas masuk — payment is deferred)
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 30); // Default 30 days
            const dueDateStr = dueDate.toISOString().slice(0, 10);

            await conn.query(
                `INSERT INTO hutang (reference, date, due_date, counterparty, description, amount, paid, status, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, 0, 'BELUM_LUNAS', 1)`,
                [invoiceNum, today, dueDateStr, cart.customer,
                 `Penjualan ${invoiceNum} (Telegram) - Hutang`, total]
            );

            await conn.commit();

            // Build receipt
            let receipt = `🧾 *NOTA PENJUALAN \- HUTANG*\n`;
            receipt += `━━━━━━━━━━━━━━━━━━━\n`;
            receipt += `📋 ${invoiceNum}\n`;
            receipt += `📅 ${today}\n`;
            receipt += `👤 ${cart.customer}\n`;
            receipt += `━━━━━━━━━━━━━━━━━━━\n`;
            cart.items.forEach(item => {
                receipt += `${item.name}\n`;
                receipt += `  ${item.qty} ${item.unit} × ${formatRupiah(item.price)} = ${formatRupiah(item.price * item.qty)}\n`;
            });
            receipt += `━━━━━━━━━━━━━━━━━━━\n`;
            receipt += `💰 *TOTAL: ${formatRupiah(total)}*\n`;
            receipt += `📒 *Status: HUTANG*\n`;
            receipt += `⏰ Jatuh tempo: ${dueDateStr}\n`;
            receipt += `━━━━━━━━━━━━━━━━━━━\n`;
            receipt += `⚠️ _Belum dibayar \- tercatat sebagai hutang_`;

            bot.sendMessage(chatId, receipt, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📒 Lihat Hutang', callback_data: 'menu_hutang' }]
                    ]
                }
            });

            // Clear cart
            carts[chatId] = { items: [], customer: 'Pelanggan Umum' };

        } catch (e) {
            await conn.rollback();
            bot.sendMessage(chatId, '❌ Gagal proses hutang: ' + e.message, mainMenu);
        } finally {
            conn.release();
        }
    }

    // ── Helper: show hutang list ─────────────────────────────
    async function showHutangList(chatId, filter) {
        try {
            let where = '';
            if (filter === 'BELUM_LUNAS') where = "WHERE status = 'BELUM_LUNAS'";
            else if (filter === 'LUNAS') where = "WHERE status = 'LUNAS'";
            else if (filter === 'JATUH_TEMPO') where = "WHERE status = 'BELUM_LUNAS' AND due_date < CURDATE()";

            const [rows] = await pool.query(
                `SELECT * FROM hutang ${where} ORDER BY due_date ASC LIMIT 15`
            );

            // Summary
            const [[sum]] = await pool.query(
                `SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as total, COALESCE(SUM(paid),0) as paid,
                        COALESCE(SUM(amount - paid),0) as sisa
                 FROM hutang WHERE status = 'BELUM_LUNAS'`
            );
            const [[overdue]] = await pool.query(
                `SELECT COUNT(*) as cnt FROM hutang WHERE status = 'BELUM_LUNAS' AND due_date < CURDATE()`
            );

            let text = `📒 *HUTANG*\n━━━━━━━━━━━━━━━━━━━\n`;
            text += `📊 Belum lunas: ${sum.cnt} hutang\n`;
            text += `💰 Total sisa: *${formatRupiah(sum.sisa)}*\n`;
            if (overdue.cnt > 0) text += `⚠️ Jatuh tempo: ${overdue.cnt} hutang\n`;
            text += `━━━━━━━━━━━━━━━━━━━\n\n`;

            if (!rows.length) {
                text += '_Tidak ada data hutang._';
                bot.sendMessage(chatId, text, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '➕ Tambah Hutang', callback_data: 'hutang_add' }],
                            [
                                { text: 'Semua', callback_data: 'htFilter_ALL' },
                                { text: 'Belum Lunas', callback_data: 'htFilter_BELUM_LUNAS' },
                                { text: 'Lunas', callback_data: 'htFilter_LUNAS' },
                            ]
                        ]
                    }
                });
                return;
            }

            const buttons = [];
            rows.forEach(h => {
                const sisa = parseFloat(h.amount) - parseFloat(h.paid);
                const dueDate = typeof h.due_date === 'string' ? h.due_date : new Date(h.due_date).toISOString().slice(0, 10);
                const dateStr = typeof h.date === 'string' ? h.date : new Date(h.date).toISOString().slice(0, 10);
                const isOverdue = h.status === 'BELUM_LUNAS' && new Date(h.due_date) < new Date();
                const icon = h.status === 'LUNAS' ? '✅' : isOverdue ? '🔴' : '🟡';

                text += `${icon} *${h.counterparty}*\n`;
                text += `   \`${h.reference}\` | ${dateStr}\n`;
                text += `   Jumlah: ${formatRupiah(h.amount)}\n`;
                text += `   Dibayar: ${formatRupiah(h.paid)} | Sisa: *${formatRupiah(sisa)}*\n`;
                text += `   Jatuh tempo: ${dueDate}${isOverdue ? ' ⚠️' : ''}\n\n`;

                if (h.status === 'BELUM_LUNAS') {
                    buttons.push([
                        { text: `💳 Bayar ${h.counterparty}`, callback_data: `htBayar_${h.id}` }
                    ]);
                }
            });

            buttons.push([{ text: '➕ Tambah Hutang', callback_data: 'hutang_add' }]);
            buttons.push([
                { text: 'Semua', callback_data: 'htFilter_ALL' },
                { text: 'Belum Lunas', callback_data: 'htFilter_BELUM_LUNAS' },
                { text: 'Jatuh Tempo', callback_data: 'htFilter_JATUH_TEMPO' },
                { text: 'Lunas', callback_data: 'htFilter_LUNAS' },
            ]);

            bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            });
        } catch (e) {
            bot.sendMessage(chatId, '❌ Gagal memuat hutang: ' + e.message, mainMenu);
        }
    }

    // ── Helper: show hutang detail with pay buttons ──────────
    async function showHutangDetail(chatId, hutangId) {
        try {
            const [[h]] = await pool.query('SELECT * FROM hutang WHERE id = ?', [hutangId]);
            if (!h) return bot.sendMessage(chatId, '❌ Hutang tidak ditemukan.', mainMenu);

            const sisa = parseFloat(h.amount) - parseFloat(h.paid);
            const dueDate = typeof h.due_date === 'string' ? h.due_date : new Date(h.due_date).toISOString().slice(0, 10);
            const dateStr = typeof h.date === 'string' ? h.date : new Date(h.date).toISOString().slice(0, 10);
            const isOverdue = h.status === 'BELUM_LUNAS' && new Date(h.due_date) < new Date();

            let text = `📒 *DETAIL HUTANG*\n━━━━━━━━━━━━━━━━━━━\n`;
            text += `📋 Ref: \`${h.reference}\`\n`;
            text += `👤 Ke: *${h.counterparty}*\n`;
            text += `📅 Tanggal: ${dateStr}\n`;
            text += `⏰ Jatuh Tempo: ${dueDate}${isOverdue ? ' ⚠️ LEWAT' : ''}\n`;
            if (h.description) text += `📝 ${h.description}\n`;
            text += `━━━━━━━━━━━━━━━━━━━\n`;
            text += `💰 Jumlah: *${formatRupiah(h.amount)}*\n`;
            text += `✅ Dibayar: ${formatRupiah(h.paid)}\n`;
            text += `📌 Sisa: *${formatRupiah(sisa)}*\n`;
            text += `📊 Status: ${h.status === 'LUNAS' ? '✅ LUNAS' : '🟡 BELUM LUNAS'}\n`;

            const buttons = [];
            if (h.status === 'BELUM_LUNAS') {
                // Quick pay amount buttons
                const quickAmounts = [];
                if (sisa >= 50000) quickAmounts.push(50000);
                if (sisa >= 100000) quickAmounts.push(100000);
                if (sisa >= 500000) quickAmounts.push(500000);
                if (sisa >= 1000000) quickAmounts.push(1000000);

                if (quickAmounts.length) {
                    const row = quickAmounts.map(a => ({
                        text: formatRupiah(a), callback_data: `htPay_${h.id}_${a}`
                    }));
                    buttons.push(row);
                }
                buttons.push([
                    { text: '💳 Bayar Lunas (' + formatRupiah(sisa) + ')', callback_data: `htPay_${h.id}_${sisa}` }
                ]);
                buttons.push([
                    { text: '✏️ Jumlah Lain...', callback_data: `htPayCustom_${h.id}` }
                ]);
            }
            buttons.push([{ text: '◀️ Kembali', callback_data: 'menu_hutang' }]);

            bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            });
        } catch (e) {
            bot.sendMessage(chatId, '❌ Gagal: ' + e.message, mainMenu);
        }
    }

    // ── Helper: process hutang payment ───────────────────────
    async function payHutang(chatId, hutangId, jumlah) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const [[h]] = await conn.query('SELECT * FROM hutang WHERE id = ?', [hutangId]);
            if (!h) {
                await conn.rollback();
                return bot.sendMessage(chatId, '❌ Hutang tidak ditemukan.', mainMenu);
            }
            if (h.status === 'LUNAS') {
                await conn.rollback();
                return bot.sendMessage(chatId, '✅ Hutang ini sudah lunas.', mainMenu);
            }

            const sisa = parseFloat(h.amount) - parseFloat(h.paid);
            const bayar = Math.min(parseFloat(jumlah), sisa);
            const newPaid = parseFloat(h.paid) + bayar;
            const newStatus = newPaid >= parseFloat(h.amount) ? 'LUNAS' : 'BELUM_LUNAS';

            // 1. Update hutang
            await conn.query('UPDATE hutang SET paid = ?, status = ? WHERE id = ?',
                [newPaid, newStatus, hutangId]);

            const today = new Date().toISOString().slice(0, 10);
            const ref = `HT-PAY-${h.id}-${Date.now()}`;

            // 2. Kas keluar (paying debt reduces cash)
            await conn.query(
                `INSERT INTO kas (reference, date, type, counterparty, description, amount, created_by)
                 VALUES (?, ?, 'KELUAR', ?, ?, ?, 1)`,
                [ref, today, h.counterparty, `Pembayaran hutang ${h.reference} (Telegram)`, bayar]
            );

            // 3. Journal entry
            await createKasJournal(conn, {
                date: today,
                description: `Pembayaran hutang ${h.reference} (Telegram)`,
                reference: ref,
                amount: bayar,
                type: 'KELUAR',
                userId: 1,
                isPurchase: false,
                isSale: false
            });

            await conn.commit();

            const newSisa = parseFloat(h.amount) - newPaid;
            let receipt = `💳 *BUKTI PEMBAYARAN HUTANG*\n`;
            receipt += `━━━━━━━━━━━━━━━━━━━\n`;
            receipt += `📋 ${h.reference}\n`;
            receipt += `👤 ${h.counterparty}\n`;
            receipt += `📅 ${today}\n`;
            receipt += `━━━━━━━━━━━━━━━━━━━\n`;
            receipt += `💰 Dibayar: *${formatRupiah(bayar)}*\n`;
            receipt += `📌 Sisa: *${formatRupiah(newSisa)}*\n`;
            receipt += `📊 Status: ${newStatus === 'LUNAS' ? '✅ LUNAS' : '🟡 BELUM LUNAS'}\n`;
            receipt += `━━━━━━━━━━━━━━━━━━━\n`;
            receipt += `_Pembayaran berhasil dicatat_ ✅`;

            bot.sendMessage(chatId, receipt, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📒 Lihat Hutang', callback_data: 'menu_hutang' }]
                    ]
                }
            });
        } catch (e) {
            await conn.rollback();
            bot.sendMessage(chatId, '❌ Gagal bayar hutang: ' + e.message, mainMenu);
        } finally {
            conn.release();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ── CALLBACK QUERY HANDLER (inline button taps) ──────────
    // ═══════════════════════════════════════════════════════════
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const data = query.data;

        // Acknowledge the button press
        bot.answerCallbackQuery(query.id);

        // ── Menu navigation buttons ─────────────────────────
        if (data === 'menu_produk') {
            try {
                const [products] = await pool.query(
                    'SELECT code, name, sell_price, stock, unit FROM products WHERE stock > 0 ORDER BY name LIMIT 30'
                );
                await sendProductList(chatId, products, '📦 *Daftar Produk:*');
            } catch (e) {
                bot.sendMessage(chatId, '❌ Gagal: ' + e.message);
            }
            return;
        }

        if (data === 'menu_keranjang') { showCart(chatId); return; }
        if (data === 'menu_bayar') { processPayment(chatId); return; }
        if (data === 'menu_hapus') {
            carts[chatId] = { items: [], customer: 'Pelanggan Umum' };
            bot.sendMessage(chatId, '🗑️ Keranjang dikosongkan.', mainMenu);
            return;
        }

        // ── Add product → show qty picker ───────────────────
        if (data.startsWith('add_')) {
            const code = data.replace('add_', '');
            try {
                const [[p]] = await pool.query(
                    'SELECT code, name, sell_price, unit FROM products WHERE code = ?', [code]
                );
                if (p) sendQtyPicker(chatId, p.code, p.name, parseFloat(p.sell_price), p.unit || 'pcs');
            } catch (e) {
                bot.sendMessage(chatId, '❌ Gagal: ' + e.message);
            }
            return;
        }

        // ── Quantity selected ───────────────────────────────
        if (data.startsWith('qty_')) {
            const parts = data.split('_');
            const code = parts[1];
            const qty = parseFloat(parts[2]);
            await addToCart(chatId, code, qty);
            return;
        }

        // ── Custom quantity ─────────────────────────────────
        if (data.startsWith('qtyCustom_')) {
            const code = data.replace('qtyCustom_', '');
            userState[chatId] = { waiting: 'customQty', code };
            bot.sendMessage(chatId, `✏️ Ketik jumlah untuk produk \`${code}\`:`, {
                parse_mode: 'Markdown',
                reply_markup: { force_reply: true, selective: true }
            });
            return;
        }

        // ── Remove item from cart ───────────────────────────
        if (data.startsWith('rmItem_')) {
            const idx = parseInt(data.replace('rmItem_', ''));
            const cart = getCart(chatId);
            if (cart.items[idx]) {
                const removed = cart.items.splice(idx, 1)[0];
                bot.sendMessage(chatId, `🗑️ *${removed.name}* dihapus dari keranjang.`, { parse_mode: 'Markdown' });
                if (cart.items.length) showCart(chatId);
                else bot.sendMessage(chatId, '🛒 Keranjang sekarang kosong.', mainMenu);
            }
            return;
        }

        // ── Add +1 more of existing item ────────────────────
        if (data.startsWith('addMore_')) {
            const code = data.replace('addMore_', '');
            await addToCart(chatId, code, 1);
            return;
        }

        // ── Edit sell price ─────────────────────────────────
        if (data.startsWith('editPrice_')) {
            const code = data.replace('editPrice_', '');
            try {
                const [[p]] = await pool.query(
                    'SELECT code, name, sell_price, unit FROM products WHERE code = ?', [code]
                );
                if (!p) return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.', mainMenu);
                userState[chatId] = { waiting: 'editPriceInput', code: p.code };
                bot.sendMessage(chatId,
                    `✏️ *Ubah Harga Jual*\n\n` +
                    `📦 *${p.name}* (\`${p.code}\`)\n` +
                    `💰 Harga saat ini: *${formatRupiah(p.sell_price)}*/${p.unit || 'pcs'}\n\n` +
                    `Ketik harga baru (angka saja):`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: { force_reply: true, selective: true }
                    }
                );
            } catch (e) {
                bot.sendMessage(chatId, '❌ Gagal: ' + e.message);
            }
            return;
        }

        // ── Confirm payment (tunai) ─────────────────────────
        if (data === 'confirmPay') {
            await executePayment(chatId);
            return;
        }

        // ── Confirm payment (hutang) ────────────────────────
        if (data === 'confirmPayHutang') {
            await executePaymentHutang(chatId);
            return;
        }

        // ── Hutang due date quick pick ──────────────────────
        if (data.startsWith('htDue_')) {
            const days = parseInt(data.replace('htDue_', ''));
            const state = userState[chatId];
            if (!state || state.waiting !== 'hutangNew' || state.step !== 'due_date') return;

            const due = new Date();
            due.setDate(due.getDate() + days);
            const dueStr = due.toISOString().slice(0, 10);
            state.due_date = dueStr;
            state.step = 'description';
            bot.sendMessage(chatId,
                `⏰ Jatuh tempo: *${dueStr}* (${days} hari)\n\n📝 Ketik keterangan (atau ketik \`-\` untuk skip):`, {
                parse_mode: 'Markdown',
                reply_markup: { force_reply: true, selective: true }
            });
            return;
        }

        // ── Product page navigation ─────────────────────────
        if (data.startsWith('page_')) {
            const offset = parseInt(data.replace('page_', ''));
            try {
                const [products] = await pool.query(
                    'SELECT code, name, sell_price, stock, unit FROM products WHERE stock > 0 ORDER BY name LIMIT 5 OFFSET ?',
                    [offset]
                );
                await sendProductList(chatId, products, '📦 *Daftar Produk:*');
            } catch (e) {
                bot.sendMessage(chatId, '❌ Gagal: ' + e.message);
            }
            return;
        }

        // ── Hutang menu ─────────────────────────────────────
        if (data === 'menu_hutang') {
            await showHutangList(chatId, 'ALL');
            return;
        }

        // ── Hutang filter ───────────────────────────────────
        if (data.startsWith('htFilter_')) {
            const filter = data.replace('htFilter_', '');
            await showHutangList(chatId, filter);
            return;
        }

        // ── Hutang detail / bayar button ────────────────────
        if (data.startsWith('htBayar_')) {
            const id = parseInt(data.replace('htBayar_', ''));
            await showHutangDetail(chatId, id);
            return;
        }

        // ── Hutang pay with amount ──────────────────────────
        if (data.startsWith('htPay_')) {
            const parts = data.split('_');
            const id = parseInt(parts[1]);
            const amount = parseFloat(parts[2]);
            await payHutang(chatId, id, amount);
            return;
        }

        // ── Hutang pay custom amount ────────────────────────
        if (data.startsWith('htPayCustom_')) {
            const id = parseInt(data.replace('htPayCustom_', ''));
            userState[chatId] = { waiting: 'hutangPayAmount', hutangId: id };
            bot.sendMessage(chatId, '✏️ Ketik jumlah pembayaran hutang:', {
                reply_markup: { force_reply: true, selective: true }
            });
            return;
        }

        // ── Hutang add new ──────────────────────────────────
        if (data === 'hutang_add') {
            userState[chatId] = { waiting: 'hutangNew', step: 'counterparty' };
            bot.sendMessage(chatId, '📒 *Tambah Hutang Baru*\n\n👤 Ketik nama kreditur/supplier:', {
                parse_mode: 'Markdown',
                reply_markup: { force_reply: true, selective: true }
            });
            return;
        }
    });

    // ═══════════════════════════════════════════════════════════
    // ── TEXT MESSAGE HANDLER (reply keyboard & free text) ─────
    // ═══════════════════════════════════════════════════════════
    bot.on('message', async (msg) => {
        if (!msg.text) return;
        const chatId = msg.chat.id;
        const text = msg.text.trim();

        // ── Handle custom qty input ─────────────────────────
        if (userState[chatId]?.waiting === 'customQty') {
            const qty = parseFloat(text);
            if (isNaN(qty) || qty <= 0) {
                bot.sendMessage(chatId, '⚠️ Masukkan angka yang valid (contoh: 2.5)');
                return;
            }
            const code = userState[chatId].code;
            delete userState[chatId];
            await addToCart(chatId, code, qty);
            return;
        }

        // ── Handle edit price input ─────────────────────────
        if (userState[chatId]?.waiting === 'editPriceInput') {
            const newPrice = parseFloat(text.replace(/[^0-9.]/g, ''));
            if (isNaN(newPrice) || newPrice <= 0) {
                bot.sendMessage(chatId, '⚠️ Masukkan harga yang valid (angka, contoh: 50000)');
                return;
            }
            const code = userState[chatId].code;
            delete userState[chatId];
            try {
                const [[product]] = await pool.query(
                    'SELECT name, sell_price FROM products WHERE code = ?', [code]
                );
                if (!product) return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.', mainMenu);

                const oldPrice = parseFloat(product.sell_price);
                await pool.query('UPDATE products SET sell_price = ? WHERE code = ?', [newPrice, code]);

                bot.sendMessage(chatId,
                    `✅ *Harga berhasil diubah!*\n\n` +
                    `📦 *${product.name}* (\`${code}\`)\n` +
                    `💰 Harga lama: ${formatRupiah(oldPrice)}\n` +
                    `💰 Harga baru: *${formatRupiah(newPrice)}*`,
                    mainMenu
                );
            } catch (e) {
                bot.sendMessage(chatId, '❌ Gagal mengubah harga: ' + e.message, mainMenu);
            }
            return;
        }

        // ── Handle search input ─────────────────────────────
        if (userState[chatId]?.waiting === 'search') {
            delete userState[chatId];
            try {
                const [products] = await pool.query(
                    'SELECT code, name, sell_price, stock, unit FROM products WHERE name LIKE ? OR code LIKE ? LIMIT 10',
                    [`%${text}%`, `%${text}%`]
                );
                await sendProductList(chatId, products, `🔍 *Hasil pencarian "${text}":*`);
            } catch (e) {
                bot.sendMessage(chatId, '❌ Gagal mencari: ' + e.message);
            }
            return;
        }

        // ── Handle customer name input ──────────────────────
        if (userState[chatId]?.waiting === 'customer') {
            delete userState[chatId];
            const cart = getCart(chatId);
            cart.customer = text;
            bot.sendMessage(chatId, `👤 Pelanggan diset: *${cart.customer}*`, mainMenu);
            return;
        }

        // ── Handle hutang custom pay amount ──────────────────
        if (userState[chatId]?.waiting === 'hutangPayAmount') {
            const amount = parseFloat(text.replace(/[^0-9.]/g, ''));
            if (isNaN(amount) || amount <= 0) {
                bot.sendMessage(chatId, '⚠️ Masukkan angka yang valid (contoh: 500000)');
                return;
            }
            const hutangId = userState[chatId].hutangId;
            delete userState[chatId];
            await payHutang(chatId, hutangId, amount);
            return;
        }

        // ── Handle hutang add wizard ─────────────────────────
        if (userState[chatId]?.waiting === 'hutangNew') {
            const state = userState[chatId];

            if (state.step === 'counterparty') {
                state.counterparty = text;
                state.step = 'amount';
                bot.sendMessage(chatId, `👤 Kreditur: *${text}*\n\n💰 Ketik jumlah hutang (angka):`, {
                    parse_mode: 'Markdown',
                    reply_markup: { force_reply: true, selective: true }
                });
                return;
            }

            if (state.step === 'amount') {
                const amount = parseFloat(text.replace(/[^0-9.]/g, ''));
                if (isNaN(amount) || amount <= 0) {
                    bot.sendMessage(chatId, '⚠️ Masukkan angka yang valid (contoh: 1000000)');
                    return;
                }
                state.amount = amount;
                state.step = 'due_date';
                bot.sendMessage(chatId,
                    `💰 Jumlah: *${formatRupiah(amount)}*\n\n⏰ Ketik tanggal jatuh tempo (YYYY-MM-DD):`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '7 Hari', callback_data: 'htDue_7' },
                                { text: '14 Hari', callback_data: 'htDue_14' },
                                { text: '30 Hari', callback_data: 'htDue_30' },
                            ],
                            [
                                { text: '60 Hari', callback_data: 'htDue_60' },
                                { text: '90 Hari', callback_data: 'htDue_90' },
                            ]
                        ]
                    }
                });
                return;
            }

            if (state.step === 'due_date') {
                // Validate date format
                if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                    bot.sendMessage(chatId, '⚠️ Format tanggal salah. Gunakan YYYY-MM-DD (contoh: 2026-05-01)');
                    return;
                }
                state.due_date = text;
                state.step = 'description';
                bot.sendMessage(chatId,
                    `⏰ Jatuh tempo: *${text}*\n\n📝 Ketik keterangan (atau ketik \`-\` untuk skip):`, {
                    parse_mode: 'Markdown',
                    reply_markup: { force_reply: true, selective: true }
                });
                return;
            }

            if (state.step === 'description') {
                const desc = text === '-' ? null : text;
                const today = new Date().toISOString().slice(0, 10);
                const ref = 'HT-' + Date.now();

                try {
                    await pool.query(
                        `INSERT INTO hutang (reference, date, due_date, counterparty, description, amount, paid, status, created_by)
                         VALUES (?, ?, ?, ?, ?, ?, 0, 'BELUM_LUNAS', 1)`,
                        [ref, today, state.due_date, state.counterparty, desc, state.amount]
                    );

                    let msg = `✅ *Hutang berhasil ditambahkan!*\n━━━━━━━━━━━━━━━━━━━\n`;
                    msg += `📋 Ref: \`${ref}\`\n`;
                    msg += `👤 ${state.counterparty}\n`;
                    msg += `💰 ${formatRupiah(state.amount)}\n`;
                    msg += `⏰ Jatuh tempo: ${state.due_date}\n`;
                    if (desc) msg += `📝 ${desc}\n`;

                    delete userState[chatId];
                    bot.sendMessage(chatId, msg, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📒 Lihat Hutang', callback_data: 'menu_hutang' }]
                            ]
                        }
                    });
                } catch (e) {
                    delete userState[chatId];
                    bot.sendMessage(chatId, '❌ Gagal menyimpan hutang: ' + e.message, mainMenu);
                }
                return;
            }
        }

        // ── Reply keyboard button handlers ──────────────────
        if (text === '📦 Produk' || text === '/produk') {
            try {
                const [products] = await pool.query(
                    'SELECT code, name, sell_price, stock, unit FROM products WHERE stock > 0 ORDER BY name LIMIT 30'
                );
                await sendProductList(chatId, products, '📦 *Daftar Produk:*');
            } catch (e) {
                bot.sendMessage(chatId, '❌ Gagal memuat produk: ' + e.message);
            }
            return;
        }

        if (text === '🔍 Cari Produk') {
            userState[chatId] = { waiting: 'search' };
            bot.sendMessage(chatId, '🔍 Ketik nama atau kode produk yang dicari:', {
                reply_markup: { force_reply: true, selective: true }
            });
            return;
        }

        if (text === '🛒 Keranjang' || text === '/keranjang') {
            showCart(chatId);
            return;
        }

        if (text === '💰 Bayar' || text === '/bayar') {
            processPayment(chatId);
            return;
        }

        if (text === '👤 Pelanggan') {
            userState[chatId] = { waiting: 'customer' };
            bot.sendMessage(chatId, '👤 Ketik nama pelanggan:', {
                reply_markup: { force_reply: true, selective: true }
            });
            return;
        }

        if (text === '🗑️ Kosongkan' || text === '/hapus') {
            const cart = getCart(chatId);
            if (!cart.items.length) {
                bot.sendMessage(chatId, '🛒 Keranjang sudah kosong.', mainMenu);
            } else {
                bot.sendMessage(chatId, `⚠️ Hapus ${cart.items.length} item dari keranjang?`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Ya, Kosongkan', callback_data: 'menu_hapus' },
                                { text: '❌ Batal', callback_data: 'menu_keranjang' }
                            ]
                        ]
                    }
                });
            }
            return;
        }

        if (text === '📋 Riwayat' || text === '/riwayat') {
            try {
                const [sales] = await pool.query(
                    `SELECT invoice_number, date, customer_name, total, status 
                     FROM sales ORDER BY id DESC LIMIT 5`
                );
                if (!sales.length) return bot.sendMessage(chatId, '📋 Belum ada transaksi.', mainMenu);

                let t = '📋 *5 Transaksi Terakhir:*\n\n';
                sales.forEach(s => {
                    const d = typeof s.date === 'string' ? s.date : new Date(s.date).toISOString().slice(0, 10);
                    const status = s.status === 'DONE' ? '✅' : s.status === 'CANCELLED' ? '❌' : '⏳';
                    t += `${status} \`${s.invoice_number}\`\n`;
                    t += `   ${d} — ${s.customer_name}\n`;
                    t += `   *${formatRupiah(s.total)}*\n\n`;
                });
                bot.sendMessage(chatId, t, mainMenu);
            } catch (e) {
                bot.sendMessage(chatId, '❌ Gagal: ' + e.message);
            }
            return;
        }

        if (text === '📒 Hutang' || text === '/hutang') {
            await showHutangList(chatId, 'ALL');
            return;
        }
        // ── /start ──────────────────────────────────────────
        if (text === '/start') {
            bot.sendMessage(chatId,
                `🥩 *Sagara Meat House – Kasir Bot*\n\n` +
                `Gunakan tombol menu di bawah untuk mulai kasir\\.\n\n` +
                `📦 *Produk* — Lihat & tambah produk\n` +
                `🔍 *Cari* — Cari produk\n` +
                `🛒 *Keranjang* — Lihat isi keranjang\n` +
                `💰 *Bayar* — Proses pembayaran\n` +
                `👤 *Pelanggan* — Set nama pelanggan\n` +
                `🗑️ *Kosongkan* — Hapus keranjang\n` +
                `📋 *Riwayat* — Transaksi terakhir\n` +
                `📒 *Hutang* — Kelola & bayar hutang`,
                mainMenu
            );
            return;
        }

        // ── /tambah [kode] [jumlah] (still works) ──────────
        const tambahMatch = text.match(/^\/tambah\s+(\S+)\s*(\d*\.?\d*)/);
        if (tambahMatch) {
            const code = tambahMatch[1].toUpperCase();
            const qty = parseFloat(tambahMatch[2]) || 1;
            await addToCart(chatId, code, qty);
            return;
        }

        // ── /cari [nama] (still works) ─────────────────────
        const cariMatch = text.match(/^\/cari\s+(.+)/);
        if (cariMatch) {
            const keyword = cariMatch[1].trim();
            try {
                const [products] = await pool.query(
                    'SELECT code, name, sell_price, stock, unit FROM products WHERE name LIKE ? OR code LIKE ? LIMIT 10',
                    [`%${keyword}%`, `%${keyword}%`]
                );
                await sendProductList(chatId, products, `🔍 *Hasil pencarian "${keyword}":*`);
            } catch (e) {
                bot.sendMessage(chatId, '❌ Gagal mencari: ' + e.message);
            }
            return;
        }

        // ── /pelanggan [nama] (still works) ────────────────
        const pelangganMatch = text.match(/^\/pelanggan\s+(.+)/);
        if (pelangganMatch) {
            const cart = getCart(chatId);
            cart.customer = pelangganMatch[1].trim();
            bot.sendMessage(chatId, `👤 Pelanggan diset: *${cart.customer}*`, mainMenu);
            return;
        }

        // ── Unknown text: try as product search ─────────────
        if (!text.startsWith('/')) {
            // User typed something that's not a command — search products
            try {
                const [products] = await pool.query(
                    'SELECT code, name, sell_price, stock, unit FROM products WHERE name LIKE ? OR code LIKE ? LIMIT 10',
                    [`%${text}%`, `%${text}%`]
                );
                if (products.length) {
                    await sendProductList(chatId, products, `🔍 *Hasil pencarian "${text}":*`);
                }
                // If nothing found, silently ignore to avoid spam
            } catch (_) {}
            return;
        }
    });

    return bot;
}

module.exports = { startBot };
