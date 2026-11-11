import { WS_RETRY_MS, wsUrl } from './config.js';

export function connectSocket({ onState, onEvent }) {
  let socket;
  let retryTimer;
  let stopped = false;
  let failures = 0;
  const connect = () => {
    if (stopped) return;
    onState(failures ? 'Reconectando' : 'Conectando', 'pending');
    try { socket = new WebSocket(wsUrl()); }
    catch { schedule(); return; }
    socket.addEventListener('open', () => { failures = 0; onState('En línea', 'online'); });
    socket.addEventListener('message', (event) => {
      try { onEvent(JSON.parse(event.data)); }
      catch { onEvent({ tipo: 'mensaje', datos: { mensaje: 'Se recibió un evento con formato no válido.' } }); }
    });
    socket.addEventListener('error', () => onState('Reconectando', 'pending'));
    socket.addEventListener('close', () => schedule());
  };
  const schedule = () => {
    if (stopped) return;
    failures += 1;
    onState('Reconectando', 'pending');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, Math.min(WS_RETRY_MS * failures, 10000));
  };
  connect();
  return () => { stopped = true; clearTimeout(retryTimer); socket?.close(); };
}
