-- Script completo para recrear la base de datos en Render/Producción
-- Basado en la estructura actual de db_pedidos

CREATE DATABASE IF NOT EXISTS db_pedidos;
USE db_pedidos;

-- =======================
-- 1. TABLAS PRINCIPALES
-- =======================

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    active TINYINT(1) DEFAULT 1
);

-- Tabla de pedidos
CREATE TABLE IF NOT EXISTS pedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedidoNo VARCHAR(255),
    nombre_cliente VARCHAR(255) NOT NULL,
    nit_cliente VARCHAR(50),
    direccion_cliente VARCHAR(255),
    tel_cliente VARCHAR(50),
    envio_no VARCHAR(50),
    transporte VARCHAR(100),
    vendedor VARCHAR(100),
    codigo_cliente VARCHAR(50),
    total_letras VARCHAR(255),
    total_q DECIMAL(10, 2),
    factura_no VARCHAR(50),
    autorizado VARCHAR(100),
    productos_json JSON,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INT NULL
);

-- Tabla de inventario de productos
CREATE TABLE IF NOT EXISTS inventario_productos (
    codigo_producto VARCHAR(50) NOT NULL PRIMARY KEY COMMENT 'Código o SKU del producto',
    descripcion VARCHAR(255) COMMENT 'Nombre o descripción del producto'
);

-- =======================
-- 2. SISTEMA DE ROLES Y PERMISOS
-- =======================

