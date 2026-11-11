import { api } from './api.js';
import { DEFAULT_API_URL } from './config.js';
import { activeCommands, auxiliaryCommandMap, commandLabel, directionCommand } from './commands.js';
import { connectSocket } from './socket.js';
import { addEvent, el, renderCommands, renderDemos, renderVehicles, setIndicator, showError, showReady, vehicleDisplayName } from './view.js';

let vehicles = [];
let commands = [];
let selectedVehicle = null;
let demoRunning = false;
let actionPending = false;
let pendingRequests = 0;
let socketStop;
let activeStick = null;
let stickStates = [];
let latestAction = 0;

async function checkApi() {
  setIndicator('api-dot', 'api-status', 'Comprobando', 'pending');
  try {
    const result = await api.check();
    if (result && typeof result === 'object' && result.mensaje) setIndicator('api-dot', 'api-status', 'Disponible', 'online');
    else setIndicator('api-dot', 'api-status', 'Disponible', 'online');
  } catch { setIndicator('api-dot', 'api-status', 'No disponible', 'offline'); }
}

async function loadVehicles() {
  try {
    const result = await api.vehicles();
    vehicles = Array.isArray(result) ? result : [];
    renderVehicles(vehicles);
    if (vehicles.length === 1) { el('vehicle-select').value = String(vehicles[0].id_vehiculo); await selectVehicle(); }
  } catch (error) {
    el('vehicle-select').replaceChildren(new Option('No se pudieron cargar vehículos', ''));
    showError(error.message);
  }
}

async function selectVehicle() {
  const id = el('vehicle-select').value;
  selectedVehicle = vehicles.find((vehicle) => String(vehicle.id_vehiculo) === id) || null;
  commands = [];
  updateStickLabels();
  el('selected-name').textContent = selectedVehicle ? vehicleDisplayName(selectedVehicle) : 'Selecciona una unidad';
  el('demo-select').disabled = true; el('demo-select').replaceChildren(new Option('Cargando DEMOs…', '')); el('demo-run').disabled = true;
  renderCommands([], () => {});
  if (!selectedVehicle) { el('command-buttons').firstElementChild.textContent = 'Selecciona un vehículo para consultar sus comandos.'; return; }
  showReady('Consultando catálogo…');
  try {
    const [commandResult, demoResult] = await Promise.all([api.commands(id), api.demos(id)]);
    if (String(selectedVehicle.id_vehiculo) !== id) return;
    commands = activeCommands(commandResult);
    updateStickLabels();
    renderCommands(commands, sendCommand);
    renderDemos(Array.isArray(demoResult) ? demoResult : []);
    showReady(`${commands.length} comandos disponibles`);
  } catch (error) { showError(error.message); }
}

async function sendCommand(command, { priority = false } = {}) {
  if (!selectedVehicle || (actionPending && !priority) || (demoRunning && !priority)) return;
  actionPending = true;
  pendingRequests += 1;
  const actionId = ++latestAction;
  const buttons = [...document.querySelectorAll('.command-button, .joy-key')];
  const stopId = String(directionCommand(commands, 'stop')?.id_comando ?? '');
  buttons.forEach((button) => { button.disabled = button.dataset.direction !== 'stop' && button.dataset.commandId !== stopId; });
  el('last-command').textContent = commandLabel(command);
  showReady('Solicitado · esperando API…');
  try {
    await api.execute(selectedVehicle.id_vehiculo, command.id_comando);
    if (actionId === latestAction) showReady('Aceptado por API · esperando evento');
  } catch (error) { if (actionId === latestAction) showError(error.message); }
  finally {
    pendingRequests = Math.max(0, pendingRequests - 1);
    actionPending = pendingRequests > 0;
    buttons.forEach((button) => { if (!button.isConnected) return; const isStop = button.dataset.direction === 'stop' || button.dataset.commandId === stopId; button.disabled = demoRunning && !isStop; });
    if (!actionPending && !demoRunning && activeStick?.engaged && activeStick.queuedDirection) {
      const { group, queuedDirection } = activeStick;
      activeStick.queuedDirection = null;
      handleStickDirection(group, queuedDirection);
    }
  }
}

function handleDirection(direction) {
  const command = directionCommand(commands, direction);
  if (command) sendCommand(command, { priority: direction === 'stop' });
  else { showError(`No hay comando del catálogo que corresponda a «${direction}».`); }
}

