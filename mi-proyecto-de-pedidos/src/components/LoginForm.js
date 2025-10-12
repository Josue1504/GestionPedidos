import React, { useState } from 'react';
import './LoginForm.css';

const LoginForm = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const url = isRegistering 
            ? 'http://localhost:5000/api/register' 
            : 'http://localhost:5000/api/login';

        try {
            const response = await fetch(url.replace('http://localhost:5000', ''), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                if (!isRegistering) {
                    onLoginSuccess();
                } else {
                    alert('Usuario registrado con éxito. Ahora puedes iniciar sesión.');
                    setIsRegistering(false); // Vuelve al modo de login
                }
            } else {
                setError(data.message || 'Error de conexión con el servidor. Inténtalo de nuevo.');
            }
        } catch (err) {
            console.error('Error:', err);
            setError('Error de conexión con el servidor. Inténtalo de nuevo.');
        }
    };

    return (
        <div className="login-container">
            <h2>{isRegistering ? 'Crear Usuario' : 'Iniciar Sesión'}</h2>
            <form onSubmit={handleSubmit}>
                <div className="input-group">
                    <label htmlFor="username">Usuario:</label>
                    <input
                        type="text"
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                    />
                </div>
                <div className="input-group">
                    <label htmlFor="password">Contraseña:</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                {error && <p className="error-message">{error}</p>}
                <button type="submit">
                    {isRegistering ? 'Registrar' : 'Entrar'}
                </button>
                <button
                    type="button"
                    className="toggle-button"
                    onClick={() => setIsRegistering(!isRegistering)}
                >
                    {isRegistering ? 'Volver al Login' : 'Crear un nuevo usuario'}
                </button>
            </form>
        </div>
    );
};

export default LoginForm;