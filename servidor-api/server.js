const express = require('express');
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const cors = require('cors');
const session = require('express-session');

// Cargar variables de entorno
require('dotenv').config();

const app = express();

// --- Configuración de CORS con credenciales ---
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// --- Habilitar el uso de JSON para las peticiones ---
app.use(express.json());

// --- Middleware de sesión ---
// La configuración de la cookie es crucial aquí
// Ajustes de sesión: en desarrollo no usamos secure=true porque no estamos en HTTPS.
const isProduction = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1); // si lo ejecutas detrás de un proxy/proxy de dev
app.use(session({
    secret: process.env.SESSION_SECRET || 'tu_secreto_de_sesion',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: isProduction,                 // sólo true en producción (HTTPS)
        httpOnly: true,
        sameSite: isProduction ? 'none' : 'lax', // sameSite none requiere secure=true en navegadores modernos
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

// Conexión a MySQL
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'fe200405', 
    database: process.env.DB_NAME || 'db_pedidos'
});

db.connect(err => {
    if (err) {
        console.error('Error al conectar a la base de datos:', err);
        return;
    }
    console.log('Conexión exitosa a la base de datos MySQL.');
});

// Once-only warning guard to avoid spamming logs when optional migration
// (user_permissions) hasn't been applied.
let warnedMissingUserPermissions = false;

// Endpoint para el registro de usuarios
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Nombre de usuario y contraseña son requeridos.' });
    }

    try {
        const checkUserQuery = 'SELECT * FROM users WHERE username = ?';
        db.query(checkUserQuery, [username], async (err, results) => {
            if (err) {
                return res.status(500).json({ message: 'Error en el servidor.' });
            }
            if (results.length > 0) {
                return res.status(409).json({ message: 'El usuario ya existe.' });
            }

            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            const insertUserQuery = 'INSERT INTO users (username, password_hash) VALUES (?, ?)';
            db.query(insertUserQuery, [username, hashedPassword], (err, result) => {
                if (err) {
                    return res.status(500).json({ message: 'Error al registrar el usuario.' });
                }
                res.status(201).json({ message: 'Usuario registrado exitosamente.' });
            });
        });
    } catch (error) {
        res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});

// Endpoint para el login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    // Select user and include active flag if it exists (COALESCE -> default to 1)
    const query = 'SELECT u.*, COALESCE(u.active, 1) AS active FROM users u WHERE username = ?';
    db.query(query, [username], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        const user = results[0];
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        // If the active column exists and the user is inactive, block login
        // (user.active comes from COALESCE => 1 if column missing)
        if (user.active === 0 || user.active === '0' || user.active === false) {
            console.log(`Login blocked for inactive user id=${user.id} username=${user.username}`);
            return res.status(403).json({ message: 'Usuario inactivo.' });
        }

        // Success
        req.session.userId = user.id;
        console.log('Login successful for user id=', user.id, 'sessionID=', req.sessionID);
        console.log('Request cookies header:', req.headers.cookie);
        console.log('Session object after login:', req.session);
        // Dev-only: devolver sessionID para ayudar en debugging (no es seguro dejarlo en producción)
        res.status(200).json({ message: 'Login exitoso.', sessionID: req.sessionID });
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error al cerrar sesión:', err);
            return res.status(500).json({ message: 'Error al cerrar sesión.' });
        }
        res.status(200).json({ message: 'Sesión cerrada exitosamente.' });
    });
});

// Middleware de autenticación
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ message: 'No autenticado.' });
    }
};

// Helper para comprobar permisos de usuario (revisa permisos directos y por rol)
// This function is defensive: if the optional `user_permissions` table
// doesn't exist (migration not applied), it will fall back to checking
// role-based permissions only instead of throwing a hard error.
const userHasPermission = (userId, permissionName) => {
        return new Promise((resolve, reject) => {
                if (!userId) return resolve(false);

                const fullSql = `
                SELECT 1 FROM (
                    SELECT p.id FROM user_roles ur
                        JOIN role_permissions rp ON rp.role_id = ur.role_id
                        JOIN permissions p ON p.id = rp.permission_id
                        WHERE ur.user_id = ?
                    UNION
                    SELECT up.permission_id AS id FROM user_permissions up WHERE up.user_id = ?
                ) x
                JOIN permissions p2 ON p2.id = x.id
                WHERE p2.name = ? LIMIT 1`;

                db.query(fullSql, [userId, userId, permissionName], (err, results) => {
                        if (!err) return resolve(results && results.length > 0);

                        // If the user_permissions table doesn't exist, fall back to
                        // checking only role-based permissions. This makes the server
                        // tolerate a missing migration while still enforcing role rules.
            if (err && err.code === 'ER_NO_SUCH_TABLE') {
                if (!warnedMissingUserPermissions) {
                    console.warn('user_permissions table missing; falling back to role-only permission check. Please run migrations: servidor-api/migrations/002_user_permissions.sql');
                    warnedMissingUserPermissions = true;
                }

                                const roleOnlySql = `
                                SELECT 1 FROM user_roles ur
                                    JOIN role_permissions rp ON rp.role_id = ur.role_id
                                    JOIN permissions p ON p.id = rp.permission_id
                                WHERE ur.user_id = ? AND p.name = ? LIMIT 1`;

                                return db.query(roleOnlySql, [userId, permissionName], (err2, results2) => {
                                        if (err2) return reject(err2);
                                        return resolve(results2 && results2.length > 0);
                                });
                        }

                        // Unknown error: reject so caller handles it
                        return reject(err);
                });
        });
};

