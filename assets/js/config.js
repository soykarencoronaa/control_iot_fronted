export const DEFAULT_API_URL = 'https://vehiculo-iot-corona.duckdns.org';
export const WS_RETRY_MS = 2500;
export const API_TIMEOUT_MS = 10000;
export const EVENT_LIMIT = 30;

export function apiBase() {
  return DEFAULT_API_URL;
}

export function wsUrl() {
  const url = new URL(apiBase());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/ws`;
  return url.toString();
}
