import React, { useState, useEffect } from 'react';
import './App.css';
import PedidoForm from './components/PedidoForm';
import PedidosList from './components/PedidosList';
import LoginForm from './components/LoginForm';
import AdminUsers from './components/AdminUsers';
import ReportesPedidos from './components/ReportesPedidos';
import apiRequest from './apiRequest';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [roleLabel, setRoleLabel] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [canViewReports, setCanViewReports] = useState(false);

  // Al montar la app intentamos recuperar la sesión actual (si existe)
  useEffect(() => {
    apiRequest('/api/me')
      .then(r => {
        if (!r.ok) throw new Error('no-session');
        return r.json();
      })
      .then(data => {
        if (data && data.id) {
          setIsAuthenticated(true);
          setUser({ id: data.id, username: data.username });
          const role = (data.roles && data.roles.length > 0) ? data.roles[0] : '';
          setRoleLabel(role);
        }
      })
      .catch(() => {
        // no session, no action
      });
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    // después del login solicitamos /api/me para obtener rol y username
    apiRequest('/api/me')
      .then(r => r.json())
      .then(data => {
        setUser({ id: data.id, username: data.username });
        const role = (data.roles && data.roles.length > 0) ? data.roles[0] : '';
        setRoleLabel(role);
      }).catch(err => {
        console.error('No se pudo obtener /api/me', err);
      });
  };
  
  // Nuevo: función para manejar el cierre de sesión
  const handleLogout = async () => {
    try {
      const response = await apiRequest('/api/logout', {
        method: 'POST'
      });
      if (response.ok) {
        setIsAuthenticated(false); // Restablecer el estado de autenticación
        setShowForm(false); // Opcional: Volver a la lista al cerrar sesión
      } else {
        alert('Hubo un error al cerrar la sesión.');
      }
    } catch (error) {
      console.error('Error de conexión:', error);
    }
  };

  if (!isAuthenticated) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  const toggleMenu = () => setMenuOpen(v => !v);

  return (
    <div className="App">
      <header className="App-header">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <div className="header-title">Sistema de Gestión de Pedidos</div>
          {roleLabel && <div className="role-badge">{roleLabel.toUpperCase()}</div>}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="header-menu">
            <button className="menu-button" onClick={toggleMenu}>☰ Menu</button>
            <div className={`menu-dropdown ${menuOpen ? 'open' : ''}`}>
              <button onClick={() => { setShowForm(true); setMenuOpen(false); }}>Crear Nuevo Pedido</button>
              {roleLabel && roleLabel.toLowerCase() === 'admin' && (
                <button onClick={() => { setShowAdmin(true); setMenuOpen(false); }}>Usuarios</button>
              )}
              {(canViewReports || (roleLabel && roleLabel.toLowerCase() === 'admin')) && (
                <button onClick={() => { setShowReports(true); setMenuOpen(false); }}>Reportes</button>
              )}
            </div>
          </div>
          {/* role label moved to header left */}

          {showForm && (
            <button className="back-button" onClick={() => setShowForm(false)}>Volver a Pedidos</button>
          )}

          <button onClick={handleLogout} className="logout-button">Cerrar Sesión</button>
        </div>
      </header>

      <main>
        {showForm ? (
          <PedidoForm onViewForm={setShowForm} />
        ) : (
          // Pasamos hideCreateButton para que PedidosList no muestre su propio botón
          <PedidosList onViewForm={setShowForm} hideCreateButton />
        )}
      </main>
      {showAdmin && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setShowAdmin(false)}>✕</button>
            <AdminUsers onClose={() => setShowAdmin(false)} />
          </div>
        </div>
      )}
      {showReports && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setShowReports(false)}>✕</button>
            <ReportesPedidos onClose={() => setShowReports(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;