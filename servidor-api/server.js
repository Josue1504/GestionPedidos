const express = require('express');
const cors = require('cors');

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

// Ruta raíz para verificar que el servidor funciona
app.get('/', (req, res) => {
    try {
        res.json({ 
            message: 'API de Gestión de Pedidos está funcionando', 
            version: '1.0.0',
            status: 'ok',
            environment: process.env.NODE_ENV || 'development',
            frontendUrl: process.env.FRONTEND_URL,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error en ruta raíz:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Ruta de prueba para login sin base de datos
app.post('/api/login', (req, res) => {
    try {
        console.log('Login attempt:', req.body);
        const { username, password } = req.body;
        
        // Login de prueba
        if (username === 'admin' && password === '123') {
            res.json({ 
                message: 'Login exitoso (modo prueba)',
                user: { id: 1, username: 'admin' }
            });
        } else {
            res.status(401).json({ message: 'Credenciales inválidas' });
        }
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno en login' });
    }
});

// Ruta de salud
app.get('/api/health', (req, res) => {
    try {
        res.json({ 
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    } catch (error) {
        console.error('Error en health:', error);
        res.status(500).json({ error: 'Error en health check' });
    }
});

// Catch all para rutas no encontradas
app.use('*', (req, res) => {
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
    console.log(`⏰ Iniciado en: ${new Date().toISOString()}`);
}).on('error', (err) => {
    console.error('❌ Error al iniciar servidor:', err);
});