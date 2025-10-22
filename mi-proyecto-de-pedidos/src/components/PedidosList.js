import React, { useState, useEffect } from 'react';
import './PedidosList.css'; 
import './PedidoForm.css'; 
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
            <div className="pedido-container">
              <div className="printable-pedido">
                <div className="top-section">
                  <div className="logo-and-company">
                    <div className="logo">
                      <img src={require('./assets/difer.png')} alt="Logo de DIFER" className="logo-img" />
                    </div>
                    <div className="company-info">
                      <h2>Grupo Comercial Difer, Sociedad Anónima</h2>
                      <p>Colonia el Naranjo, 31 calle 6-21 Int. Bodega 40, zona 4, Mixco Guatemala</p>
                      <p>grupodifer@gmail.com - ventasgrupodifer@gmail.com</p>
                      <p className="pbx">PBX: (502) 2429-4100</p>
                      <p className="business-line">Hierro, Tubería Negra, Galvanizada y Acero al Carbón, Válvulas, Láminas Lisas y Acanaladas, Perfiles, Pinturas y Ferretería en General</p>
                      <p className="location-date">Guatemala, <span className="underline">{new Date(selected.fecha_creacion).toLocaleDateString()}</span></p>
                    </div>
                  </div>
                  <div className="pedido-box">
                    <p>PEDIDO NO.</p>
                    <div className="pedido-number-input">
                      <p style={{ margin: 0 }}>{selected.pedidoNo || ''}</p>
                    </div>
                  </div>
                </div>

                <div className="client-shipping-section">
                  <div className="client-group">
                    <div className="input-line">
                      <label>Nombre:</label>
                      <input 
                        type="text" 
                        value={selected.nombre_cliente || ''} 
                        onChange={e => setSelected(prev => ({ ...prev, nombre_cliente: e.target.value }))}
                        style={{ flexGrow: 1, border: 'none', borderBottom: '1px solid #000', padding: '2px 0', fontSize: '12px' }}
                      />
                    </div>
                    <div className="input-line">
                      <label>Dirección:</label>
                      <input 
                        type="text" 
                        value={selected.direccion_cliente || ''} 
                        onChange={e => setSelected(prev => ({ ...prev, direccion_cliente: e.target.value }))}
                        style={{ flexGrow: 1, border: 'none', borderBottom: '1px solid #000', padding: '2px 0', fontSize: '12px' }}
                      />
                    </div>
                    <div className="input-line">
                      <label>Envío No:</label>
                      <div style={{ borderBottom: '1px solid #000', padding: '2px 0', width: '80px', marginRight: '10px' }}>{selected.envio_no || ''}</div>
                      <label className="inline-label">Transporte</label>
                      <div style={{ borderBottom: '1px solid #000', padding: '2px 0', width: '120px', marginRight: '10px' }}>{selected.transporte || ''}</div>
                    </div>
                  </div>
                  <div className="shipping-group">
                    <div className="input-line">
                      <label>NIT:</label>
                      <input 
                        type="text" 
                        value={selected.nit_cliente || ''} 
                        onChange={e => setSelected(prev => ({ ...prev, nit_cliente: e.target.value }))}
                        style={{ flexGrow: 1, border: 'none', borderBottom: '1px solid #000', padding: '2px 0', fontSize: '12px' }}
                      />
                    </div>
                    <div className="input-line">
                      <label>Tel:</label>
                      <div style={{ borderBottom: '1px solid #000', padding: '2px 0', flexGrow: 1 }}>{selected.tel_cliente || ''}</div>
                    </div>
                    <div className="input-line">
                      <label className="inline-label">Vendedor</label>
                      <div style={{ borderBottom: '1px solid #000', padding: '2px 0', width: '120px', marginRight: '10px' }}>{selected.vendedor || ''}</div>
                      <label className="inline-label">Código de Cliente</label>
                      <input 
                        type="text" 
                        value={selected.codigo_cliente || ''} 
                        onChange={e => setSelected(prev => ({ ...prev, codigo_cliente: e.target.value }))}
                        style={{ width: '80px', border: 'none', borderBottom: '1px solid #000', padding: '2px 0', fontSize: '12px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Mostrar productos solo como vista (no editable) */}
                <div className="table-section">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '8%' }}>CANT.</th>
                        <th style={{ width: '15%' }}>CÓDIGO</th>
                        <th style={{ width: '45%' }}>DESCRIPCIÓN</th>
                        <th style={{ width: '16%' }}>PRECIO/U.</th>
                        <th style={{ width: '16%' }}>VALOR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        try {
                          let productos = [];
                          if (selected.productos_json) {
                            const parsed = typeof selected.productos_json === 'string' ? 
                              JSON.parse(selected.productos_json) : selected.productos_json;
                            productos = Array.isArray(parsed) ? parsed : 
                              (parsed.productos ? parsed.productos : []);
                          }
                          return productos.length > 0 ? productos.map((p, i) => (
                            <tr key={i}>
                              <td style={{ textAlign: 'center' }}>{p.cantidad}</td>
                              <td style={{ textAlign: 'center' }}>{p.codigo}</td>
                              <td>{p.descripcion || ''}</td>
                              <td style={{ textAlign: 'right' }}>{p.precio}</td>
                              <td style={{ textAlign: 'right' }}>{p.valor}</td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan={5} style={{ textAlign: 'center', color: '#b00', fontWeight: 600 }}>No hay productos en este pedido.</td>
                            </tr>
                          );
                        } catch (e) {
                          return (
                            <tr>
                              <td colSpan={5} style={{ textAlign: 'center', color: '#b00', fontWeight: 600 }}>Error al cargar productos.</td>
                            </tr>
                          );
                        }
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Solo mostrar total en letras como información, sin campo de total Q editable */}
                <div className="footer-section">
                  <div className="total-en-letras">
                    <label>TOTAL EN LETRAS:</label>
                    <div className="underline-text">
                      <p style={{ margin: 0 }}>{selected.total_letras || ''}</p>
                    </div>
                  </div>
                  <div className="total-q">
                    <label>TOTAL Q.</label>
                    <div className="total-amount">
                      <div style={{ fontSize: '16px', fontWeight: 'bold', textAlign: 'right' }}>Q. {selected.total_q || ''}</div>
                    </div>
                  </div>
                </div>

                {/* Sección de observaciones editable */}
                <div className="signature-lines" style={{ marginTop: '20px' }}>
                  <div className="input-line full-width">
                    <label>Observaciones:</label>
                    <textarea 
                      value={selected.observaciones || ''} 
                      onChange={e => setSelected(prev => ({ ...prev, observaciones: e.target.value }))}
                      style={{ width: '100%', minHeight: '60px', padding: '8px', fontSize: '12px', fontFamily: 'Arial, sans-serif', border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical' }}
                      placeholder="Escriba aquí cualquier observación o comentario sobre el pedido..."
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'center' }}>
                <button onClick={handleSave}>Guardar Cambios</button>
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