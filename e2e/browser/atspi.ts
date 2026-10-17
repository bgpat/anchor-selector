/** Find and click browser UI through AT-SPI. Runs under gjs, not Bun. */
import System from 'system';
import Atspi from 'gi://Atspi?version=2.0';
import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib?version=2.0';

type Button = 'left' | 'middle' | 'right';
type Prefer = 'top' | 'bottom';

type Box = {
  name: string;
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
  actionable: boolean;
};

type Query = {
  command: string;
  name: string;
  role: string;
  exact: boolean;
  prefer: Prefer;
  timeout: number;
  exclude: string;
  app: string;
  button: Button;
  x: number;
  y: number;
  duration: number;
  pauseMs: number;
  text: string;
  submit: boolean;
  selectAll: boolean;
  maxNodes: number;
};

function scanLimit(query: Query): number {
  return query.maxNodes > 0 ? query.maxNodes : 400;
}

type Limit = {
  depth: number;
  nodes: number;
};

type Node = {
  depth: number;
  name: string;
  role: string;
  rect: Atspi.Rect | null;
  obj: Atspi.Accessible;
};

type Found = {
  box: Box;
  obj: Atspi.Accessible;
};

function fail(message: string): never {
  printerr(message);
  return System.exit(1);
}

function extents(obj: Atspi.Accessible): Atspi.Rect | null {
  try {
    const component = obj.get_component_iface();
    if (component == null) {
      return null;
    }
    return component.get_extents(Atspi.CoordType.SCREEN);
  } catch {
    return null;
  }
}

function objectName(obj: Atspi.Accessible): string {
  try {
    return obj.get_name() || '';
  } catch {
    return '';
  }
}

function roleName(obj: Atspi.Accessible): string {
  try {
    return obj.get_role_name() || '';
  } catch {
    return '';
  }
}

function isActionable(obj: Atspi.Accessible): boolean {
  try {
    const state = obj.get_state_set();
    if (state == null) {
      return true;
    }
    if (!state.contains(Atspi.StateType.ENABLED)) {
      return false;
    }
    if (!state.contains(Atspi.StateType.SENSITIVE)) {
      return false;
    }
    if (!state.contains(Atspi.StateType.SHOWING)) {
      return false;
    }
  } catch {
    return true;
  }
  return true;
}

function* walk(
  obj: Atspi.Accessible | null,
  depth: number,
  limit: Limit,
): Generator<Node> {
  if (obj == null || depth > limit.depth || limit.nodes <= 0) {
    return;
  }
  limit.nodes -= 1;
  yield {
    depth,
    name: objectName(obj),
    role: roleName(obj),
    rect: extents(obj),
    obj,
  };
  let count = 0;
  try {
    count = obj.get_child_count();
  } catch {
    return;
  }
  for (let index = 0; index < count; index += 1) {
    let child: Atspi.Accessible | null = null;
    try {
      child = obj.get_child_at_index(index);
    } catch {
      continue;
    }
    yield* walk(child, depth + 1, limit);
  }
}

function* apps(appFilter: string): Generator<Atspi.Accessible> {
  const desktop = Atspi.get_desktop(0);
  const count = desktop.get_child_count();
  for (let index = 0; index < count; index += 1) {
    let app: Atspi.Accessible | null = null;
    try {
      app = desktop.get_child_at_index(index);
    } catch {
      continue;
    }
    if (app == null) {
      continue;
    }
    const name = objectName(app).toLowerCase();
    if (appFilter !== '' && !name.includes(appFilter)) {
      continue;
    }
    yield app;
  }
}

function* candidates(appFilter: string, maxNodes: number): Generator<Node> {
  const limit = { depth: 14, nodes: maxNodes };
  for (const app of apps(appFilter)) {
    yield* walk(app, 0, limit);
  }
}

function nameMatches(
  actual: string,
  expected: string,
  exact: boolean,
): boolean {
  if (expected === '') {
    return true;
  }
  if (exact) {
    return actual === expected;
  }
  return actual.includes(expected);
}

function matching(query: Query): Found[] {
  const found: Found[] = [];
  for (const node of candidates(query.app, scanLimit(query))) {
    if (!nameMatches(node.name, query.name, query.exact)) {
      continue;
    }
    if (query.exclude !== '' && node.name.includes(query.exclude)) {
      continue;
    }
    if (
      query.role !== '' &&
      query.role.toLowerCase() !== node.role.toLowerCase()
    ) {
      continue;
    }
    const rect = node.rect;
    if (rect == null || rect.width <= 0 || rect.height <= 0) {
      continue;
    }
    found.push({
      box: {
        name: node.name,
        role: node.role,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        actionable: isActionable(node.obj),
      },
      obj: node.obj,
    });
  }
  if (query.prefer === 'bottom') {
    found.sort((a, b) => b.box.y - a.box.y || a.box.x - b.box.x);
  } else {
    found.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  }
  return found;
}

