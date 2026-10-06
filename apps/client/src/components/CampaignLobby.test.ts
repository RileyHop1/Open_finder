// @vitest-environment jsdom
import type { Seat } from '@hearthtable/core';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as seatsApi from '../api/seats.js';
import * as worldsApi from '../api/worlds.js';
import { getDeviceToken } from '../realtime/deviceToken.js';
import { createSocket, emitOperation } from '../realtime/socket.js';
import CampaignLobby from './CampaignLobby.vue';

vi.mock('../api/seats.js');
vi.mock('../api/worlds.js');
vi.mock('../realtime/socket.js');
vi.mock('../realtime/deviceToken.js');

const MY_DEVICE_TOKEN = 'my-device-token';

function makeStubSocket() {
  const handlers = new Map<string, (...args: never[]) => void>();
  return {
    handlers,
    on: vi.fn((event: string, handler: (...args: never[]) => void) => {
      handlers.set(event, handler);
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function makeSeat(overrides: Partial<Seat> = {}): Seat {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    schemaVersion: 1,
    name: 'Valeros',
    isGM: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function mountLobby(worldId = crypto.randomUUID()) {
  return mount(CampaignLobby, {
    props: { worldId, worldName: 'Curse of the Crimson Throne' },
    global: { plugins: [createPinia()] },
  });
}

let stubSocket: ReturnType<typeof makeStubSocket>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getDeviceToken).mockReturnValue(MY_DEVICE_TOKEN);
  vi.mocked(seatsApi.listSeats).mockResolvedValue([]);
  stubSocket = makeStubSocket();
  vi.mocked(createSocket).mockReturnValue(stubSocket as never);
});

describe('CampaignLobby', () => {
  it('renders the campaign name as the heading', async () => {
    const wrapper = mountLobby();
    await flushPromises();
    expect(wrapper.find('h2').text()).toBe('Curse of the Crimson Throne');
  });

  it('connects on mount and disconnects on unmount', async () => {
    const wrapper = mountLobby();
    await flushPromises();
    expect(createSocket).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    expect(stubSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('lists every seat, with a Claim button for an unclaimed one', async () => {
    const seat = makeSeat({ name: 'Valeros' });
    vi.mocked(seatsApi.listSeats).mockResolvedValue([seat]);

    const wrapper = mountLobby();
    await flushPromises();

    expect(wrapper.text()).toContain('Valeros');
    expect(wrapper.find('button').text()).toBe('Claim');
  });

  it('shows a message when there are no seats yet', async () => {
    const wrapper = mountLobby();
    await flushPromises();
    expect(wrapper.text()).toContain('No seats yet');
  });

  it('claims an unprotected seat immediately when Claim is clicked', async () => {
    const seat = makeSeat();
    vi.mocked(seatsApi.listSeats).mockResolvedValue([seat]);
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    const wrapper = mountLobby();
    await flushPromises();

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(emitOperation).toHaveBeenCalledWith(
      stubSocket,
      expect.objectContaining({ type: 'seat.claim', payload: { seatId: seat.id } }),
    );
  });

  it('shows a PIN form instead of claiming immediately for a pin-protected seat', async () => {
    const seat = makeSeat({ isGM: true, pin: '1234' });
    vi.mocked(seatsApi.listSeats).mockResolvedValue([seat]);

    const wrapper = mountLobby();
    await flushPromises();

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(emitOperation).not.toHaveBeenCalled();
    expect(wrapper.find('form.pin-form').exists()).toBe(true);
  });

  it('submits the entered PIN when confirming a pin-protected claim', async () => {
    const seat = makeSeat({ isGM: true, pin: '1234' });
    vi.mocked(seatsApi.listSeats).mockResolvedValue([seat]);
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    const wrapper = mountLobby();
    await flushPromises();
    await wrapper.find('button').trigger('click');
    await flushPromises();

    await wrapper.find('.pin-form input').setValue('1234');
    await wrapper.find('.pin-form').trigger('submit');
    await flushPromises();

    expect(emitOperation).toHaveBeenCalledWith(
      stubSocket,
      expect.objectContaining({
        type: 'seat.claim',
        payload: { seatId: seat.id, pin: '1234' },
      }),
    );
  });

  it('shows the table only while this device holds a seat', async () => {
    vi.mocked(seatsApi.listSeats).mockResolvedValue([makeSeat()]);
    const unseated = mountLobby();
    await flushPromises();
    expect(unseated.find('.table').exists()).toBe(false);
    expect(unseated.find('details.seat-manager').attributes('open')).toBeDefined();

    vi.mocked(seatsApi.listSeats).mockResolvedValue([
      makeSeat({ name: 'Valeros', claimedByDeviceToken: MY_DEVICE_TOKEN }),
    ]);
    const seated = mountLobby();
    await flushPromises();
    expect(seated.find('.table').exists()).toBe(true);
    expect(seated.text()).toContain('Playing as Valeros');
    // Map-first (ADR 0022): TableView is the whole page while seated, so
    // none of this screen's own chrome -- including the seat roster --
    // renders alongside it.
    expect(seated.find('details.seat-manager').exists()).toBe(false);
    expect(seated.find('#lobby-heading').exists()).toBe(false);
  });

  it("shows Claimed with no button for someone else's seat", async () => {
    const someoneElses = makeSeat({ claimedByDeviceToken: 'someone-else' });
    vi.mocked(seatsApi.listSeats).mockResolvedValue([someoneElses]);

    const wrapper = mountLobby();
    await flushPromises();

    const seatRow = wrapper.find('.seat-row');
    expect(seatRow.text()).toContain('Claimed');
    expect(seatRow.find('button').exists()).toBe(false);
  });

  it('creates a seat from the form and clears it', async () => {
    const created = makeSeat({ name: 'Brand New Character' });
    vi.mocked(seatsApi.createSeat).mockResolvedValue(created);

    const wrapper = mountLobby();
    await flushPromises();

    await wrapper.find('#new-seat-name').setValue('Brand New Character');
    await wrapper.find('form.create-seat').trigger('submit');
    await flushPromises();

    expect(seatsApi.createSeat).toHaveBeenCalledWith(
      expect.any(String),
      'Brand New Character',
      false,
      undefined,
    );
    expect(wrapper.text()).toContain('Brand New Character');
  });

  it('has labels associated with the seat-creation inputs, for keyboard/screen-reader users', async () => {
    const wrapper = mountLobby();
    await flushPromises();
    expect(wrapper.find('label[for="new-seat-name"]').exists()).toBe(true);
    expect(wrapper.find('label[for="new-seat-pin"]').exists()).toBe(true);
  });

  describe('leaving the campaign', () => {
    it('offers "Back to campaigns" only to the GM seat this device holds', async () => {
      const gm = makeSeat({
        name: 'GM',
        isGM: true,
        claimedByDeviceToken: MY_DEVICE_TOKEN,
      });
      vi.mocked(seatsApi.listSeats).mockResolvedValue([gm]);

      const wrapper = mountLobby();
      await flushPromises();

      expect(wrapper.find('.leave-campaign').exists()).toBe(true);
    });

    it('hides it from a player seat', async () => {
      const player = makeSeat({ claimedByDeviceToken: MY_DEVICE_TOKEN, isGM: false });
      vi.mocked(seatsApi.listSeats).mockResolvedValue([player]);

      const wrapper = mountLobby();
      await flushPromises();

      expect(wrapper.find('.leave-campaign').exists()).toBe(false);
    });

    it('asks before leaving, and only calls deactivateWorld after confirming', async () => {
      const gm = makeSeat({
        name: 'GM',
        isGM: true,
        claimedByDeviceToken: MY_DEVICE_TOKEN,
      });
      vi.mocked(seatsApi.listSeats).mockResolvedValue([gm]);
      vi.mocked(worldsApi.deactivateWorld).mockResolvedValue(undefined);

      const wrapper = mountLobby();
      await flushPromises();

      await wrapper.find('.leave-campaign').trigger('click');
      await flushPromises();
      expect(worldsApi.deactivateWorld).not.toHaveBeenCalled();
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true);

      await wrapper.find('.leave-confirm button').trigger('click');
      await flushPromises();
      expect(worldsApi.deactivateWorld).toHaveBeenCalledTimes(1);
    });

    it('cancels without calling deactivateWorld', async () => {
      const gm = makeSeat({
        name: 'GM',
        isGM: true,
        claimedByDeviceToken: MY_DEVICE_TOKEN,
      });
      vi.mocked(seatsApi.listSeats).mockResolvedValue([gm]);

      const wrapper = mountLobby();
      await flushPromises();

      await wrapper.find('.leave-campaign').trigger('click');
      await flushPromises();
      await wrapper.findAll('.leave-confirm button')[1]?.trigger('click');
      await flushPromises();

      expect(worldsApi.deactivateWorld).not.toHaveBeenCalled();
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    });
  });
});