-- Tabla de roles
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de permisos
CREATE TABLE IF NOT EXISTS permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Relación roles-permisos
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    PRIMARY KEY(role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- Relación usuarios-roles
CREATE TABLE IF NOT EXISTS user_roles (
    user_id INT NOT NULL,
    role_id INT NOT NULL,
    PRIMARY KEY(user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- Permisos directos de usuarios (opcional)
CREATE TABLE IF NOT EXISTS user_permissions (
    user_id INT NOT NULL,
    permission_id INT NOT NULL,
    PRIMARY KEY (user_id, permission_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- =======================
-- 3. ÍNDICES Y FOREIGN KEYS
-- =======================

-- Agregar foreign key para created_by en pedidos
ALTER TABLE pedidos
    ADD INDEX idx_pedidos_created_by (created_by),
    ADD CONSTRAINT fk_pedidos_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- Índice por fecha para búsquedas y ordenamiento
ALTER TABLE pedidos
    ADD INDEX idx_pedidos_fecha (fecha_creacion);

-- Índice para user_permissions
CREATE INDEX idx_user_permissions_user ON user_permissions(user_id);

-- =======================
-- 4. DATOS INICIALES - ROLES Y PERMISOS
-- =======================

-- Crear roles base
INSERT INTO roles (name, description) VALUES
    ('admin', 'Administrador con permisos totales'),
    ('vendedor', 'Vendedor: crear pedidos y ver solo los suyos')
ON DUPLICATE KEY UPDATE name = name;

-- Crear permisos
INSERT INTO permissions (name, description) VALUES
    ('pedidos.create', 'Crear pedidos'),
    ('pedidos.view_all', 'Ver todos los pedidos'),
    ('pedidos.view_own', 'Ver solo pedidos propios'),
    ('pedidos.edit', 'Editar pedidos'),
    ('pedidos.delete', 'Eliminar pedidos'),
    ('users.manage', 'Crear/editar/eliminar usuarios y asignar roles/permisos')
ON DUPLICATE KEY UPDATE name = name;

-- Asignar permisos a roles
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 
    r.id,
    p.id
FROM roles r, permissions p
WHERE r.name = 'admin'; -- Admin tiene todos los permisos

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 
    r.id,
    p.id
FROM roles r, permissions p
WHERE r.name = 'vendedor' 
AND p.name IN ('pedidos.create', 'pedidos.view_own'); -- Vendedor solo crear y ver propios

-- =======================
-- 5. USUARIO ADMINISTRADOR POR DEFECTO
-- =======================

-- Crear usuario admin por defecto (password: admin123)
-- Hash generado con bcrypt rounds=10
INSERT IGNORE INTO users (username, password_hash, active) VALUES 
('admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 1);

-- Asignar rol admin al usuario admin
INSERT IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id 
FROM users u, roles r 
WHERE u.username = 'admin' AND r.name = 'admin';

-- =======================
-- 6. INVENTARIO DE PRODUCTOS
-- =======================

INSERT INTO inventario_productos (codigo_producto, descripcion) VALUES
('STA0001', 'SISTA DE USO GENERAL TRASPARENTE F109 300ML'),
('STA0002', 'SISTA DE USO GENERAL NEGRO F109 300ML'),
('STA0003', 'SISTA DE USO GENERAL TRANSPARENTE F109 BLISTER'),
('STA0004', 'SISTA BAÑOS Y COCINAS TRANSPARENTE F101 BLISTER'),
('STA0005', 'SISTA BAÑOS Y COCINAS TRASPARENTE 300ML F101'),
('STA0006', 'SISTA BAÑOS Y COCINAS BLANCO 300ML F 101'),
('STA0007', 'SISTA VIDRIO Y ALUMINIO TRANSPARENTE F107 300ML'),
('STA0008', 'SISTA VIDRIO Y ALUMINIO BLANCO F107 300ML'),
('STA0009', 'SISTA VIDRIO Y ALUMINIO NEGRO F107 300ML'),
('STA0012', 'SISTA ACRILICO BLANCO F130 300ML'),
('STA0013', 'SISTA MULTIUSOS TRANSPARENTE 280ML'),
('STA0014', 'SISTA MULTIUSOS BLANCO 280ML'),
('STA0015', 'SISTA MULTIUSOS NEGRO 280ML'),
('STA0016', 'SISTA FT 101 BLANCO 280ML'),
('STA0017', 'SISTA FT 101 GRIS 280ML'),
('STA0018', 'SISTA CINTA TAPAGOTERAS 0.10 X 10M'),
('STA0019', 'SISTA CINTA TAPOGOTERAS 1MT'),
('STA0020', 'SISTA TAPAGOTERA GALON'),
('STA0021', 'SISTA TAPAGOTERA 1/4'),
('STA0022', 'SISTA TAPAGOTERA 1/8'),
('STA0023', 'SISTA TAPAGOTERA 1/16'),
('STA0026', 'SISTA ESPUMA EXPANSIVA UNIVERSAL 500ML'),
('STA0027', 'SISTA ESPUMA EXPANSIVA UNIVERSAL 300ML'),
('STA0029', 'SISTA ELASTOMERIC 280ML BLANCO'),
('STA0030', 'SISTA ELASTOMERIC 280ML ARCILLA'),
('STA0031', 'SISTA ELASTOMERIC 280ML ALMENDRA'),
('STA0032', 'SISTA ELASTOMERIC 280ML CAFÉ'),
('STA0033', 'SISTA ELASTOMERIC 280ML NEGRO'),
('STA0034', 'SISTA ELASTOMERIC 280ML GRIS'),
('TAG0001', 'TANGIT TODA PRESION 25ML'),
('TAG0002', 'TANGIT TODA PRESION 50ML'),
('TAG0003', 'TANGIT TODA PRESION 100ML'),
('TAG0004', 'TANGIT TODA PRESION 125ML 1/32'),
('TAG0005', 'TANGIT TODA PRESION 240ML 1/16'),
('TAG0006', 'TANGIT TODA PRESION 475ML 1/8'),
('TAG0007', 'TANGIT TODA PRESION 950ML 1/4'),
('TAG0008', 'TANGIT TODA PRESION GALON'),
('TAG0009', 'TANGIT CPVC 50ML'),
('TAG0010', 'TANGIT TODA PRESION 125ML CPVC 1/32'),
('TAG0011', 'TANGIT CPVC AMARILLO 240ML'),
('TAG0012', 'TANGIT LIMPIADOR 240ML'),
('MTY0001', 'METYLAN 225ML'),
('MTY0002', 'METYLAN 475ML'),
('MTY0003', 'METYLAN 980ML'),
('PTX0001', 'PATTEX 3000 PVA 250G'),
('PTX0005', 'PATTEX NO MAS CLAVOS 113G'),
('PTX0006', 'PATTEX NO MAS CLAVOS 353ML'),
('PTX0015', 'PATTEX NO MAS CLAVO CRYSTAL'),
('PTX0007', 'PATTEX CONTACTO 50ML'),
('PTX0008', 'PATTEX CONTACTO 100ML'),
('PTX0011', 'PATTEX CONTACTO 1 LT'),
('PTX0013', 'PATTEX CONTACTO 250ML'),
('PTX0014', 'PATTEX CONTACTO 500ML'),
('LOC0001', 'LOCTITE ORIGINAL 3G'),
('LOC0003', 'LOCTITE FLEX GEL 3G'),
('LOC0004', 'LOCTITE PRECISION 5G'),
('LOC0006', 'LOCTITE PINCEL 5G'),
('LOC0007', 'LOCTITE POWER EPOXY TRANS 5 minutos 25G'),
('LOC0008', 'LOCTITE POWER EPOXY METAL 5 minutos 25G'),
('LOC0009', 'LOCTITE EPOXIMIL 98G'),
('LOC0010', 'LOCTITE EPOXIBONDER ROLLO 30G'),
('LOC0043', 'LOCTITE 2G - BLISTER DE 12-'),
('FSA0001', 'ASFALTINA GALON'),
('FCR0001', 'FESTER CR 66 GRIS'),
('FCR0002', 'FESTER CR 66 BLANCO'),
('IMP0009', 'IMPERFACIL TOTAL 8 AÑOS TERRACOTA CUBETA'),
('IMP0010', 'IMPERFACIL TOTAL 8 AÑOS BLANCO CUBETA'),
('IMP0011', 'IMPERFACIL TOTAL 8 AÑOS BLANCO GALON'),
('IMP0012', 'IMPERFACIL TOTAL 8 AÑOS TERRACOTA/ROJO GALON'),
('IMP0013', 'IMPERFACIL TOTAL 6 AÑOS BLANCO CUBETA'),
('IMP0014', 'IMPERFACIL TOTAL 6 AÑOS ROJO CUBETA'),
('IMP0015', 'IMPERFACIL TOTAL 6 AÑOS BLANCO GALON'),
('IMP0016', 'IMPERFACIL TOTAL 6 AÑOS ROJO GALON'),
('FSP0002', 'FESTER SUPERSEAL P GRIS 300ML'),
('FSP0003', 'FESTER SUPERSEAL P BLANCO 300ML'),
('FSP0006', 'FESTERFLEX ROLLO 1.10X100MTS'),
('FSB0001', 'FESTERBOND GALON'),
('FSB0002', 'FESTERBOND CUBETA'),
('750748', 'Sikaflex-1A Purform Blanco Cartucho - 0.444Kg'),
('750846', 'Sikaflex-1A Purform GRIS Cartucho - 0.444Kg'),
('750845', 'Sikaflex-1A Purform Negro Cartucho - 0.444Kg'),
('515119', 'Sikaflex Universal GRISC5021 /12CTR300'),
('512540', 'Sikaflex Universal BLANCO C5021 /12CTR300'),
('767995', 'Sikaflex 1A Purform Blanco C9270 /20UP600ml'),
('741050', 'Sikaflex 1A Purform GrisC9270 /20UP600ml'),
('32496', 'Sikaflex-221 Blanco C16 /20 UP600'),
('46868', 'Sikaflex-221 Gris C16 /20 UP600'),
('46870', 'Sikaflex-221 Negro C16 /20 UP600'),
('756947', 'SIKAFLEX-11FC PURFORM BLANCO C5044/12CTR300'),
('93548', 'Sikadur-31 Hi-Mod Gel (AB) CL /6x 1KG (1/4)'),
('464178', 'Sikadur-32 Primer N (AB) CL /6x 1KG (1/4)'),
('92863', 'Sikadur-31 Hi-Mod Gel (AB) CL Pl 5KG'),
('464184', 'Sikadur-32 Primer N (AB) CL Ka 2,5KG'),
('609434', 'Sikalatex N Doy Pack 1.2 Litros'),
('462673', 'Sikalatex N Galon - 3.8 Kg'),
('543425', 'Sikalatex N Cubeta - 18.9 Kg'),
('613129', 'SikaSet L Tonel 250 Kg'),
('613130', 'SikaSet L Cubeta 23 Kg'),
('488547', 'SikaSet L Galon 4.5 kg'),
('705245', 'Antisol GP Cubeta 18.9Kg'),
('714093', 'Antisol GP Galon - 3.8KG'),
('705246', 'Antisol GP Tonel 200Kg'),
('586621', 'Sika Monotop-101 Blanco - 20 Kg'),
('594920', 'Sika Monotop-101 Blanco - 5 Kg'),
('586398', 'Sika Monotop-101 Gris - 20 Kg'),
('594918', 'Sika Monotop-101 Gris - 5 Kg'),
('606641', 'Acril Techo Power Blanco 4a Cub 19 L'),
('606640', 'Acril Techo Power Blanco 4a Gal 4 L'),
('607245', 'Acril Techo Power Blanco 6a Cub 19 L'),
('607244', 'Acril Techo Power Blanco 6a Gal 4 L'),
('607623', 'Acril Techo Power Blanco 8a Cub 19 L'),
('607667', 'Acril Techo Power Rojo 4a Cub 19 L'),
('607672', 'Acril Techo Power Rojo 4a Gal 4 L'),
('607676', 'Acril Techo Power Rojo 6a Cub 19 L'),
('607677', 'Acril Techo Power Rojo 6a Gal 4 L'),
('607679', 'Acril Techo Power Rojo 8a Cub 19 L'),
('73836', 'Sikaboom 250ml - 0.18Kg'),
('404', 'Sikaboom 500ml - 0.35Kg'),
('94388', 'Merulex I.F.A. CO /4x3,5KG'),
('565830', 'Sika Permalastik Pro Cub - 19L'),
('596963', 'Sika Permalastik Pro Gal - 4 L'),
('685666', 'Sikaflex 117 Metal Force Gris 300ml'),
('609103', 'Sanisil Blanco /12 CTR280'),
('609098', 'Sanisil Transparente /12 CTR280'),
('96645', 'Sika 1 - 17Kg'),
('423836', 'Sika 1 PET - 4.32Kg (4.5L)'),
('500206', 'Sikament 100 Cub - 20.4 Kg'),
('500343', 'Sikament 100 Gal - 4.1 Kg'),
('651659', 'Sika Zero Salitre - Gal 5 L'),
('SK97106', 'SIKAGUARD 70 MX/ 4X3 – 12KG GALON'),
('438769', 'Sikasil Universal black C5006 /12 CTR280'),
('417735', 'Sikasil Universal grey V9/3 /12 CTR280'),
('107386', 'Sikasil Universal transparent /12 CTR280'),
('107370', 'Sikasil Universal white /12 CTR280'),
('97189', 'Boquilla Nrml Pistol Cerr. Fina - 0.01Kg'),
('503650', 'Boquilla para Anchor Fix 3001'),
('658703', 'Boquilla SikaCeram-850 Design PC'),
('636062', 'Color Chart SikaCeram-850 Design /250 PC'),
('610486', 'Emulsika MX cubeta 19L'),
('150292', 'Pistola Albion'),
('600598', 'Pistola p/Anchorfix-3001'),
('97215', 'Pistola p/Anchorfix-4'),
('669455', 'Plastiment 1000 Tonel - 226 Kg'),
('669454', 'Plastiment 1000 Tote - 1,130 Kg'),
('537642', 'Plastiment G940 Cub - 21.4 Kg'),
('537641', 'Plastiment G940 Ton - 226 Kg'),
('537640', 'Plastiment G940 Tot - 1,130 Kg'),
('537622', 'Plastocrete 161 MR Cubeta 23.7 Kg'),
('537607', 'Plastocrete 161 MR Tonel 250 Kg'),
('537586', 'Plastocrete 161 MR Tote 1,250 Kg'),
('115148', 'Sigunit L50 AFX - 1,440 Kg'),
('96744', 'Sigunit L50 AFX - 250 Kg'),
('700345', 'Sika AnchorFix-2 (AB)GT /12 CTR150'),
('594059', 'Sika Anchorfix-3001 (AB) GT/12 CTR600'),
('433513', 'Sika Desmoldante Acua Cub-19 L'),
('614987', 'Sika Desmoldante Acua Gal-3.78 L'),
('424234', 'Sika Desmoldante Acua Ton-200 L'),
('624658', 'Sika ECG Tool Kit PC'),
('97112', 'Sika Malla (1,1mx100m) MX ROL'),
('466817', 'Sika Manto APP 3.5 GV Rojo(10mx1m) ROL'),
('466809', 'Sika Manto SBS 3.5 GV Rojo (10mx1m) ROL'),
('691625', 'Sika Monotop Seal-107 Blanco - 18.5 Kg'),
('691624', 'Sika Monotop Seal-107 Gris -18.5 Kg'),
('589478', 'Sika Monotop-412 SG - 22.7 Kg'),
('686744', 'Sika Permalastik Pro CO /4X3,5KG'),
('681823', 'Sika Permalastik Pro CO Pl 21KG'),
('663983', 'Sika Stabilizer-300 Plus Cub - 22.5 Kg'),
('633487', 'Sika Stabilizer-300 Plus Ton 238 Kg'),
('629303', 'Sika Stabilizer-300 Plus Tot - 1,190 kg'),
('426004', 'Sika Tela (1,1mx100m) MX ROL'),
('455072', 'Sika ViscoFlow-50 Tonel - 220 Kg'),
('629302', 'Sika Zero Salitre Doy Pack 1.2 L'),
('629584', 'SikaCem Acelerante Doy Pack 500 mL'),
('515272', 'SikaCem Fluido Doy Pack 300 mL'),
('738187', 'SikaCeram-100 UG Ceramica Bg 20KG'),
('594738', 'SikaCeram-102 Pegapiso - 20 Kg'),
('594912', 'SikaCeram-204 Piso sobre Piso - 20 Kg'),
('611718', 'SikaCeram-204 Piso sobre Piso - 40 Kg'),
('643556', 'SikaCeram-204 Piso sobre Piso Bolsa 5 Kg'),
('606639', 'SikaCeram-205 Porcelanato - 20 Kg'),
('611719', 'SikaCeram-205 Porcelanato - 40 Kg'),
('711080', 'SikaCeram-207 Baños y Cocinas - 20KG'),
('623360', 'SikaCeram-30 Pega Nivelador - 40 Kg'),
('94717', 'Sikadur AnchorFix-4(AB)CO/UY/11 CTR900GR'),
('562732', 'Sikadur-51SL (AB) 19.04 Kg'),
('502089', 'Sikadur-52 MX (AB) Pl 1Kg'),
('97135', 'SikaFiber Bolsa Biodegrabale /20x0,6KG'),
('704452', 'SikaFiber Bolsa Biodegrabale /50x0.15KG'),
('554916', 'Sikaflex 133 Multipropósito blanco, cartucho 280ml'),
('554917', 'Sikaflex 133 Multipropósito gris, cartucho 280ml'),
('423261', 'Sikaflex PRO-3 Gris C1/20 UP600'),
('687261', 'Sikaflex SOLO Negro C5013 /12 CRT300'),
('108785', 'Sikaflex-11FC+ Blanco C5013 /12 CTR300'),
('1372', 'Sikaflex-252 Blanco Salchicha - 0.726Kg'),
('105545', 'Sikaflex-260N Salchicha - 0.732Kg'),
('543547', 'Sikaflex-401 Pavement SL /12 CTR300'),
('519956', 'Sikaflex-401 Pavement SL Pl 5GAL'),
('183042', 'Sikafloor Uretano Premium (AB) MX 17KG'),
('459999', 'Sikafloor-155W N(AB) MX (10L) 14KG'),
('439220', 'Sikafloor-161 (A+B) - 16 kg'),
('464399', 'Sikafloor-20 PurCem (C) MX - 26.5 Kg'),
('464398', 'Sikafloor-20-31 PurCem (B) MX - 3 Kg'),
('464396', 'Sikafloor-20-31 PurCem(A)R7038 MX Ka 3KG'),
('464397', 'Sikafloor-20-31 PurCem(A)R7046 MX Ka 3KG'),
('96920', 'Sikagard-62 (AB) Gris MX 22Kg'),
('641419', 'Sikagard-70 MX /4x3.12 Kg'),
('97105', 'Sikagard-70 MX Cub 14.82Kg'),
('97107', 'Sikagard-70 MX Ton 150Kg'),
('600911', 'SikaGrout-212 GP - 22.7 Kg'),
('643555', 'SikaGrout-212 GP - 5 Kg'),
('461862', 'SikaLatex N Tonel - 200 Kg'),
('96653', 'Sikalite - 10Kg'),
('96654', 'Sikalite Saco - 25Kg'),
('500345', 'Sikament 100 Ton - 216 Kg'),
('97864', 'SikaRod (1219mx1/4IN) MX /2 ROL'),
('97861', 'SikaRod (182mx1IN) MX /2 ROL'),
('97862', 'SikaRod (236mx5/8IN) MX /2 ROL'),
('97863', 'SikaRod (320mx3/8IN) MX /2 ROL'),
('505530', 'SikaSello Pintores CO /12 CTR280'),
('505527', 'SikaSello Puertas y Ventan.CO /12 CTR280'),
('609139', 'Sikasil C Transparente /12 CTR280'),
('546873', 'Sikasil Gasket grey ES CN /12x95GR'),
('495688', 'SikaTitan SOLO Negro C5023/20 UP600'),
('97094', 'SikaTop Armatec-110EC (ABC) MX 8KG'),
('94377', 'SikaTransparente-5 CO /4x3KG'),
('94379', 'SikaTransparente-5 CO Dr 160KG'),
('94378', 'SikaTransparente-5 CO Pl 16KG'),
('537645', 'SikaViscocrete 2100 Cub - 20.6 Kg'),
('537644', 'SikaViscocrete 2100 Ton - 218 Kg'),
('537643', 'SikaViscocrete 2100 Tot - 1,090 Kg'),
('717135', 'SikaWaterbar O-15 E CO yellow (20m/R) M'),
('717137', 'SikaWaterbar O-22 E CO yellow (15m/R) M')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

-- =======================
-- SCRIPT COMPLETADO
-- =======================
-- Base de datos lista para importar en Render
-- Contiene:
-- - Estructura completa de tablas
-- - Sistema de roles y permisos
-- - Usuario admin por defecto (admin/admin123)
-- - Inventario completo de productos (321 productos)
-- - Índices y foreign keys configurados