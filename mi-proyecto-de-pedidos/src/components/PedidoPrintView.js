import React, { useEffect, useState } from 'react';
import './PedidoForm.css';
import apiRequest from '../apiRequest';

const PedidoPrintView = ({ pedido }) => {
  // siempre declarar hooks en el tope del componente para cumplir las reglas de hooks
  const [productos, setProductos] = useState([]);

  // useEffect que reacciona a cambios en `pedido` y carga/actualiza productos
  useEffect(() => {
    let mounted = true;
    if (!pedido) {
      if (mounted) setProductos([]);
      return () => { mounted = false; };
    }

    // Extraer productos iniciales desde el pedido
    let initialProductos = [];
    try {
      if (pedido.productos_json) initialProductos = typeof pedido.productos_json === 'string' ? JSON.parse(pedido.productos_json) : pedido.productos_json;
      else if (pedido.productos) initialProductos = pedido.productos;
    } catch (e) {
      initialProductos = [];
    }

    // Inicializamos el state con los productos guardados
    if (mounted) setProductos(initialProductos || []);

    // Detectar filas que necesitan lookup
    const needsLookup = (initialProductos || [])
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => {
        const desc = (p.descripcion || '').toString().trim();
        return desc === '' || /^prueba/i.test(desc);
      });

    if (needsLookup.length === 0) return () => { mounted = false; };

    Promise.all(needsLookup.map(async ({ p, i }) => {
      try {
        const code = encodeURIComponent((p.codigo || '').toString().trim());
        if (!code) return { i, descripcion: p.descripcion };
        const res = await apiRequest(`/api/productos/${code}`);
        if (res.ok) {
          const data = await res.json();
          return { i, descripcion: data.descripcion || p.descripcion };
        }
      } catch (err) {
        // ignore
      }
      return { i, descripcion: p.descripcion };
    }))
      .then(results => {
        if (!mounted) return;
        const updated = [...(initialProductos || [])];
        results.forEach(r => {
          if (r && typeof r.i === 'number') {
            updated[r.i] = { ...updated[r.i], descripcion: r.descripcion };
          }
        });
        setProductos(updated);
      });

    return () => { mounted = false; };
  }, [pedido]);

  return (
    <div className="pedido-print-view" style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}>
      <div className="top-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="logo-and-company" style={{ display: 'flex', alignItems: 'center', gap: 20, flex: '1 1 auto' }}>
          <div className="logo" style={{ flex: '0 0 140px' }}>
            <img src={require('./assets/difer.png')} alt="Logo" style={{ maxWidth: 120 }} />
          </div>
          <div className="company-info" style={{ flex: '1 1 auto', textAlign: 'center' }}>
            <h2 style={{ margin: 0 }}>Grupo Comercial Difer, Sociedad Anónima</h2>
            <p style={{ margin: '4px 0' }}>Colonia el Naranjo, 31 calle 6-21 Int. Bodega 40, zona 4, Mixco Guatemala</p>
            <p style={{ margin: '2px 0' }}>grupodifer@gmail.com - ventasgrupodifer@gmail.com</p>
          </div>
        </div>
        <div style={{ flex: '0 0 140px', textAlign: 'right' }}>
          <div className="pedido-box" style={{ display: 'inline-block' }}>
            <p style={{ margin: 0 }}>PEDIDO NO.</p>
            <div className="pedido-number-input" style={{ padding: '4px 6px' }}>
              <p style={{ margin: 0 }}>{pedido.pedidoNo}</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <div style={{ width: '60%' }}>
          <p><strong>Nombre:</strong> {pedido.nombre_cliente}</p>
          <p><strong>Dirección:</strong> {pedido.direccion_cliente}</p>
          <p><strong>Envío No:</strong> {pedido.envio_no} <strong>Transporte:</strong> {pedido.transporte}</p>
        </div>
        <div style={{ width: '35%' }}>
          <p><strong>NIT:</strong> {pedido.nit_cliente}</p>
          <p><strong>Tel:</strong> {pedido.tel_cliente}</p>
          <p><strong>Vendedor:</strong> {pedido.vendedor}</p>
        </div>
      </div>

      <div className="print-table-section" style={{ marginTop: 12 }}>
        <table className="print-table">
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
            {productos && productos.length > 0 ? productos.map((p, i) => (
              <tr key={i}>
                <td className="td-center">{p.cantidad}</td>
                <td className="td-center">{p.codigo}</td>
                <td>{p.descripcion || ''}</td>
                <td className="td-right">{p.precio}</td>
                <td className="td-right">{p.valor}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} className="td-center">No hay productos</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        <div style={{ width: '65%' }}>
          <p><strong>TOTAL EN LETRAS:</strong></p>
          <div style={{ border: '1px solid #000', padding: 8, minHeight: 24 }}>{pedido.total_letras || pedido.total_letras || ''}</div>
        </div>
        <div style={{ width: '30%' }}>
          <p><strong>TOTAL Q.</strong></p>
          <div style={{ border: '1px solid #000', padding: 8, textAlign: 'right' }}>Q. {pedido.total_q}</div>
        </div>
      </div>
    </div>
  );
};

export default PedidoPrintView;
