import { variables } from '@/util';

const hue = document.querySelector('#hue');
const huePreview = document.querySelector('#hue-preview');

variables.config.getAll().then(config => {
  document.querySelector('#config').style.display = 'block';
  hue.value = config.hue;
  hue.style.backgroundColor = `hsl(${hue.value}, 100%, 50%)`;
  huePreview.style.fill = `hsl(${hue.value}, 100%, 50%)`;
});

hue.addEventListener('input', () => {
  huePreview.style.fill = `hsl(${hue.value}, 100%, 50%)`;
  variables.config.set('hue', +hue.value);
});
