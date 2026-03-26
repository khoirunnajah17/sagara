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

// Static files
app.use(express.static(path.join(__dirname, 'src/public')));

// API Routes
app.use('/api/auth',      require('./src/routes/auth'));
app.use('/api/accounts',  require('./src/routes/accounts'));
app.use('/api/journal',   require('./src/routes/journal'));
app.use('/api/sales',     require('./src/routes/sales'));
app.use('/api/purchases', require('./src/routes/purchases'));
app.use('/api/inventory', require('./src/routes/inventory'));
app.use('/api/reports',   require('./src/routes/reports'));

// Root redirect
app.get('/', (req, res) => res.redirect('/index.html'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sagara Accounting berjalan di http://localhost:${PORT}`);
});

module.exports = app;
