/**
 * Whether this browser can give us a WebGL2 context, which PixiJS needs
 * (CLAUDE.md, Targets and budgets: "WebGL2 required"). Checked up front, on a
 * throwaway canvas, so a browser without it gets a plain-language message
 * instead of a blank box and a console error.
 *
 * `makeCanvas` is a parameter only so a test can stand in for a browser.
 */
export function supportsWebGL2(
  makeCanvas: () => Pick<HTMLCanvasElement, 'getContext'> = () =>
    document.createElement('canvas'),
): boolean {
  try {
    return makeCanvas().getContext('webgl2') !== null;
  } catch {
    return false;
  }
}
