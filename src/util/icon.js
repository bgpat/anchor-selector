import { default as Color } from 'color';
import variables from './variables';

/** Action badge while selecting (icon unchanged; works on Chrome and Firefox). */
export function getSelectingBadgeStyle() {
  return variables.config.get('hue').then((hue) => {
    const { saturation, lightness } = variables.overlay.selecting.stroke;
    const background = Color.hsl(hue, saturation, lightness).hex();
    return {
      background,
      // U+200B zero-width space: no visible glyph; pill size is still browser-defined.
      text: '\u200B',
      textColor: '#FFFFFF',
    };
  });
}
