# Sistema de Pedidos - Deploy en Render

## Pasos para deploy:

### 1. Subir código a GitHub
1. Crear repositorio en GitHub
2. Subir tanto `servidor-api` como `mi-proyecto-de-pedidos`

### 2. Configurar Base de Datos en Render
1. En Render Dashboard, crear "PostgreSQL" o "MySQL" (recomiendo PostgreSQL)
2. Copiar la URL de conexión
3. Ejecutar el script `database_export.sql` en la nueva base de datos

### 3. Deploy del Backend
1. En Render: "New Web Service"
2. Conectar repositorio de GitHub
3. Root Directory: `servidor-api`
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Environment Variables:
   ```
   NODE_ENV=production
   DB_HOST=<host_de_render>
   DB_USER=<usuario_render>
   DB_PASSWORD=<password_render>
   DB_NAME=<nombre_db>
   SESSION_SECRET=<secreto_super_seguro>
   FRONTEND_URL=<url_del_frontend>
   ```

### 4. Deploy del Frontend
1. En Render: "New Static Site"
2. Root Directory: `mi-proyecto-de-pedidos`
3. Build Command: `npm run build`
4. Publish Directory: `build`

### 5. Configurar CORS
Actualizar `FRONTEND_URL` en el backend con la URL real del frontend.

## Variables de entorno necesarias:

### Backend:
- `DB_HOST`: Host de la base de datos
- `DB_USER`: Usuario de la base de datos
- `DB_PASSWORD`: Contraseña de la base de datos
- `DB_NAME`: Nombre de la base de datos
- `SESSION_SECRET`: Secreto para las sesiones
- `FRONTEND_URL`: URL del frontend para CORS

### Comandos locales:
```bash
# Instalar dependencias del backend
cd servidor-api
npm install

# Instalar dependencias del frontend  
cd ../mi-proyecto-de-pedidos
npm install
```