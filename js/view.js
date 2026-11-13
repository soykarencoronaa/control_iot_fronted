import { EVENT_LIMIT } from './config.js';
import { commandCode, commandLabel, outputCommandMap } from './commands.js';

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
  const picker = byId('vehicle-select');
  if (!picker) return;
  picker.replaceChildren(new Option(vehicles.length ? 'Selecciona un vehículo' : 'No hay vehículos registrados', ''));
  vehicles.forEach((v) => picker.add(new Option(`${vehicleDisplayName(v)}${v.activo === false ? ' · inactivo' : ''}`, v.id_vehiculo)));
}

export function renderCommands(commands, onSelect) {
  byId('command-count').textContent = `${commands.length} comandos`;
}

export function renderDemos(demos) {
  const select = byId('demo-select');
  const active = demos.filter((demo) => demo && demo.activo !== false);
  select.replaceChildren(new Option(active.length ? 'Selecciona una DEMO' : 'No hay DEMOs activas', ''));
  active.forEach((demo) => select.add(new Option(demo.nombre || `DEMO ${demo.id_demo}`, demo.id_demo)));
  select.disabled = active.length === 0;
  byId('demo-run').disabled = active.length === 0;
}

export function setDemoProgress(state, message) {
  const progress = byId('demo-progress');
  progress.dataset.state = state;
  byId('demo-note').textContent = message;
  byId('demo-progress-icon').textContent = state === 'running' ? '↻' : state === 'error' ? '!' : state === 'done' ? '✓' : '·';
}

function outputElements(kind) {
  return {
    card: byId(`${kind}-card`), status: byId(`${kind}-status`), detail: byId(`${kind}-detail`), actions: byId(`${kind}-actions`),
  };
}

export function setOutputState(kind, state, message = '') {
  const { card, status, detail } = outputElements(kind);
  card.dataset.state = state || 'unknown';
  status.textContent = state === 'on' ? 'Encendido · estimado' : state === 'off' ? 'Apagado · estimado' : message || 'Estado sin confirmar';
  if (state === 'on' || state === 'off') detail.textContent = message || 'Estimado desde los pulsos aceptados; el equipo no reporta estado físico.';
}

function addOutputButton(container, command, intent, onCommand, kind) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'output-action'; button.dataset.commandId = command.id_comando;
  button.textContent = intent === 'on' ? 'Encender' : intent === 'off' ? 'Apagar' : intent === 'toggle' ? `Alternar ${kind === 'led' ? 'LED' : 'sonido'}` : commandLabel(command);
  button.title = `${commandLabel(command)} · código ${commandCode(command)}`;
  button.addEventListener('click', () => onCommand(command, intent));
  container.append(button);
}

export function renderOutputControls(commands, states, onCommand) {
  for (const kind of ['led', 'sound']) {
    const map = outputCommandMap(commands, kind);
    const { actions, detail, status } = outputElements(kind);
    actions.replaceChildren();
    const matched = Boolean(map.on || map.off || map.actions.length);
    if (!matched) {
      status.textContent = kind === 'led' ? 'LED no registrado' : 'Sonido no registrado';
      detail.textContent = 'La API no incluye este control en el catálogo activo.';
      const note = document.createElement('span'); note.className = 'output-empty'; note.textContent = 'Agrega los comandos y códigos compatibles al catálogo del vehículo.';
      actions.append(note);
      continue;
    }
    detail.textContent = map.on && map.off ? 'Control independiente encendido / apagado.' : map.actions.length === 1 ? 'Un pulso alterna encendido y apagado.' : 'Órdenes del catálogo activo.';
    if (map.on) addOutputButton(actions, map.on, 'on', onCommand, kind);
    if (map.off) addOutputButton(actions, map.off, 'off', onCommand, kind);
    for (const command of map.actions) addOutputButton(actions, command, map.actions.length === 1 && !map.on && !map.off ? 'toggle' : 'action', onCommand, kind);
    if (states[kind] === null || states[kind] === undefined) setOutputState(kind, null, 'Listo para enviar una orden');
  }
}

export function summarizeEvent(event, commands = []) {
  const data = event?.datos && typeof event.datos === 'object' ? event.datos : event || {};
  const command = commands.find((item) => String(item.id_comando) === String(data.id_comando));
  const label = data.comando || data.nombre_comando || command?.nombre || (data.id_comando != null ? `Comando #${data.id_comando}` : null);
  const vehicle = data.vehiculo || data.nombre_vehiculo || (data.id_vehiculo != null ? `Unidad #${data.id_vehiculo}` : null);
  const category = event?.tipo || data.tipo || 'evento';
  const action = event?.accion || data.accion || 'actividad';
  const timeValue = event?.fecha_hora || event?.fecha || data.fecha_hora || data.fecha || data.created_at;
  const date = timeValue ? new Date(timeValue) : new Date();
  return {
    title: [label, data.movimiento].filter(Boolean).join(' · ') || `${category} · ${action}`,
    detail: [vehicle, data.origen, data.id_demo != null ? `DEMO #${data.id_demo}` : null].filter(Boolean).join(' · ') || `${category} · ${action}`,
    category: String(category),
    time: Number.isNaN(date.getTime()) ? 'ahora' : date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    timestamp: Number.isNaN(date.getTime()) ? Date.now() : date.getTime(),
    commandId: data.id_comando ?? null,
  };
}

export function renderHistory(records, page, pageSize = 8) {
  const list = byId('history-list');
  const pageCount = Math.max(1, Math.ceil(records.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * pageSize;
  const visible = records.slice(start, start + pageSize);
  list.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('p'); empty.className = 'history-empty'; empty.textContent = 'Todavía no hay movimientos registrados.'; list.append(empty);
  } else {
    for (const record of visible) {
      const row = document.createElement('article'); row.className = 'history-entry';
      const time = document.createElement('time'); time.className = 'history-entry-time'; time.textContent = record.time || '—';
      const copy = document.createElement('div'); copy.className = 'history-entry-copy';
      const title = document.createElement('strong'); title.textContent = record.title || 'Actividad del vehículo';
      const detail = document.createElement('span'); detail.textContent = record.detail || 'Registro recibido';
      copy.append(title, detail);
      const tag = document.createElement('span'); tag.className = 'history-entry-tag'; tag.textContent = record.category || 'evento';
      row.append(time, copy, tag); list.append(row);
    }
  }
  byId('history-page-label').textContent = `${records.length} ${records.length === 1 ? 'evento' : 'eventos'}`;
  byId('history-range').textContent = records.length ? `${start + 1}–${Math.min(start + pageSize, records.length)} de ${records.length}` : 'Sin registros';
  byId('history-prev').disabled = currentPage <= 0;
  byId('history-next').disabled = currentPage >= pageCount - 1;
  byId('history-count').textContent = String(records.length);
  return currentPage;
}

export function setCurrentMovement(record) {
  byId('history-current').textContent = record?.title || 'Esperando actividad de la excavadora';
  byId('history-current-time').textContent = record ? `${record.time} · ${record.detail}` : 'El evento más reciente aparecerá aquí.';
  byId('last-command').textContent = record?.title || 'Esperando comando';
  byId('movement-live-dot').classList.toggle('is-live', Boolean(record));
}

export function addEvent(event, commands = []) { return summarizeEvent(event, commands); }
export function showError(message) { byId('action-status').textContent = message; byId('action-status').classList.add('error-text'); }
export function showReady(message = 'Listo') { byId('action-status').textContent = message; byId('action-status').classList.remove('error-text'); }
