import React, { useEffect, useState } from 'react';
import './PedidoForm.css';
import apiRequest from '../apiRequest';

const PedidoPrintView = ({ pedido }) => {
  // Debug visual: log pedido recibido
  if (window && window.console) {
    console.log('Pedido recibido en PrintView:', pedido);
  }
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
      if (pedido.productos_json) {
        let parsed;
        if (typeof pedido.productos_json === 'string') {
          try {
            parsed = JSON.parse(pedido.productos_json);
          } catch (err) {
            console.error('Error parseando productos_json:', err, pedido.productos_json);
            parsed = [];
          }
        } else {
          parsed = pedido.productos_json;
        }
        // Si es un objeto con productos, extraer el array
        if (Array.isArray(parsed)) {
          initialProductos = parsed;
        } else if (parsed && Array.isArray(parsed.productos)) {
          initialProductos = parsed.productos;
        } else if (parsed && typeof parsed === 'object' && Object.keys(parsed).length && Array.isArray(parsed[Object.keys(parsed).find(k => k.toLowerCase().includes('producto'))])) {
          // Fallback: buscar cualquier clave que contenga 'producto' y sea array
          initialProductos = parsed[Object.keys(parsed).find(k => k.toLowerCase().includes('producto'))];
        } else {
          initialProductos = [];
        }
        console.log('Productos extraídos:', initialProductos);
      } else if (pedido.productos && Array.isArray(pedido.productos)) {
        initialProductos = pedido.productos;
      } else {
        initialProductos = [];
      }
    } catch (e) {
      console.error('Error inesperado en productos_json:', e);
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

  // Fallback visual si el pedido es nulo o vacío
  if (!pedido || Object.keys(pedido).length === 0) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#b00', fontWeight: 600 }}>No se pudo cargar el pedido. Verifica la conexión o los datos.</div>;
  }
  return (
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
              <p className="location-date">Guatemala, <span className="underline">{new Date(pedido.fecha_creacion).toLocaleDateString()}</span></p>
            </div>
          </div>
          <div className="pedido-box">
            <p>PEDIDO NO.</p>
            <div className="pedido-number-input">
              <p style={{ margin: 0 }}>{pedido.pedidoNo || ''}</p>
            </div>
          </div>
        </div>

      <div className="client-shipping-section">
        <div className="client-group">
          <div className="input-line">
            <label>Nombre:</label>
            <div style={{ borderBottom: '1px solid #000', padding: '2px 0', flexGrow: 1 }}>{pedido.nombre_cliente || ''}</div>
          </div>
          <div className="input-line">
            <label>Dirección:</label>
            <div style={{ borderBottom: '1px solid #000', padding: '2px 0', flexGrow: 1 }}>{pedido.direccion_cliente || ''}</div>
          </div>
          <div className="input-line">
            <label>Envío No:</label>
            <div style={{ borderBottom: '1px solid #000', padding: '2px 0', width: '80px', marginRight: '10px' }}>{pedido.envio_no || ''}</div>
            <label className="inline-label">Transporte</label>
            <div style={{ borderBottom: '1px solid #000', padding: '2px 0', width: '120px', marginRight: '10px' }}>{pedido.transporte || ''}</div>
          </div>
        </div>
        <div className="shipping-group">
          <div className="input-line">
            <label>NIT:</label>
            <div style={{ borderBottom: '1px solid #000', padding: '2px 0', flexGrow: 1 }}>{pedido.nit_cliente || ''}</div>
          </div>
          <div className="input-line">
            <label>Tel:</label>
            <div style={{ borderBottom: '1px solid #000', padding: '2px 0', flexGrow: 1 }}>{pedido.tel_cliente || ''}</div>
          </div>
          <div className="input-line">
            <label className="inline-label">Vendedor</label>
            <div style={{ borderBottom: '1px solid #000', padding: '2px 0', width: '120px', marginRight: '10px' }}>{pedido.vendedor || ''}</div>
            <label className="inline-label">Código de Cliente</label>
            <div style={{ borderBottom: '1px solid #000', padding: '2px 0', width: '80px', marginRight: '10px' }}>{pedido.codigo_cliente || ''}</div>
          </div>
        </div>
      </div>

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
            {Array.isArray(productos) && productos.length > 0 ? productos.map((p, i) => (
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
            )}
          </tbody>
        </table>
      </div>

      <div className="footer-section">
        <div className="total-en-letras">
          <label>TOTAL EN LETRAS:</label>
          <div className="underline-text">
            <p style={{ margin: 0 }}>{pedido.total_letras || ''}</p>
          </div>
        </div>
        <div className="total-q">
          <label>TOTAL Q.</label>
          <div className="total-amount">
            <div style={{ fontSize: '16px', fontWeight: 'bold', textAlign: 'right' }}>Q. {pedido.total_q || ''}</div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default PedidoPrintView;
