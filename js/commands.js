const directions = {
  up: ['avanzar', 'adelante', 'forward', 'front'],
  down: ['retroceder', 'reversa', 'reverso', 'atras', 'atrás', 'reverse', 'back'],
  left: ['izquierda', 'girar izquierda', 'left'],
  right: ['derecha', 'girar derecha', 'right'],
  stop: ['detener', 'alto', 'parar', 'stop', 'frenar'],
};

export function commandLabel(command) { return String(command?.nombre || `Comando ${command?.id_comando ?? ''}`); }
export function commandCode(command) { return command?.codigo === undefined ? '—' : String(command.codigo); }
export function activeCommands(value) { return Array.isArray(value) ? value.filter((c) => c && c.activo !== false && c.id_comando != null) : []; }
export function isStopCommand(command) { return /detener|alto|parar|stop|frenar/i.test(commandLabel(command)); }
export function directionCommand(commands, direction) {
  const terms = directions[direction] || [];
  return commands.find((command) => terms.some((term) => commandLabel(command).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(term.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))));
}

const implementDirections = {
  up: ['subir', 'elevar', 'levantar', 'ascender', 'arriba', 'raise', 'lift', 'up'],
  down: ['bajar', 'descender', 'abajo', 'lower', 'down'],
  left: ['izquierda', 'izquierdo', 'left', 'anticlockwise'],
  right: ['derecha', 'derecho', 'right', 'clockwise'],
};

function normalizeName(value) {
  return String(value).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function outputKindOf(command) {
  const label = normalizeName(`${command?.nombre || ''} ${command?.descripcion || ''}`).replace(/[^a-z0-9]+/g, ' ');
  if (/\b(led|luz|luces|lampara|faro|light)\b/.test(label)) return 'led';
  if (/\b(sonido|audio|bocina|claxon|speaker|sound|beep|melodia)\b/.test(label)) return 'sound';
  return null;
}

export function isOutputCommand(command) { return outputKindOf(command) !== null; }

export function outputCommandMap(commands, kind) {
  const selected = commands.filter((command) => outputKindOf(command) === kind);
  const onWords = /\b(encender|enciende|prender|prende|activar|activa|encendido|encendida|on)\b/;
  const offWords = /\b(apagar|apaga|desactivar|desactiva|apagado|apagada|off)\b/;
  const on = selected.find((command) => onWords.test(normalizeName(commandLabel(command)).replace(/[^a-z0-9]+/g, ' ')));
  const off = selected.find((command) => offWords.test(normalizeName(commandLabel(command)).replace(/[^a-z0-9]+/g, ' ')));
  const actions = selected.filter((command) => command !== on && command !== off);
  return { on: on || null, off: off || null, actions };
}

export function auxiliaryCommandMap(candidates) {
  const result = { up: null, down: null, left: null, right: null };
  const used = new Set();
  for (const direction of ['up', 'down', 'left', 'right']) {
    const command = candidates.find((item) => !used.has(item.id_comando)
      && implementDirections[direction].some((term) => normalizeName(commandLabel(item)).includes(normalizeName(term))));
    if (command) { result[direction] = command; used.add(command.id_comando); }
  }
  const fallbackOrder = ['up', 'right', 'down', 'left'];
  for (const command of candidates) {
    if (used.has(command.id_comando)) continue;
    const slot = fallbackOrder.find((direction) => result[direction] === null);
    if (!slot) break;
    result[slot] = command;
    used.add(command.id_comando);
  }
  return result;
}
