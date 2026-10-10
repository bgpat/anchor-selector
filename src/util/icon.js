import { default as Color } from 'color';
import variables from './variables';

/** Action badge while selecting (icon unchanged; works on Chrome and Firefox). */
export function getSelectingBadgeStyle() {
  return variables.config.get('hue').then((hue) => {
    const { saturation, lightness } = variables.overlay.selecting.stroke;
    const background = Color.hsl(hue, saturation, lightness).hex();
    return {
      background,
      // U+00A0: Firefox draws a normal " " + matching textColor as a line; NBSP + contrast keeps a pill.
      text: '\u00A0',
      textColor: '#FFFFFF',
    };
  });
}
