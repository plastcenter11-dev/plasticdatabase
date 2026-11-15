import { describe, it, expect } from 'vitest';
import { createSingleFlight, requestKey } from './singleFlight';

describe('single flight', () => {
  it('sends an identical write once while it is in flight and shares the answer', async () => {
    const once = createSingleFlight();
    let calls = 0;
    const send = () => new Promise(r => setTimeout(() => { calls++; r({ id: calls }); }, 10));
    const [a, b] = await Promise.all([once('post /x {"a":1}', send), once('post /x {"a":1}', send)]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
  });

  it('different writes go through separately', async () => {
    const once = createSingleFlight();
    let calls = 0;
    const send = () => Promise.resolve(++calls);
    await Promise.all([once('post /x {"a":1}', send), once('post /x {"a":2}', send), once('delete /x/1 ', send)]);
    expect(calls).toBe(3);
  });

  it('the same write can be sent again once the first has finished', async () => {
    const once = createSingleFlight();
    let calls = 0;
    const send = () => Promise.resolve(++calls);
    await once('k', send);
    await once('k', send);
    expect(calls).toBe(2);
  });

  it('a failed write is shared with the duplicate, then forgotten', async () => {
    const once = createSingleFlight();
    let calls = 0;
    const send = () => new Promise((_, rej) => setTimeout(() => { calls++; rej(new Error('boom')); }, 5));
    const results = await Promise.allSettled([once('k', send), once('k', send)]);
    expect(results.every(r => r.status === 'rejected')).toBe(true);
    expect(calls).toBe(1);
    await expect(once('k', send)).rejects.toThrow('boom');
    expect(calls).toBe(2);
  });

  it('a key of null (reads, uploads) is never merged', async () => {
    const once = createSingleFlight();
    let calls = 0;
    const send = () => Promise.resolve(++calls);
    await Promise.all([once(null, send), once(null, send)]);
    expect(calls).toBe(2);
  });
});

describe('request key', () => {
  it('reads and uploads have no key; writes are told apart by method, address and body', () => {
    expect(requestKey({ method: 'get', url: '/items' })).toBeNull();
    expect(requestKey({ method: 'post', url: '/backup/restore', data: { not: 'a string' } })).toBeNull();
    const a = requestKey({ method: 'post', baseURL: '/api', url: '/finance/cash-receipts', data: '{"amount":5}' });
    expect(a).toBe(requestKey({ method: 'POST', baseURL: '/api', url: '/finance/cash-receipts', data: '{"amount":5}' }));
    expect(a).not.toBe(requestKey({ method: 'post', baseURL: '/api', url: '/finance/cash-receipts', data: '{"amount":6}' }));
    expect(requestKey({ method: 'delete', url: '/x/1' })).not.toBe(requestKey({ method: 'delete', url: '/x/2' }));
  });
});