// Middleware factory para requerir permiso
const requirePermission = (permissionName) => {
    return async (req, res, next) => {
        try {
            const userId = req.session.userId;
            if (!userId) return res.status(401).json({ message: 'No autenticado.' });
            const ok = await userHasPermission(userId, permissionName);
            if (!ok) return res.status(403).json({ message: 'No tienes permiso.' });
            next();
        } catch (err) {
            console.error('Error comprobando permiso:', err);
            res.status(500).json({ message: 'Error en el servidor' });
        }
    };
};

// Rutas de la API de pedidos
// Crear pedido: requerir permiso explícito 'pedidos.create'
app.post('/api/pedidos', isAuthenticated, requirePermission('pedidos.create'), async (req, res) => {
    const { pedidoNo, clienteData, productos, finalData, fecha } = req.body;
    console.log('POST /api/pedidos - sessionID=', req.sessionID);
    console.log('Request cookies header:', req.headers.cookie);
    console.log('Session object at pedidos:', req.session);

    // Extra safety: explicitly re-check permission and log outcome so we can
    // debug cases where a user without permission still manages to call this route.
    try {
        const has = await userHasPermission(req.session.userId, 'pedidos.create');
        console.log(`Permission check for user ${req.session.userId} pedidos.create => ${has}`);
        if (!has) {
            console.warn(`Blocked creación de pedido: usuario ${req.session.userId} no tiene 'pedidos.create'`);
            return res.status(403).json({ message: 'No tienes permiso para crear pedidos.' });
        }
    } catch (permErr) {
        console.error('Error al comprobar permiso en POST /api/pedidos:', permErr);
        return res.status(500).json({ message: 'Error comprobando permisos.' });
    }

    // Guardar productos como JSON en la columna productos_json (según el esquema proporcionado)
    const productosJson = JSON.stringify(productos || []);

    // Insertar todos los campos que están en tu esquema
    const insertPedidoSQL = `INSERT INTO pedidos (
        pedidoNo,
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
        factura_no,
        autorizado,
        productos_json,
        fecha_creacion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    // Convertir fecha legible del frontend (ej. "30 de 9 de 2025") a formato MySQL DATETIME
    let fechaParam = null;
    if (fecha && typeof fecha === 'string') {
        // Intentar extraer dia, mes, año de formato "DD de M de YYYY" o variantes
        const m = fecha.match(/(\d{1,2})\s+de\s+(\d{1,2})\s+de\s+(\d{4})/);
        if (m) {
            const day = parseInt(m[1], 10);
            const month = parseInt(m[2], 10);
            const year = parseInt(m[3], 10);
            // Construir objeto Date en UTC local (hora 00:00:00)
            const d = new Date(year, month - 1, day);
            if (!isNaN(d.getTime())) {
                // Formatear a 'YYYY-MM-DD HH:MM:SS' para MySQL
                const pad = (n) => n.toString().padStart(2, '0');
                const mysqlDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                fechaParam = mysqlDate;
            }
        }
    }

    const params = [
        pedidoNo || null,
        clienteData.nombre || null,
        clienteData.nit || null,
        clienteData.direccion || null,
        clienteData.tel || null,
        clienteData.envioNo || null,
        clienteData.transporte || null,
        clienteData.vendedor || null,
        clienteData.codigoCliente || null,
        finalData.totalLetras || null,
        parseFloat(finalData.totalQ) || 0.00,
        finalData.facturaNo || null,
        finalData.autorizado || null,
        productosJson,
        fechaParam // NULL si no pudo convertirse
    ];

    db.query(insertPedidoSQL, params, (err, result) => {
        if (err) {
            console.error('Error al insertar el pedido:', err);
            return res.status(500).json({ message: 'Error al insertar el pedido.' });
        }
        const newId = result.insertId;
        // Intentar asignar created_by si la columna existe (no fallar si no existe)
        const trySetCreatedBy = () => {
            const updSql = 'UPDATE pedidos SET created_by = ? WHERE id = ?';
            db.query(updSql, [req.session.userId, newId], (uErr) => {
                if (uErr) {
                    // Si la columna no existe o hay otro error, lo registramos pero no abortamos
                    if (uErr.code === 'ER_BAD_FIELD_ERROR' || uErr.code === 'ER_NO_SUCH_COLUMN') {
                        console.warn('created_by column missing in pedidos; skipping created_by set.');
                    } else {
                        console.error('Error estableciendo created_by en pedido:', uErr);
                    }
                }
                res.status(201).json({ message: 'Pedido guardado con éxito.', pedidoId: newId });
            });
        };

        trySetCreatedBy();
    });
});

app.get('/api/pedidos', isAuthenticated, async (req, res) => {
    const dbQuery = (sql, params=[]) => new Promise((resolve, reject) => db.query(sql, params, (err, results) => err ? reject(err) : resolve(results)));
    try {
        const userId = req.session.userId;
        const canViewAll = await userHasPermission(userId, 'pedidos.view_all');

        const { created_by, vendedor, page = 1, pageSize = 50, fromDate, toDate, q } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const size = Math.min(500, Math.max(1, parseInt(pageSize, 10) || 50));
        const offset = (pageNum - 1) * size;

        // Security: non-admin users cannot request other users' pedidos
        if (created_by && parseInt(created_by, 10) !== userId && !canViewAll) {
            return res.status(403).json({ message: 'No tienes permiso para ver esos pedidos.' });
        }

        // Helper to execute the created_by-based query (may fail if column missing)
        const runCreatedByQuery = async (creatorId) => {
            // build where clauses
            const where = [];
            const params = [];
            where.push('created_by = ?'); params.push(creatorId);
            if (fromDate) { where.push('fecha_creacion >= ?'); params.push(fromDate + ' 00:00:00'); }
            if (toDate) { where.push('fecha_creacion <= ?'); params.push(toDate + ' 23:59:59'); }
            if (q) { where.push('(nombre_cliente LIKE ? OR nit_cliente LIKE ? OR pedidoNo LIKE ?)'); params.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }

            const whereSql = where.length ? (' WHERE ' + where.join(' AND ')) : '';
            const countSql = `SELECT COUNT(*) AS total FROM pedidos${whereSql}`;
            const itemsSql = `SELECT * FROM pedidos${whereSql} ORDER BY fecha_creacion DESC LIMIT ? OFFSET ?`;
            const countRes = await dbQuery(countSql, params);
            const total = countRes && countRes[0] ? countRes[0].total : 0;
            const itemsParams = params.concat([size, offset]);
            const items = await dbQuery(itemsSql, itemsParams);
            return { total, pedidos: items };
        };

        // Helper to execute vendedor-based query
        const runVendedorQuery = async (vendedorName) => {
            const where = [];
            const params = [];
            where.push('vendedor = ?'); params.push(vendedorName);
            if (fromDate) { where.push('fecha_creacion >= ?'); params.push(fromDate + ' 00:00:00'); }
            if (toDate) { where.push('fecha_creacion <= ?'); params.push(toDate + ' 23:59:59'); }
            if (q) { where.push('(nombre_cliente LIKE ? OR nit_cliente LIKE ? OR pedidoNo LIKE ?)'); params.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }
            const whereSql = where.length ? (' WHERE ' + where.join(' AND ')) : '';
            const countSql = `SELECT COUNT(*) AS total FROM pedidos${whereSql}`;
            const itemsSql = `SELECT * FROM pedidos${whereSql} ORDER BY fecha_creacion DESC LIMIT ? OFFSET ?`;
            const countRes = await dbQuery(countSql, params);
            const total = countRes && countRes[0] ? countRes[0].total : 0;
            const items = await dbQuery(itemsSql, params.concat([size, offset]));
            return { total, pedidos: items };
        };

        // If created_by provided, try to query by that column first; fallback if column missing
        if (created_by) {
            try {
                const result = await runCreatedByQuery(parseInt(created_by, 10));
                return res.json({ total: result.total, page: pageNum, pageSize: size, pedidos: result.pedidos });
            } catch (err) {
                if (err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_COLUMN')) {
                    // fallback: map user id to username and use vendedor
                    const u = await dbQuery('SELECT username FROM users WHERE id = ? LIMIT 1', [created_by]);
                    const username = (u && u[0] && u[0].username) || null;
                    if (!username) return res.json({ total: 0, page: pageNum, pageSize: size, pedidos: [] });
                    const fallback = await runVendedorQuery(username);
                    return res.json({ total: fallback.total, page: pageNum, pageSize: size, pedidos: fallback.pedidos });
                }
                throw err;
            }
        }

        // If vendedor provided explicitly, use that
        if (vendedor) {
            const result = await runVendedorQuery(vendedor);
            return res.json({ total: result.total, page: pageNum, pageSize: size, pedidos: result.pedidos });
        }

        // No creator/vendedor specified
        if (canViewAll) {
            // list all with optional filters
            const where = [];
            const params = [];
            if (fromDate) { where.push('fecha_creacion >= ?'); params.push(fromDate + ' 00:00:00'); }
            if (toDate) { where.push('fecha_creacion <= ?'); params.push(toDate + ' 23:59:59'); }
            if (q) { where.push('(nombre_cliente LIKE ? OR nit_cliente LIKE ? OR pedidoNo LIKE ?)'); params.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }
            const whereSql = where.length ? (' WHERE ' + where.join(' AND ')) : '';
            const countRes = await dbQuery(`SELECT COUNT(*) AS total FROM pedidos${whereSql}`, params);
            const total = countRes && countRes[0] ? countRes[0].total : 0;
            const items = await dbQuery(`SELECT * FROM pedidos${whereSql} ORDER BY fecha_creacion DESC LIMIT ? OFFSET ?`, params.concat([size, offset]));
            return res.json({ total, page: pageNum, pageSize: size, pedidos: items });
        }

        // Non-admin: return only own pedidos (try created_by then fallback to vendedor)
        try {
            const own = await runCreatedByQuery(userId);
            return res.json({ total: own.total, page: pageNum, pageSize: size, pedidos: own.pedidos });
        } catch (err) {
            if (err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_COLUMN')) {
                // fallback: filter by username
                const u = await dbQuery('SELECT username FROM users WHERE id = ? LIMIT 1', [userId]);
                const username = (u && u[0] && u[0].username) || null;
                if (!username) return res.json({ total: 0, page: pageNum, pageSize: size, pedidos: [] });
                const fallback = await runVendedorQuery(username);
                return res.json({ total: fallback.total, page: pageNum, pageSize: size, pedidos: fallback.pedidos });
            }
            throw err;
        }
    } catch (err) {
        console.error('Error al obtener los pedidos (filtro):', err);
        res.status(500).send('Error al obtener los pedidos.');
    }
});

// Endpoint para buscar producto por código en inventario_productos
app.get('/api/productos/:code', (req, res) => {
    const code = (req.params.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ message: 'Código requerido' });
    const sql = 'SELECT codigo_producto AS code, descripcion FROM inventario_productos WHERE codigo_producto = ? LIMIT 1';
    db.query(sql, [code], (err, results) => {
        if (err) {
            console.error('Error al buscar producto:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        if (!results || results.length === 0) return res.status(404).json({ message: 'No encontrado' });
        res.json(results[0]);
    });
});

app.put('/api/pedidos/:id', isAuthenticated, requirePermission('pedidos.edit'), (req, res) => {
    const { id } = req.params;
    const body = req.body || {};

    // Preparar productos_json: aceptar array u objeto o string
    let productosJson = null;
    if (body.productos_json) {
        productosJson = typeof body.productos_json === 'string' ? body.productos_json : JSON.stringify(body.productos_json);
    } else if (body.productos) {
        productosJson = JSON.stringify(body.productos);
    }

    // Procesar fecha si viene como cadena legible
    let fechaParam = null;
    const fechaRaw = body.fecha_creacion || body.fecha || body.fechaCreacion || null;
    if (fechaRaw && typeof fechaRaw === 'string') {
        const m = fechaRaw.match(/(\d{1,2})\s+de\s+(\d{1,2})\s+de\s+(\d{4})/);
        if (m) {
            const day = parseInt(m[1], 10);
            const month = parseInt(m[2], 10);
            const year = parseInt(m[3], 10);
            const d = new Date(year, month - 1, day);
            if (!isNaN(d.getTime())) {
                const pad = (n) => n.toString().padStart(2, '0');
                fechaParam = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            }
        } else {
            // intentar parsear ISO
            const d = new Date(fechaRaw);
            if (!isNaN(d.getTime())) {
                const pad = (n) => n.toString().padStart(2, '0');
                fechaParam = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            }
        }
    }

    const sql = `UPDATE pedidos SET
        nombre_cliente = ?,
        nit_cliente = ?,
        direccion_cliente = ?,
        tel_cliente = ?,
        envio_no = ?,
        transporte = ?,
        vendedor = ?,
        codigo_cliente = ?,
        total_letras = ?,
        total_q = ?,
        factura_no = ?,
        autorizado = ?,
        productos_json = ?,
        fecha_creacion = ?
        WHERE id = ?`;

    const params = [
        body.nombre_cliente || null,
        body.nit_cliente || null,
        body.direccion_cliente || null,
        body.tel_cliente || null,
        body.envio_no || null,
        body.transporte || null,
        body.vendedor || null,
        body.codigo_cliente || null,
        body.total_letras || null,
        body.total_q ? parseFloat(body.total_q) : 0.00,
        body.factura_no || null,
        body.autorizado || null,
        productosJson,
        fechaParam,
        id
    ];

    db.query(sql, params, (err, result) => {
        if (err) {
            console.error('Error al actualizar el pedido:', err);
            return res.status(500).json({ message: 'Error al actualizar el pedido.' });
        }
        res.json({ message: 'Pedido actualizado con éxito.', affectedRows: result.affectedRows });
    });
});

app.delete('/api/pedidos/:id', isAuthenticated, requirePermission('pedidos.delete'), async (req, res) => {
    const { id } = req.params;
    try {
        // Extra logging: check permission explicitly
        const has = await userHasPermission(req.session.userId, 'pedidos.delete');
        console.log(`Permission check for user ${req.session.userId} pedidos.delete => ${has}`);
        if (!has) {
            console.warn(`Blocked eliminación de pedido: usuario ${req.session.userId} no tiene 'pedidos.delete'`);
            return res.status(403).json({ message: 'No tienes permiso para eliminar pedidos.' });
        }
    } catch (err) {
        console.error('Error comprobando permiso antes de eliminar pedido:', err);
        return res.status(500).json({ message: 'Error comprobando permisos.' });
    }

    const sql = 'DELETE FROM pedidos WHERE id=?';
    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error('Error al eliminar el pedido:', err);
            return res.status(500).json({ message: 'Error al eliminar el pedido.' });
        }
        res.json({ message: 'Pedido eliminado con éxito.', affectedRows: result.affectedRows });
    });
});

// Endpoint de depuración (NO dejar en producción)
app.get('/api/debug-session', (req, res) => {
    res.json({
        sessionID: req.sessionID,
        session: req.session,
        cookiesHeader: req.headers.cookie || null,
    });
});

// Endpoint para obtener información del usuario autenticado (username y roles)
app.get('/api/me', isAuthenticated, (req, res) => {
    const sql = `SELECT u.id, u.username, r.name AS role
                 FROM users u
                 LEFT JOIN user_roles ur ON ur.user_id = u.id
                 LEFT JOIN roles r ON r.id = ur.role_id
                 WHERE u.id = ?`;
    db.query(sql, [req.session.userId], (err, results) => {
        if (err) {
            console.error('Error al obtener info de usuario:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        if (!results || results.length === 0) {
            return res.status(200).json({ id: req.session.userId, username: null, roles: [] });
        }

        const username = results[0].username;
        const roles = results.map(r => r.role).filter(Boolean);
        res.json({ id: req.session.userId, username, roles });
    });
});

// Ruta raíz para verificar que el servidor funciona
app.get('/', (req, res) => {
    res.json({ 
        message: 'API de Gestión de Pedidos está funcionando', 
        version: '1.0.0',
        status: 'ok' 
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});

// Listar permisos disponibles (para checklist en frontend)
app.get('/api/permissions', isAuthenticated, (req, res) => {
    db.query('SELECT id, name, description FROM permissions ORDER BY name', (err, results) => {
        if (err) return res.status(500).json({ message: 'Error en el servidor' });
        res.json(results);
    });
});

// Listar usuarios (solo para administradores)
app.get('/api/users', isAuthenticated, requirePermission('users.manage'), (req, res) => {
    const sql = `SELECT u.id, u.username, COALESCE(u.active,1) AS active, GROUP_CONCAT(r.name) AS roles
                 FROM users u
                 LEFT JOIN user_roles ur ON ur.user_id = u.id
                 LEFT JOIN roles r ON r.id = ur.role_id
                 GROUP BY u.id, u.username, u.active`;

    db.query(sql, (err, results) => {
        if (!err) return res.json(results.map(r => ({ id: r.id, username: r.username, active: r.active === 1 || r.active === '1', roles: r.roles ? r.roles.split(',') : [] })));

        // If the active column doesn't exist yet (migration not applied), fall back to role-only query
        if (err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_COLUMN')) {
            console.warn('users.active column missing; falling back to legacy users query. Run migrations: servidor-api/migrations/004_add_user_active.sql');
            const fallback = `SELECT u.id, u.username, GROUP_CONCAT(r.name) AS roles
                              FROM users u
                              LEFT JOIN user_roles ur ON ur.user_id = u.id
                              LEFT JOIN roles r ON r.id = ur.role_id
                              GROUP BY u.id, u.username`;
            return db.query(fallback, (err2, results2) => {
                if (err2) {
                    console.error('Error al obtener usuarios (fallback):', err2);
                    return res.status(500).json({ message: 'Error en el servidor' });
                }
                return res.json(results2.map(r => ({ id: r.id, username: r.username, active: true, roles: r.roles ? r.roles.split(',') : [] })));
            });
        }

        console.error('Error al obtener usuarios:', err);
        return res.status(500).json({ message: 'Error en el servidor' });
    });
});

// Crear usuario y asignar rol/permissions (solo admin)
app.post('/api/users', isAuthenticated, requirePermission('users.manage'), async (req, res) => {
    const { username, password, roleId, permissionIds } = req.body || {};
    if (!username || !password) return res.status(400).json({ message: 'username y password requeridos' });

    try {
        // Verificar duplicado
        const exists = await new Promise((resolve, reject) => db.query('SELECT id FROM users WHERE username = ?', [username], (err, rows) => err ? reject(err) : resolve(rows && rows.length > 0)));
        if (exists) return res.status(409).json({ message: 'Usuario ya existe' });

        const saltRounds = 10;
        const hashed = await bcrypt.hash(password, saltRounds);

        // Insert user
        const insertRes = await new Promise((resolve, reject) => db.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hashed], (err, result) => err ? reject(err) : resolve(result)));
        const newUserId = insertRes.insertId;

        // Assign role if provided
        if (roleId) {
            await new Promise((resolve, reject) => db.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [newUserId, roleId], (err) => err ? reject(err) : resolve()));
        }

        // Assign direct permissions if provided (optional)
        if (Array.isArray(permissionIds) && permissionIds.length > 0) {
            const values = permissionIds.map(pid => [newUserId, pid]);
            try {
                await new Promise((resolve, reject) => db.query('INSERT INTO user_permissions (user_id, permission_id) VALUES ?', [values], (err) => err ? reject(err) : resolve()));
            } catch (permErr) {
                // If the user_permissions table doesn't exist, log a friendly warning
                // and continue: the user is created but direct permissions were not assigned.
                if (permErr && permErr.code === 'ER_NO_SUCH_TABLE') {
                    console.warn('user_permissions table missing; created user but could not assign direct permissions. Run migrations: servidor-api/migrations/002_user_permissions.sql');
                } else {
                    throw permErr; // rethrow other DB errors to be handled by outer catch
                }
            }
        }

        res.status(201).json({ ok: true, userId: newUserId });
    } catch (err) {
        console.error('Error creando usuario:', err);
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

// Listar roles (para el dropdown en la UI)
app.get('/api/roles', isAuthenticated, (req, res) => {
    db.query('SELECT id, name, description FROM roles ORDER BY name', (err, results) => {
        if (err) return res.status(500).json({ message: 'Error en el servidor' });
        res.json(results);
    });
});

// Consultar si el usuario actual tiene un permiso específico
app.get('/api/has-permission', isAuthenticated, async (req, res) => {
    const name = req.query.name;
    if (!name) return res.status(400).json({ message: 'name query required' });
    try {
        const ok = await userHasPermission(req.session.userId, name);
        res.json({ ok });
    } catch (err) {
        console.error('Error comprobando permiso (has-permission):', err);
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

// Obtener permisos efectivos del usuario en sesión (role + permisos directos)
app.get('/api/me-permissions', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.json({ permissions: [] });

    const combinedSql = `
        SELECT DISTINCT p.name FROM role_permissions rp
            JOIN permissions p ON p.id = rp.permission_id
            JOIN user_roles ur ON ur.role_id = rp.role_id
        WHERE ur.user_id = ?
        UNION
        SELECT p2.name FROM user_permissions up JOIN permissions p2 ON p2.id = up.permission_id WHERE up.user_id = ?
        ORDER BY name`;

    db.query(combinedSql, [userId, userId], (err, results) => {
        if (!err) return res.json({ permissions: (results || []).map(r => r.name) });

        // If user_permissions table missing, fall back to role-only
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            if (!warnedMissingUserPermissions) {
                console.warn('user_permissions table missing when fetching me-permissions; falling back to role-only. Run migrations: servidor-api/migrations/002_user_permissions.sql');
                warnedMissingUserPermissions = true;
            }
            const roleOnlySql = `
                SELECT DISTINCT p.name FROM role_permissions rp
                    JOIN permissions p ON p.id = rp.permission_id
                    JOIN user_roles ur ON ur.role_id = rp.role_id
                WHERE ur.user_id = ? ORDER BY p.name`;
            return db.query(roleOnlySql, [userId], (err2, results2) => {
                if (err2) {
                    console.error('Error fetching me-permissions (role-only):', err2);
                    return res.status(500).json({ message: 'Error en el servidor' });
                }
                return res.json({ permissions: (results2 || []).map(r => r.name) });
            });
        }

        console.error('Error obteniendo permisos para usuario en sesión:', err);
        return res.status(500).json({ message: 'Error en el servidor' });
    });
});

// Obtener detalle de un solo usuario (roles + permissions asignadas)
app.get('/api/users/:id', isAuthenticated, requirePermission('users.manage'), (req, res) => {
    const id = req.params.id;
    const sqlUser = 'SELECT id, username, COALESCE(active,1) AS active FROM users WHERE id = ? LIMIT 1';
    const finishWithError = (err) => res.status(500).json({ message: 'Error en el servidor' });

    // Try to get active column; if it doesn't exist, fallback and assume active=true
    db.query(sqlUser, [id], (err, rows) => {
        if (err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_COLUMN')) {
            // fallback without active
            db.query('SELECT id, username FROM users WHERE id = ? LIMIT 1', [id], (err2, rows2) => {
                if (err2) return finishWithError(err2);
                if (!rows2 || rows2.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
                const user = rows2[0];
                // obtener roles
                db.query('SELECT role_id FROM user_roles WHERE user_id = ?', [id], (rErr, rRows) => {
                    if (rErr) return finishWithError(rErr);
                    const roles = (rRows || []).map(rr => rr.role_id);
                    db.query('SELECT permission_id FROM user_permissions WHERE user_id = ?', [id], (pErr, pRows) => {
                        if (pErr) {
                            if (pErr.code === 'ER_NO_SUCH_TABLE') return res.json({ id: user.id, username: user.username, active: true, roles, permissionIds: [] });
                            return finishWithError(pErr);
                        }
                        const permissionIds = (pRows || []).map(pr => pr.permission_id);
                        return res.json({ id: user.id, username: user.username, active: true, roles, permissionIds });
                    });
                });
            });
            return;
        }

        if (err) return finishWithError(err);
        if (!rows || rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
        const user = rows[0];
        // obtener roles
        db.query('SELECT role_id FROM user_roles WHERE user_id = ?', [id], (rErr, rRows) => {
            if (rErr) return finishWithError(rErr);
            const roles = (rRows || []).map(rr => rr.role_id);
            // obtener permisos directos (si la tabla existe)
            db.query('SELECT permission_id FROM user_permissions WHERE user_id = ?', [id], (pErr, pRows) => {
                if (pErr) {
                    if (pErr.code === 'ER_NO_SUCH_TABLE') {
                        // tabla faltante: devolver empty list
                        return res.json({ id: user.id, username: user.username, active: true, roles, permissionIds: [] });
                    }
                    return finishWithError(pErr);
                }
                const permissionIds = (pRows || []).map(pr => pr.permission_id);
                return res.json({ id: user.id, username: user.username, active: user.active === 1 || user.active === '1', roles, permissionIds });
            });
        });
    });
});

// Actualizar usuario (username, password opcional, role, permissionIds)
app.put('/api/users/:id', isAuthenticated, requirePermission('users.manage'), async (req, res) => {
    const id = req.params.id;
    const { username, password, roleId, permissionIds } = req.body || {};
    if (!username) return res.status(400).json({ message: 'username requerido' });

    try {
        // Si se cambia el username, actualizar
        const updates = [];
        const params = [];
        updates.push('username = ?'); params.push(username);

        if (password) {
            const hashed = await bcrypt.hash(password, 10);
            updates.push('password_hash = ?'); params.push(hashed);
        }

        // Support updating active state if provided
        if (typeof req.body.active !== 'undefined') {
            updates.push('active = ?');
            params.push(req.body.active ? 1 : 0);
        }

        params.push(id);
        const updateSql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

        // Execute update; if it fails because 'active' column doesn't exist, retry without the active part.
        try {
            await new Promise((resolve, reject) => db.query(updateSql, params, (err) => err ? reject(err) : resolve()));
        } catch (updateErr) {
            if ((updateErr.code === 'ER_BAD_FIELD_ERROR' || updateErr.code === 'ER_NO_SUCH_COLUMN') && updates.includes('active = ?')) {
                console.warn("Active column missing when updating user; retrying update without 'active' column.");
                // Remove the 'active = ?' update and its corresponding param
                const activeIndex = updates.indexOf('active = ?');
                const updates2 = updates.filter(u => u !== 'active = ?');
                const params2 = params.slice();
                // params align with updates order; remove the active param at same index
                if (activeIndex >= 0 && activeIndex < params2.length - 1) {
                    params2.splice(activeIndex, 1);
                }
                const updateSql2 = `UPDATE users SET ${updates2.join(', ')} WHERE id = ?`;
                await new Promise((resolve, reject) => db.query(updateSql2, params2, (err) => err ? reject(err) : resolve()));
            } else {
                throw updateErr;
            }
        }

        // actualizar role: eliminar existentes e insertar nuevo si proporcionado
        await new Promise((resolve, reject) => db.query('DELETE FROM user_roles WHERE user_id = ?', [id], (err) => err ? reject(err) : resolve()));
        if (roleId) {
            await new Promise((resolve, reject) => db.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, roleId], (err) => err ? reject(err) : resolve()));
        }

        // actualizar permisos directos
        await new Promise((resolve, reject) => db.query('DELETE FROM user_permissions WHERE user_id = ?', [id], (err) => err ? reject(err) : resolve())).catch(err => {
            if (err && err.code === 'ER_NO_SUCH_TABLE') {
                // ignore; table missing
                return Promise.resolve();
            }
            throw err;
        });

        if (Array.isArray(permissionIds) && permissionIds.length > 0) {
            const values = permissionIds.map(pid => [id, pid]);
            try {
                await new Promise((resolve, reject) => db.query('INSERT INTO user_permissions (user_id, permission_id) VALUES ?', [values], (err) => err ? reject(err) : resolve()));
            } catch (permErr) {
                if (permErr && permErr.code === 'ER_NO_SUCH_TABLE') {
                    console.warn('user_permissions table missing; updated user but could not assign direct permissions.');
                } else {
                    throw permErr;
                }
            }
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('Error actualizando usuario:', err);
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

// Eliminar usuario
app.delete('/api/users/:id', isAuthenticated, requirePermission('users.manage'), (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'id requerido' });

    // prevenir que un admin se inhabilite a sí mismo por accidente
    if (req.session.userId === id) {
        return res.status(400).json({ message: 'No puedes inhabilitar tu propia cuenta desde la UI.' });
    }

    // Soft-delete: marcar active = 0 en vez de eliminar
    const sql = 'UPDATE users SET active = 0 WHERE id = ?';
    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error('Error inhabilitando usuario:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        res.json({ ok: true, affectedRows: result.affectedRows });
    });
});

// Endpoint para activar/desactivar usuario (PATCH /api/users/:id/active) - admin only
app.patch('/api/users/:id/active', isAuthenticated, requirePermission('users.manage'), (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { active } = req.body || {};
    if (!id) return res.status(400).json({ message: 'id requerido' });
    if (typeof active === 'undefined') return res.status(400).json({ message: 'active requerido (true/false)' });

    // prevenir que un admin inhabilite su propia cuenta
    if (req.session.userId === id && active === false) {
        return res.status(400).json({ message: 'No puedes inhabilitar tu propia cuenta desde la UI.' });
    }

    const sql = 'UPDATE users SET active = ? WHERE id = ?';
    db.query(sql, [active ? 1 : 0, id], (err, result) => {
        if (err) {
            console.error('Error actualizando estado de usuario:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        res.json({ ok: true, affectedRows: result.affectedRows });
    });
});

// Obtener permisos efectivos (nombres) de un usuario: roles + permisos directos
app.get('/api/users/:id/effective-perms', isAuthenticated, requirePermission('users.manage'), (req, res) => {
    const id = req.params.id;
    const combinedSql = `
        SELECT DISTINCT p.name FROM role_permissions rp
            JOIN permissions p ON p.id = rp.permission_id
            JOIN user_roles ur ON ur.role_id = rp.role_id
        WHERE ur.user_id = ?
        UNION
        SELECT p2.name FROM user_permissions up JOIN permissions p2 ON p2.id = up.permission_id WHERE up.user_id = ?
        ORDER BY name`;

    db.query(combinedSql, [id, id], (err, results) => {
        if (!err) return res.json({ permissions: (results || []).map(r => r.name) });

        // If the user_permissions table is missing, fall back to role-only permissions
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            if (!warnedMissingUserPermissions) {
                console.warn('user_permissions table missing when fetching effective-perms; falling back to role-only. Run migrations: servidor-api/migrations/002_user_permissions.sql');
                warnedMissingUserPermissions = true;
            }
            const roleOnlySql = `
                SELECT DISTINCT p.name FROM role_permissions rp
                    JOIN permissions p ON p.id = rp.permission_id
                    JOIN user_roles ur ON ur.role_id = rp.role_id
                WHERE ur.user_id = ? ORDER BY p.name`;
            return db.query(roleOnlySql, [id], (err2, results2) => {
                if (err2) return res.status(500).json({ message: 'Error en el servidor' });
                return res.json({ permissions: (results2 || []).map(r => r.name) });
            });
        }

        console.error('Error obteniendo permisos efectivos:', err);
        return res.status(500).json({ message: 'Error en el servidor' });
    });
});