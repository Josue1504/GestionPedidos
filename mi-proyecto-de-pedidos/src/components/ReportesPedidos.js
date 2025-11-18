import React, { useEffect, useState } from 'react';
import './ReportesPedidos.css';
import ReportesPrintView from './ReportesPrintView';
import apiRequest from '../apiRequest';

const ReportesPedidos = ({ onClose }) => {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [pedidos, setPedidos] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPrintView, setShowPrintView] = useState(false);
  const [printPedidos, setPrintPedidos] = useState([]);
  const [printTitle, setPrintTitle] = useState('');

  useEffect(() => {
    apiRequest('/api/users')
      .then(r => r.json())
      .then(j => setUsers(Array.isArray(j) ? j : (j && j.users ? j.users : [])))
      .catch(() => setUsers([]));
  }, []);

  const loadPedidos = async (uId, p = 1, dateParam = undefined) => {
    setLoading(true);
    try {
      // if uId is falsy, load all pedidos (admin view)
      // include date filter if selectedDate is set (single day)
      const params = new URLSearchParams();
      if (uId) params.append('created_by', uId);
      params.append('page', p);
      params.append('pageSize', pageSize);
      // dateParam takes precedence (passed directly from the change handler)
      const dateToUse = dateParam !== undefined ? dateParam : selectedDate;
      if (dateToUse) {
        params.append('fromDate', dateToUse);
        params.append('toDate', dateToUse);
      }
  const url = `/api/pedidos?${params.toString()}`;
  const res = await apiRequest(url);
      const j = await res.json();
      const list = j.pedidos || [];
      setPedidos(list);
      setTotal(j.total || 0);
      return list;
    } catch (err) {
      console.error('Error cargando pedidos para reporte', err);
      setPedidos([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const openPrintView = async (scope = 'selected') => {
    // scope: 'selected' -> current filters, 'all' -> all pedidos
    setLoading(true);
    try {
      let list = [];
      if (scope === 'selected') {
        // use current pedidos (if loaded) otherwise load with filters
        if (pedidos && pedidos.length) list = pedidos;
        else list = await loadPedidos(selectedUser, 1, selectedDate) || [];
        const user = users.find(u => String(u.id) === String(selectedUser));
        setPrintTitle(user ? `Pedidos de ${user.username}` : 'Pedidos (filtro)');
      } else {
        list = await loadPedidos('', 1, selectedDate) || [];
        setPrintTitle('Todos los pedidos');
      }
      setPrintPedidos(list);
      setShowPrintView(true);
    } catch (e) {
      console.error('Error preparando vista de impresión', e);
      alert('Error al preparar la vista de impresión');
    } finally {
      setLoading(false);
    }
  };

  const closePrintView = () => {
    setShowPrintView(false);
    setPrintPedidos([]);
    setPrintTitle('');
  };

  const handleUserChange = (e) => {
    const v = e.target.value;
    setSelectedUser(v);
    setPage(1);
    // always load (empty => all)
    loadPedidos(v, 1);
  };

  const handleDateChange = (e) => {
    const d = e.target.value; // YYYY-MM-DD
    setSelectedDate(d);
    setPage(1);
    // Pasar la fecha nueva directamente para evitar condiciones de carrera
    loadPedidos(selectedUser, 1, d);
  };

  const handlePage = (newPage) => {
    setPage(newPage);
    // siempre recargar con los filtros actuales (fecha tomado desde el estado)
    loadPedidos(selectedUser, newPage);
  };

  return (
    <div className="reportes-pedidos">
      <h3>Reportes de Pedidos</h3>
      <div className="form-row">
        <label>Vendedor</label>
        <select value={selectedUser} onChange={handleUserChange}>
          <option value="">-- Seleccionar vendedor --</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
        </select>
      </div>
      <div className="form-row">
        <label>Fecha (día)</label>
        <input type="date" value={selectedDate} onChange={handleDateChange} />
      </div>

      <div style={{ marginTop: 12 }}>
        {loading ? (<div>Cargando...</div>) : (
          <>
            <div>Mostrando {pedidos.length} de {total} pedidos</div>
            <div style={{ marginTop: 8 }}>
              <button onClick={() => openPrintView('selected')} disabled={pedidos.length === 0}>Imprimir datos filtrados</button>
              <button onClick={() => openPrintView('all')} style={{ marginLeft: 8 }}>Imprimir todos los datos</button>
            </div>
            <div style={{ marginTop: 6, fontWeight: 'bold' }}>Suma total Q.: Q. {pedidos.reduce((s, p) => s + (parseFloat(p.total_q) || 0), 0).toFixed(2)}</div>
            <table className="report-table">
              <thead>
                <tr><th>ID</th><th>Pedido No</th><th>Cliente</th><th>Total Q.</th><th>Fecha</th></tr>
              </thead>
              <tbody>
                {pedidos.map(p => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.pedidoNo}</td>
                    <td>{p.nombre_cliente}</td>
                    <td>Q. {Number(p.total_q).toFixed(2)}</td>
                    <td>{p.fecha_creacion ? new Date(p.fecha_creacion).toLocaleDateString('es-ES') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {total > pageSize && (
              <div style={{ marginTop: 8 }}>
                <button onClick={() => handlePage(Math.max(1, page - 1))} disabled={page === 1}>Anterior</button>
                <span style={{ margin: '0 8px' }}>Página {page}</span>
                <button onClick={() => handlePage(page + 1)} disabled={page * pageSize >= total}>Siguiente</button>
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <button onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
};

export default ReportesPedidos;
