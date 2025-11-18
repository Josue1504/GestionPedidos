import React, { useState, useEffect } from 'react';
import './PedidoForm.css';
import diferLogo from './assets/difer.png';
import apiRequest from '../apiRequest';

// Función para convertir números a letras (maneja números grandes mediante operaciones con cadenas)
const numberToWords = (input) => {
    // Acepta número o cadena; siempre trabajamos con una representación con dos decimales
    let s;
    if (typeof input === 'number') {
        s = input.toFixed(2);
    } else {
        const n = Number(String(input).replace(/,/g, ''));
        if (Number.isNaN(n)) return '';
        s = n.toFixed(2);
    }

    const [integerStr, centsStr] = s.split('.');

    // Mapas básicos
    const units = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const teens = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
    const twenties = ['VEINTE','VEINTIUNO','VEINTIDOS','VEINTITRES','VEINTICUATRO','VEINTICINCO','VEINTISEIS','VEINTISIETE','VEINTIOCHO','VEINTINUEVE'];
    const tens = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const hundreds = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    // Convierte un número entre 0 y 999 a palabras
    const convertLessThanThousand = (n) => {
        n = Number(n);
        if (n === 0) return '';
        if (n === 100) return 'CIEN';
        let parts = [];
        if (n >= 100) {
            const h = Math.floor(n / 100);
            parts.push(hundreds[h]);
            n = n % 100;
        }
        if (n >= 30) {
            const t = Math.floor(n / 10);
            parts.push(tens[t]);
            const u = n % 10;
            if (u) parts.push('Y ' + units[u]);
        } else if (n >= 20) {
            // 20-29 -> VEINTE / VEINTIUNO...
            parts.push(twenties[n - 20]);
        } else if (n >= 10) {
            parts.push(teens[n - 10]);
        } else if (n > 0) {
            parts.push(units[n]);
        }

        return parts.join(' ').trim();
    };

    // Nombres de escala por grupos de 3 dígitos (del menor al mayor)
    const scales = ['', 'MIL', 'MILLON', 'MIL MILLONES', 'BILLON', 'MIL BILLONES', 'TRILLON'];

    // Si el entero es 0
    if (/^0+$/.test(integerStr)) {
        const centsPart = centsStr && centsStr !== '00' ? ` CON ${centsStr}/100` : '';
        return `CERO QUETZALES${centsPart} EXACTOS`;
    }

    // Separa en grupos de 3 desde la derecha
    let intPadded = integerStr;
    const rem = intPadded.length % 3;
    if (rem !== 0) intPadded = '0'.repeat(3 - rem) + intPadded;
    const groups = [];
    for (let i = 0; i < intPadded.length; i += 3) {
        groups.push(intPadded.substr(i, 3));
    }

    const words = [];
    const groupCount = groups.length;
    groups.forEach((grp, idx) => {
        const grpValue = Number(grp);
        if (grpValue === 0) return; // omitir grupos nulos

        const scaleIndex = groupCount - idx - 1; // 0 -> unidades, 1 -> miles, 2 -> millones, ...
        let grpWords = convertLessThanThousand(grpValue);

        // Reglas de unión con la escala
        if (scaleIndex === 1) {
            // MIL: cuando el grupo es 1, se dice solo 'MIL' (no 'UNO MIL')
            if (grpValue === 1) {
                grpWords = 'MIL';
            } else {
                grpWords = `${grpWords} MIL`;
            }
        } else if (scaleIndex >= 2) {
            // Para MILLON/BILLON/TRILLON manejamos singular/plural
            const baseScale = scales[scaleIndex] || '';
            if (!baseScale) {
                // Si llegamos a una escala no definida, la añadimos tal cual
                grpWords = `${grpWords} ${baseScale}`.trim();
            } else {
                // Si la base es 'MILLON' y grpValue > 1 usamos 'MILLONES'
                if (baseScale === 'MILLON') {
                    grpWords = grpValue === 1 ? `UN MILLON` : `${grpWords} MILLONES`;
                } else {
                    // Para otras escalas que contienen espacios (ej. 'MIL MILLONES'), no pluralizamos en esta implementación
                    grpWords = `${grpWords} ${baseScale}`.trim();
                }
            }
        }

        // Para scaleIndex === 0 (unidades) se mantiene grpWords tal cual
        words.push(grpWords.trim());
    });

    const integerInWords = words.join(' ').replace(/UNO MIL/, 'MIL');
    const centsPart = centsStr && centsStr !== '00' ? ` CON ${centsStr}/100` : '';

    return `${integerInWords} QUETZALES${centsPart} EXACTOS`.toUpperCase();
};

