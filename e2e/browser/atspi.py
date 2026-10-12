#!/usr/bin/env python3
"""Find and click browser UI through the AT-SPI accessibility tree."""

import argparse
import ctypes
import json
import sys
import time

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi  # noqa: E402


def extents(obj):
    component = None
    getter = getattr(obj, "get_component_iface", None)
    if getter is not None:
        try:
            component = getter()
        except Exception:
            component = None
    if component is None:
        query = getattr(obj, "queryComponent", None)
        if query is not None:
            try:
                component = query()
            except Exception:
                component = None
    if component is None:
        return None
    try:
        return component.get_extents(Atspi.CoordType.SCREEN)
    except Exception:
        pass
    try:
        return component.getExtents(Atspi.CoordType.SCREEN)
    except Exception:
        return None


def role_name(obj):
    try:
        return obj.get_role_name() or ""
    except Exception:
        return ""


def object_name(obj):
    try:
        return obj.get_name() or ""
    except Exception:
        return ""


def walk(obj, depth, limit):
    if obj is None or depth > limit[0] or limit[1] <= 0:
        return
    limit[1] -= 1
    rect = extents(obj)
    box = ""
    if rect is not None:
        box = f" {rect.x},{rect.y} {rect.width}x{rect.height}"
    yield depth, object_name(obj), role_name(obj), box, obj
    try:
        count = obj.get_child_count()
    except Exception:
        return
    for index in range(count):
        try:
            child = obj.get_child_at_index(index)
        except Exception:
            continue
        yield from walk(child, depth + 1, limit)


def apps(app_filter):
    desktop = Atspi.get_desktop(0)
    for index in range(desktop.get_child_count()):
        app = desktop.get_child_at_index(index)
        if app is None:
            continue
        name = object_name(app).lower()
        if app_filter and app_filter not in name:
            continue
        yield app


def candidates(app_filter, max_nodes):
    for app in apps(app_filter):
        yield from walk(app, 0, [14, max_nodes])


def name_matches(actual, expected, exact):
    if not expected:
        return True
    if exact:
        return actual == expected
    return expected in actual


def collect(args):
    found = []
    for _depth, name, role, _box, obj in candidates(args.app, 4000):
        if not name_matches(name, args.name, args.exact):
            continue
        if args.exclude and args.exclude in name:
            continue
        if args.role and args.role.lower() != role.lower():
            continue
        rect = extents(obj)
        if rect is None or rect.width <= 0 or rect.height <= 0:
            continue
        found.append(
            {
                "name": name,
                "role": role,
                "x": rect.x,
                "y": rect.y,
                "width": rect.width,
                "height": rect.height,
            }
        )
    if args.prefer == "top":
        found.sort(key=lambda item: (item["y"], item["x"]))
    elif args.prefer == "bottom":
        found.sort(key=lambda item: (-item["y"], item["x"]))
    return found


def action_iface(obj):
    for getter_name in ("get_action_iface", "queryAction"):
        getter = getattr(obj, getter_name, None)
        if getter is None:
            continue
        try:
            iface = getter()
        except Exception:
            continue
        if iface is not None:
            return iface
    return None


def do_click_action(obj):
    iface = action_iface(obj)
    if iface is None:
        return False
    try:
        count = iface.get_n_actions()
    except Exception:
        try:
            count = iface.nActions
        except Exception:
            return False
    chosen = 0 if count else None
    for index in range(count):
        try:
            name = iface.get_action_name(index) or ""
        except Exception:
            try:
                name = iface.getName(index) or ""
            except Exception:
                name = ""
        if name.lower() in ("click", "press", "activate"):
            chosen = index
            break
    if chosen is None:
        return False
    try:
        return bool(iface.do_action(chosen))
    except Exception:
        try:
            return bool(iface.doAction(chosen))
        except Exception:
            return False


def load_x11():
    x11 = ctypes.CDLL("libX11.so.6")
    x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
    x11.XOpenDisplay.restype = ctypes.c_void_p
    x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
    x11.XDefaultRootWindow.restype = ctypes.c_ulong
    x11.XWarpPointer.argtypes = [
        ctypes.c_void_p,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_uint,
        ctypes.c_uint,
        ctypes.c_int,
        ctypes.c_int,
    ]
    x11.XWarpPointer.restype = ctypes.c_int
    x11.XFlush.argtypes = [ctypes.c_void_p]
    x11.XFlush.restype = ctypes.c_int
    x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
    x11.XSync.restype = ctypes.c_int
    x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
    x11.XCloseDisplay.restype = ctypes.c_int
    x11.XQueryPointer.argtypes = [
        ctypes.c_void_p,
        ctypes.c_ulong,
        ctypes.POINTER(ctypes.c_ulong),
        ctypes.POINTER(ctypes.c_ulong),
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_uint),
    ]
    x11.XQueryPointer.restype = ctypes.c_int
    return x11


def pointer_position(x11, display, root):
    root_ret = ctypes.c_ulong()
    child = ctypes.c_ulong()
    root_x = ctypes.c_int()
    root_y = ctypes.c_int()
    win_x = ctypes.c_int()
    win_y = ctypes.c_int()
    mask = ctypes.c_uint()
    x11.XQueryPointer(
        display,
        root,
        ctypes.byref(root_ret),
        ctypes.byref(child),
        ctypes.byref(root_x),
        ctypes.byref(root_y),
        ctypes.byref(win_x),
        ctypes.byref(win_y),
        ctypes.byref(mask),
    )
    return root_x.value, root_y.value


