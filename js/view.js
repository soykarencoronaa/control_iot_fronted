import { EVENT_LIMIT } from './config.js';
import { commandCode, commandLabel, isStopCommand } from './commands.js';

const byId = (id) => document.getElementById(id);
export const el = byId;

export function vehicleDisplayName(vehicle) {
  const name = String(vehicle?.nombre || '').trim();
  if (!name || name.toLocaleLowerCase('es') === 'string') return `Makasan · unidad ${vehicle?.id_vehiculo ?? ''}`;
  return name;
}

export function setIndicator(dotId, labelId, text, state) {
  byId(dotId).className = `state-dot ${state}`;
  byId(labelId).textContent = text;
}

export function renderVehicles(vehicles) {
  const select = byId('vehicle-select');
  select.replaceChildren(new Option(vehicles.length ? 'Selecciona un vehículo' : 'No hay vehículos registrados', ''));
  vehicles.forEach((v) => select.add(new Option(`${vehicleDisplayName(v)}${v.activo === false ? ' · inactivo' : ''}`, v.id_vehiculo)));
}

export function renderCommands(commands, onSelect) {
  const container = byId('command-buttons');
  container.replaceChildren();
  byId('command-count').textContent = `${commands.length} ${commands.length === 1 ? 'comando' : 'comandos'}`;
  if (!commands.length) { const p = document.createElement('p'); p.className = 'empty-note'; p.textContent = 'Este vehículo no tiene comandos activos.'; container.append(p); return; }
  commands.forEach((command) => {
    const button = document.createElement('button');
    const stop = isStopCommand(command);
    button.type = 'button'; button.className = `command-button${stop ? ' command-stop' : ''}`;
    button.dataset.commandId = command.id_comando;
    const icon = document.createElement('span'); icon.className = 'command-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = stop ? '■' : '↗';
    const label = document.createElement('span'); label.className = 'command-name'; label.textContent = commandLabel(command);
    const code = document.createElement('small'); code.textContent = `CÓDIGO ${commandCode(command)}`;
    button.append(icon, label, code); button.addEventListener('click', () => onSelect(command, { priority: stop })); container.append(button);
  });
}

export function renderDemos(demos) {
  const select = byId('demo-select'); select.replaceChildren(new Option(demos.length ? 'Selecciona una DEMO' : 'No hay DEMOs activas', ''));
  demos.filter((demo) => demo && demo.activo !== false).forEach((demo) => select.add(new Option(demo.nombre || `DEMO ${demo.id_demo}`, demo.id_demo)));
  select.disabled = select.options.length <= 1;
  byId('demo-run').disabled = select.disabled;
}

export function addEvent(event) {
  const feed = byId('event-feed');
  if (feed.querySelector('.empty-note')) feed.replaceChildren();
  const item = document.createElement('article'); item.className = 'event-item';
  const header = document.createElement('div'); header.className = 'event-meta';
  const kind = document.createElement('span'); kind.textContent = `${String(event?.tipo || 'evento')} · ${String(event?.accion || 'notificación')}`;
  const time = document.createElement('time');
  const date = event?.fecha_hora ? new Date(event.fecha_hora) : new Date(); time.textContent = Number.isNaN(date.getTime()) ? 'ahora' : date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  header.append(kind, time);
  const details = document.createElement('p');
  const data = event?.datos && typeof event.datos === 'object' ? event.datos : {};
  const summary = [data.vehiculo, data.comando, data.id_vehiculo != null ? `Vehículo #${data.id_vehiculo}` : null, data.id_comando != null ? `Comando #${data.id_comando}` : null, event?.mensaje].filter(Boolean);
  details.textContent = summary.length ? summary.join(' · ') : 'Evento recibido desde la API.';
  item.append(header, details); feed.prepend(item);
  while (feed.children.length > EVENT_LIMIT) feed.lastElementChild.remove();
}

export function showError(message) { byId('action-status').textContent = message; byId('action-status').classList.add('error-text'); }
export function showReady(message = 'Listo') { byId('action-status').textContent = message; byId('action-status').classList.remove('error-text'); }
