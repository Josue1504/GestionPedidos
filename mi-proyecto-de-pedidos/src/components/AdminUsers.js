import React, { useEffect, useState } from 'react';
import './AdminUsers.css';
import apiRequest from '../apiRequest';

const AdminUsers = ({ onClose }) => {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [checked, setChecked] = useState(new Set());
  const [rolesList, setRolesList] = useState([]);
  const [canGrantUsersManage, setCanGrantUsersManage] = useState(false);
  const [canGrantViewAll, setCanGrantViewAll] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingActive, setEditingActive] = useState(true);

  useEffect(() => {
    apiRequest('/api/permissions')
      .then(async r => {
        if (!r.ok) throw new Error('No se pudieron cargar permisos');
        const j = await r.json();
        setPermissions(Array.isArray(j) ? j : (j && Array.isArray(j.permissions) ? j.permissions : []));
      })
      .catch(() => setPermissions([]));

    const loadUsers = () => {
      setLoadingUsers(true);
      setUsersError(null);
      apiRequest('/api/users')
        .then(async r => {
          if (!r.ok) {
            const text = await r.text().catch(() => '');
            setUsers([]);
            setUsersError(`Error cargando usuarios: ${r.status} ${r.statusText} ${text}`);
            setLoadingUsers(false);
            return;
          }
          const j = await r.json();
          if (Array.isArray(j)) setUsers(j);
          else if (j && Array.isArray(j.users)) setUsers(j.users);
          else if (j && j.id) setUsers([j]);
          else setUsers([]);
          setLoadingUsers(false);
        })
        .catch(err => { console.error('Error fetching users:', err); setUsers([]); setUsersError(String(err)); setLoadingUsers(false); });
    };

    loadUsers();
    // obtener roles
    apiRequest('/api/roles')
      .then(async r => {
        if (!r.ok) throw new Error('No se pudieron cargar roles');
        const j = await r.json();
        setRolesList(Array.isArray(j) ? j : []);
      })
      .catch(() => setRolesList([]));
    // comprobar si el usuario actual puede administrar usuarios (para mostrar/ocultar la opción)
    apiRequest('/api/has-permission?name=users.manage')
      .then(r => r.json())
      .then(data => setCanGrantUsersManage(!!data.ok))
      .catch(() => setCanGrantUsersManage(false));
    apiRequest('/api/has-permission?name=pedidos.view_all')
      .then(r => r.json())
      .then(data => setCanGrantViewAll(!!data.ok))
      .catch(() => setCanGrantViewAll(false));
  }, []);

  const refreshUsers = () => {
    setUsersError(null);
    setLoadingUsers(true);
    apiRequest('/api/users')
      .then(async r => {
        if (!r.ok) {
          const text = await r.text().catch(() => '');
          setUsers([]);
          setUsersError(`Error cargando usuarios: ${r.status} ${r.statusText} ${text}`);
          setLoadingUsers(false);
          return;
        }
        const j = await r.json();
        if (Array.isArray(j)) setUsers(j);
        else if (j && Array.isArray(j.users)) setUsers(j.users);
        else if (j && j.id) setUsers([j]);
        else setUsers([]);
        setLoadingUsers(false);
      })
      .catch(err => { console.error('Error fetching users:', err); setUsers([]); setUsersError(String(err)); setLoadingUsers(false); });
  };

  const loadUserForEdit = async (id) => {
    try {
  const res = await apiRequest(`/api/users/${id}`);
      if (!res.ok) return alert('No se pudo cargar el usuario');
      const data = await res.json();
      setEditingId(data.id);
      setUsername(data.username || '');
      setPassword('');
      setRoleId(data.roles && data.roles.length ? data.roles[0] : '');
      setChecked(new Set(data.permissionIds || []));
      setEditingActive(typeof data.active === 'undefined' ? true : !!data.active);
    } catch (err) {
      console.error(err);
      alert('Error cargando usuario');
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return alert('No hay usuario seleccionado para editar');
    if (!username) return alert('username requerido');
    const body = { username, password: password || undefined, roleId: roleId || null, permissionIds: Array.from(checked), active: editingActive };
    try {
      console.log('Enviando datos al servidor (PUT /api/users):', { id: editingId, username, roleId, permissionIds: Array.from(checked), active: editingActive });
  const res = await apiRequest(`/api/users/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const textResp = await res.text().catch(() => null);
      let parsedResp = null;
      try { parsedResp = textResp ? JSON.parse(textResp) : null; } catch(e) { parsedResp = textResp; }
      console.log('Respuesta del servidor (PUT /api/users):', res.status, parsedResp);
      if (res.ok) {
        alert('Usuario actualizado');
        // optimistic local update so the admin sees the change immediately
        setUsers(prev => prev.map(u => u.id === editingId ? { ...u, username, roles: roleId ? [roleId] : [], active: !!editingActive } : u));
        // refresh list from server to ensure canonical state
        refreshUsers();
        // clear form
        setEditingId(null); setUsername(''); setPassword(''); setRoleId(''); setChecked(new Set()); setEditingActive(true);
      } else {
        const err = await res.json();
        alert(err.message || 'Error actualizando');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Confirma eliminar este usuario? Esta acción no se puede deshacer.')) return;
    try {
  const res = await apiRequest(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        alert('Usuario eliminado');
        setUsers(prev => prev.filter(u => u.id !== id));
      } else {
        const err = await res.json();
        alert(err.message || 'Error eliminando');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión');
    }
  };

  const togglePermission = (id) => {
    // If role is "vendedor", prevent toggling admin-only permissions
    const adminNames = ['pedidos.view_all', 'users.manage'];
    const adminPermIds = permissions.filter(p => adminNames.includes(p.name)).map(p => p.id);
    const selectedRole = rolesList.find(r => String(r.id) === String(roleId));
    const roleName = selectedRole ? (selectedRole.name || '').toString().toLowerCase() : '';
    if (roleName === 'vendedor' && adminPermIds.includes(id)) {
      // prevent toggling admin permission for vendedor
      return;
    }
    const s = new Set(checked);
    if (s.has(id)) s.delete(id); else s.add(id);
    setChecked(s);
  };

  const handleCreate = async () => {
    if (!username || !password) return alert('username y password requeridos');
    const body = { username, password, roleId: roleId || null, permissionIds: Array.from(checked) };
    try {
  const res = await apiRequest('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        alert('Usuario creado');
        const created = await res.json();
        setUsers(prev => [...prev, { id: created.userId, username, roles: roleId ? [roleId] : [] }]);
        setUsername(''); setPassword(''); setChecked(new Set());
      } else {
        const err = await res.json();
        alert(err.message || 'Error creando');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión');
    }
  };

  // Map known permission keys to friendly labels requested by the user
  const permLabel = (name) => {
    const map = {
      'pedidos.create': 'Crear',
      'pedidos.delete': 'Eliminar',
      'pedidos.edit': 'Editar',
      // Distinguish view_all vs view_own so admins can assign the correct scope
      'pedidos.view_all': 'Ver Pedidos (Todos)',
      'pedidos.view_own': 'Ver Pedidos (Propios)',
      'users.manage': 'Administrar usuarios'
    };
    if (map[name]) return map[name];
    // fallback: convert 'foo.bar' to 'Foo Bar'
    return name.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  };

  return (
    <div className="admin-users">
      <h3>Gestión de Usuarios</h3>
      <div className="admin-grid">
        <div className="users-list">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0 }}>Usuarios</h4>
            <div>
              <button onClick={refreshUsers} style={{ marginRight: 8 }}>Refresh</button>
            </div>
          </div>

          {loadingUsers ? (
            <div style={{ padding: 20 }}>Cargando usuarios...</div>
          ) : usersError ? (
            <div style={{ padding: 20, color: 'red' }}>
              Error: {usersError}
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: 20 }}>No hay usuarios para mostrar.</div>
          ) : (
            <table>
              <thead>
                <tr><th>ID</th><th>Username</th><th>Active</th><th>Roles</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.username}</td>
                    <td>{u.active ? 'Activo' : 'Inactivo'}</td>
                    <td>{(u.roles || []).join(', ')}</td>
                    <td>
                      <button onClick={() => loadUserForEdit(u.id)}>Editar</button>
                      <button style={{ marginLeft: 6 }} onClick={() => handleDelete(u.id)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="create-user">
          <h4>Crear usuario</h4>
          <div className="form-row">
            <label>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="usuario" />
          </div>
          <div className="form-row">
            <label>Password</label>
            <input value={password} type="password" onChange={e => setPassword(e.target.value)} placeholder="contraseña" />
          </div>
          <div className="form-row">
            <label>Rol</label>
            <select value={roleId} onChange={e => setRoleId(e.target.value)}>
              <option value="">-- Seleccionar --</option>
              {rolesList.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          <div className="form-row">
            <label>Activo</label>
            <input type="checkbox" checked={editingActive} onChange={e => setEditingActive(e.target.checked)} />
          </div>

          <div className="form-row">
            <label>Permisos (opcional)</label>
            <div className="permissions-list">
              {/* Render the 4 main permissions first in the requested order */}
              {['pedidos.create','pedidos.delete','pedidos.edit','pedidos.view_own'].map(key => {
                const p = permissions.find(pp => pp.name === key);
                if (!p) return null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`perm-pill ${checked.has(p.id) ? 'checked' : ''}`}
                    onClick={() => togglePermission(p.id)}
                    aria-pressed={checked.has(p.id)}
                  >
                    {permLabel(p.name)}
                  </button>
                );
              })}
            </div>

            {/* Admin-only permissions below - disable/hidden when role is vendedor */}
            <div className="permissions-admin-row">
              {canGrantViewAll && (() => {
                const p = permissions.find(pp => pp.name === 'pedidos.view_all');
                if (!p) return null;
                const selectedRole = rolesList.find(r => String(r.id) === String(roleId));
                const roleName = selectedRole ? (selectedRole.name || '').toString().toLowerCase() : '';
                const isVendedor = roleName === 'vendedor';
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`perm-pill admin-pill ${checked.has(p.id) ? 'checked' : ''} ${isVendedor ? 'disabled-perm' : ''}`}
                    onClick={() => { if (!isVendedor) togglePermission(p.id); }}
                    aria-pressed={checked.has(p.id)}
                    disabled={isVendedor}
                    title={isVendedor ? 'No disponible para el rol vendedor' : ''}
                  >
                    {permLabel(p.name)}
                    <span className="admin-badge">ADMIN</span>
                  </button>
                );
              })()}

              {canGrantUsersManage && (() => {
                const p = permissions.find(pp => pp.name === 'users.manage');
                if (!p) return null;
                const selectedRole = rolesList.find(r => String(r.id) === String(roleId));
                const roleName = selectedRole ? (selectedRole.name || '').toString().toLowerCase() : '';
                const isVendedor = roleName === 'vendedor';
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`perm-pill admin-pill ${checked.has(p.id) ? 'checked' : ''} ${isVendedor ? 'disabled-perm' : ''}`}
                    onClick={() => { if (!isVendedor) togglePermission(p.id); }}
                    aria-pressed={checked.has(p.id)}
                    disabled={isVendedor}
                    title={isVendedor ? 'No disponible para el rol vendedor' : ''}
                  >
                    {permLabel(p.name)}
                    <span className="admin-badge">ADMIN</span>
                  </button>
                );
              })()}
            </div>
          </div>

          <div className="actions">
            {editingId ? (
              <>
                <button className="primary" onClick={handleUpdate}>Guardar cambios</button>
                <button onClick={() => { setEditingId(null); setUsername(''); setPassword(''); setRoleId(''); setChecked(new Set()); }} style={{ marginLeft: 8 }}>Cancelar</button>
              </>
            ) : (
              <button className="primary" onClick={handleCreate}>Crear</button>
            )}
            <button onClick={onClose} style={{ marginLeft: 8 }}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminUsers;