def warp_x_pointer(x, y, duration_ms):
    """x11grab records the X pointer. AT-SPI absolute moves leave it in place on Xvfb."""
    x11 = load_x11()
    display = x11.XOpenDisplay(None)
    if not display:
        raise RuntimeError("XOpenDisplay failed")
    try:
        root = x11.XDefaultRootWindow(display)
        x = int(x)
        y = int(y)
        start_x, start_y = pointer_position(x11, display, root)
        steps = 1 if duration_ms <= 0 else max(1, int(duration_ms) // 16)
        for index in range(1, steps + 1):
            if index == steps:
                next_x, next_y = x, y
            else:
                next_x = start_x + (x - start_x) * index // steps
                next_y = start_y + (y - start_y) * index // steps
            x11.XWarpPointer(display, 0, root, 0, 0, 0, 0, next_x, next_y)
            x11.XFlush(display)
            if index < steps:
                time.sleep(duration_ms / steps / 1000)
        x11.XSync(display, False)
    finally:
        x11.XCloseDisplay(display)


def move_pointer(x, y, duration_ms=500):
    x = int(x)
    y = int(y)
    warp_x_pointer(x, y, duration_ms)
    Atspi.generate_mouse_event(x, y, "abs")


def click_box(box, button):
    x = int(box["x"] + box["width"] / 2)
    y = int(box["y"] + box["height"] / 2)
    press, release = {
        "left": ("b1p", "b1r"),
        "middle": ("b2p", "b2r"),
        "right": ("b3p", "b3r"),
    }[button]
    move_pointer(x, y)
    time.sleep(0.15)
    if button == "left":
        Atspi.generate_mouse_event(x, y, "b1c")
    else:
        Atspi.generate_mouse_event(x, y, press)
        time.sleep(0.05)
        Atspi.generate_mouse_event(x, y, release)
    return {"x": x, "y": y, **box}


def matching_objects(args):
    found = []
    for _depth, name, role, _box, obj in candidates(args.app, 4000):
        if not name_matches(name, args.name, args.exact):
            continue
        if args.exclude and args.exclude in name:
            continue
        if args.role and args.role.lower() != role.lower():
            continue
        rect = extents(obj)
        if rect is None or rect.width <= 0 or rect.height <= 0:
            continue
        found.append(
            (
                {
                    "name": name,
                    "role": role,
                    "x": rect.x,
                    "y": rect.y,
                    "width": rect.width,
                    "height": rect.height,
                },
                obj,
            )
        )
    if args.prefer == "top":
        found.sort(key=lambda item: (item[0]["y"], item[0]["x"]))
    elif args.prefer == "bottom":
        found.sort(key=lambda item: (-item[0]["y"], item[0]["x"]))
    return found


def dump(args):
    for depth, name, role, box, _obj in candidates(args.app, 2500):
        print(f"{'  ' * depth}{role}: {name}{box}")


def wait_for_objects(args):
    deadline = time.time() + args.timeout
    found = []
    while True:
        found = matching_objects(args)
        if found or time.time() >= deadline:
            return found
        time.sleep(0.2)


def wait_for(args):
    return [box for box, _obj in wait_for_objects(args)]


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    def add_query(command):
        command.add_argument("--name", default="")
        command.add_argument("--role", default="")
        command.add_argument("--exact", action="store_true")
        command.add_argument("--prefer", choices=("top", "bottom"), default="top")
        command.add_argument("--timeout", type=float, default=3)
        command.add_argument("--exclude", default="")
        command.add_argument("--app", default="chrom")

    dump_command = sub.add_parser("dump")
    dump_command.add_argument("--app", default="chrom")

    find_command = sub.add_parser("find")
    add_query(find_command)

    click_command = sub.add_parser("click")
    add_query(click_command)
    click_command.add_argument(
        "--button", choices=("left", "middle", "right"), default="left"
    )

    move_command = sub.add_parser("move")
    move_command.add_argument("--x", type=int, required=True)
    move_command.add_argument("--y", type=int, required=True)
    move_command.add_argument("--duration", type=int, default=500)

    xy_command = sub.add_parser("click-xy")
    xy_command.add_argument("--x", type=int, required=True)
    xy_command.add_argument("--y", type=int, required=True)
    xy_command.add_argument(
        "--button", choices=("left", "middle", "right"), default="left"
    )

    args = parser.parse_args()
    Atspi.init()

    if args.command == "dump":
        dump(args)
        return

    if args.command == "move":
        move_pointer(args.x, args.y, args.duration)
        return

    if args.command == "click-xy":
        clicked = click_box(
            {"name": "", "role": "", "x": args.x, "y": args.y, "width": 1, "height": 1},
            args.button,
        )
        print(json.dumps(clicked))
        return

    found = wait_for_objects(args)
    if not found:
        print("accessible object not found", file=sys.stderr)
        sys.exit(1)
    chosen, obj = found[0]
    if args.command == "find":
        print(json.dumps({"match": chosen, "count": len(found)}))
        return
    move_pointer(chosen["x"] + chosen["width"] / 2, chosen["y"] + chosen["height"] / 2)
    time.sleep(0.05)
    if args.button == "left" and do_click_action(obj):
        print(json.dumps({"action": "click", **chosen}))
        return
    print(json.dumps(click_box(chosen, args.button)))


if __name__ == "__main__":
    main()
