// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MapCanvas from './MapCanvas.vue';

const pixi = vi.hoisted(() => {
  const instances: {
    init: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    canvas: HTMLCanvasElement;
  }[] = [];
  return { instances, failInit: false, holdInit: undefined as Promise<void> | undefined };
});

vi.mock('pixi.js', () => ({
  Application: class {
    canvas = document.createElement('canvas');
    init = vi.fn(async () => {
      await pixi.holdInit;
      if (pixi.failInit) {
        throw new Error('no context');
      }
    });
    destroy = vi.fn();
    resize = vi.fn();
    constructor() {
      pixi.instances.push(this);
    }
  },
}));

/** jsdom has no WebGL, so a canvas that answers `webgl2` stands in for a capable browser. */
function pretendWebGL2(available: boolean): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((
    kind: string,
  ) => (available && kind === 'webgl2' ? {} : null)) as never);
}

beforeEach(() => {
  pixi.instances.length = 0;
  pixi.failInit = false;
  pixi.holdInit = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MapCanvas', () => {
  it('starts PixiJS in its box, adds the canvas, and hands the application out', async () => {
    pretendWebGL2(true);
    const wrapper = mount(MapCanvas, { attachTo: document.body });
    await flushPromises();

    const [app] = pixi.instances;
    expect(app?.init).toHaveBeenCalledWith(
      expect.objectContaining({
        resizeTo: wrapper.get('[data-testid="map-canvas"]').element,
        preference: 'webgl',
      }),
    );
    expect(wrapper.find('canvas').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.emitted('ready')).toHaveLength(1);
    wrapper.unmount();
  });

  it('destroys the application when it goes away', async () => {
    pretendWebGL2(true);
    const wrapper = mount(MapCanvas, { attachTo: document.body });
    await flushPromises();
    wrapper.unmount();
    expect(pixi.instances[0]?.destroy).toHaveBeenCalledWith(true, { children: true });
  });

  it('says so in words, and starts nothing, when WebGL2 is missing', async () => {
    pretendWebGL2(false);
    const wrapper = mount(MapCanvas, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('needs WebGL 2');
    expect(wrapper.find('canvas').exists()).toBe(false);
    expect(pixi.instances).toHaveLength(0);
    expect(wrapper.emitted('ready')).toBeUndefined();
    wrapper.unmount();
  });

  it('gives the same message when PixiJS fails to start', async () => {
    pretendWebGL2(true);
    pixi.failInit = true;
    const wrapper = mount(MapCanvas, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('needs WebGL 2');
    expect(wrapper.emitted('ready')).toBeUndefined();
    wrapper.unmount();
  });

  it('cleans up an application that finished starting after the component left', async () => {
    pretendWebGL2(true);
    let release: () => void = () => undefined;
    pixi.holdInit = new Promise<void>((resolve) => {
      release = resolve;
    });
    const wrapper = mount(MapCanvas, { attachTo: document.body });
    await flushPromises();
    wrapper.unmount();
    release();
    await flushPromises();

    expect(pixi.instances[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  describe('resizing when the box changes without a window resize', () => {
    const observed: { callback: ResizeObserverCallback }[] = [];
    const observe = vi.fn();
    const disconnect = vi.fn();

    beforeEach(() => {
      observed.length = 0;
      observe.mockClear();
      disconnect.mockClear();
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: ResizeObserverCallback) {
            observed.push({ callback });
          }
          observe = observe;
          disconnect = disconnect;
          unobserve = vi.fn();
        },
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('resizes the pixi application when its box is observed to change', async () => {
      pretendWebGL2(true);
      const wrapper = mount(MapCanvas, { attachTo: document.body });
      await flushPromises();
      const app = pixi.instances[0];

      expect(observe).toHaveBeenCalledWith(
        wrapper.get('[data-testid="map-canvas"]').element,
      );
      observed[0]?.callback([] as never, {} as ResizeObserver);

      expect(app?.resize).toHaveBeenCalledTimes(1);
      wrapper.unmount();
    });

    it('disconnects the observer when the component goes away', async () => {
      pretendWebGL2(true);
      const wrapper = mount(MapCanvas, { attachTo: document.body });
      await flushPromises();
      wrapper.unmount();

      expect(disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
