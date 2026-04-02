require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'sagara_secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// Static files (disable auto index.html serving)
app.use(express.static(path.join(__dirname, 'src/public'), { index: false }));

// Health check — test DB connection (hapus setelah deploy berhasil)
app.get('/api/health', async (req, res) => {
    try {
        const pool = require('./src/config/db');
        const [rows] = await pool.query('SELECT 1 as ok');
        const [tables] = await pool.query('SHOW TABLES');
        res.json({
            status: 'OK',
            db_connected: true,
            telegram_token_set: !!process.env.TELEGRAM_BOT_TOKEN,
            tables_count: tables.length,
            tables: tables.map(t => Object.values(t)[0]),
            env: {
                DB_HOST: process.env.DB_HOST || '(not set)',
                DB_USER: process.env.DB_USER || '(not set)',
                DB_NAME: process.env.DB_NAME || '(not set)',
                DB_PORT: process.env.DB_PORT || '3306'
            }
        });
    } catch (err) {
        res.status(500).json({
            status: 'ERROR',
            db_connected: false,
            error: err.message,
            code: err.code,
            env: {
                DB_HOST: process.env.DB_HOST || '(not set)',
                DB_USER: process.env.DB_USER || '(not set)',
                DB_NAME: process.env.DB_NAME || '(not set)',
                DB_PORT: process.env.DB_PORT || '3306'
            }
        });
    }
});

// Public catalog API (no auth)
app.use('/api/catalog',        require('./src/routes/catalog'));
app.use('/api/orders',         require('./src/routes/orders'));
app.use('/api/customer-auth',  require('./src/routes/customer-auth'));
app.use('/api/contact',        require('./src/routes/contact'));

// API Routes
app.use('/api/auth',      require('./src/routes/auth'));
app.use('/api/accounts',  require('./src/routes/accounts'));
app.use('/api/journal',   require('./src/routes/journal'));
app.use('/api/sales',     require('./src/routes/sales'));
app.use('/api/purchases', require('./src/routes/purchases'));
app.use('/api/inventory', require('./src/routes/inventory'));
app.use('/api/warehouse', require('./src/routes/warehouse'));
app.use('/api/reports',   require('./src/routes/reports'));
app.use('/api/hutang',    require('./src/routes/hutang'));
app.use('/api/kas',       require('./src/routes/kas'));
app.use('/api/users',     require('./src/routes/users'));
app.use('/api/customers', require('./src/routes/customers'));

// Logo upload API (admin only)
const multer = require('multer');
const fs = require('fs');
const logoUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, path.join(__dirname, 'src/public/img')),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, 'logo' + ext);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/image\/(jpeg|jpg|png|webp|svg)/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Only image files allowed'));
    }
});

// GET /api/logo — serve current logo (dynamic: finds whatever logo file exists)
app.get('/api/logo', (req, res) => {
    const imgDir = path.join(__dirname, 'src/public/img');
    const exts = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
    for (const ext of exts) {
        const file = path.join(imgDir, 'logo' + ext);
        if (fs.existsSync(file)) {
            return res.sendFile(file);
        }
    }
    res.status(404).json({ message: 'Logo not found' });
});

app.post('/api/logo/upload', (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ message: 'Unauthorized' });
    next();
}, logoUpload.single('logo'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    // Remove old logos with different extensions
    const imgDir = path.join(__dirname, 'src/public/img');
    const uploaded = req.file.filename;
    ['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.webp', 'logo.svg'].forEach(f => {
        if (f !== uploaded) {
            try { fs.unlinkSync(path.join(imgDir, f)); } catch(e) {}
        }
    });
    res.json({ success: true, logo: '/api/logo' });
});

// ── Nota Design Upload ───────────────────────────────────────
const notaUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, path.join(__dirname, 'src/public/img')),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, 'nota-header' + ext);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/image\/(jpeg|jpg|png|webp)/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Hanya file gambar (JPG, PNG, WEBP) yang diizinkan'));
    }
});

// GET /api/nota-design — serve current nota header image
app.get('/api/nota-design', (req, res) => {
    const imgDir = path.join(__dirname, 'src/public/img');
    const exts = ['.png', '.jpg', '.jpeg', '.webp'];
    for (const ext of exts) {
        const file = path.join(imgDir, 'nota-header' + ext);
        if (fs.existsSync(file)) {
            return res.sendFile(file);
        }
    }
    res.status(404).json({ message: 'Nota design not found' });
});

// GET /api/nota-design/exists — check if nota design exists
app.get('/api/nota-design/exists', (req, res) => {
    const imgDir = path.join(__dirname, 'src/public/img');
    const exts = ['.png', '.jpg', '.jpeg', '.webp'];
    for (const ext of exts) {
        const file = path.join(imgDir, 'nota-header' + ext);
        if (fs.existsSync(file)) {
            return res.json({ exists: true, url: '/api/nota-design' });
        }
    }
    res.json({ exists: false });
});

// POST /api/nota-design/upload — upload nota header design
app.post('/api/nota-design/upload', (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ message: 'Unauthorized' });
    next();
}, notaUpload.single('nota'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const imgDir = path.join(__dirname, 'src/public/img');
    const uploaded = req.file.filename;
    ['nota-header.png', 'nota-header.jpg', 'nota-header.jpeg', 'nota-header.webp'].forEach(f => {
        if (f !== uploaded) {
            try { fs.unlinkSync(path.join(imgDir, f)); } catch(e) {}
        }
    });
    res.json({ success: true, url: '/api/nota-design' });
});

// DELETE /api/nota-design — remove nota design (revert to default text)
app.delete('/api/nota-design', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ message: 'Unauthorized' });
    const imgDir = path.join(__dirname, 'src/public/img');
    ['nota-header.png', 'nota-header.jpg', 'nota-header.jpeg', 'nota-header.webp'].forEach(f => {
        try { fs.unlinkSync(path.join(imgDir, f)); } catch(e) {}
    });
    res.json({ success: true, message: 'Nota design removed' });
});

// Root → serve home.html directly (avoid redirect issues on Codespaces)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'src/public/home.html')));

// Global error handler — always return JSON, never HTML
app.use((err, req, res, next) => {
    console.error('Global error:', err.message);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Internal Server Error' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sagara Meat House berjalan di http://localhost:${PORT}`);

    // Start Telegram Bot
    if (process.env.TELEGRAM_BOT_TOKEN) {
        console.log('Telegram Bot: token ditemukan, memulai bot...');
        try {
            const { startBot } = require('./src/telegram-bot');
            startBot(process.env.TELEGRAM_BOT_TOKEN);
            console.log('Telegram Bot: startBot() berhasil dipanggil');
        } catch (err) {
            console.error('Telegram Bot: GAGAL start -', err.message);
        }
    } else {
        console.log('Telegram Bot: TELEGRAM_BOT_TOKEN tidak ditemukan di .env, bot tidak dijalankan');
    }
});

module.exports = app;
