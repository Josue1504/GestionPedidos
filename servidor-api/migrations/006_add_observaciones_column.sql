-- Migración para reemplazar factura_no y autorizado con observaciones
-- Archivo: 006_add_observaciones_column.sql

-- Agregar la nueva columna observaciones
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS observaciones TEXT;

-- Opcional: Combinar los datos existentes de factura_no y autorizado en observaciones
-- Solo si hay datos que preservar
UPDATE pedidos 
SET observaciones = COALESCE(
    CASE 
        WHEN factura_no IS NOT NULL AND autorizado IS NOT NULL 
        THEN 'Factura No.: ' || factura_no || ' | Autorizado: ' || autorizado
        WHEN factura_no IS NOT NULL 
        THEN 'Factura No.: ' || factura_no
        WHEN autorizado IS NOT NULL 
        THEN 'Autorizado: ' || autorizado
        ELSE NULL
    END, 
    observaciones
)
WHERE (factura_no IS NOT NULL OR autorizado IS NOT NULL) 
AND (observaciones IS NULL OR observaciones = '');

-- Eliminar las columnas antiguas
ALTER TABLE pedidos DROP COLUMN IF EXISTS factura_no;
ALTER TABLE pedidos DROP COLUMN IF EXISTS autorizado;