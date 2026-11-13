import { api } from './api.js';
import { activeCommands, auxiliaryCommandMap, commandLabel, directionCommand, isOutputCommand, outputCommandMap, outputKindOf } from './commands.js';
import { connectSocket } from './socket.js';
import { addEvent, el, renderCommands, renderDemos, renderHistory, renderOutputControls, setCurrentMovement, setDemoProgress, setIndicator, setOutputState, showError, showReady, vehicleDisplayName } from './view.js';

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
let liveHistory = [];
let apiHistory = [];
let historyPage = 0;
function readEstimatedState(kind) {
  try {
    const value = sessionStorage.getItem(`makasan-${kind}-state-estimate`);
    return value === 'on' || value === 'off' ? value : null;
  } catch { return null; }
}
const outputStates = { led: readEstimatedState('led'), sound: readEstimatedState('sound') };
const expectedOutputEvents = new Map();

function applyOutputCommand(command, kind, intent) {
  if (!kind) return;
  const map = outputCommandMap(commands, kind);
  if (intent === 'on' || (map.on && String(map.on.id_comando) === String(command.id_comando))) {
    outputStates[kind] = 'on';
    try { sessionStorage.setItem(`makasan-${kind}-state-estimate`, 'on'); } catch { /* almacenamiento opcional */ }
    setOutputState(kind, 'on'); return;
  }
  if (intent === 'off' || (map.off && String(map.off.id_comando) === String(command.id_comando))) {
    outputStates[kind] = 'off';
    try { sessionStorage.setItem(`makasan-${kind}-state-estimate`, 'off'); } catch { /* almacenamiento opcional */ }
    setOutputState(kind, 'off'); return;
  }
  const isSingleToggle = map.actions.length === 1 && String(map.actions[0].id_comando) === String(command.id_comando);
  if (intent === 'toggle' || isSingleToggle) {
    const initialUnknown = outputStates[kind] === null;
    outputStates[kind] = outputStates[kind] === 'on' ? 'off' : 'on';
    const note = initialUnknown
      ? 'Estimación desde apagado inicial; el equipo no reporta su estado físico.'
      : 'Estimado por los pulsos aceptados en esta sesión; no es confirmación física.';
    try { sessionStorage.setItem(`makasan-${kind}-state-estimate`, outputStates[kind]); } catch { /* almacenamiento opcional */ }
    setOutputState(kind, outputStates[kind], note);
  }
}

