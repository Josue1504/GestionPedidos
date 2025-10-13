import config from './config';

// Helper para hacer fetch con la URL correcta
const apiRequest = (endpoint, options = {}) => {
  const baseUrl = config.API_BASE_URL;
  const url = baseUrl ? `${baseUrl}${endpoint}` : endpoint;
  
  // Agregar credentials por defecto
  const defaultOptions = {
    credentials: 'include',
    ...options
  };
  
  return fetch(url, defaultOptions);
};

export default apiRequest;