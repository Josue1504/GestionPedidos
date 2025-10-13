const express = require('express');
const { Pool } = require('pg');
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

// Conexión a PostgreSQL
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Verificar conexión
db.connect((err, client, release) => {
    if (err) {
        console.error('Error al conectar a la base de datos:', err);
        return;
    }
    console.log('Conexión exitosa a la base de datos PostgreSQL.');
    release();
});

// Función helper para queries con async/await
const dbQuery = (text, params) => {
    return new Promise((resolve, reject) => {
        db.query(text, params, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
};

// Middleware de autenticación
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    } else {
        return res.status(401).json({ message: 'No autenticado.' });
    }
};

// Middleware de autorización por permisos
const requirePermission = (permissionName) => {
    return async (req, res, next) => {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({ message: 'No autenticado.' });
        }

        const userId = req.session.userId;
        
        try {
            // Verificar permisos directos del usuario y de sus roles
            const query = `
                SELECT DISTINCT p.name 
                FROM permissions p
                LEFT JOIN user_permissions up ON p.id = up.permission_id AND up.user_id = $1
                LEFT JOIN role_permissions rp ON p.id = rp.permission_id
                LEFT JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.user_id = $1
                WHERE (up.user_id IS NOT NULL OR ur.user_id IS NOT NULL) AND p.name = $2
            `;
            
            const result = await dbQuery(query, [userId, permissionName]);
            
            if (result.rows.length > 0) {
                next();
            } else {
                res.status(403).json({ message: 'No tienes permisos para realizar esta acción.' });
            }
        } catch (error) {
            console.error('Error verificando permisos:', error);
            res.status(500).json({ message: 'Error interno del servidor.' });
        }
    };
};

// Ruta raíz para verificar que el servidor funciona
app.get('/', (req, res) => {
    res.json({ 
        message: 'API de Gestión de Pedidos está funcionando', 
        version: '1.0.0',
        status: 'ok' 
    });
});

// --- REGISTRO DE USUARIO ---
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Nombre de usuario y contraseña son requeridos.' });
    }

    try {
        // Verificar si el usuario ya existe
        const existingUser = await dbQuery('SELECT * FROM users WHERE username = $1', [username]);
        
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ message: 'El usuario ya existe.' });
        }

        // Cifrar la contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insertar el nuevo usuario
        const result = await dbQuery('INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id', [username, hashedPassword]);
        
        res.status(201).json({ message: 'Usuario registrado exitosamente.', userId: result.rows[0].id });
    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ message: 'Error en el servidor.' });
    }
});

// --- INICIO DE SESIÓN ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await dbQuery('SELECT * FROM users WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        const user = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        // Guardar en sesión
        req.session.userId = user.id;
        req.session.username = user.username;

        res.json({ 
            message: 'Inicio de sesión exitoso.',
            user: { id: user.id, username: user.username }
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ message: 'Error en el servidor.' });
    }
});

// --- CERRAR SESIÓN ---
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error al cerrar sesión:', err);
            return res.status(500).json({ message: 'Error al cerrar sesión.' });
        }
        res.clearCookie('connect.sid');
        res.json({ message: 'Sesión cerrada exitosamente.' });
    });
});

// --- OBTENER INFORMACIÓN DEL USUARIO ACTUAL ---
app.get('/api/me', isAuthenticated, async (req, res) => {
    try {
        const result = await dbQuery('SELECT id, username FROM users WHERE id = $1', [req.session.userId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        res.json({ user: result.rows[0] });
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        res.status(500).json({ message: 'Error en el servidor.' });
    }
});

// --- OBTENER PRODUCTOS POR CÓDIGO ---
app.get('/api/productos/:code', async (req, res) => {
    const { code } = req.params;
    
    try {
        const result = await dbQuery('SELECT * FROM productos WHERE code = $1', [code]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error buscando producto:', error);
        res.status(500).json({ message: 'Error en el servidor.' });
    }
});

// --- CREAR PEDIDO ---
app.post('/api/pedidos', isAuthenticated, requirePermission('pedidos.create'), async (req, res) => {
    const { cliente, productos } = req.body;

    if (!cliente || !productos || productos.length === 0) {
        return res.status(400).json({ message: 'Cliente y productos son requeridos.' });
    }

    try {
        // Calcular total
        let total = 0;
        for (const producto of productos) {
            total += producto.cantidad * producto.precio;
        }

        // Insertar pedido
        const pedidoResult = await dbQuery(
            'INSERT INTO pedidos (usuario_id, cliente, total, estado) VALUES ($1, $2, $3, $4) RETURNING id',
            [req.session.userId, cliente, total, 'pendiente']
        );

        const pedidoId = pedidoResult.rows[0].id;

        // Insertar detalles del pedido
        for (const producto of productos) {
            await dbQuery(
                'INSERT INTO pedido_detalles (pedido_id, producto_codigo, cantidad, precio_unitario) VALUES ($1, $2, $3, $4)',
                [pedidoId, producto.codigo, producto.cantidad, producto.precio]
            );
        }

        res.status(201).json({ 
            message: 'Pedido creado exitosamente.',
            pedidoId: pedidoId 
        });
    } catch (error) {
        console.error('Error creando pedido:', error);
        res.status(500).json({ message: 'Error en el servidor.' });
    }
});

// --- OBTENER PEDIDOS ---
app.get('/api/pedidos', isAuthenticated, async (req, res) => {
    try {
        const result = await dbQuery(`
            SELECT p.*, u.username as usuario_nombre 
            FROM pedidos p 
            JOIN users u ON p.usuario_id = u.id 
            ORDER BY p.fecha_creacion DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo pedidos:', error);
        res.status(500).json({ message: 'Error en el servidor.' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});