function getStickMaps() {
  const primary = Object.fromEntries(['up', 'down', 'left', 'right'].map((direction) => [direction, directionCommand(commands, direction) || null]));
  const reserved = new Set([...Object.values(primary), directionCommand(commands, 'stop')].filter(Boolean).map((command) => command.id_comando));
  const remaining = commands.filter((command) => !reserved.has(command.id_comando));
  return { drive: primary, implement: auxiliaryCommandMap(remaining) };
}

function updateStickLabels() {
  const maps = getStickMaps();
  const labelIds = {
    drive: { up: 'drive-up-label', left: 'drive-left-label', right: 'drive-right-label', down: 'drive-down-label' },
    implement: { up: 'implement-up-label', left: 'implement-left-label', right: 'implement-right-label', down: 'implement-down-label' },
  };
  for (const group of ['drive', 'implement']) {
    for (const direction of ['up', 'left', 'right', 'down']) {
      const label = el(labelIds[group][direction]);
      const command = maps[group][direction];
      const text = command ? commandLabel(command) : 'SIN COMANDO';
      label.textContent = text.toLocaleUpperCase('es');
      label.title = text;
      label.setAttribute('aria-label', `${direction}: ${text}`);
    }
  }
}

function handleStickDirection(group, direction) {
  const command = getStickMaps()[group]?.[direction];
  if (command) sendCommand(command);
  else showError(`El catálogo no tiene un comando asignado a ${direction} en el joystick ${group === 'drive' ? 'de traslación' : 'del brazo'}.`);
}

async function runDemo() {
  if (!selectedVehicle || demoRunning || actionPending) return;
  const demoId = el('demo-select').value;
  if (!demoId) return;
  demoRunning = true; el('demo-run').disabled = true;
  el('demo-note').textContent = 'DEMO en ejecución. Los eventos aparecen aquí conforme los emite la API.';
  document.querySelectorAll('.command-button, .joy-key').forEach((button) => { button.disabled = button.dataset.direction !== 'stop' && button.dataset.commandId !== String(directionCommand(commands, 'stop')?.id_comando); });
  el('demo-note').textContent = 'La API actual no expone cancelación de DEMO. DETENER tiene prioridad local, pero no interrumpe la secuencia del servidor.';
  try {
    await api.runDemo(selectedVehicle.id_vehiculo, demoId);
    el('demo-note').textContent = 'La API informó que la DEMO finalizó.';
  } catch (error) { el('demo-note').textContent = `No se completó: ${error.message}`; }
  finally {
    demoRunning = false; el('demo-run').disabled = !el('demo-select').value;
    const stopId = String(directionCommand(commands, 'stop')?.id_comando ?? '');
    document.querySelectorAll('.command-button, .joy-key').forEach((button) => {
      const isStop = button.dataset.direction === 'stop' || button.dataset.commandId === stopId;
      button.disabled = actionPending && !isStop;
    });
  }
}