function doClickAction(obj: Atspi.Accessible): boolean {
  let iface: Atspi.Action | null = null;
  try {
    iface = obj.get_action_iface();
  } catch {
    return false;
  }
  if (iface == null) {
    return false;
  }
  let count = 0;
  try {
    count = iface.get_n_actions();
  } catch {
    return false;
  }
  let chosen: number | null = count > 0 ? 0 : null;
  for (let index = 0; index < count; index += 1) {
    let name = '';
    try {
      name = iface.get_action_name(index) || '';
    } catch {
      name = '';
    }
    const normalized = name.toLowerCase();
    if (
      normalized === 'click' ||
      normalized === 'press' ||
      normalized === 'activate'
    ) {
      chosen = index;
      break;
    }
  }
  if (chosen == null) {
    return false;
  }
  try {
    return Boolean(iface.do_action(chosen));
  } catch {
    return false;
  }
}

function warpPointer(x: number, y: number, durationMs: number): void {
  Gdk.init([]);
  const display = Gdk.Display.get_default();
  if (display == null) {
    fail('Gdk display not found');
  }
  const pointer = display.get_default_seat().get_pointer();
  if (pointer == null) {
    fail('Gdk pointer not found');
  }
  const screen = display.get_default_screen();
  const [, startX, startY] = pointer.get_position();
  const steps = durationMs <= 0 ? 1 : Math.max(1, Math.floor(durationMs / 16));
  for (let index = 1; index <= steps; index += 1) {
    const nextX =
      index === steps ? x : startX + Math.trunc(((x - startX) * index) / steps);
    const nextY =
      index === steps ? y : startY + Math.trunc(((y - startY) * index) / steps);
    pointer.warp(screen, nextX, nextY);
    display.flush();
    if (index < steps) {
      GLib.usleep(Math.round((durationMs / steps) * 1000));
    }
  }
  display.sync();
}

function movePointer(x: number, y: number, durationMs = 250): void {
  const targetX = Math.trunc(x);
  const targetY = Math.trunc(y);
  warpPointer(targetX, targetY, durationMs);
  Atspi.generate_mouse_event(targetX, targetY, 'abs');
}

function accessibleAt(x: number, y: number): Atspi.Accessible | null {
  let desktop: Atspi.Accessible;
  try {
    desktop = Atspi.get_desktop(0);
  } catch {
    return null;
  }
  let count = 0;
  try {
    count = desktop.get_child_count();
  } catch {
    return null;
  }
  for (let index = 0; index < count; index += 1) {
    let child: Atspi.Accessible | null = null;
    try {
      child = desktop.get_child_at_index(index);
    } catch {
      child = null;
    }
    if (child == null) {
      continue;
    }
    let component: Atspi.Component | null = null;
    try {
      component = child.get_component_iface();
    } catch {
      component = null;
    }
    if (component == null) {
      continue;
    }
    try {
      const found = component.get_accessible_at_point(
        x,
        y,
        Atspi.CoordType.SCREEN,
      );
      if (found != null) {
        return found;
      }
    } catch {
      // Another application owns this corner of the screen.
    }
  }
  return null;
}

/** Chrome's tab strip ignores synthesized clicks. Activate the control under the pointer. */
function activateControlAt(x: number, y: number): boolean {
  const roles = new Set(['push button', 'button', 'page tab', 'tab']);
  let node = accessibleAt(x, y);
  for (let depth = 0; node != null && depth < 8; depth += 1) {
    if (roles.has(roleName(node)) && doClickAction(node)) {
      return true;
    }
    try {
      node = node.get_parent();
    } catch {
      return false;
    }
  }
  return false;
}

const KEY_SYM = 2;
const KEY_STRING = 3;

function typeText(text: string, selectAll: boolean, submit: boolean): void {
  if (selectAll) {
    Atspi.generate_keyboard_event(0, '<Ctrl>a', KEY_SYM);
    GLib.usleep(50_000);
  }
  for (const char of text) {
    Atspi.generate_keyboard_event(0, char, KEY_STRING);
    GLib.usleep(10_000);
  }
  if (submit) {
    GLib.usleep(50_000);
    Atspi.generate_keyboard_event(0, 'Return', KEY_SYM);
  }
}

