const form = document.forms.config;
const click = form.click;
const clickKey = form.clickKey;

export default {
  load(config) {
    let selected = config.click.find(
      (a) => a.keys.sort().join('\0') === this.checked.sort().join('\0'),
    );
    if (selected == null) {
      selected = { action: 'open-current', keys: this.checked };
      config.click.push(selected);
    }
    click.dataset.config = JSON.stringify(config.click);
    click.value = selected.action;
  },
  update(e) {
    const config = JSON.parse(click.dataset.config);
    if (e.target !== click) {
      return config;
    }
    const selected = config.find(
      (a) => a.keys.sort().join('\0') === this.checked.sort().join('\0'),
    );
    selected.action = click.value;
    return config;
  },
  get checked() {
    return Array.from(clickKey)
      .filter((n) => n.checked)
      .map((n) => n.value);
  },
};
