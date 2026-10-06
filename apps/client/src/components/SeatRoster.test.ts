// @vitest-environment jsdom
import type { Seat } from '@hearthtable/core';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as seatsApi from '../api/seats.js';
import { getDeviceToken } from '../realtime/deviceToken.js';
import { createSocket, emitOperation } from '../realtime/socket.js';
import { useConnectionStore } from '../stores/connection.js';
import { useLobbyStore } from '../stores/lobby.js';
import SeatRoster from './SeatRoster.vue';

vi.mock('../api/seats.js');
vi.mock('../realtime/socket.js');
vi.mock('../realtime/deviceToken.js');

const MY_DEVICE_TOKEN = 'my-device-token';
const WORLD_ID = crypto.randomUUID();

function makeSeat(overrides: Partial<Seat> = {}): Seat {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    worldId: WORLD_ID,
    schemaVersion: 1,
    name: 'Valeros',
    isGM: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function mountRoster() {
  const pinia = createPinia();
  const wrapper = mount(SeatRoster, { global: { plugins: [pinia] } });
  useConnectionStore(pinia).connect();
  useLobbyStore(pinia).loadForWorld(WORLD_ID);
  return wrapper;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getDeviceToken).mockReturnValue(MY_DEVICE_TOKEN);
  vi.mocked(seatsApi.listSeats).mockResolvedValue([]);
  vi.mocked(createSocket).mockReturnValue({
    on: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as never);
});

describe('SeatRoster', () => {
  it('shows a message when there are no seats yet', async () => {
    const wrapper = mountRoster();
    await flushPromises();
    expect(wrapper.text()).toContain('No seats yet');
  });

  it('shows "You" and a Release button for the seat this device holds', async () => {
    const mine = makeSeat({ name: 'Valeria', claimedByDeviceToken: MY_DEVICE_TOKEN });
    vi.mocked(seatsApi.listSeats).mockResolvedValue([mine]);
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    const wrapper = mountRoster();
    await flushPromises();

    const row = wrapper.get('.seat-row');
    expect(row.text()).toContain('You');
    await row.get('button').trigger('click');

    expect(emitOperation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'seat.release' }),
    );
  });

  it("shows Claimed with no button for someone else's seat", async () => {
    const someoneElses = makeSeat({ claimedByDeviceToken: 'someone-else' });
    vi.mocked(seatsApi.listSeats).mockResolvedValue([someoneElses]);

    const wrapper = mountRoster();
    await flushPromises();

    const row = wrapper.get('.seat-row');
    expect(row.text()).toContain('Claimed');
    expect(row.find('button').exists()).toBe(false);
  });

  it('claims an unprotected seat immediately when Claim is clicked', async () => {
    const seat = makeSeat();
    vi.mocked(seatsApi.listSeats).mockResolvedValue([seat]);
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    const wrapper = mountRoster();
    await flushPromises();
    await wrapper.get('.seat-row button').trigger('click');
    await flushPromises();

    expect(emitOperation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'seat.claim', payload: { seatId: seat.id } }),
    );
  });

  it('shows a PIN form instead of claiming immediately for a pin-protected seat', async () => {
    const seat = makeSeat({ isGM: true, pin: '1234' });
    vi.mocked(seatsApi.listSeats).mockResolvedValue([seat]);
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    const wrapper = mountRoster();
    await flushPromises();
    await wrapper.get('.seat-row button').trigger('click');
    await flushPromises();

    expect(emitOperation).not.toHaveBeenCalled();
    await wrapper.get('.pin-form input').setValue('1234');
    await wrapper.get('.pin-form').trigger('submit');
    await flushPromises();

    expect(emitOperation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'seat.claim',
        payload: { seatId: seat.id, pin: '1234' },
      }),
    );
  });

  it('creates a seat from the form and clears it', async () => {
    const created = makeSeat({ name: 'Brand New Character' });
    vi.mocked(seatsApi.createSeat).mockResolvedValue(created);

    const wrapper = mountRoster();
    await flushPromises();

    await wrapper.get('#new-seat-name').setValue('Brand New Character');
    await wrapper.get('form.create-seat').trigger('submit');
    await flushPromises();

    expect(seatsApi.createSeat).toHaveBeenCalledWith(
      WORLD_ID,
      'Brand New Character',
      false,
      undefined,
    );
    expect(wrapper.text()).toContain('Brand New Character');
  });
});
