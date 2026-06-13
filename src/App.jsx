import React, { useState, useEffect, useRef } from 'react';

function App() {
  const [cancion, setCancion] = useState({
    titulo: 'Mi Nueva Canción',
    bpm: '120',
    bloques: [
      { id: '1', tipo: 'Intro', numero: 1, texto: '', acordes: '', comentarios: '', audios: [] }
    ]
  });

  const [modoEdicion, setModoEdicion] = useState(true); 
  const [scrollActivo, setScrollActivo] = useState(false);
  const [velocidadScroll, setVelocidadScroll] = useState(2); 

  const [grabandoEnBloqueId, setGrabandoEnBloqueId] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const scrollIntervalRef = useRef(null);

  // Cargar texto y acordes del localStorage
  useEffect(() => {
    const guardado = localStorage.getItem('compositor_cancion');
    if (guardado) {
      const cancionParseada = JSON.parse(guardado);
      // Limpiamos audios viejos al cargar para evitar URLs rotas de sesiones pasadas
      cancionParseada.bloques = cancionParseada.bloques.map(b => ({ ...b, audios: [] }));
      setCancion(cancionParseada);
    }
  }, []);

  // Guardar cambios en el localStorage
  useEffect(() => {
    localStorage.setItem('compositor_cancion', JSON.stringify(cancion));
  }, [cancion]);

  useEffect(() => {
    if (scrollActivo && !modoEdicion) {
      const intervaloMs = 60 / velocidadScroll; 
      scrollIntervalRef.current = setInterval(() => {
        window.scrollBy({ top: 1, behavior: 'auto' });
      }, intervaloMs);
    } else {
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    }
    return () => {
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    };
  }, [scrollActivo, velocidadScroll, modoEdicion]);

  const cambiarModo = () => {
    if (!modoEdicion) setScrollActivo(false);
    setModoEdicion(!modoEdicion);
  };

  const manejarDatosGenerales = (campo, valor) => {
    setCancion({ ...cancion, [campo]: valor });
  };

  const agregarBloque = (tipo) => {
    const cantidadMismoTipo = cancion.bloques.filter(b => b.tipo === tipo).length;
    const nuevoNumero = cantidadMismoTipo + 1;

    let acordesHeredados = '';
    const ultimoBloqueMismoTipo = [...cancion.bloques]
      .reverse()
      .find(b => b.tipo === tipo);
    
    if (ultimoBloqueMismoTipo) {
      acordesHeredados = ultimoBloqueMismoTipo.acordes;
    }

    const nuevoBloque = {
      id: Date.now().toString(),
      tipo: tipo,
      numero: nuevoNumero,
      texto: '',
      acordes: acordesHeredados,
      comentarios: '',
      audios: []
    };

    setCancion({ ...cancion, bloques: [...cancion.bloques, nuevoBloque] });
  };

  const modificarBloque = (id, campo, valor) => {
    const bloquesActualizados = cancion.bloques.map((b) => {
      if (b.id === id) return { ...b, [campo]: valor };
      return b;
    });
    setCancion({ ...cancion, bloques: bloquesActualizados });
  };

  const eliminarBloque = (id) => {
    const filtrados = cancion.bloques.filter((b) => b.id !== id);
    const contadores = {};
    const bloquesRenumerados = filtrados.map((b) => {
      contadores[b.tipo] = (contadores[b.tipo] || 0) + 1;
      return { ...b, numero: contadores[b.tipo] };
    });
    setCancion({ ...cancion, bloques: bloquesRenumerados });
  };

  // --- NUEVA LÓGICA DE AUDIO ULTRA-LIVIANA PARA MÓVILES ---
  const iniciarGrabacion = async (bloqueId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const tipoNativo = mediaRecorderRef.current.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: tipoNativo });
        
        // El truco mágico: Creamos un link directo en la memoria ram del celu, sin conversiones pesadas
        const urlDirecta = URL.createObjectURL(audioBlob);

        setCancion((prevCancion) => {
          const bloquesActualizados = prevCancion.bloques.map((b) => {
            if (b.id === bloqueId) {
              const numeroAudio = b.audios.length + 1;
              return {
                ...b,
                audios: [...b.audios, { id: Date.now().toString(), nombre: `Idea ${numeroAudio}`, url: urlDirecta }]
              };
            }
            return b;
          });
          return { ...prevCancion, bloques: bloquesActualizados };
        });
      };

      mediaRecorderRef.current.start();
      setGrabandoEnBloqueId(bloqueId);
    } catch (err) {
      alert("Microfono bloqueado. Usá la web desde Chrome común.");
    }
  };

  const detenerGrabacion = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setGrabandoEnBloqueId(null);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const eliminarAudio = (bloqueId, audioId) => {
    const bloquesActualizados = cancion.bloques.map((b) => {
      if (b.id === bloqueId) {
        return { ...b, audios: b.audios.filter((a) => a.id !== audioId) };
      }
      return b;
    });
    setCancion({ ...cancion, bloques: bloquesActualizados });
  };

  return (
    <div className={`app-compositor ${!modoEdicion ? 'modo-vivo' : ''}`}>
      
      <style>{`
        body, html {
          margin: 0; padding: 0; background-color: #12141c !important; color: #e0e6ed !important;
          font-family: 'Segoe UI', Roboto, sans-serif; min-height: 100vh;
        }
        .app-compositor { max-width: 600px; margin: 0 auto; padding: 15px; box-sizing: border-box; background-color: #12141c; min-height: 100vh; }
        .barra-modos { margin-bottom: 15px; position: sticky; top: 0; z-index: 999; }
        .btn-cambio-modo { width: 100%; padding: 14px; border-radius: 10px; font-size: 15px; font-weight: bold; cursor: pointer; border: none; color: white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
        .btn-cambio-modo.comp { background-color: #2c313d; border: 1px solid #3b425c; }
        .btn-cambio-modo.vivo { background-color: #ff2a5f; }
        .header-cancion { background: #1a1d29; padding: 15px; border-radius: 12px; border: 1px solid #2a2f42; margin-bottom: 20px; display: flex; flex-direction: column; gap: 12px; }
        .input-titulo { background: transparent; border: none; border-bottom: 2px solid #3b425c; color: #fff; font-size: 24px; font-weight: bold; width: 100%; outline: none; }
        .titulo-vivo { font-size: 28px; color: #fff; margin: 0; }
        .control-bpm { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #8892b0; }
        .input-bpm { background: #25293c; border: 1px solid #3b425c; color: #00ffcc; font-size: 16px; font-weight: bold; padding: 5px 8px; border-radius: 6px; width: 60px; text-align: center; }
        .bpm-vivo { color: #00ffcc; font-size: 18px; font-weight: bold; }
        .selector-estructural { background: #1a1d29; padding: 12px; border-radius: 12px; border: 1px solid #2a2f42; margin-bottom: 20px; }
        .selector-estructural p { margin: 0 0 10px 0; font-size: 13px; color: #8892b0; text-transform: uppercase; }
        .botones-estructura { display: flex; flex-wrap: wrap; gap: 8px; }
        .btn-est { flex: 1; min-width: 80px; padding: 10px; border: none; border-radius: 8px; font-weight: bold; font-size: 13px; cursor: pointer; color: #fff; }
        .btn-est.intro { background-color: #3f51b5; }
        .btn-est.estrofa { background-color: #2da44e; }
        .btn-est.pre-estribillo { background-color: #00bcd4; }
        .btn-est.estribillo { background-color: #e91e63; }
        .btn-est.puente { background-color: #9c27b0; }
        .btn-est.solo { background-color: #ff9800; }
        .btn-est.final { background-color: #607d8b; }
        .lista-bloques { display: flex; flex-direction: column; gap: 20px; }
        .tarjeta-bloque { background: #1e2230; border-radius: 14px; padding: 15px; border-left: 6px solid #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        .tarjeta-bloque.intro { border-left-color: #3f51b5; }
        .tarjeta-bloque.estrofa { border-left-color: #2da44e; }
        .tarjeta-bloque.pre-estribillo { border-left-color: #00bcd4; }
        .tarjeta-bloque.estribillo { border-left-color: #e91e63; }
        .tarjeta-bloque.puente { border-left-color: #9c27b0; }
        .tarjeta-bloque.solo { border-left-color: #ff9800; }
        .tarjeta-bloque.final { border-left-color: #607d8b; }
        .encabezado-bloque { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .encabezado-bloque h3 { margin: 0; font-size: 18px; color: #fff; }
        .btn-eliminar-bloque { background: transparent; border: none; color: #ff4a4a; cursor: pointer; font-size: 13px; }
        .caja-letras { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
        .input-acordes { background: #151821; border: 1px dashed #444b66; color: #ffcc00; padding: 10px; border-radius: 6px; font-size: 15px; font-family: monospace; font-weight: bold; outline: none; }
        .acordes-vivo-txt { color: #ffcc00; font-family: monospace; font-size: 20px; font-weight: bold; background: #151821; padding: 8px; border-radius: 6px; margin-bottom: 5px; }
        .txt-letra { background: #25293c; border: 1px solid #3b425c; color: #fff; padding: 10px; border-radius: 8px; font-size: 16px; resize: vertical; outline: none; }
        .letra-vivo-txt { color: #ffffff; font-size: 18px; line-height: 1.6; margin: 5px 0 0 0; white-space: pre-wrap; }
        .input-comentarios { background: #1a1d29; border: none; color: #5af78e; padding: 8px 10px; border-radius: 6px; font-size: 13px; font-style: italic; width: 100%; box-sizing: border-box; margin-bottom: 15px; outline: none; }
        .comentario-vivo-txt { color: #5af78e; font-size: 13px; font-style: italic; background: rgba(90, 247, 142, 0.05); padding: 6px 10px; border-radius: 6px; margin-top: 5px; }
        .estudio-audio-bloque { background: #151821; padding: 12px; border-radius: 10px; border: 1px solid #25293c; }
        .btn-audio { width: 100%; padding: 12px; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .btn-audio.grabar { background: #28a745; color: white; }
        .btn-audio.grabar:disabled { background: #2c313d; color: #555; cursor: not-allowed; }
        .btn-audio.detener { background: #dc3545; color: white; animation: pulso-rojo 1.5s infinite; }
        .lista-audios-bloque { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid #25293c; padding-top: 10px; }
        .item-audio { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #1e2230; padding: 6px 10px; border-radius: 6px; }
        .nombre-audio { font-size: 12px; color: #a0aec0; }
        .reproductor-nativo { flex: 1; height: 32px; min-width: 140px; }
        .btn-borrar-audio { background: transparent; border: none; cursor: pointer; font-size: 16px; }
        .modo-vivo .lista-bloques { padding-bottom: 100px; }
        .consola-scroll-flotante { position: fixed; bottom: 15px; left: 50%; transform: translateX(-50%); background: #1a1d29; border: 2px solid #3b425c; padding: 12px 20px; border-radius: 50px; display: flex; align-items: center; gap: 15px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 1000; width: 90%; max-width: 400px; box-sizing: border-box; }
        .btn-scroll-toggle { flex: 1; padding: 10px 15px; border-radius: 25px; border: none; font-weight: bold; font-size: 14px; cursor: pointer; color: white; }
        .btn-scroll-toggle.pausado { background-color: #007bff; }
        .btn-scroll-toggle.corriendo { background-color: #ff9800; }
        .controles-velocidad { display: flex; align-items: center; gap: 8px; }
        .controles-velocidad button { background: #25293c; border: 1px solid #3b425c; color: white; width: 30px; height: 30px; border-radius: 50%; font-weight: bold; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; }
        .controles-velocidad span { font-size: 13px; color: #8892b0; min-width: 55px; text-align: center; }
        @keyframes pulso-rojo { 0% { opacity: 1; } 50% { opacity: 0.6; } 100% { opacity: 1; } }
        @media (max-width: 480px) { .item-audio { flex-direction: column; align-items: stretch; gap: 6px; } }
      `}</style>

      <div className="barra-modos">
        <button onClick={cambiarModo} className={`btn-cambio-modo ${modoEdicion ? 'comp' : 'vivo'}`}>
          {modoEdicion ? '📝 Modo: Composición' : '🎸 Modo: En Vivo / Lectura'}
        </button>
      </div>

      <header className="header-cancion">
        {modoEdicion ? (
          <input type="text" value={cancion.titulo} onChange={(e) => manejarDatosGenerales('titulo', e.target.value)} className="input-titulo" placeholder="Nombre de la canción..." />
        ) : (
          <h1 className="titulo-vivo">🎤 {cancion.titulo || 'Sin Título'}</h1>
        )}
        
        <div className="control-bpm">
          <label>Tempo: </label>
          {modoEdicion ? (
            <input type="number" value={cancion.bpm} onChange={(e) => manejarDatosGenerales('bpm', e.target.value)} className="input-bpm" />
          ) : (
            <span className="bpm-vivo">{cancion.bpm}</span>
          )}
          <span>BPM 🥁</span>
        </div>
      </header>

      {modoEdicion && (
        <div className="selector-estructural">
          <p>+ Tocar para agregar sección:</p>
          <div className="botones-estructura">
            <button onClick={() => agregarBloque('Intro')} className="btn-est intro">Intro</button>
            <button onClick={() => agregarBloque('Estrofa')} className="btn-est estrofa">Estrofa</button>
            <button onClick={() => agregarBloque('Pre-Estribillo')} className="btn-est pre-estribillo">Pre-Estri</button>
            <button onClick={() => agregarBloque('Estribillo')} className="btn-est estribillo">Estribillo</button>
            <button onClick={() => agregarBloque('Puente')} className="btn-est puente">Puente</button>
            <button onClick={() => agregarBloque('Solo')} className="btn-est solo">Solo / Riff</button>
            <button onClick={() => agregarBloque('Final')} className="btn-est final">Final</button>
          </div>
        </div>
      )}

      <main className="lista-bloques">
        {cancion.bloques.map((bloque) => (
          <div key={bloque.id} className={`tarjeta-bloque ${bloque.tipo.toLowerCase()}`}>
            
            <div className="encabezado-bloque">
              <h3>{bloque.tipo} {bloque.numero}</h3>
              {modoEdicion && (
                <button onClick={() => eliminarBloque(bloque.id)} className="btn-eliminar-bloque">❌ Quitar</button>
              )}
            </div>

            <div className="caja-letras">
              {modoEdicion ? (
                <input type="text" placeholder="Acordes de esta sección..." value={bloque.acordes} onChange={(e) => modificarBloque(bloque.id, 'acordes', e.target.value)} className="input-acordes" />
              ) : (
                bloque.acordes && <div className="acordes-vivo-txt">{bloque.acordes}</div>
              )}

              {modoEdicion ? (
                <textarea placeholder={`Escribí la letra acá...`} value={bloque.texto} onChange={(e) => modificarBloque(bloque.id, 'texto', e.target.value)} className="txt-letra" rows="3" />
              ) : (
                bloque.texto && <p className="letra-vivo-txt">{bloque.texto}</p>
              )}
            </div>

            {modoEdicion ? (
              <input type="text" placeholder="💡 Comentario de producción..." value={bloque.comentarios} onChange={(e) => modificarBloque(bloque.id, 'comentarios', e.target.value)} className="input-comentarios" />
            ) : (
              bloque.comentarios && <div className="comentario-vivo-txt">💡 {bloque.comentarios}</div>
            )}

            <div className="estudio-audio-bloque">
              {modoEdicion && (
                <div className="controles-grabadora">
                  {grabandoEnBloqueId === bloque.id ? (
                    <button onClick={detenerGrabacion} className="btn-audio detener">⏹️ Detener Grabación</button>
                  ) : (
                    <button onClick={() => iniciarGrabacion(bloque.id)} disabled={grabandoEnBloqueId !== null} className="btn-audio grabar">🎙️ Grabar Idea</button>
                  )}
                </div>
              )}

              {bloque.audios.length > 0 && (
                <div className="lista-audios-bloque">
                  {bloque.audios.map((audio) => (
                    <div key={audio.id} className="item-audio">
                      <span className="nombre-audio">🎵 {audio.nombre}:</span>
                      <audio src={audio.url} controls className="reproductor-nativo" />
                      {modoEdicion && (
                        <button onClick={() => eliminarAudio(bloque.id, audio.id)} className="btn-borrar-audio">🗑️</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ))}
      </main>

      {!modoEdicion && (
        <div className="consola-scroll-flotante">
          <button onClick={() => setScrollActivo(!scrollActivo)} className={`btn-scroll-toggle ${scrollActivo ? 'corriendo' : 'pausado'}`}>{scrollActivo ? '⏸️ Pausar Scroll' : '▶️ Auto-Scroll'}</button>
          <div className="controles-velocidad">
            <button onClick={() => setVelocidadScroll(Math.max(1, velocidadScroll - 0.5))} disabled={velocidadScroll <= 1}>-</button>
            <span>Vel: {velocidadScroll}x</span>
            <button onClick={() => setVelocidadScroll(Math.min(5, velocidadScroll + 0.5))} disabled={velocidadScroll >= 5}>+</button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;