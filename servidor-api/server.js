const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const cors = require('cors');
const session = require('express-session');

// Cargar variables de entorno
require('dotenv').config();

const app = express();

// --- Configuración de CORS con credenciales ---
// Permitimos explícitamente el dominio del frontend y localhost
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'https://gestionpedidos-1-fe.onrender.com',
    'http://localhost:3000'
].filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        // Permitir llamadas sin origin (como Postman/health checks)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
    exposedHeaders: ['Set-Cookie'],
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
// Responder preflight (Express 5 no acepta "*" en rutas)
app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

// --- Habilitar el uso de JSON para las peticiones ---
app.use(express.json());

// --- Middleware de sesión (debe ir ANTES de las rutas que la usan) ---
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

// Logging básico
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

// --- Middlewares de autenticación ---
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) return next();
    return res.status(401).json({ message: 'No autenticado' });
};

// --- Autorización por permisos ---
const hasPermission = async (userId, permissionName) => {
    try {
        // Si es admin por rol, permitir todo
        const adminRole = await dbQuery(
            'SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1 AND r.name = $2 LIMIT 1',
            [userId, 'admin']
        );
        if (adminRole.rows.length > 0) return true;

        // Verificar permisos directos y por roles
        const result = await dbQuery(
            `SELECT DISTINCT p.name
             FROM permissions p
             LEFT JOIN user_permissions up ON p.id = up.permission_id AND up.user_id = $1
             LEFT JOIN role_permissions rp ON p.id = rp.permission_id
             LEFT JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.user_id = $1
             WHERE (up.user_id IS NOT NULL OR ur.user_id IS NOT NULL) AND p.name = $2`,
            [userId, permissionName]
        );
        return result.rows.length > 0;
    } catch (e) {
        console.error('Error verificando permisos:', e);
        return false;
    }
};

const requirePermission = (permissionName) => async (req, res, next) => {
    try {
        if (!(req.session && req.session.userId)) return res.status(401).json({ message: 'No autenticado' });
        const ok = await hasPermission(req.session.userId, permissionName);
        if (ok) return next();
        return res.status(403).json({ message: 'No tienes permisos para realizar esta acción' });
    } catch (e) {
        console.error('Error en requirePermission:', e);
        return res.status(500).json({ message: 'Error interno de permisos' });
    }
};

