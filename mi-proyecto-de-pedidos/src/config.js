// Configuración de URLs para diferentes entornos
const config = {
  development: {
    API_BASE_URL: '', // Usar proxy local
  },
  production: {
    API_BASE_URL: process.env.REACT_APP_API_URL || 'https://tu-backend.onrender.com',
  }
};

const environment = process.env.NODE_ENV || 'development';

export default config[environment];