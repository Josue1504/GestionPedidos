const mysql = require('mysql');
const bcrypt = require('bcrypt');

const username = process.argv[2] || 'adminuser';
const password = process.argv[3] || 'AdminPass123!';

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'fe200405',
  database: 'db_pedidos'
});

db.connect(err => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err);
    process.exit(1);
  }
  console.log('Conectado a la BD. Inicio bootstrap...');
  run().then(() => {
    console.log('Bootstrap completado.');
    db.end();
  }).catch(e => {
    console.error('Error en bootstrap:', e);
    db.end();
    process.exit(1);
  });
});

async function query(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

async function run() {
  // Ensure role admin
  let roles = await query('SELECT id FROM roles WHERE name = ?', ['admin']).catch(() => []);
  let roleId;
  if (roles && roles.length > 0) {
    roleId = roles[0].id;
    console.log('Role admin existente id=', roleId);
  } else {
    const r = await query('INSERT INTO roles (name) VALUES (?)', ['admin']);
    roleId = r.insertId;
    console.log('Role admin creado id=', roleId);
  }

  const perms = ['users.manage','pedidos.create','pedidos.view_all','pedidos.view_own','pedidos.edit','pedidos.delete'];
  const permIds = {};
  for (const p of perms) {
    const found = await query('SELECT id FROM permissions WHERE name = ?', [p]).catch(() => []);
    if (found && found.length > 0) {
      permIds[p] = found[0].id;
    } else {
      const ins = await query('INSERT INTO permissions (name) VALUES (?)', [p]);
      permIds[p] = ins.insertId;
      console.log('perm created', p, permIds[p]);
    }
    // ensure role_permissions
    await query('INSERT INTO role_permissions (role_id, permission_id) SELECT ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role_id=? AND permission_id=?)', [roleId, permIds[p], roleId, permIds[p]]).catch(()=>{});
  }

  // find or create user
  const users = await query('SELECT id FROM users WHERE username = ?', [username]).catch(()=>[]);
  let userId;
  if (users && users.length > 0) {
    userId = users[0].id;
    console.log('Usuario existente id=', userId);
  } else {
    const hash = await bcrypt.hash(password, 10);
    try {
      const ins = await query('INSERT INTO users (username, password_hash, active) VALUES (?,?,1)', [username, hash]);
      userId = ins.insertId;
      console.log('Usuario creado id=', userId, ' username=', username);
    } catch (err) {
      if (err && err.code === 'ER_BAD_FIELD_ERROR') {
        // columna active no existe en esta BD -> insertar sin active
        const ins2 = await query('INSERT INTO users (username, password_hash) VALUES (?,?)', [username, hash]);
        userId = ins2.insertId;
        console.log('Usuario creado (sin columna active) id=', userId, ' username=', username);
      } else {
        throw err;
      }
    }
  }

  // assign role to user
  await query('INSERT INTO user_roles (user_id, role_id) SELECT ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id=? AND role_id=?)', [userId, roleId, userId, roleId]).catch(()=>{});
  console.log('Asignado role admin al usuario');

  // done
}