function configureJoystick() {
  stickStates = [];
  const keyDirections = { ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };

  const bindStick = (padId, knobId, group) => {
    const pad = el(padId);
    const knob = el(knobId);
    const state = { pad, knob, group, pointerId: null, direction: null, queuedDirection: null, engaged: false, key: null };
    stickStates.push(state);

    const reset = () => {
      knob.style.setProperty('--stick-x', '0px');
      knob.style.setProperty('--stick-y', '0px');
      pad.setAttribute('aria-label', `Joystick ${group === 'drive' ? 'de traslación' : 'de brazo'} centrado. Arrastra la perilla o usa las flechas.`);
    };

    const stop = ({ sendCommand = true } = {}) => {
      const shouldStop = Boolean(state.direction || state.engaged);
      state.direction = null;
      state.queuedDirection = null;
      state.pointerId = null;
      state.key = null;
      state.engaged = false;
      pad.classList.remove('stick-active');
      if (activeStick === state) activeStick = null;
      reset();
      if (sendCommand && shouldStop) handleDirection('stop');
    };
    state.stop = stop;

    const update = (clientX, clientY) => {
      const rect = pad.getBoundingClientRect();
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);
      const travel = rect.width * .17;
      const scale = distance > travel ? travel / distance : 1;
      knob.style.setProperty('--stick-x', `${dx * scale}px`);
      knob.style.setProperty('--stick-y', `${dy * scale}px`);
      const next = distance < rect.width * .2 ? null
        : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right')
          : (dy < 0 ? 'up' : 'down');

      if (next && next !== state.direction) {
        state.direction = next;
        state.engaged = true;
        activeStick = state;
        pad.setAttribute('aria-label', `Joystick ${group === 'drive' ? 'de traslación' : 'de brazo'}: ${el(`${group}-` + ({ up: 'up', left: 'left', right: 'right', down: 'down' }[next]) + '-label').textContent}. Suelta para detener.`);
        if (actionPending) state.queuedDirection = next;
        else handleStickDirection(group, next);
      } else if (!next && state.direction) {
        state.direction = null;
        state.queuedDirection = null;
        state.engaged = false;
        handleDirection('stop');
      }
    };

    pad.addEventListener('pointerdown', (event) => {
      if ((activeStick && activeStick !== state) || demoRunning || actionPending) return;
      event.preventDefault();
      state.pointerId = event.pointerId;
      activeStick = state;
      pad.setPointerCapture(event.pointerId);
      pad.classList.add('stick-active');
      update(event.clientX, event.clientY);
    });
    pad.addEventListener('pointermove', (event) => { if (state.pointerId === event.pointerId) update(event.clientX, event.clientY); });
    pad.addEventListener('pointerup', (event) => { if (state.pointerId === event.pointerId) stop(); });
    pad.addEventListener('pointercancel', (event) => { if (state.pointerId === event.pointerId) stop(); });
    pad.addEventListener('lostpointercapture', (event) => { if (state.pointerId === event.pointerId) stop(); });
    pad.addEventListener('keydown', (event) => {
      const direction = keyDirections[event.key];
      if (!direction || demoRunning || (activeStick && activeStick !== state)) return;
      event.preventDefault();
      if (direction === state.direction) return;
      state.key = event.key;
      state.direction = direction;
      state.engaged = true;
      activeStick = state;
      pad.classList.add('stick-active');
      const axis = { up: 'up', down: 'down', left: 'left', right: 'right' }[direction];
      pad.setAttribute('aria-label', `Joystick ${group === 'drive' ? 'de traslación' : 'de brazo'}: ${el(`${group}-${axis}-label`).textContent}. Suelta para detener.`);
      if (actionPending) state.queuedDirection = direction;
      else handleStickDirection(group, direction);
    });
    pad.addEventListener('keyup', (event) => {
      if (!keyDirections[event.key] || !state.direction || (state.key && state.key !== event.key)) return;
      event.preventDefault();
      stop();
    });
    pad.addEventListener('blur', () => { if (state.key) stop(); });
  };

  bindStick('joystick', 'stick-knob', 'drive');
  bindStick('implement-joystick', 'implement-stick-knob', 'implement');
  el('joystick-stop').addEventListener('click', () => {
    if (activeStick?.stop) activeStick.stop({ sendCommand: false });
    handleDirection('stop');
  });
}

function startSocket() {
  socketStop?.();
  socketStop = connectSocket({
    onState: (text, state) => setIndicator('ws-dot', 'ws-status', text, state),
    onEvent: addEvent,
  });
}

function configureSettings() {
  const dialog = el('settings-dialog');
  el('api-url').value = localStorage.getItem('control-iot-api-url') || DEFAULT_API_URL;
  el('settings-open').addEventListener('click', () => dialog.showModal());
  el('settings-close').addEventListener('click', () => dialog.close());
  el('settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (event.submitter?.id !== 'settings-save') { dialog.close(); return; }
    const value = el('api-url').value.trim().replace(/\/+$/, '');
    if (!/^https:\/\//i.test(value)) { el('api-url').setCustomValidity('Usa una dirección HTTPS pública.'); el('api-url').reportValidity(); return; }
    el('api-url').setCustomValidity('');
    localStorage.setItem('control-iot-api-url', value);
    dialog.close(); startSocket(); checkApi(); loadVehicles();
  });
}

el('vehicle-select').addEventListener('change', selectVehicle);
el('demo-select').addEventListener('change', () => { el('demo-run').disabled = !el('demo-select').value || demoRunning; });
el('demo-run').addEventListener('click', runDemo);
el('clear-events').addEventListener('click', () => { const feed = el('event-feed'); feed.replaceChildren(); const note = document.createElement('div'); note.className = 'empty-note'; note.textContent = 'Aún no se han recibido eventos.'; feed.append(note); });
configureJoystick(); configureSettings(); startSocket(); checkApi(); loadVehicles();
setInterval(checkApi, 30000);
