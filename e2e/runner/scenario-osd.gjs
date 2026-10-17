/** Large on-screen banner for the active e2e scenario (visible in x11grab). */
import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib?version=2.0';
import Pango from 'gi://Pango?version=1.0';

Gtk.init(null);

let win = null;
let label = null;
let bounds = { x: 0, y: 0, width: 960 };

function escapeMarkup(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ensureWindow() {
  if (win != null) {
    return;
  }
  win = new Gtk.Window({ window_position: Gtk.WindowPosition.NONE });
  win.set_decorated(false);
  win.set_keep_above(true);
  win.set_skip_taskbar_hint(true);
  win.set_skip_pager_hint(true);
  win.set_accept_focus(false);
  win.set_type_hint(Gtk.WindowTypeHint.DOCK);
  win.set_resizable(false);

  const provider = new Gtk.CssProvider();
  provider.load_from_data(
    `
    .e2e-scenario-osd {
      background-color: rgba(12, 12, 16, 0.92);
      padding: 18px 28px;
    }
    .e2e-scenario-osd label {
      color: #f4f4f5;
    }
    `,
    -1,
  );
  Gtk.StyleContext.add_provider_for_screen(
    Gdk.Screen.get_default(),
    provider,
    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
  );

  label = new Gtk.Label({ justify: Gtk.Justification.CENTER });
  label.set_line_wrap(true);
  label.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
  label.set_xalign(0.5);

  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
  box.get_style_context().add_class('e2e-scenario-osd');
  box.pack_start(label, true, true, 0);
  win.add(box);
}

function applyBounds() {
  if (win == null) {
    return;
  }
  win.move(Math.round(bounds.x), Math.round(bounds.y));
  win.resize(Math.round(bounds.width), 1);
}

function showText(id, title) {
  ensureWindow();
  applyBounds();
  const markup = `<span size="40000" weight="bold" font_family="sans">${escapeMarkup(id)}</span>\n<span size="20000" font_family="sans">${escapeMarkup(title)}</span>`;
  label.set_markup(markup);
  win.show_all();
  const [, naturalHeight] = win.get_preferred_height();
  win.resize(Math.round(bounds.width), naturalHeight);
}

function handleMessage(line) {
  const msg = JSON.parse(line);
  if (msg.bounds != null) {
    bounds = msg.bounds;
    if (win != null) {
      applyBounds();
    }
    return;
  }
  if (msg.hide === true) {
    win?.hide();
    return;
  }
  if (msg.id != null) {
    showText(msg.id, msg.title ?? '');
  }
}

const stdin = GLib.IOChannel.unix_new(0);
stdin.set_encoding('UTF-8');
stdin.set_buffered(false);

function readStdinLine(channel) {
  if (typeof channel.read_line_utf8 === 'function') {
    return channel.read_line_utf8();
  }
  const [status, line] = channel.read_line(null);
  return [status, line];
}

GLib.io_add_watch(stdin, GLib.PRIORITY_DEFAULT, GLib.IO_IN, (channel) => {
  const [status, line] = readStdinLine(channel);
  if (status === GLib.IOStatus.NORMAL && line != null && line.trim() !== '') {
    handleMessage(line.trim());
  }
  return GLib.SOURCE_CONTINUE;
});

Gtk.main();
