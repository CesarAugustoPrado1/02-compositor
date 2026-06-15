import React, { useState } from 'react';
import { supabase } from './supabaseClient';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [esRegistro, setEsRegistro] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [verPassword, setVerPassword] = useState(false); // Estado para alternar el ojito

  const manejarAuth = async (e) => {
    e.preventDefault();
    setCargando(true);

    try {
      if (esRegistro) {
        // Registrar nuevo músico
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('¡Registro exitoso! Te enviamos un mail de confirmación (revisá Spam si no llega).');
      } else {
        // Iniciar sesión
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data?.user) onLoginSuccess(data.user);
      }
    } catch (error) {
      alert(`Error: ${error.message || error.description}`);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="contenedor-login">
      <style>{`
        .contenedor-login { max-width: 400px; margin: 100px auto; padding: 25px; background: #1a1d29; border-radius: 14px; border: 1px solid #2a2f42; box-shadow: 0 8px 24px rgba(0,0,0,0.4); text-align: center; font-family: sans-serif; color: #e0e6ed; }
        .contenedor-login h2 { color: #fff; margin-bottom: 20px; font-size: 24px; }
        .form-login { display: flex; flex-direction: column; gap: 15px; }
        .form-login input { background: #25293c; border: 1px solid #3b425c; color: #fff; padding: 12px; border-radius: 8px; font-size: 15px; outline: none; width: 100%; box-sizing: border-box; }
        .form-login input:focus { border-color: #00ffcc; }
        
        /* Contenedor relativo para posicionar el ojito */
        .campo-password { position: relative; width: 100%; }
        .form-login .input-pass { padding-right: 45px; } /* Espacio extra a la derecha para que el texto no tape el ojo */
        
        /* Estilos del botón del ojito flotante */
        .btn-ojo-password { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: transparent; border: none; font-size: 18px; cursor: pointer; padding: 0; outline: none; user-select: none; }
        
        .btn-auth { background: #00ffcc; color: #12141c; padding: 12px; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer; transition: background 0.2s; width: 100%; }
        .btn-auth:disabled { background: #3b425c; color: #8892b0; cursor: not-allowed; }
        .btn-toggle-auth { background: transparent; border: none; color: #8892b0; margin-top: 15px; cursor: pointer; font-size: 14px; text-decoration: underline; }
      `}</style>

      <h2>{esRegistro ? '🎵 Crear Cuenta de Músico' : '🎸 Ingresar al Compositor'}</h2>
      
      <form onSubmit={manejarAuth} className="form-login">
        <input 
          type="email" 
          placeholder="Tu Correo Electrónico" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          required 
        />
        
        <div className="campo-password">
          <input 
            type={verPassword ? 'text' : 'password'} 
            placeholder="Tu Contraseña" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            className="input-pass"
            required 
          />
          <button 
            type="button" 
            onClick={() => setVerPassword(!verPassword)} 
            className="btn-ojo-password"
            title={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {verPassword ? '🙈' : '👁️'}
          </button>
        </div>

        <button type="submit" disabled={cargando} className="btn-auth">
          {cargando ? 'Procesando...' : esRegistro ? 'Registrarme' : 'Iniciar Sesión'}
        </button>
      </form>

      <button onClick={() => setEsRegistro(!esRegistro)} className="btn-toggle-auth">
        {esRegistro ? '¿Ya tenés cuenta? Iniciá sesión' : '¿Sos nuevo? Creá una cuenta acá'}
      </button>
    </div>
  );
}