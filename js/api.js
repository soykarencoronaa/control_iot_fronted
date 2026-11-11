import { API_TIMEOUT_MS, apiBase } from './config.js';

async function request(path, { method = 'GET', body, timeoutMs = API_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      method,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) {
      const detail = data && typeof data === 'object' ? data.detail : '';
      throw new Error(detail || `La API respondió HTTP ${response.status}.`);
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('La solicitud tardó demasiado. Intenta de nuevo.');
    if (error instanceof TypeError) throw new Error('No se pudo contactar la API. Revisa la conexión y la configuración CORS.');
    throw error;
  } finally { clearTimeout(timer); }
}

export const api = {
  check: () => request('/'),
  vehicles: () => request('/api/vehiculos'),
  commands: (vehicleId) => request(`/api/vehiculos/${encodeURIComponent(vehicleId)}/comandos`),
  demos: (vehicleId) => request(`/api/vehiculos/${encodeURIComponent(vehicleId)}/demos`),
  execute: (vehicleId, commandId) => request(`/api/vehiculos/${encodeURIComponent(vehicleId)}/estado`, {
    method: 'POST', body: { id_comando: commandId, conectado: true, origen: 'WEB' },
  }),
  runDemo: (vehicleId, demoId) => request(`/api/vehiculos/${encodeURIComponent(vehicleId)}/demos/${encodeURIComponent(demoId)}/ejecutar`, { method: 'POST', timeoutMs: 30 * 60 * 1000 }),
};
