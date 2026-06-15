import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import Login from './Login';

function App() {
  const [usuario, setUsuario] = useState(null);
  const [cargandoUsuario, setCargandoUsuario] = useState(true);
  const [listaCanciones, setListaCanciones] = useState([]);
  const [cancionSeleccionada, setCancionSeleccionada] = useState(null);
  
  // Estado de la canción activa en pantalla
  const [cancion, setCancion] = useState(null);

  const [modoEdicion, setModoEdicion] = useState(true); 
  const [scrollActivo, setScrollActivo] = useState(false);
  const [velocidadScroll, setVelocidadScroll] = useState(2); 

  const [grabandoEnBloqueId, setGrabandoEnBloqueId] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const scrollIntervalRef = useRef(null);

  // 1. Verificar si hay una sesión activa al arrancar
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUsuario(session?.user ?? null);
      setCargandoUsuario(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUsuario(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Cargar el listado de canciones generales de la base de datos
  useEffect(() => {
    if (usuario) cargarListaCanciones();
  }, [usuario]);

  const cargarListaCanciones = async () => {
    const { data, error } = await supabase
      .from('canciones')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setListaCanciones(data);
  };

  // 3. Cargar los bloques completos de una canción seleccionada
  const seleccionarCancion = async (infoCancion) => {
    setCancionSeleccionada(infoCancion);
    
    const { data: datosBloques, error } = await supabase
      .from('bloques')
      .select('*, audios(*)')
      .eq('cancion_id', infoCancion.id)
      .order('orden', { ascending: true });

    if (!error) {
      setCancion({
        id: infoCancion.id,
        titulo: infoCancion.titulo,
        bpm: infoCancion.bpm,
        usuario_id: infoCancion.usuario_id, // Guardamos quién la creó para validar permisos
        bloques: datosBloques.map(b => ({
          id: b.id,
          tipo: b.tipo,
          numero: b.numero,
          texto: b.texto,
          acordes: b.acordes,
          comments: b.comentarios,
          audios: b.audios || []
        }))
      });
    }
  };

  // 4. Crear una canción nueva verificando que el nombre no se repita
  const crearNuevaCancion = async () => {
    let tituloDefinitivo = 'Nueva Canción';
    let existe = true;
    let contador = 1;

    // Bucle para verificar nombres duplicados en la lista local antes de insertar
    while (existe) {
      const nombreBuscar = contador === 1 ? 'Nueva Canción' : `Nueva Canción ${contador}`;
      const duplicada = listaCanciones.some(c => c.titulo.toLowerCase() === nombreBuscar.toLowerCase());
      if (!duplicada) {
        tituloDefinitivo = nombreBuscar;
        existe = false;
      } else {
        contador++;
      }
    }

    const { data: nuevaCan, error: errCan } = await supabase
      .from('canciones')
      .insert([{ titulo: tituloDefinitivo, bpm: '120', usuario_id: usuario.id }])
      .select()
      .single();

    if (!errCan && nuevaCan) {
      // Le creamos un bloque Intro por defecto para arrancar
      await supabase
        .from('bloques')
        .insert([{ cancion_id: nuevaCan.id, tipo: 'Intro', numero: 1, orden: 1 }]);
      
      await cargarListaCanciones();
      seleccionarCancion(nuevaCan);
    }
  };

  // 5. Auto-guardar cambios (Solo si el usuario es el creador)
  const guardarCambioEnServidor = async (bloqueId, campo, valor) => {
    if (cancion.usuario_id !== usuario.id) return; // Bloqueo de seguridad a nivel de ejecución
    await supabase
      .from('bloques')
      .update({ [campo]: valor })
      .eq('id', bloqueId);
  };

  const modificarBloqueLocal = (id, campo, valor) => {
    // Si no es el creador, solo le permitimos editar el campo 'comentarios' como sugerencia de texto
    if (cancion.usuario_id !== usuario.id && campo !== 'comentarios') {
      alert("Solo el creador original puede modificar la letra o acordes base.");
      return;
    }

    setCancion(prev => {
      const actualizados = prev.bloques.map(b => b.id === id ? { ...b, [campo]: valor } : b);
      return { ...prev, bloques: actualizados };
    });
    guardarCambioEnServidor(id, campo, valor);
  };

  const modificarTituloBpm = async (campo, valor) => {
    if (cancion.usuario_id !== usuario.id) return;

    // Validación extra: Si cambia el título, verificar que no se llame igual a otra existente
    if (campo === 'titulo') {
      const nombreRepetido = listaCanciones.some(c => c.id !== cancion.id && c.titulo.toLowerCase() === valor.trim().toLowerCase());
      if (nombreRepetido) {
        alert("Ya existe otra canción con ese nombre. Elegí uno distinto.");
        return;
      }
    }

    setCancion(prev => ({ ...prev, [campo]: valor }));
    await supabase.from('canciones').update({ [campo]: valor }).eq('id', cancion.id);
    cargarListaCanciones();
  };

  // 6. Agregar y quitar bloques en la nube
  const agregarBloque = async (tipo) => {
    if (cancion.usuario_id !== usuario.id) {
      alert("Solo el creador puede alterar la estructura de la canción.");
      return;
    }

    const cantidadMismoTipo = cancion.bloques.filter(b => b.tipo === tipo).length;
    const nuevoNumero = cantidadMismoTipo + 1;
    const ordenNuevo = cancion.bloques.length + 1;

    const { data: nuevoB, error } = await supabase
      .from('bloques')
      .insert([{ cancion_id: cancion.id, tipo, numero: nuevoNumero, orden: ordenNuevo }])
      .select()
      .single();

    if (!error && nuevoB) {
      setCancion(prev => ({
        ...prev,
        bloques: [...prev.bloques, { ...nuevoB, audios: [] }]
      }));
    }
  };

  const eliminarBloque = async (id) => {
    if (cancion.usuario_id !== usuario.id) return;
    const { error } = await supabase.from('bloques').delete().eq('id', id);
    if (!error) {
      seleccionarCancion(cancionSeleccionada);
    }
  };

  const eliminarCancionCompleta = async (cancionId, e) => {
    e.stopPropagation();
    if (confirm('¿Seguro querés eliminar todo este borrador? No se puede deshacer.')) {
      await supabase.from('canciones').delete().eq('id', cancionId);
      if (cancion?.id === cancionId) setCancion(null);
      cargarListaCanciones();
    }
  };

  // 7. LÓGICA DE AUDIO (Cualquier usuario puede grabar su sugerencia)
  const iniciarGrabacion = async (bloqueId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
      });
      
      let tipoMime = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(tipoMime)) tipoMime = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(tipoMime)) tipoMime = '';

      mediaRecorderRef.current = new MediaRecorder(stream, tipoMime ? { mimeType: tipoMime } : {});
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const tipoNativo = mediaRecorderRef.current.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: tipoNativo });
        
        const nombreArchivo = `${usuario.id}/${bloqueId}-${Date.now()}.webm`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('audios-compositor')
          .upload(nombreArchivo, audioBlob, { contentType: tipoNativo });

        if (uploadError) {
          alert('Error al subir el audio al servidor.');
          return;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('audios-compositor')
          .getPublicUrl(nombreArchivo);

        // Se guarda el audio. Lleva la marca del bloque.
        const { data: nuevoAudio } = await supabase
          .from('audios')
          .insert([{ bloque_id: bloqueId, nombre: `Idea ${Date.now().toString().slice(-4)}`, storage_path: publicUrl }])
          .select()
          .single();

        if (nuevoAudio) {
          setCancion(prev => {
            const bloquesModificados = prev.bloques.map(b => 
              b.id === bloqueId ? { ...b, audios: [...b.audios, nuevoAudio] } : b
            );
            return { ...prev, bloques: bloquesModificados };
          });
        }
      };

      mediaRecorderRef.current.start(1000);
      setGrabandoEnBloqueId(bloqueId);
    } catch (err) {
      alert("Permiso de micrófono denegado.");
    }
  };

  const detenerGrabacion = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setGrabandoEnBloqueId(null);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const eliminarAudio = async (bloqueId, audioId) => {
    // Solo el creador de la canción puede borrar audios adjuntos
    if (cancion.usuario_id !== usuario.id) {
      alert("Solo el propietario original puede eliminar pistas de audio.");
      return;
    }
    const { error } = await supabase.from('audios').delete().eq('id', audioId);
    if (!error) {
      setCancion(prev => {
        const bloquesModificados = prev.bloques.map(b => 
          b.id === bloqueId ? { ...b, audios: b.audios.filter(a => a.id !== audioId) } : b
        );
        return { ...prev, bloques: bloquesModificados };
      });
    }
  };

  // Motor del Auto-Scroll
  useEffect(() => {
    if (scrollActivo && !modoEdicion) {
      const intervaloMs = 60 / velocidadScroll; 
      scrollIntervalRef.current = setInterval(() => {
        window.scrollBy({ top: 1, behavior: 'auto' });
      }, intervaloMs);
    } else {
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    }
    return () => { if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current); };
  }, [scrollActivo, velocidadScroll, modoEdicion]);

  if (cargandoUsuario) return <div style={{ color: '#fff', textAlign: 'center', marginTop: '100px' }}>Iniciando Servidor...</div>;
  if (!usuario) return <Login onLoginSuccess={(user) => setUsuario(user)} />;

  return (
    <div className={`app-compositor ${!modoEdicion ? 'modo-vivo' : ''}`}>
      <style>{`
        body, html { margin: 0; padding: 0; background-color: #12141c !important; color: #e0e6ed !important; font-family: sans-serif; min-height: 100vh; }
        .app-compositor { max-width: 600px; margin: 0 auto; padding: 15px; background-color: #12141c; min-height: 100vh; }
        .barra-usuario { display: flex; justify-content: space-between; align-items: center; background: #1a1d29; padding: 10px 15px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; color: #8892b0; border: 1px solid #2a2f42; }
        .btn-cerrar { background: transparent; border: none; color: #ff4a4a; cursor: pointer; text-decoration: underline; }
        .panel-proyectos { background: #1a1d29; border: 1px solid #2a2f42; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
        .panel-proyectos h2 { margin-top: 0; font-size: 20px; color: #fff; }
        .lista-items-cancion { display: flex; flex-direction: column; gap: 10px; margin-top: 15px; }
        .item-cancion { background: #25293c; padding: 12px 15px; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border: 1px solid transparent; }
        .item-cancion:hover { border-color: #00ffcc; }
        .item-cancion.activa { border-color: #00ffcc; background: #1e2230; }
        .btn-crear-can { width: 100%; background: #00ffcc; color: #12141c; border: none; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 15px; }
        .barra-modos { margin-bottom: 15px; position: sticky; top: 0; z-index: 999; }
        .btn-cambio-modo { width: 100%; padding: 14px; border-radius: 10px; font-size: 15px; font-weight: bold; cursor: pointer; border: none; color: white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
        .btn-cambio-modo.comp { background-color: #2c313d; border: 1px solid #3b425c; }
        .btn-cambio-modo.vivo { background-color: #ff2a5f; }
        .header-cancion { background: #1a1d29; padding: 15px; border-radius: 12px; border: 1px solid #2a2f42; margin-bottom: 20px; display: flex; flex-direction: column; gap: 12px; }
        .input-titulo { background: transparent; border: none; border-bottom: 2px solid #3b425c; color: #fff; font-size: 24px; font-weight: bold; width: 100%; outline: none; }
        .titulo-vivo { font-size: 28px; color: #fff; margin: 0; }
        .control-bpm { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #8892b0; }
        .input-bpm { background: #25293c; border: 1px solid #3b425c; color: #00ffcc; font-size: 16px; font-weight: bold; padding: 5px 8px; border-radius: 6px; width: 60px; text-align: center; }
        .selector-estructural { background: #1a1d29; padding: 12px; border-radius: 12px; border: 1px solid #2a2f42; margin-bottom: 20px; }
        .botones-estructura { display: flex; flex-wrap: wrap; gap: 8px; }
        .btn-est { flex: 1; min-width: 80px; padding: 10px; border: none; border-radius: 8px; font-weight: bold; font-size: 13px; cursor: pointer; color: #fff; }
        .btn-est.intro { background-color: #3f51b5; }
        .btn-est.estrofa { background-color: #2da44e !important; }
        
        /* SOLUCIÓN: Identificador de clase totalmente exclusivo */
        .btn-est.pre-chunk { background-color: #ffcc00 !important; color: #12141c !important; }
        
        .btn-est.estribillo { background-color: #e91e63; }
        .btn-est.puente { background-color: #9c27b0; }
        .btn-est.solo { background-color: #ff9800; }
        .btn-est.final { background-color: #607d8b; }
        .lista-bloques { display: flex; flex-direction: column; gap: 20px; }
        .tarjeta-bloque { background: #1e2230; border-radius: 14px; padding: 15px; border-left: 6px solid #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        .tarjeta-bloque.intro { border-left-color: #3f51b5; }
        .tarjeta-bloque.estrofa { border-left-color: #2da44e !important; }
        
        /* SOLUCIÓN: Borde amarillo asegurado sin colisiones */
        .tarjeta-bloque.pre-chunk { border-left-color: #ffcc00 !important; }
        
        .tarjeta-bloque.estribillo { border-left-color: #e91e63; }
        .tarjeta-bloque.puente { border-left-color: #9c27b0; }
        .tarjeta-bloque.solo { border-left-color: #ff9800; }
        .tarjeta-bloque.final { border-left-color: #607d8b; }
        .encabezado-bloque { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .caja-letras { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
        .input-acordes { background: #151821; border: 1px dashed #444b66; color: #ffcc00; padding: 10px; border-radius: 6px; font-size: 15px; font-family: monospace; font-weight: bold; outline: none; }
        .acordes-vivo-txt { color: #ffcc00; font-family: monospace; font-size: 20px; font-weight: bold; background: #151821; padding: 8px; border-radius: 6px; }
        .txt-letra { background: #25293c; border: 1px solid #3b425c; color: #fff; padding: 10px; border-radius: 8px; font-size: 16px; resize: vertical; outline: none; }
        .letra-vivo-txt { color: #ffffff; font-size: 18px; line-height: 1.6; white-space: pre-wrap; margin: 5px 0; }
        .input-comentarios { background: #1a1d29; border: none; color: #5af78e; padding: 8px 10px; border-radius: 6px; font-size: 13px; font-style: italic; width: 100%; box-sizing: border-box; outline: none; }
        .comentario-vivo-txt { color: #5af78e; font-size: 13px; font-style: italic; background: rgba(90, 247, 142, 0.05); padding: 6px 10px; border-radius: 6px; }
        .estudio-audio-bloque { background: #151821; padding: 12px; border-radius: 10px; border: 1px solid #25293c; margin-top: 10px; }
        .btn-audio { width: 100%; padding: 12px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .btn-audio.grabar { background: #28a745; color: white; }
        .btn-audio.detener { background: #dc3545; color: white; }
        .lista-audios-bloque { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid #25293c; padding-top: 10px; }
        .item-audio { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #1e2230; padding: 6px 10px; border-radius: 6px; }
        .reproductor-nativo { flex: 1; height: 32px; }
        .consola-scroll-flotante { position: fixed; bottom: 15px; left: 50%; transform: translateX(-50%); background: #1a1d29; border: 2px solid #3b425c; padding: 12px 20px; border-radius: 50px; display: flex; align-items: center; gap: 15px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 1000; width: 90%; max-width: 400px; box-sizing: border-box; }
        .btn-scroll-toggle { flex: 1; padding: 10px 15px; border-radius: 25px; border: none; font-weight: bold; color: white; cursor: pointer; }
        .btn-scroll-toggle.pausado { background-color: #007bff; }
        .btn-scroll-toggle.corriendo { background-color: #ff9800; }
        .controles-velocidad { display: flex; align-items: center; gap: 8px; }
        .controles-velocidad button { background: #25293c; border: 1px solid #3b425c; color: white; width: 30px; height: 30px; border-radius: 50%; font-weight: bold; cursor: pointer; }
      `}</style>

      {/* Barra superior de sesión */}
      <div className="barra-usuario">
        <span>👤 Músico: {usuario.email}</span>
        <button onClick={() => supabase.auth.signOut()} className="btn-cerrar">Cerrar Sesión</button>
      </div>

      {/* Panel de control de borradores */}
      <div className="panel-proyectos">
        <h2>🎵 Mis Borradores en la Nube</h2>
        <button onClick={crearNuevaCancion} className="btn-crear-can">+ Crear Nueva Canción</button>
        <div className="lista-items-cancion">
          {listaCanciones.map(c => (
            <div key={c.id} onClick={() => seleccionarCancion(c)} className={`item-cancion ${cancion?.id === c.id ? 'activa' : ''}`}>
              <span>🎸 {c.titulo} ({c.bpm} BPM)</span>
              {/* SEGURIDAD: Solo el creador puede borrar canciones completas */}
              {usuario.id === c.usuario_id && (
                <button onClick={(e) => eliminarCancionCompleta(c.id, e)} style={{ background: 'transparent', border: 'none', color: '#ff4a4a', cursor: 'pointer' }}>🗑️</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Si hay una canción seleccionada, dibujamos el compositor */}
      {cancion && (
        <>
          <div className="barra-modos">
            <button onClick={() => setModoEdicion(!modoEdicion)} className={`btn-cambio-modo ${modoEdicion ? 'comp' : 'vivo'}`}>
              {modoEdicion ? '📝 Modo: Composición' : '🎸 Modo: En Vivo / Lectura'}
            </button>
          </div>

          <header className="header-cancion">
            {modoEdicion ? (
              <input 
                type="text" 
                value={cancion.titulo} 
                onChange={(e) => modificarTituloBpm('titulo', e.target.value)} 
                className="input-titulo" 
                disabled={cancion.usuario_id !== usuario.id} // Bloqueado si es invitado
              />
            ) : (
              <h1 className="titulo-vivo">🎤 {cancion.titulo}</h1>
            )}
            <div className="control-bpm">
              <label>Tempo: </label>
              {modoEdicion ? (
                <input 
                  type="number" 
                  value={cancion.bpm} 
                  onChange={(e) => modificarTituloBpm('bpm', e.target.value)} 
                  className="input-bpm" 
                  disabled={cancion.usuario_id !== usuario.id} // Bloqueado si es invitado
                />
              ) : (
                <span style={{ color: '#00ffcc', fontWeight: 'bold' }}>{cancion.bpm}</span>
              )}
              <span>BPM 🥁</span>
            </div>
          </header>

          {modoEdicion && cancion.usuario_id === usuario.id && (
            <div className="selector-estructural">
              <div className="botones-estructura">
                {['Intro', 'Estrofa', 'Pre-Estribillo', 'Estribillo', 'Puente', 'Solo', 'Final'].map(tipo => {
                  const claseBotones = tipo === 'Pre-Estribillo' ? 'pre-chunk' : tipo.toLowerCase().replace('-', '');
                  return (
                    <button key={tipo} onClick={() => agregarBloque(tipo)} className={`btn-est ${claseBotones}`}>{tipo}</button>
                  );
                })}
              </div>
            </div>
          )}

          <main className="lista-bloques">
            {cancion.bloques.map((bloque) => {
              const claseTarjeta = bloque.tipo === 'Pre-Estribillo' ? 'pre-chunk' : bloque.tipo.toLowerCase().replace('-', '');
              return (
                <div key={bloque.id} className={`tarjeta-bloque ${claseTarjeta}`}>
                  <div className="encabezado-bloque">
                    <h3>{bloque.tipo} {bloque.numero}</h3>
                    {/* SEGURIDAD: Solo el creador puede quitar un bloque estructural */}
                    {modoEdicion && cancion.usuario_id === usuario.id && (
                      <button onClick={() => eliminarBloque(bloque.id)} style={{ background: 'transparent', border: 'none', color: '#ff4a4a', cursor: 'pointer' }}>❌ Quitar</button>
                    )}
                  </div>

                  <div className="caja-letras">
                    {modoEdicion ? (
                      <input 
                        type="text" 
                        placeholder="Acordes..." 
                        value={bloque.acordes || ''} 
                        onChange={(e) => modificarBloqueLocal(bloque.id, 'acordes', e.target.value)} 
                        className="input-acordes" 
                        disabled={cancion.usuario_id !== usuario.id} // Bloqueado si es invitado
                      />
                    ) : (
                      bloque.acordes && <div className="acordes-vivo-txt">{bloque.acordes}</div>
                    )}

                    {modoEdicion ? (
                      <textarea 
                        placeholder="Letra..." 
                        value={bloque.texto || ''} 
                        onChange={(e) => modificarBloqueLocal(bloque.id, 'texto', e.target.value)} 
                        className="txt-letra" 
                        rows="3" 
                        disabled={cancion.usuario_id !== usuario.id} // Bloqueado si es invitado
                      />
                    ) : (
                      bloque.texto && <p className="letra-vivo-txt">{bloque.texto}</p>
                    )}
                  </div>

                  {/* COMENTARIOS: Abiertos para que invitados dejen sus sugerencias de texto */}
                  {modoEdicion ? (
                    <input type="text" placeholder="💡 Dejá tu sugerencia o comentario..." value={bloque.comments || ''} onChange={(e) => modificarBloqueLocal(bloque.id, 'comentarios', e.target.value)} className="input-comentarios" />
                  ) : (
                    bloque.comments && <div className="comentario-vivo-txt">💡 {bloque.comments}</div>
                  )}

                  <div className="estudio-audio-bloque">
                    {/* AUDIO DE SUGERENCIAS: Cualquier músico invitado puede grabar audios */}
                    {modoEdicion && (
                      <div>
                        {grabandoEnBloqueId === bloque.id ? (
                          <button onClick={detenerGrabacion} className="btn-audio detener">⏹️ Detener</button>
                        ) : (
                          <button onClick={() => iniciarGrabacion(bloque.id)} disabled={grabandoEnBloqueId !== null} className="btn-audio grabar">🎙️ Grabar Idea</button>
                        )}
                      </div>
                    )}

                    {bloque.audios.length > 0 && (
                      <div className="lista-audios-bloque">
                        {bloque.audios.map((audio) => (
                          <div key={audio.id} className="item-audio">
                            <audio src={audio.storage_path} controls className="reproductor-nativo" />
                            {modoEdicion && cancion.usuario_id === usuario.id && (
                              <button onClick={() => eliminarAudio(bloque.id, audio.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>🗑️</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </main>
        </>
      )}

      {!modoEdicion && (
        <div className="consola-scroll-flotante">
          <button onClick={() => setScrollActivo(!scrollActivo)} className={`btn-scroll-toggle ${scrollActivo ? 'corriendo' : 'pausado'}`}>{scrollActivo ? '⏸️ Pausar' : '▶️ Auto-Scroll'}</button>
          <div className="controles-velocidad">
            <button onClick={() => setVelocidadScroll(Math.max(1, velocidadScroll - 0.5))}>-</button>
            <span style={{ fontSize: '13px', color: '#8892b0', minWidth: '55px', textAlign: 'center' }}>{velocidadScroll}x</span>
            <button onClick={() => setVelocidadScroll(Math.min(5, velocidadScroll + 0.5))}>+</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;