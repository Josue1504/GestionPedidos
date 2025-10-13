const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const cors = require('cors');
const session = require('express-session');

// Cargar variables de entorno
require('dotenv').config();

const app = express();

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// --- Configuración de CORS con credenciales ---
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// --- Habilitar el uso de JSON para las peticiones ---
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Conexión a PostgreSQL
let db;
if (process.env.DATABASE_URL) {
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    // Verificar conexión
    db.connect((err, client, release) => {
        if (err) {
            console.error('❌ Error al conectar a PostgreSQL:', err);
        } else {
            console.log('✅ Conexión exitosa a PostgreSQL');
            release();
        }
    });
} else {
    console.log('⚠️  No DATABASE_URL found, running in test mode');
}

// Función helper para queries
const dbQuery = (text, params) => {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('No database connection'));
            return;
        }
        db.query(text, params, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
};

// Ruta raíz para verificar que el servidor funciona
app.get('/', (req, res) => {
    try {
        res.json({ 
            message: 'API de Gestión de Pedidos está funcionando', 
            version: '1.0.0',
            status: 'ok',
            environment: process.env.NODE_ENV || 'development',
            frontendUrl: process.env.FRONTEND_URL,
            database: db ? 'connected' : 'test_mode',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error en ruta raíz:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// --- INICIO DE SESIÓN ---
app.post('/api/login', async (req, res) => {
    try {
        console.log('Login attempt:', req.body);
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Usuario y contraseña requeridos' });
        }

        // Si no hay base de datos, usar login de prueba
        if (!db) {
            if (username === 'admin' && password === '123') {
                req.session.userId = 1;
                req.session.username = 'admin';
                return res.json({ 
                    message: 'Login exitoso (modo prueba)',
                    user: { id: 1, username: 'admin' }
                });
            } else {
                return res.status(401).json({ message: 'Credenciales inválidas' });
            }
        }

        // Login con base de datos real
        const result = await dbQuery('SELECT * FROM users WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        const user = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        // Guardar en sesión
        req.session.userId = user.id;
        req.session.username = user.username;

        res.json({ 
            message: 'Inicio de sesión exitoso',
            user: { id: user.id, username: user.username }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno en login' });
    }
});

// --- CERRAR SESIÓN ---
app.post('/api/logout', (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.error('Error al cerrar sesión:', err);
                return res.status(500).json({ message: 'Error al cerrar sesión' });
            }
            res.clearCookie('connect.sid');
            res.json({ message: 'Sesión cerrada exitosamente' });
        });
    } catch (error) {
        console.error('Error en logout:', error);
        res.status(500).json({ error: 'Error interno en logout' });
    }
});

// --- Middleware de sesión ---
const isProduction = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1);
app.use(session({
    secret: process.env.SESSION_SECRET || 'tu_secreto_de_sesion',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: isProduction,
        httpOnly: true,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

// Ruta de salud
app.get('/api/health', (req, res) => {
    try {
        res.json({ 
            status: 'healthy',
            database: db ? 'connected' : 'test_mode',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    } catch (error) {
        console.error('Error en health:', error);
        res.status(500).json({ error: 'Error en health check' });
    }
});

// Catch all para rutas no encontradas
app.use((req, res) => {
    console.log('Ruta no encontrada:', req.originalUrl);
    res.status(404).json({ 
        error: 'Ruta no encontrada', 
        path: req.originalUrl,
        message: 'API endpoint not found'
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor iniciado exitosamente`);
    console.log(`📍 Puerto: ${PORT}`);
    console.log(`🌍 Modo: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 CORS permitido para: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log(`🗃️  Base de datos: ${db ? 'PostgreSQL conectada' : 'Modo prueba'}`);
    console.log(`⏰ Iniciado en: ${new Date().toISOString()}`);
}).on('error', (err) => {
    console.error('❌ Error al iniciar servidor:', err);
});