function pressAt(x: number, y: number, button: Button): void {
  const targetX = Math.trunc(x);
  const targetY = Math.trunc(y);
  Atspi.generate_mouse_event(targetX, targetY, 'abs');
  const events = {
    left: ['b1p', 'b1r'],
    middle: ['b2p', 'b2r'],
    right: ['b3p', 'b3r'],
  } as const;
  const [press, release] = events[button];
  if (button === 'left') {
    Atspi.generate_mouse_event(targetX, targetY, 'b1c');
  } else {
    Atspi.generate_mouse_event(targetX, targetY, press);
    GLib.usleep(50_000);
    Atspi.generate_mouse_event(targetX, targetY, release);
  }
}

function dump(query: Query): void {
  for (const node of candidates(query.app, scanLimit(query))) {
    const box =
      node.rect == null
        ? ''
        : ` ${node.rect.x},${node.rect.y} ${node.rect.width}x${node.rect.height}`;
    print(`${'  '.repeat(node.depth)}${node.role}: ${node.name}${box}`);
  }
}

function waitFor(query: Query): Found[] {
  const deadline = Date.now() + query.timeout * 1000;
  let found: Found[] = [];
  for (;;) {
    found = matching(query);
    if (found.length > 0 || Date.now() >= deadline) {
      return found;
    }
    GLib.usleep(200_000);
  }
}

function readCommand(): Query {
  const raw = System.programArgs[0];
  if (raw == null) {
    fail('missing command');
  }
  const command = JSON.parse(raw) as Partial<Query>;
  if (command.command == null) {
    fail('missing command');
  }
  return {
    command: command.command,
    name: command.name ?? '',
    role: command.role ?? '',
    exact: command.exact ?? false,
    prefer: command.prefer ?? 'top',
    timeout: Math.min(command.timeout ?? 3, 10),
    exclude: command.exclude ?? '',
    app: command.app ?? 'chrom',
    button: command.button ?? 'left',
    x: command.x ?? 0,
    y: command.y ?? 0,
    duration: command.duration ?? 250,
    pauseMs: command.pauseMs ?? 0,
    text: command.text ?? '',
    submit: command.submit ?? false,
    selectAll: command.selectAll ?? false,
    maxNodes: command.maxNodes ?? 0,
  };
}

function main(): void {
  const query = readCommand();
  Atspi.init();
  if (query.command === 'dump') {
    dump(query);
    return;
  }
  if (query.command === 'list') {
    print(JSON.stringify(matching(query).map((item) => item.box)));
    return;
  }
  if (query.command === 'move') {
    movePointer(query.x, query.y, query.duration);
    return;
  }
  if (query.command === 'type-text') {
    typeText(query.text, query.selectAll, query.submit);
    return;
  }
  if (query.command === 'press-at') {
    const x = Math.trunc(query.x);
    const y = Math.trunc(query.y);
    if (query.button === 'left' && activateControlAt(x, y)) {
      GLib.usleep(query.pauseMs * 1000);
      print(JSON.stringify({ action: 'click', x, y }));
      return;
    }
    pressAt(x, y, query.button);
    GLib.usleep(query.pauseMs * 1000);
    print(JSON.stringify({ action: 'click', x, y }));
    return;
  }
  if (query.command === 'click-xy') {
    movePointer(query.x, query.y, query.duration);
    const x = Math.trunc(query.x);
    const y = Math.trunc(query.y);
    if (query.button === 'left' && activateControlAt(x, y)) {
      GLib.usleep(query.pauseMs * 1000);
      print(JSON.stringify({ action: 'click', x, y }));
      return;
    }
    pressAt(x, y, query.button);
    GLib.usleep(query.pauseMs * 1000);
    print(JSON.stringify({ action: 'click', x, y }));
    return;
  }
  const found = waitFor(query);
  const chosen =
    found.find((item) => {
      if (query.x === 0 && query.y === 0) {
        return false;
      }
      const box = item.box;
      return (
        query.x >= box.x &&
        query.x <= box.x + box.width &&
        query.y >= box.y &&
        query.y <= box.y + box.height
      );
    }) ?? found[0];
  if (chosen == null) {
    fail('accessible object not found');
  }
  if (query.command === 'find') {
    print(JSON.stringify({ match: chosen.box, count: found.length }));
    return;
  }
  if (query.command !== 'click') {
    fail(`unknown command ${query.command}`);
  }
  const centerX = chosen.box.x + chosen.box.width / 2;
  const centerY = chosen.box.y + chosen.box.height / 2;
  movePointer(centerX, centerY, query.duration);
  if (query.button === 'left' && doClickAction(chosen.obj)) {
    GLib.usleep(query.pauseMs * 1000);
    print(JSON.stringify({ action: 'click', ...chosen.box }));
    return;
  }
  pressAt(centerX, centerY, query.button);
  GLib.usleep(query.pauseMs * 1000);
  print(JSON.stringify({ action: 'click', ...chosen.box }));
}

main();
