import React, { useState } from 'react';
import './LoginForm.css';
import apiRequest from '../apiRequest';

const LoginForm = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    // Registro deshabilitado: solo login

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

    const endpoint = '/api/login';

        try {
            const response = await apiRequest(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                onLoginSuccess();
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
            <h2>Iniciar Sesión</h2>
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
                <button type="submit">Entrar</button>
            </form>
        </div>
    );
};

export default LoginForm;