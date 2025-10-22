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
// Render y proxies requieren trust proxy antes del middleware de sesión
app.set('trust proxy', 1);
app.use(session({
    secret: process.env.SESSION_SECRET || 'tu_secreto_de_sesion',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true, // Siempre true en producción (Render es HTTPS)
        httpOnly: true,
        sameSite: 'none', // Necesario para cross-origin cookies
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
    console.log('🔍 Auth check:', { 
        sessionId: req.session?.id, 
        userId: req.session?.userId, 
        username: req.session?.username,
        path: req.path 
    });
    
    if (req.session && req.session.userId) {
        // Verificar si el usuario está activo en cada request
        dbQuery('SELECT active FROM users WHERE id = $1', [req.session.userId])
            .then(result => {
                const active = result.rows[0]?.active;
                if (!active || active === 0) {
                    console.log('❌ Usuario inactivo, expulsando de la sesión');
                    req.session.destroy(() => {});
                    return res.status(403).json({ message: 'Usuario inactivo. Contacta al administrador.' });
                }
                console.log('✅ User authenticated:', req.session.username);
                return next();
            })
            .catch(err => {
                console.error('Error verificando usuario activo:', err);
                return res.status(500).json({ message: 'Error interno de autenticación' });
            });
        return;
    }
    console.log('❌ User not authenticated for path:', req.path);
    return res.status(401).json({ message: 'No autenticado' });
};

// --- Autorización por permisos ---
// Regla: si el usuario tiene permisos directos (user_permissions), estos actúan como override
// y se IGNORAN los permisos por rol. Si no tiene directos, se usan los del rol.
const hasPermission = async (userId, permissionName) => {
    try {
        // 1) Si es admin por rol, permitir todo
        const adminRole = await dbQuery(
            'SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1 AND r.name = $2 LIMIT 1',
            [userId, 'admin']
        );
        if (adminRole.rows.length > 0) return true;

        // 2) ¿Tiene permisos directos? -> override
        const directCountRes = await dbQuery('SELECT COUNT(*)::int AS c FROM user_permissions WHERE user_id = $1', [userId]);
        const hasDirect = (directCountRes.rows[0]?.c || 0) > 0;
        if (hasDirect) {
            const directCheck = await dbQuery(
                `SELECT 1 FROM user_permissions up
                 JOIN permissions p ON up.permission_id = p.id
                 WHERE up.user_id = $1 AND p.name = $2 LIMIT 1`,
                [userId, permissionName]
            );
            return directCheck.rows.length > 0;
        }

        // 3) Sin permisos directos -> usar permisos por rol
        const roleCheck = await dbQuery(
            `SELECT 1 FROM user_roles ur
             JOIN role_permissions rp ON ur.role_id = rp.role_id
             JOIN permissions p ON p.id = rp.permission_id
             WHERE ur.user_id = $1 AND p.name = $2 LIMIT 1`,
            [userId, permissionName]
        );
        return roleCheck.rows.length > 0;
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
        // Log detallado para depuración
        console.log('🔍 Login attempt:', { 
            user: req.body?.username, 
            sessionId: req.session?.id,
            hasPassword: !!req.body?.password 
        });
        
        const { username, password } = req.body;
        const uname = (username || '').trim();
        const pwd = (password || '');

        if (!uname || !pwd) {
            console.log('❌ Login failed: Missing credentials');
            return res.status(400).json({ message: 'Usuario y contraseña requeridos' });
        }

        // Si no hay base de datos, usar login de prueba
        if (!db) {
            console.log('🔍 Using test mode (no DB)');
            if (uname === 'admin' && pwd === '123') {
                req.session.userId = 1;
                req.session.username = 'admin';
                console.log('✅ Test login successful:', { user: uname, sessionId: req.session.id });
                return res.json({ 
                    message: 'Login exitoso (modo prueba)',
                    user: { id: 1, username: 'admin' }
                });
            } else {
                console.log('❌ Test login failed: Invalid credentials');
                return res.status(401).json({ message: 'Credenciales inválidas' });
            }
        }

        // Login con base de datos real
        console.log('🔍 Checking user in database:', uname);
        const result = await dbQuery('SELECT * FROM users WHERE username = $1', [uname]);
        
        if (result.rows.length === 0) {
            console.log('❌ User not found in database');
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        const user = result.rows[0];
        console.log('🔍 User found:', { id: user.id, username: user.username, active: user.active });

        // Verificar si el usuario está activo
        if (!user.active || user.active === 0) {
            console.log('❌ Usuario inactivo, acceso denegado');
            return res.status(403).json({ message: 'Usuario inactivo. Contacta al administrador.' });
        }

        const isPasswordValid = await bcrypt.compare(pwd, user.password_hash);
        console.log('🔍 Password validation:', isPasswordValid);

        if (!isPasswordValid) {
            console.log('❌ Invalid password');
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        // Guardar en sesión
        req.session.userId = user.id;
        req.session.username = user.username;

        console.log('✅ Login successful:', { 
            user: user.username, 
            id: user.id, 
            sessionId: req.session.id 
        });

        res.json({ 
            message: 'Inicio de sesión exitoso',
            user: { id: user.id, username: user.username }
        });

    } catch (error) {
        console.error('❌ Error en login:', error);
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
        console.log('🔍 /api/me called:', { userId: req.session.userId, username: req.session.username });
        
        if (!db) {
            // Modo prueba
            const testUser = { id: 1, username: req.session.username || 'admin', roles: ['admin'] };
            console.log('✅ /api/me test mode response:', testUser);
            return res.json(testUser);
        }
        
        const result = await dbQuery('SELECT id, username FROM users WHERE id = $1', [req.session.userId]);
        if (result.rows.length === 0) {
            console.log('❌ /api/me: User not found');
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        
        const { id, username } = result.rows[0];
        console.log('🔍 User data from DB:', { id, username });
        
        // Obtener roles
    const rolesRes = await dbQuery('SELECT r.name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1', [id]);
    let roles = rolesRes.rows.map(r => r.name);
        console.log('🔍 User roles:', roles);
        
        const responseData = { id, username, roles };
        console.log('✅ /api/me response:', responseData);
        res.json(responseData);
    } catch (error) {
        console.error('❌ Error en /api/me:', error);
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
// --- USUARIOS (gestión completa) ---
app.get('/api/users', isAuthenticated, requirePermission('users.manage'), async (req, res) => {
    try {
        const result = await dbQuery(
            `SELECT 
                u.id, 
                u.username, 
                COALESCE(u.active, 1) AS active,
                COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
             FROM users u
             LEFT JOIN user_roles ur ON u.id = ur.user_id
             LEFT JOIN roles r ON ur.role_id = r.id
             GROUP BY u.id
             ORDER BY u.username ASC`);
        // Map roles from Postgres array to JS array if needed
        const users = result.rows.map(r => ({ 
            id: r.id, 
            username: r.username, 
            active: r.active === 1 || r.active === true, 
            roles: Array.isArray(r.roles) ? r.roles : [] 
        }));
        res.json(users);
    } catch (e) {
        console.error('Error en GET /api/users:', e);
        res.status(500).json({ message: 'Error interno' });
    }
});

app.get('/api/users/:id', isAuthenticated, requirePermission('users.manage'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const userRes = await dbQuery('SELECT id, username, COALESCE(active,1) AS active FROM users WHERE id = $1', [id]);
        if (userRes.rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
        const base = userRes.rows[0];
        const rolesRes = await dbQuery('SELECT r.id, r.name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1', [id]);
        const permsRes = await dbQuery('SELECT permission_id FROM user_permissions WHERE user_id = $1', [id]);
        // Elegimos el primer rol como principal para edición
        const primaryRoleId = rolesRes.rows[0]?.id || null;
        res.json({ 
            id: base.id, 
            username: base.username, 
            active: base.active === 1 || base.active === true, 
            roles: rolesRes.rows.map(r => r.name),
            roleId: primaryRoleId,
            permissionIds: permsRes.rows.map(p => p.permission_id)
        });
    } catch (e) {
        console.error('Error en GET /api/users/:id:', e);
        res.status(500).json({ message: 'Error interno' });
    }
});

app.post('/api/users', isAuthenticated, requirePermission('users.manage'), async (req, res) => {
    try {
        const { username, password, roleId, permissionIds } = req.body || {};
        if (!username || !password) return res.status(400).json({ message: 'username y password requeridos' });
        // crear usuario
        const hash = await bcrypt.hash(password, 10);
        const insertUser = await dbQuery('INSERT INTO users (username, password_hash, active) VALUES ($1, $2, 1) RETURNING id', [username, hash]);
        const userId = insertUser.rows[0].id;
        // rol opcional
        if (roleId !== null && roleId !== undefined && roleId !== '') {
            const rid = Number(roleId);
            if (!Number.isNaN(rid)) {
                await dbQuery('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, rid]);
            }
        }
        // permisos opcionales
        if (Array.isArray(permissionIds) && permissionIds.length) {
            for (const pid of permissionIds) {
                const pnum = Number(pid);
                if (!Number.isNaN(pnum)) {
                    await dbQuery('INSERT INTO user_permissions (user_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, pnum]);
                }
            }
        }
        res.json({ ok: true, userId });
    } catch (e) {
        console.error('Error en POST /api/users:', e);
        // Manejar conflicto por username único
        if (e && e.code === '23505') return res.status(409).json({ message: 'El username ya existe' });
        res.status(500).json({ message: 'Error interno' });
    }
});

app.put('/api/users/:id', isAuthenticated, requirePermission('users.manage'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { username, password, roleId, permissionIds, active } = req.body || {};
        if (!username) return res.status(400).json({ message: 'username requerido' });
        // actualizar username/active
        await dbQuery('UPDATE users SET username = $1, active = $2 WHERE id = $3', [username, active ? 1 : 0, id]);
        // actualizar password si viene
        if (password) {
            const hash = await bcrypt.hash(password, 10);
            await dbQuery('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);
        }
        // actualizar rol único: solo si roleId viene; proteger contra quitar el último admin
        if (roleId !== null && roleId !== undefined && roleId !== '') {
            const rid = Number(roleId);
            if (!Number.isNaN(rid)) {
                // Obtener role_id de admin
                const adminRole = await dbQuery("SELECT id FROM roles WHERE name = 'admin' LIMIT 1");
                const adminRoleId = adminRole.rows[0]?.id;
                // ¿El usuario actualmente es admin?
                let isUserAdmin = false;
                if (adminRoleId) {
                    const isAdminRes = await dbQuery('SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = $2 LIMIT 1', [id, adminRoleId]);
                    isUserAdmin = isAdminRes.rows.length > 0;
                }
                // Si el usuario es admin y lo vamos a cambiar a un rol distinto a admin, verificar que no sea el último admin
                if (isUserAdmin && adminRoleId && rid !== adminRoleId) {
                    const countRes = await dbQuery('SELECT COUNT(*)::int AS c FROM user_roles WHERE role_id = $1', [adminRoleId]);
                    const adminCount = countRes.rows[0]?.c || 0;
                    if (adminCount <= 1) {
                        return res.status(400).json({ message: 'No puedes quitar el último administrador' });
                    }
                }
                // Reemplazar roles
                await dbQuery('DELETE FROM user_roles WHERE user_id = $1', [id]);
                await dbQuery('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, rid]);
            }
        }
        // actualizar permisos directos: reemplazar por los enviados
        await dbQuery('DELETE FROM user_permissions WHERE user_id = $1', [id]);
        if (Array.isArray(permissionIds) && permissionIds.length) {
            for (const pid of permissionIds) {
                const pnum = Number(pid);
                if (!Number.isNaN(pnum)) {
                    await dbQuery('INSERT INTO user_permissions (user_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, pnum]);
                }
            }
        }
        res.json({ ok: true });
    } catch (e) {
        console.error('Error en PUT /api/users/:id:', e);
        res.status(500).json({ message: 'Error interno' });
    }
});

app.delete('/api/users/:id', isAuthenticated, requirePermission('users.manage'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await dbQuery('DELETE FROM users WHERE id = $1', [id]);
        res.json({ ok: true });
    } catch (e) {
        console.error('Error en DELETE /api/users/:id:', e);
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

    const listSql = `SELECT 
                p.id,
                p.pedidoNo AS "pedidoNo",
                p.nombre_cliente,
                p.nit_cliente,
                p.direccion_cliente,
                p.tel_cliente,
                p.envio_no,
                p.transporte,
                p.vendedor,
                p.codigo_cliente,
                p.total_letras,
                p.factura_no,
                p.autorizado,
                p.productos_json,
                p.total_q,
                p.fecha_creacion,
                p.created_by,
                u.username as created_by_username
             FROM pedidos p
             LEFT JOIN users u ON p.created_by = u.id
             ${whereSql}
             ORDER BY p.fecha_creacion DESC LIMIT ${ps} OFFSET ${offset}`;
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

// Catch all para rutas no encontradas (debe ir AL FINAL después de todas las rutas)
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