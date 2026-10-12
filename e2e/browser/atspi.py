#!/usr/bin/env python3
"""Find and click browser UI through the AT-SPI accessibility tree."""

import argparse
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


def click_box(box, button):
    x = int(box["x"] + box["width"] / 2)
    y = int(box["y"] + box["height"] / 2)
    press, release = {
        "left": ("b1p", "b1r"),
        "middle": ("b2p", "b2r"),
        "right": ("b3p", "b3r"),
    }[button]
    Atspi.generate_mouse_event(x, y, "abs")
    time.sleep(0.05)
    Atspi.generate_mouse_event(x, y, press)
    time.sleep(0.05)
    Atspi.generate_mouse_event(x, y, release)
    return {"x": x, "y": y, **box}


def dump(args):
    for depth, name, role, box, _obj in candidates(args.app, 2500):
        print(f"{'  ' * depth}{role}: {name}{box}")


def wait_for(args):
    deadline = time.time() + args.timeout
    found = []
    while True:
        found = collect(args)
        if found or time.time() >= deadline:
            return found
        time.sleep(0.2)


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

    if args.command == "click-xy":
        clicked = click_box(
            {"name": "", "role": "", "x": args.x, "y": args.y, "width": 1, "height": 1},
            args.button,
        )
        print(json.dumps(clicked))
        return

    found = wait_for(args)
    if not found:
        print("accessible object not found", file=sys.stderr)
        sys.exit(1)
    chosen = found[0]
    if args.command == "find":
        print(json.dumps({"match": chosen, "count": len(found)}))
        return
    print(json.dumps(click_box(chosen, args.button)))


if __name__ == "__main__":
    main()