// Ruta raíz para verificar que el servidor funciona
app.get('/', (req, res) => {
    try {
        res.json({ 
            message: 'API de Gestión de Pedidos funcionando correctamente', 
            version: '1.0.1',
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
        // Log solo el usuario (evitar imprimir contraseñas)
        console.log('Login attempt for user:', req.body && req.body.username);
        const { username, password } = req.body;
        const uname = (username || '').trim();
        const pwd = (password || '');

        if (!uname || !pwd) {
            return res.status(400).json({ message: 'Usuario y contraseña requeridos' });
        }

        // Si no hay base de datos, usar login de prueba
        if (!db) {
            if (uname === 'admin' && pwd === '123') {
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
        const result = await dbQuery('SELECT * FROM users WHERE username = $1', [uname]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(pwd, user.password_hash);

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

// --- USUARIO ACTUAL ---
app.get('/api/me', isAuthenticated, async (req, res) => {
    try {
        if (!db) {
            // Modo prueba
            return res.json({ id: 1, username: req.session.username || 'admin', roles: ['admin'] });
        }
        const result = await dbQuery('SELECT id, username FROM users WHERE id = $1', [req.session.userId]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
        const { id, username } = result.rows[0];
        // Obtener roles
        const rolesRes = await dbQuery('SELECT r.name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1', [id]);
        const roles = rolesRes.rows.map(r => r.name);
        res.json({ id, username, roles });
    } catch (error) {
        console.error('Error en /api/me:', error);
        res.status(500).json({ error: 'Error interno en /api/me' });
    }
});

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

// Error handling middleware (debe ir al final)
app.use((err, req, res, next) => {
    console.error('Error:', err);
    // Para errores CORS, responder con cabeceras mínimas
    if (err.message && err.message.startsWith('Not allowed by CORS')) {
        return res.status(403).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
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

// --- CHEQUEO DE PERMISOS ---
app.get('/api/has-permission', isAuthenticated, async (req, res) => {
    try {
        const name = (req.query.name || '').toString();
        if (!name) return res.json({ ok: false });
        const ok = await hasPermission(req.session.userId, name);
        res.json({ ok });
    } catch (e) {
        console.error('Error en /api/has-permission:', e);
        res.status(500).json({ ok: false });
    }
});

// --- PRODUCTOS (inventario) ---
app.get('/api/productos/:code', isAuthenticated, async (req, res) => {
    try {
        const code = (req.params.code || '').toString().trim().toUpperCase();
        if (!code) return res.status(400).json({ message: 'Código requerido' });
        const result = await dbQuery('SELECT codigo_producto, descripcion FROM inventario_productos WHERE codigo_producto = $1', [code]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Producto no encontrado' });
        res.json(result.rows[0]);
    } catch (e) {
        console.error('Error en /api/productos/:code', e);
        res.status(500).json({ message: 'Error interno' });
    }
});

// --- USUARIOS (para reportes) ---
app.get('/api/users', isAuthenticated, requirePermission('users.manage'), async (req, res) => {
    try {
        const result = await dbQuery('SELECT id, username FROM users ORDER BY username ASC', []);
        res.json(result.rows);
    } catch (e) {
        console.error('Error en /api/users:', e);
        res.status(500).json({ message: 'Error interno' });
    }
});

// --- PEDIDOS ---
app.get('/api/pedidos', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const canViewAll = await hasPermission(userId, 'pedidos.view_all');
        const { created_by, fromDate, toDate, page = 1, pageSize = 100 } = req.query;

        const where = [];
        const params = [];
        let idx = 1;

        if (!canViewAll) {
            where.push(`created_by = $${idx++}`);
            params.push(userId);
        } else if (created_by) {
            where.push(`created_by = $${idx++}`);
            params.push(Number(created_by));
        }
        if (fromDate) {
            where.push(`fecha_creacion::date >= $${idx++}`);
            params.push(fromDate);
        }
        if (toDate) {
            where.push(`fecha_creacion::date <= $${idx++}`);
            params.push(toDate);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const countSql = `SELECT COUNT(*)::int AS c FROM pedidos ${whereSql}`;
        const countRes = await dbQuery(countSql, params);
        const total = countRes.rows[0]?.c || 0;

        const p = Math.max(1, parseInt(page));
        const ps = Math.max(1, Math.min(500, parseInt(pageSize)));
        const offset = (p - 1) * ps;

        const listSql = `SELECT id, pedidoNo, nombre_cliente, nit_cliente, direccion_cliente, tel_cliente, total_q, fecha_creacion
                         FROM pedidos ${whereSql} ORDER BY fecha_creacion DESC LIMIT ${ps} OFFSET ${offset}`;
        const listRes = await dbQuery(listSql, params);
        res.json({ pedidos: listRes.rows, total, page: p, pageSize: ps });
    } catch (e) {
        console.error('Error en GET /api/pedidos:', e);
        res.status(500).json({ message: 'Error interno' });
    }
});
// Endpoint para obtener todos los permisos
app.get('/api/permissions', isAuthenticated, async (req, res) => {
    try {
        const result = await dbQuery('SELECT id, name, description FROM permissions ORDER BY id');
        res.json(result.rows);
    } catch (e) {
        console.error('Error en /api/permissions:', e);
        res.status(500).json({ error: 'Error al obtener permisos' });
    }
});

// Endpoint para obtener todos los roles
app.get('/api/roles', isAuthenticated, async (req, res) => {
    try {
        const result = await dbQuery('SELECT id, name, description FROM roles ORDER BY id');
        res.json(result.rows);
    } catch (e) {
        console.error('Error en /api/roles:', e);
        res.status(500).json({ error: 'Error al obtener roles' });
    }
});

app.post('/api/pedidos', isAuthenticated, requirePermission('pedidos.create'), async (req, res) => {
    try {
        const userId = req.session.userId;
        const { pedidoNo, clienteData, productos, finalData, fecha } = req.body || {};

        const nombre_cliente = clienteData?.nombre || '';
        const nit_cliente = clienteData?.nit || '';
        const direccion_cliente = clienteData?.direccion || '';
        const tel_cliente = clienteData?.tel || '';
        const envio_no = clienteData?.envioNo || '';
        const transporte = clienteData?.transporte || '';
        const vendedor = clienteData?.vendedor || '';
        const codigo_cliente = clienteData?.codigoCliente || '';

        let total_q = 0;
        if (Array.isArray(productos)) {
            for (const p of productos) {
                total_q += parseFloat(p?.valor || 0) || 0;
            }
        }
        const total_letras = finalData?.totalLetras || '';

        const insertSql = `INSERT INTO pedidos (
            pedidoNo, nombre_cliente, nit_cliente, direccion_cliente, tel_cliente,
            envio_no, transporte, vendedor, codigo_cliente,
            total_letras, total_q, factura_no, autorizado, productos_json, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`;

        const params = [
            pedidoNo || null,
            nombre_cliente,
            nit_cliente,
            direccion_cliente,
            tel_cliente,
            envio_no,
            transporte,
            vendedor,
            codigo_cliente,
            total_letras,
            total_q,
            finalData?.facturaNo || null,
            finalData?.autorizado || null,
            JSON.stringify({ productos, fecha }),
            userId
        ];

        const result = await dbQuery(insertSql, params);
        res.status(201).json({ id: result.rows[0].id, message: 'Pedido creado exitosamente' });
    } catch (e) {
        console.error('Error en POST /api/pedidos:', e);
        res.status(500).json({ message: 'Error interno' });
    }
});

app.put('/api/pedidos/:id', isAuthenticated, requirePermission('pedidos.edit'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { nombre_cliente, nit_cliente, direccion_cliente, total_q } = req.body || {};
        const sql = `UPDATE pedidos SET nombre_cliente = COALESCE($1,nombre_cliente), nit_cliente = COALESCE($2,nit_cliente),
                     direccion_cliente = COALESCE($3,direccion_cliente), total_q = COALESCE($4,total_q)
                     WHERE id = $5 RETURNING id`;
        const r = await dbQuery(sql, [nombre_cliente || null, nit_cliente || null, direccion_cliente || null, total_q || null, id]);
        if (r.rows.length === 0) return res.status(404).json({ message: 'Pedido no encontrado' });
        res.json({ id });
    } catch (e) {
        console.error('Error en PUT /api/pedidos/:id', e);
        res.status(500).json({ message: 'Error interno' });
    }
});

app.delete('/api/pedidos/:id', isAuthenticated, requirePermission('pedidos.delete'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const r = await dbQuery('DELETE FROM pedidos WHERE id = $1', [id]);
        res.json({ ok: true });
    } catch (e) {
        console.error('Error en DELETE /api/pedidos/:id', e);
        res.status(500).json({ message: 'Error interno' });
    }
});