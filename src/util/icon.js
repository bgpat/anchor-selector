import { default as Color } from 'color';
import variables from './variables';

/** Action badge while selecting (icon unchanged; works on Chrome and Firefox). */
export function getSelectingBadgeStyle() {
  return variables.config.get('hue').then((hue) => {
    const { saturation, lightness } = variables.overlay.selecting.stroke;
    const background = Color.hsl(hue, saturation, lightness).hex();
    return {
      background,
      // Firefox collapses same-color/space badges into a thin line; use a glyph + contrast.
      text: '•',
      textColor: '#FFFFFF',
    };
  });
}