function allHistory() {
  const merged = [...liveHistory, ...apiHistory].sort((a, b) => b.timestamp - a.timestamp);
  const seen = new Set();
  return merged.filter((item) => {
    const key = `${item.commandId ?? item.title}|${item.timestamp}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 30);
}

function refreshHistory() { historyPage = renderHistory(allHistory(), historyPage); }

function recordLiveEvent(event) {
  const isMovement = event?.tipo === 'estado_vehiculo'
    || (event?.tipo === 'demo' && ['ejecutar_movimiento', 'finalizada'].includes(event?.accion));
  if (!isMovement) return;
  const record = addEvent(event, commands);
  liveHistory.unshift(record);
  liveHistory = liveHistory.slice(0, 30);
  setCurrentMovement(record);
  refreshHistory();
  const eventData = event?.datos || {};
  const command = commands.find((item) => String(item.id_comando) === String(eventData.id_comando));
  if (command && (event.tipo === 'estado_vehiculo' || event.tipo === 'demo')) {
    const kind = outputKindOf(command);
    if (kind) {
      const pending = expectedOutputEvents.get(String(command.id_comando));
      if (pending) pending.seen = true;
      else applyOutputCommand(command, kind, 'action');
    }
  }
  if (event?.tipo === 'demo' && event?.accion === 'ejecutar_movimiento') {
    const movementCommand = commands.find((item) => String(item.id_comando) === String(eventData.id_comando));
    setDemoProgress('running', `DEMO en ejecución · paso ${eventData.orden ?? '…'}${movementCommand ? ` · ${commandLabel(movementCommand)}` : ''}`);
  } else if (event?.tipo === 'demo' && event?.accion === 'finalizada') {
    setDemoProgress('done', 'La API informó que la DEMO finalizó.');
  }
}

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
    vehicles = Array.isArray(result) ? result.filter((vehicle) => vehicle && vehicle.activo !== false) : [];
    const vehicle = vehicles[0];
    if (!vehicle) { el('selected-name').textContent = 'No hay una unidad activa'; showError('La API no devolvió vehículos activos.'); return; }
    el('selected-name').textContent = vehicleDisplayName(vehicle);
    selectedVehicle = vehicle;
    await selectVehicle();
  } catch (error) {
    showError(error.message);
  }
}

async function selectVehicle() {
  const id = String(selectedVehicle?.id_vehiculo ?? '');
  commands = [];
  updateStickLabels();
  el('demo-select').disabled = true; el('demo-select').replaceChildren(new Option('Cargando DEMOs…', '')); el('demo-run').disabled = true;
  renderCommands([]);
  if (!selectedVehicle) return;
  showReady('Consultando catálogo…');
  try {
    const [commandResult, demoResult] = await Promise.all([api.commands(id), api.demos(id)]);
    if (String(selectedVehicle.id_vehiculo) !== id) return;
    commands = activeCommands(commandResult);
    updateStickLabels();
    renderCommands(commands);
    renderDemos(Array.isArray(demoResult) ? demoResult : []);
    renderOutputControls(commands, outputStates, sendOutputCommand);
    for (const kind of ['led', 'sound']) {
      if (outputStates[kind]) setOutputState(kind, outputStates[kind], 'Estimado a partir de pulsos enviados anteriormente en esta pestaña.');
    }
    try {
      const state = await api.state(id);
      const lastCommand = commands.find((command) => String(command.id_comando) === String(state.id_comando));
      const kind = lastCommand ? outputKindOf(lastCommand) : null;
      if (kind) {
        const map = outputCommandMap(commands, kind);
        if (map.on && String(map.on.id_comando) === String(lastCommand.id_comando)) { outputStates[kind] = 'on'; setOutputState(kind, 'on'); }
        else if (map.off && String(map.off.id_comando) === String(lastCommand.id_comando)) { outputStates[kind] = 'off'; setOutputState(kind, 'off'); }
      }
    } catch { /* no hay estado inicial registrado */ }
    await loadVehicleHistory(id);
    showReady(`${commands.length} comandos disponibles`);
  } catch (error) { showError(error.message); }
}

async function loadVehicleHistory(id = selectedVehicle?.id_vehiculo) {
  if (!id) return;
  try {
    const rows = await api.history(id);
    apiHistory = (Array.isArray(rows) ? rows : []).map((row) => {
      const data = { ...row };
      if (!data.comando) data.comando = data.nombre_comando || data.comando_nombre || data.accion || data.nombre;
      const shaped = addEvent({ tipo: 'historial', accion: data.origen || 'movimiento', datos: data, fecha_hora: data.fecha_hora || data.fecha || data.fecha_registro || data.created_at }, commands);
      return shaped;
    }).sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);
    if (apiHistory.length && !liveHistory.length) setCurrentMovement(apiHistory[0]);
  } catch { apiHistory = []; }
  refreshHistory();
}

async function sendCommand(command, { priority = false, outputKind = null, intent = 'action' } = {}) {
  if (!selectedVehicle || (actionPending && !priority) || (demoRunning && !priority)) return;
  actionPending = true;
  pendingRequests += 1;
  const actionId = ++latestAction;
  const buttons = [...document.querySelectorAll('.command-button, .joy-key, .output-action')];
  const stopId = String(directionCommand(commands, 'stop')?.id_comando ?? '');
  buttons.forEach((button) => { button.disabled = button.dataset.direction !== 'stop' && button.dataset.commandId !== stopId; });
  showReady('Solicitado · esperando API…');
  if (outputKind) expectedOutputEvents.set(String(command.id_comando), { seen: false });
  try {
    await api.execute(selectedVehicle.id_vehiculo, command.id_comando);
    if (outputKind) { applyOutputCommand(command, outputKind, intent); expectedOutputEvents.delete(String(command.id_comando)); }
    const record = { title: commandLabel(command), detail: 'Orden aceptada por la API', category: 'comando', time: new Date().toLocaleTimeString('es-MX'), timestamp: Date.now(), commandId: command.id_comando };
    setCurrentMovement(record); liveHistory.unshift(record); liveHistory = liveHistory.slice(0, 30); refreshHistory();
    if (actionId === latestAction) showReady('Aceptado por API · esperando evento');
  } catch (error) {
    const pendingOutput = outputKind ? expectedOutputEvents.get(String(command.id_comando)) : null;
    if (pendingOutput?.seen) applyOutputCommand(command, outputKind, intent);
    if (outputKind) expectedOutputEvents.delete(String(command.id_comando));
    if (actionId === latestAction) showError(error.message);
  }
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

function sendOutputCommand(command, intent) {
  sendCommand(command, { outputKind: outputKindOf(command), intent });
}

function handleDirection(direction) {
  const command = directionCommand(commands, direction);
  if (command) sendCommand(command, { priority: direction === 'stop' });
  else { showError(`No hay comando del catálogo que corresponda a «${direction}».`); }
}

function getStickMaps() {
  const primary = Object.fromEntries(['up', 'down', 'left', 'right'].map((direction) => [direction, directionCommand(commands, direction) || null]));
  const reserved = new Set([...Object.values(primary), directionCommand(commands, 'stop')].filter(Boolean).map((command) => command.id_comando));
  const remaining = commands.filter((command) => !reserved.has(command.id_comando) && !isOutputCommand(command));
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
  setDemoProgress('running', 'DEMO en ejecución · esperando los pasos que envía la API…');
  document.querySelectorAll('.command-button, .joy-key, .output-action').forEach((button) => { button.disabled = true; });
  try {
    await api.runDemo(selectedVehicle.id_vehiculo, demoId);
    setDemoProgress('done', 'La API informó que la DEMO finalizó.');
  } catch (error) { setDemoProgress('error', `No se completó: ${error.message}`); }
  finally {
    demoRunning = false; el('demo-run').disabled = !el('demo-select').value;
    const stopId = String(directionCommand(commands, 'stop')?.id_comando ?? '');
    document.querySelectorAll('.command-button, .joy-key, .output-action').forEach((button) => {
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
    onEvent: recordLiveEvent,
  });
}

function configureTabs() {
  const buttons = [...document.querySelectorAll('.tab-button')];
  const views = [...document.querySelectorAll('.tab-view')];
  const activate = (name) => {
    for (const button of buttons) {
      const active = button.dataset.tab === name;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }
    for (const view of views) {
      const active = view.dataset.view === name;
      view.hidden = !active;
      view.classList.toggle('is-active', active);
    }
    if (name === 'history') loadVehicleHistory();
  };
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => activate(button.dataset.tab));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus(); activate(buttons[next].dataset.tab);
    });
  });
  el('history-prev').addEventListener('click', () => { historyPage = Math.max(0, historyPage - 1); refreshHistory(); });
  el('history-next').addEventListener('click', () => { historyPage += 1; refreshHistory(); });
  el('refresh-history').addEventListener('click', () => loadVehicleHistory());
}

el('demo-select').addEventListener('change', () => { el('demo-run').disabled = !el('demo-select').value || demoRunning; });
el('demo-run').addEventListener('click', runDemo);
configureJoystick(); configureTabs(); startSocket(); checkApi(); loadVehicles();
setInterval(checkApi, 30000);
