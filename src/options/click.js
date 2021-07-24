const form = document.forms.config;
const click = form.click;
const clickKey = form.clickKey;

export default {
  load(config) {
    let selected = config.click.find(
      (a) => a.keys.sort().join('\0') === this.checked.sort().join('\0'),
    );
    if (selected == null) {
      selected = { action: 'replace-address-bar', keys: this.checked };
      config.click.push(selected);
    }
    click.dataset.config = JSON.stringify(config.click);
    click.value = selected.action;
    this.render(config.click);
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
  render(config) {
    const ul = form.querySelector('#click ~ ul');
    const keyLabels = Object.fromEntries(
      Array.from(form.querySelectorAll('input[name=clickKey]')).map((e) => [
        e.value,
        e.parentNode.innerText.trim(),
      ]),
    );
    Array.from(ul.querySelectorAll('li')).forEach((li) => ul.removeChild(li));
    config.forEach(({ keys, action }) => {
      const li = document.createElement('LI');
      const actionLabel = form.querySelector(
        `#click > option[value=${action}`,
      ).innerText;
      li.innerText = `${
        keys.map((k) => `[${keyLabels[k]}]`).join(' + ') || 'no key'
      }: ${actionLabel}`;
      ul.appendChild(li);
    });
  },
  get checked() {
    return Array.from(clickKey)
      .filter((n) => n.checked)
      .map((n) => n.value);
  },
};
