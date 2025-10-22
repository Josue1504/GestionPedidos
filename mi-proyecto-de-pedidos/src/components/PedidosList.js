import React, { useState, useEffect } from 'react';
import './PedidosList.css'; 
import PedidoPrintView from './PedidoPrintView';
import apiRequest from '../apiRequest';

// Modal simple inline (no dependencias externas)
const Modal = ({ children, onClose }) => (
  <div className="modal-backdrop">
    <div className="modal-content">
      <button className="modal-close" onClick={onClose}>✕</button>
      {children}
    </div>
  </div>
);

const PedidosList = ({ onViewForm, hideCreateButton }) => {
  const [pedidos, setPedidos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [canEditPedidos, setCanEditPedidos] = useState(false);
  const [canDeletePedidos, setCanDeletePedidos] = useState(false);
  const [canViewPedidos, setCanViewPedidos] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchPedidos = async () => {
      try {
  const response = await apiRequest('/api/pedidos');
        if (response.ok) {
          const data = await response.json();
          // Backwards compatibility: server may return an array or a paginated object { pedidos: [], total, page }
          if (Array.isArray(data)) {
            setPedidos(data);
          } else if (data && Array.isArray(data.pedidos)) {
            setPedidos(data.pedidos);
          } else {
            // unknown shape -> empty list
            setPedidos([]);
          }
        } else {
          console.error('Error al obtener los pedidos:', response.statusText);
        }
      } catch (error) {
        console.error('Error de conexión:', error);
      }
    };

    // Check permissions (start conservative)
    setCanEditPedidos(false);
    setCanDeletePedidos(false);
    setCanViewPedidos(false);
    setIsAdmin(false);

  apiRequest('/api/has-permission?name=pedidos.edit').then(r => r.json()).then(d => setCanEditPedidos(!!d.ok)).catch(() => setCanEditPedidos(false));
  apiRequest('/api/has-permission?name=pedidos.delete').then(r => r.json()).then(d => setCanDeletePedidos(!!d.ok)).catch(() => setCanDeletePedidos(false));
    Promise.all([
  apiRequest('/api/has-permission?name=pedidos.view_own').then(r => r.json()).catch(() => ({ ok: false })),
  apiRequest('/api/has-permission?name=pedidos.view_all').then(r => r.json()).catch(() => ({ ok: false }))
    ]).then(([own, all]) => {
      setCanViewPedidos(!!(own.ok || all.ok));
      setIsAdmin(!!all.ok); // Admin tiene view_all
    }).catch(() => setCanViewPedidos(false));

    fetchPedidos();
  }, []);

  const openView = (pedido) => {
    setSelected(pedido);
    setIsEditing(false);
  };

  const openEdit = (pedido) => {
    setSelected(pedido);
    setIsEditing(true);
  };

  const handleDelete = async (pedido) => {
    if (!window.confirm('¿Eliminar este pedido? Esta acción no se puede deshacer.')) return;
    try {
  const res = await apiRequest(`/api/pedidos/${pedido.id}`, { method: 'DELETE' });
      if (res.ok) {
        setPedidos(prev => prev.filter(p => p.id !== pedido.id));
      } else {
        alert('Error al eliminar.');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión.');
    }
  };

  const handleSave = async () => {
    // Enviar selected al backend
    try {
      const res = await apiRequest(`/api/pedidos/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selected),
      });
      if (res.ok) {
        const updated = await res.json();
        setPedidos(prev => prev.map(p => p.id === selected.id ? { ...p, ...selected } : p));
        setSelected(null);
        setIsEditing(false);
      } else {
        alert('Error al actualizar.');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión.');
    }
  };

  // Nota: el botón de cerrar sesión principal está en el header (App.js)

  return (
    <div className="pedidos-list-container">
      <div className="pedidos-header">
        <h2>Lista de Pedidos</h2>
      </div>
      {/* Create button removed per request (functionality exists elsewhere) */}
      <table className="pedidos-table">
        <thead>
          <tr>
            <th>No. de Pedido</th>
            <th>Nombre del Cliente</th>
            <th>NIT</th>
            <th>Total Q.</th>
            <th>Fecha</th>
            {isAdmin && <th>Creado por</th>}
            <th className="no-print">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map(pedido => (
            <tr key={pedido.id}>
              <td>{pedido.pedidoNo}</td>
              <td>{pedido.nombre_cliente}</td>
              <td>{pedido.nit_cliente}</td>
              <td>Q. {pedido.total_q}</td>
              <td>{new Date(pedido.fecha_creacion).toLocaleDateString()}</td>
              {isAdmin && <td>{pedido.created_by_username || 'N/A'}</td>}
              <td className="no-print">
                {canViewPedidos ? (
                  <button onClick={() => openView(pedido)}>Ver</button>
                ) : (
                  <button disabled title="No tienes permiso para ver pedidos">Ver</button>
                )}

                {canEditPedidos ? (
                  <button onClick={() => openEdit(pedido)}>Editar</button>
                ) : (
                  <button disabled title="No tienes permiso para editar pedidos">Editar</button>
                )}

                {canDeletePedidos ? (
                  <button onClick={() => handleDelete(pedido)}>Eliminar</button>
                ) : (
                  <button disabled title="No tienes permiso para eliminar pedidos">Eliminar</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <Modal onClose={() => setSelected(null)}>
              {!isEditing ? (
            <div>
              <PedidoPrintView pedido={selected} />
              <div style={{ display: 'flex', gap: '8px', marginTop: 8 }}>
                {canEditPedidos ? (
                  <button onClick={() => setIsEditing(true)}>Modificar</button>
                ) : (
                  <button disabled title="No tienes permiso para modificar pedidos">Modificar</button>
                )}
                <button onClick={() => setSelected(null)}>Cerrar</button>
              </div>
            </div>
          ) : (
            <div>
              <p><strong>Cliente:</strong> <input value={selected.nombre_cliente || ''} onChange={e => setSelected(prev => ({ ...prev, nombre_cliente: e.target.value }))} /></p>
              <p><strong>NIT:</strong> <input value={selected.nit_cliente || ''} onChange={e => setSelected(prev => ({ ...prev, nit_cliente: e.target.value }))} /></p>
              <p><strong>Dirección:</strong> <input value={selected.direccion_cliente || ''} onChange={e => setSelected(prev => ({ ...prev, direccion_cliente: e.target.value }))} /></p>
              <p><strong>Total Q.:</strong> <input value={selected.total_q || ''} onChange={e => setSelected(prev => ({ ...prev, total_q: e.target.value }))} /></p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleSave}>Guardar</button>
                <button onClick={() => setIsEditing(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};

export default PedidosList;