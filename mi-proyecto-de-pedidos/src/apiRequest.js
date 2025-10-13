import config from './config';

// Helper para hacer fetch con la URL correcta
const apiRequest = async (endpoint, options = {}) => {
  const baseUrl = config.API_BASE_URL;
  const url = baseUrl ? `${baseUrl}${endpoint}` : endpoint;

  // Agregar credentials por defecto
  const defaultOptions = {
    credentials: 'include',
    ...options
  };

  const response = await fetch(url, defaultOptions);
  // Si el usuario fue desactivado, expulsar y mostrar alerta
  if (response.status === 403) {
    try {
      const data = await response.json();
      if (data && typeof data.message === 'string' && data.message.toLowerCase().includes('inactivo')) {
        alert('Tu usuario fue desactivado por el administrador. Serás desconectado.');
        // Limpiar sesión y recargar a login
        window.location.href = '/';
        return response;
      }
    } catch (e) {
      // fallback: solo alerta y recarga
      alert('Tu usuario fue desactivado por el administrador. Serás desconectado.');
      window.location.href = '/';
      return response;
    }
  }
  return response;
};

export default apiRequest;