import React from 'react';
import './ReportesPrintView.css';

const ReportesPrintView = ({ pedidos = [], title = '', onClose }) => {
  // Note: prefer opening a new tab and printing there to avoid modal-print issues

  const openInNewTabAndPrint = () => {
    try {
      const w = window.open('', '_blank');
      if (!w) return alert('No se pudo abrir la nueva pestaña. Revisa el bloqueador de ventanas emergentes.');

      const style = `
        body { font-family: Arial, sans-serif; margin: 20px; }
        h2 { text-align: left; }
        .summary { font-weight: 700; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 13px; }
        th { background: #f6f6f6; }
      `;

      const rowsHtml = (pedidos || []).map(p => `
        <tr>
          <td>${p.id}</td>
          <td>${p.pedidoNo || ''}</td>
          <td>${(p.nombre_cliente||'')}</td>
          <td>Q. ${Number(p.total_q || 0).toFixed(2)}</td>
          <td>${p.fecha_creacion ? new Date(p.fecha_creacion).toLocaleString('es-ES') : ''}</td>
        </tr>
      `).join('\n');

      const html = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${title || 'Reporte de Pedidos'}</title>
            <style>${style}</style>
          </head>
          <body>
            <h2>${title || 'Reporte de Pedidos'}</h2>
            <div class="summary">Total pedidos: ${(pedidos||[]).length} — Suma Q. ${(pedidos||[]).reduce((s,p)=>s+(parseFloat(p.total_q)||0),0).toFixed(2)}</div>
            <table>
              <thead>
                <tr><th>ID</th><th>Pedido No</th><th>Cliente</th><th>Total Q.</th><th>Fecha</th></tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </body>
        </html>
      `;

      w.document.open();
      w.document.write(html);
      w.document.close();
      // Wait for content to render then trigger print
      w.focus();
      setTimeout(() => {
        try { w.print(); } catch (e) { console.error('Error printing new tab', e); }
      }, 500);
    } catch (e) {
      console.error('openInNewTabAndPrint error', e);
      alert('Error al abrir la nueva pestaña para imprimir');
    }
  };

  const total = pedidos.reduce((s, p) => s + (parseFloat(p.total_q) || 0), 0).toFixed(2);

  return (
    <div className="reportes-print-overlay">
      <div className="reportes-print-container">
        <div className="print-header">
          <h2>{title || 'Reporte de Pedidos'}</h2>
          <div className="print-actions">
            <button onClick={openInNewTabAndPrint}>Imprimir / Guardar PDF</button>
            <button onClick={onClose} style={{ marginLeft: 8 }}>Cerrar</button>
          </div>
        </div>

        <div className="print-body">
          <div className="print-summary">Total pedidos: {pedidos.length} — Suma Q. {total}</div>
          <table className="print-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Pedido No</th>
                <th>Cliente</th>
                <th>Total Q.</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map(p => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.pedidoNo}</td>
                  <td>{p.nombre_cliente}</td>
                  <td>Q. {Number(p.total_q).toFixed(2)}</td>
                  <td>{p.fecha_creacion ? new Date(p.fecha_creacion).toLocaleString('es-ES') : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportesPrintView;
