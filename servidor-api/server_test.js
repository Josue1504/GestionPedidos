const express = require('express');
const cors = require('cors');

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

// Ruta raíz para verificar que el servidor funciona
app.get('/', (req, res) => {
    res.json({ 
        message: 'API de Gestión de Pedidos está funcionando', 
        version: '1.0.0',
        status: 'ok',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
    });
});

// Ruta de prueba para login sin base de datos
app.post('/api/login', (req, res) => {
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
});

// Ruta de salud
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
    console.log(`Modo: ${process.env.NODE_ENV || 'development'}`);
    console.log(`CORS permitido para: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});