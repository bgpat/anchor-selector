import { default as Color } from 'color';
import variables from './variables';

/** Muted action badge while selecting (icon unchanged; works on Chrome and Firefox). */
export function getSelectingBadgeStyle() {
  return variables.config.get('hue').then((hue) => {
    const { saturation, lightness } = variables.overlay.selecting.stroke;
    const background = Color.hsl(
      hue,
      Math.max(saturation - 50, 10),
      Math.min(lightness + 32, 76),
    ).hex();
    return {
      background,
      text: ' ',
      textColor: background,
    };
  });
}
