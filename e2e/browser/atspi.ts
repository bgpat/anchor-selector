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
};

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

function matching(query: Query, maxNodes: number): Found[] {
  const found: Found[] = [];
  for (const node of candidates(query.app, maxNodes)) {
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

function movePointer(x: number, y: number, durationMs = 500): void {
  const targetX = Math.trunc(x);
  const targetY = Math.trunc(y);
  warpPointer(targetX, targetY, durationMs);
  Atspi.generate_mouse_event(targetX, targetY, 'abs');
}

function clickBox(box: Box, button: Button): Box {
  const x = Math.trunc(box.x + box.width / 2);
  const y = Math.trunc(box.y + box.height / 2);
  const events = {
    left: ['b1p', 'b1r'],
    middle: ['b2p', 'b2r'],
    right: ['b3p', 'b3r'],
  } as const;
  const [press, release] = events[button];
  movePointer(x, y);
  GLib.usleep(150_000);
  if (button === 'left') {
    Atspi.generate_mouse_event(x, y, 'b1c');
  } else {
    Atspi.generate_mouse_event(x, y, press);
    GLib.usleep(50_000);
    Atspi.generate_mouse_event(x, y, release);
  }
  return box;
}

function dump(query: Query): void {
  for (const node of candidates(query.app, 2500)) {
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
    found = matching(query, 4000);
    if (found.length > 0 || Date.now() >= deadline) {
      return found;
    }
    GLib.usleep(200_000);
  }
}

function takeValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value == null) {
    fail(`missing value for ${flag}`);
  }
  return value;
}

function parseArgs(argv: string[]): Query {
  const command = argv[0];
  if (command == null) {
    fail('missing command');
  }
  const query: Query = {
    command,
    name: '',
    role: '',
    exact: false,
    prefer: 'top',
    timeout: 3,
    exclude: '',
    app: 'chrom',
    button: 'left',
    x: 0,
    y: 0,
    duration: 500,
  };
  const seen = new Set<string>();
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag == null) {
      continue;
    }
    if (flag === '--exact') {
      query.exact = true;
      continue;
    }
    index += 1;
    const value = takeValue(argv, index, flag);
    seen.add(flag);
    switch (flag) {
      case '--name':
        query.name = value;
        break;
      case '--role':
        query.role = value;
        break;
      case '--prefer':
        if (value !== 'top' && value !== 'bottom') {
          fail(`unknown prefer ${value}`);
        }
        query.prefer = value;
        break;
      case '--timeout':
        query.timeout = Number(value);
        if (Number.isNaN(query.timeout)) {
          fail(`invalid timeout ${value}`);
        }
        break;
      case '--exclude':
        query.exclude = value;
        break;
      case '--app':
        query.app = value;
        break;
      case '--button':
        if (value !== 'left' && value !== 'middle' && value !== 'right') {
          fail(`unknown button ${value}`);
        }
        query.button = value;
        break;
      case '--x':
        query.x = Number(value);
        if (Number.isNaN(query.x)) {
          fail(`invalid x ${value}`);
        }
        break;
      case '--y':
        query.y = Number(value);
        if (Number.isNaN(query.y)) {
          fail(`invalid y ${value}`);
        }
        break;
      case '--duration':
        query.duration = Number(value);
        if (Number.isNaN(query.duration)) {
          fail(`invalid duration ${value}`);
        }
        break;
      default:
        fail(`unknown argument ${flag}`);
    }
  }
  if (
    (command === 'move' || command === 'click-xy') &&
    (!seen.has('--x') || !seen.has('--y'))
  ) {
    fail('missing coordinates');
  }
  return query;
}

function main(): void {
  const query = parseArgs(System.programArgs);
  Atspi.init();
  if (query.command === 'dump') {
    dump(query);
    return;
  }
  if (query.command === 'move') {
    movePointer(query.x, query.y, query.duration);
    return;
  }
  if (query.command === 'click-xy') {
    print(
      JSON.stringify(
        clickBox(
          {
            name: '',
            role: '',
            x: query.x,
            y: query.y,
            width: 1,
            height: 1,
          },
          query.button,
        ),
      ),
    );
    return;
  }
  const found = waitFor(query);
  const chosen = found[0];
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
  movePointer(
    chosen.box.x + chosen.box.width / 2,
    chosen.box.y + chosen.box.height / 2,
  );
  GLib.usleep(50_000);
  if (query.button === 'left' && doClickAction(chosen.obj)) {
    print(JSON.stringify({ action: 'click', ...chosen.box }));
    return;
  }
  print(JSON.stringify(clickBox(chosen.box, query.button)));
}

main();
