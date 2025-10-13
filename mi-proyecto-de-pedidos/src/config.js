// Configuración de URLs para diferentes entornos
const config = {
  development: {
    API_BASE_URL: '', // Usar proxy local
  },
  production: {
    API_BASE_URL: process.env.REACT_APP_API_URL || 'https://gestionpedidos-1-be.onrender.com',
  }
};

// En Render siempre usar production si existe REACT_APP_API_URL
const environment = process.env.REACT_APP_API_URL ? 'production' : (process.env.NODE_ENV || 'development');

console.log('Environment:', environment);
console.log('API_BASE_URL:', config[environment].API_BASE_URL);
console.log('REACT_APP_API_URL:', process.env.REACT_APP_API_URL);

export default config[environment];