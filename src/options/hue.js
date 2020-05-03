const form = document.forms.config;
const hue = form.hue;
const huePreview = document.querySelector('#hue-preview');

export default {
  load(config) {
    hue.value = config.hue;
    hue.style.backgroundColor = `hsl(${hue.value}, 100%, 50%)`;
    huePreview.style.fill = `hsl(${hue.value}, 100%, 50%)`;
  },
  update() {
    return +hue.value;
  },
};