const PedidoForm = ({ onViewForm }) => {
    const [pedidoNo, setPedidoNo] = useState('');
    const [fecha, setFecha] = useState('');
    
    const initialClienteData = {
        nombre: '',
        direccion: '',
        envioNo: '',
        transporte: '',
        nit: '',
        tel: '',
        vendedor: '',
        codigoCliente: ''
    };
    const [clienteData, setClienteData] = useState(initialClienteData);

    const initialProductos = [{ cantidad: '', codigo: '', descripcion: '', precio: '', valor: '', status: '' }];
    const [productos, setProductos] = useState(initialProductos);

    const initialFinalData = {
        totalLetras: '',
        totalQ: '0.00',
        observaciones: ''
    };
    const [finalData, setFinalData] = useState(initialFinalData);
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [savedPedidoId, setSavedPedidoId] = useState(null);
    // Permisos separados: crear y ver
    const [canCreatePedido, setCanCreatePedido] = useState(false);
    const [canViewPedidos, setCanViewPedidos] = useState(false);
    const [canPrintPedido, setCanPrintPedido] = useState(false);
    
    // Función para inicializar el formulario con datos de fecha y pedido nuevos
    const initializeForm = () => {
        // Genera el número de pedido (5 números y 1 letra)
        const max = 99999;
        const min = 10000;
        const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const randomLetter = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        const customPedidoNo = `${randomNumber}-${randomLetter}`;
        setPedidoNo(customPedidoNo);

        // Genera la fecha actual
        const today = new Date();
        const day = today.getDate();
        const month = today.getMonth() + 1;
        const year = today.getFullYear();
        const formattedDate = `${day} de ${month} de ${year}`;
        setFecha(formattedDate);
        
        // Resetea los demás estados del formulario
        setClienteData(initialClienteData);
        setProductos(initialProductos);
        setFinalData(initialFinalData);
    };
    
    // Llama a la función de inicialización cuando el componente se monta por primera vez
    useEffect(() => {
        initializeForm();
        // Permiso para crear y para imprimir (imprimir solo depende de crear)
        apiRequest('/api/has-permission?name=pedidos.create')
            .then(r => r.json())
            .then(d => {
                setCanCreatePedido(!!d.ok);
                setCanPrintPedido(!!d.ok);
            })
            .catch(() => {
                setCanCreatePedido(false);
                setCanPrintPedido(false);
            });

        // Permiso para ver pedidos (no afecta imprimir)
        Promise.all([
            apiRequest('/api/has-permission?name=pedidos.view_own').then(r => r.json()).catch(() => ({ ok: false })),
            apiRequest('/api/has-permission?name=pedidos.view_all').then(r => r.json()).catch(() => ({ ok: false }))
        ])
        .then(([own, all]) => setCanViewPedidos(!!(own.ok || all.ok)))
        .catch(() => setCanViewPedidos(false));
    }, []);

    // Efecto para recalcular el total y el total en letras
    useEffect(() => {
        const total = productos.reduce((sum, producto) => {
            const valor = parseFloat(producto.valor || 0);
            return sum + valor;
        }, 0);
        
        setFinalData(prevData => ({
            ...prevData,
            totalQ: total.toFixed(2),
            totalLetras: numberToWords(total)
        }));
    }, [productos]);

    const handleInputChange = (e, section) => {
        const { name, value } = e.target;
        // Campos numéricos que deben aceptar solo dígitos
        const numericFields = new Set(['nit', 'tel', 'vendedor', 'codigoCliente']);

        if (section === 'cliente') {
            let newValue = value;
            if (numericFields.has(name)) {
                // Elimina todo carácter que no sea dígito
                newValue = String(value).replace(/\D/g, '');
            }
            setClienteData(prevData => ({ ...prevData, [name]: newValue }));
            setErrors(prev => ({ ...prev, cliente: undefined }));
        } else if (section === 'final') {
            setFinalData(prevData => ({ ...prevData, [name]: value }));
            setErrors(prev => ({ ...prev, final: undefined }));
        }
    };

    const handleProductChange = (e, index) => {
        const { name, value } = e.target;
        const newProductos = [...productos];
        newProductos[index][name] = value;
        // Si el usuario modifica el código, limpiamos el estado de búsqueda para esa fila
        if (name === 'codigo') {
            newProductos[index].status = '';
        }
        
        const cantidad = parseFloat(newProductos[index]['cantidad'] || 0);
        const precio = parseFloat(newProductos[index]['precio'] || 0);
        newProductos[index].valor = (cantidad * precio).toFixed(2);
        
        setProductos(newProductos);
    };

    // Lookup product description by code from backend with UI feedback
    const lookupCode = async (code, index) => {
        const c = (code || '').toString().trim().toUpperCase();
        if (!c) return;
        const newProductos = [...productos];
        newProductos[index].status = 'buscando';
        setProductos(newProductos);
        try {
            const res = await apiRequest(`/api/productos/${encodeURIComponent(c)}`);
            if (res.ok) {
                const data = await res.json();
                const updated = [...newProductos];
                updated[index].descripcion = data.descripcion || updated[index].descripcion;
                updated[index].status = 'ok';
                setProductos(updated);
            } else if (res.status === 404) {
                const updated = [...newProductos];
                updated[index].status = 'no-encontrado';
                setProductos(updated);
            } else {
                const updated = [...newProductos];
                updated[index].status = 'error';
                setProductos(updated);
            }
        } catch (err) {
            console.error('Error buscando producto:', err);
            const updated = [...newProductos];
            updated[index].status = 'error';
            setProductos(updated);
        }
    };
    
    const addRow = () => {
        setProductos([...productos, { cantidad: '', codigo: '', descripcion: '', precio: '', valor: '' }]);
    };

    const removeRow = () => {
        if (productos.length > 1) {
            const newProductos = [...productos];
            newProductos.pop();
            setProductos(newProductos);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Prevenir doble envío
        if (isSubmitting) {
            return;
        }
        
        // Validar formulario antes de enviar
        const validationErrors = validateForm();
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            // Mostrar resumen de errores
            const messages = Object.values(validationErrors).flat();
            alert('Por favor corrige los siguientes errores:\n\n' + messages.join('\n'));
            return;
        }

        setErrors({});
        setIsSubmitting(true);
        
        const pedidoCompleto = { pedidoNo, clienteData, productos, finalData, fecha };
        console.log("Enviando datos:", pedidoCompleto);

        try {
            const response = await apiRequest('/api/pedidos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pedidoCompleto),
            });

            if (response.ok) {
                const data = await response.json().catch(() => ({}));
                alert('¡Pedido guardado con éxito!');
                // Mantener el pedido en pantalla para imprimir/guardar PDF.
                // Guardamos el id retornado para marcar que ya fue persistido.
                if (data && data.id) setSavedPedidoId(data.id);
                // No reinicializamos el formulario aquí — el usuario debe usar "Nuevo Pedido" para limpiar.
            } else {
                const errorData = await response.json();
                alert(`Error al guardar el pedido: ${errorData.message}`);
            }
        } catch (error) {
            console.error('Error de conexión:', error);
            alert('Hubo un problema de conexión con el servidor. Asegúrate de que tu servidor Node.js está activo.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Validación del formulario: devuelve un objeto con arrays de mensajes
    const validateForm = () => {
        const v = {};

        // Cliente: nombre es obligatorio
        if (!clienteData.nombre || clienteData.nombre.trim() === '') {
            v.cliente = v.cliente || [];
            v.cliente.push('El nombre del cliente es requerido.');
        }

        // Productos: debe haber al menos un producto con cantidad>0 y descripcion y precio
        const productErrors = [];
        let hasValidProduct = false;
        productos.forEach((p, idx) => {
            const cantidad = parseFloat(p.cantidad || 0);
            const precio = parseFloat(p.precio || 0);
            const descripcion = (p.descripcion || '').toString().trim();

            // Si el producto está completamente vacío, ignóralo
            const allEmpty = !p.cantidad && !p.codigo && !p.descripcion && !p.precio && !p.valor;
            if (allEmpty) return;

            // Si se rellenó algo, valida campos esenciales
            if (!(cantidad > 0)) {
                productErrors.push(`Fila ${idx + 1}: cantidad debe ser mayor a 0.`);
            }
            if (!descripcion) {
                productErrors.push(`Fila ${idx + 1}: descripción es requerida.`);
            }
            if (!(precio > 0)) {
                productErrors.push(`Fila ${idx + 1}: precio debe ser mayor a 0.`);
            }

            if (cantidad > 0 && descripcion && precio > 0) {
                hasValidProduct = true;
            }
        });

        if (!hasValidProduct) {
            productErrors.unshift('Agrega al menos un producto con cantidad, descripción y precio.');
        }

        if (productErrors.length > 0) {
            v.productos = productErrors;
        }

        return v;
    };

    // Helper: devuelve un set con índices de filas que tienen errores
    const productErrorRows = () => {
        const rows = new Set();
        if (errors && errors.productos) {
            errors.productos.forEach(msg => {
                const m = msg.match(/Fila\s(\d+)/);
                if (m) rows.add(parseInt(m[1], 10) - 1);
            });
        }
        return rows;
    };

    const productRows = productErrorRows();

    const handlePrint = () => {
        window.print();
    };
    
    // Nuevo botón para crear un nuevo pedido
    const handleNewPedido = () => {
        initializeForm();
        setSavedPedidoId(null);
    };

    return (
        <div className="pedido-container">
            <form onSubmit={handleSubmit}>
                <div className="printable-pedido">
                <div className="top-section">
                    <div className="logo-and-company">
                        <div className="logo">
                            <img src={diferLogo} alt="Logo de DIFER" className="logo-img" />
                        </div>
                        <div className="company-info">
                            <h2>Grupo Comercial Difer, Sociedad Anónima</h2>
                            <p>Colonia el Naranjo, 31 calle 6-21 Int. Bodega 40, zona 4, Mixco Guatemala</p>
                            <p>grupodifer@gmail.com - ventasgrupodifer@gmail.com</p>
                            <p className="pbx">PBX: (502) 2429-4100</p>
                            <p className="business-line">Hierro, Tubería Negra, Galvanizada y Acero al Carbón, Válvulas, Láminas Lisas y Acanaladas, Perfiles, Pinturas y Ferretería en General</p>
                            <p className="location-date">Guatemala, <span className="underline">{fecha}</span></p>
                        </div>
                    </div>
                    <div className="pedido-box">
                        <p>PEDIDO NO.</p>
                        <div className="pedido-number-input">
                            <p>{pedidoNo}</p>
                        </div>
                    </div>
                </div>

                <div className="client-shipping-section">
                    <div className="client-group">
                        <div className="input-line">
                            <label>Nombre:</label>
                            <input className={errors && errors.cliente ? 'input-error' : ''} type="text" name="nombre" value={clienteData.nombre} onChange={(e) => handleInputChange(e, 'cliente')} />
                        </div>
                        <div className="input-line">
                            <label>Dirección:</label>
                            <input type="text" name="direccion" value={clienteData.direccion} onChange={(e) => handleInputChange(e, 'cliente')} />
                        </div>
                        <div className="input-line">
                            <label>Envío No:</label>
                            <input type="text" name="envioNo" className="small-input" value={clienteData.envioNo} onChange={(e) => handleInputChange(e, 'cliente')} />
                            <label className="inline-label">Transporte</label>
                            <input type="text" name="transporte" className="medium-input" value={clienteData.transporte} onChange={(e) => handleInputChange(e, 'cliente')} />
                        </div>
                    </div>
                    <div className="shipping-group">
                        <div className="input-line">
                            <label>NIT:</label>
                            <input inputMode="numeric" pattern="\\d*" type="text" name="nit" value={clienteData.nit} onChange={(e) => handleInputChange(e, 'cliente')} />
                        </div>
                        <div className="input-line">
                            <label>Tel:</label>
                            <input inputMode="numeric" pattern="\\d*" type="text" name="tel" value={clienteData.tel} onChange={(e) => handleInputChange(e, 'cliente')} />
                        </div>
                        <div className="input-line">
                            <label className="inline-label">Vendedor</label>
                            <input inputMode="numeric" pattern="\\d*" type="text" name="vendedor" className="medium-input" value={clienteData.vendedor} onChange={(e) => handleInputChange(e, 'cliente')} />
                            <label className="inline-label">Código de Cliente</label>
                            <input inputMode="numeric" pattern="\\d*" type="text" name="codigoCliente" className="small-input" value={clienteData.codigoCliente} onChange={(e) => handleInputChange(e, 'cliente')} />
                        </div>
                    </div>
                </div>

                <div className="table-section">
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: '6%' }}>CANT.</th>
                                <th style={{ width: '20%' }}>CÓDIGO</th>
                                <th style={{ width: '50%' }}>DESCRIPCIÓN</th>
                                <th style={{ width: '12%' }}>PRECIO/U.</th>
                                <th style={{ width: '12%' }}>VALOR</th>
                            </tr>
                        </thead>
                        <tbody>
                            {productos.map((producto, index) => (
                                <tr key={index} className={productRows.has(index) ? 'row-error' : ''}>
                                    <td><input className={productRows.has(index) ? 'input-error' : ''} type="number" name="cantidad" value={producto.cantidad} onChange={(e) => handleProductChange(e, index)} /></td>
                                    <td style={{ position: 'relative' }}>
                                        <input className={productRows.has(index) ? 'input-error' : ''} type="text" name="codigo" value={producto.codigo} onChange={(e) => handleProductChange(e, index)} onBlur={(e) => lookupCode(e.target.value, index)} />
                                        {producto.status === 'buscando' && <div className="code-status" style={{ color: '#0d6efd', fontSize: '12px' }}>Buscando...</div>}
                                        {producto.status === 'no-encontrado' && <div className="code-status" style={{ color: '#dc3545', fontSize: '12px' }}>No encontrado</div>}
                                        {producto.status === 'error' && <div className="code-status" style={{ color: '#6c757d', fontSize: '12px' }}>Error</div>}
                                    </td>
                                    <td>
                                        <input
                                            className={productRows.has(index) ? 'input-error' : ''}
                                            type="text"
                                            name="descripcion"
                                            value={producto.descripcion}
                                            readOnly
                                            title="Este campo se completa automáticamente al ingresar el código"
                                        />
                                    </td>
                                    <td><input className={productRows.has(index) ? 'input-error' : ''} type="number" name="precio" value={producto.precio} onChange={(e) => handleProductChange(e, index)} /></td>
                                    <td><input type="number" name="valor" value={producto.valor} onChange={(e) => handleProductChange(e, index)} readOnly /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="table-actions">
                        <button type="button" onClick={addRow}>Agregar Fila</button>
                        <button type="button" onClick={removeRow}>Eliminar Fila</button>
                    </div>
                </div>

                <div className="footer-section">
                    <div className="total-en-letras">
                        <label>TOTAL EN LETRAS:</label>
                        <div className="underline-text" style={{ padding: '8px 5px', height: 'auto', minHeight: '30px', display: 'flex', alignItems: 'center' }}>
                            <p style={{ margin: 0 }}>{finalData.totalLetras}</p>
                        </div>
                    </div>
                    <div className="total-q">
                        <label>TOTAL Q.</label>
                        <div className="total-amount">
                            <input type="text" name="totalQ" value={finalData.totalQ} readOnly />
                        </div>
                    </div>
                    <div className="signature-lines">
                        <div className="input-line full-width">
                            <label>Observaciones:</label>
                            <textarea 
                                name="observaciones" 
                                value={finalData.observaciones} 
                                onChange={(e) => handleInputChange(e, 'final')}
                                style={{ width: '100%', minHeight: '60px', padding: '8px', fontSize: '12px', fontFamily: 'Arial, sans-serif', border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical' }}
                                placeholder="Escriba aquí cualquier observación o comentario sobre el pedido..."
                            />
                        </div>
                    </div>
                </div>

                </div>

                {/* Alerta prominente + detalles de errores */}
                {errors && (errors.cliente || errors.productos) && (
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ background: '#fff3cd', border: '1px solid #ffeeba', padding: '10px', borderRadius: '4px', color: '#856404', fontWeight: '600' }}>
                            Es importante: completa los campos marcados antes de guardar el pedido.
                        </div>
                        <div className="form-errors" style={{ color: 'red', marginTop: '8px' }}>
                            {errors.cliente && errors.cliente.map((msg, i) => <div key={`c-${i}`}>{msg}</div>)}
                            {errors.productos && errors.productos.map((msg, i) => <div key={`p-${i}`}>{msg}</div>)}
                        </div>
                    </div>
                )}
                <div className="action-buttons">
                    {canCreatePedido ? (
                        <button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Guardando...' : 'Guardar Pedido'}
                        </button>
                    ) : (
                        <button type="button" disabled title="No tienes permiso para crear pedidos">Guardar Pedido</button>
                    )}

                    {canCreatePedido ? (
                        <button type="button" onClick={handleNewPedido} disabled={isSubmitting}>Nuevo Pedido</button>
                    ) : (
                        <button type="button" disabled title="No tienes permiso para crear pedidos">Nuevo Pedido</button>
                    )}

                    {canPrintPedido ? (
                        <button type="button" onClick={handlePrint} disabled={isSubmitting}>Imprimir / Guardar PDF</button>
                    ) : (
                        <button type="button" disabled title="No tienes permiso para imprimir pedidos">Imprimir / Guardar PDF</button>
                    )}
                </div>

                {!canCreatePedido && (
                    <div style={{ marginTop: 8, color: '#856404', background: '#fff3cd', padding: 8, borderRadius: 4 }}>
                        No tienes permisos para crear o iniciar pedidos. Contacta a un administrador si crees que esto es un error.
                    </div>
                )}
            </form>
        </div>
    );
};

export default PedidoForm;