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
