// A double click on "Save" (or a second tap on a slow connection) sends the same request twice, and the
// server would dutifully create two invoices or two receipts. This sends an identical write only once
// while the first one is still on its way: the second caller simply gets the first one's answer.

export function createSingleFlight() {
  const inflight = new Map();
  return (key, send) => {
    if (key === null) return send();                       // not something we can recognise: send as is
    if (inflight.has(key)) return inflight.get(key);
    const p = Promise.resolve().then(send).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}

// the identity of a write: what it does, where, and with which body (null for uploads and the like)
export function requestKey(config) {
  const method = String(config.method || 'get').toLowerCase();
  if (method === 'get' || method === 'head' || method === 'options') return null;
  if (config.data !== undefined && typeof config.data !== 'string') return null;
  return `${method} ${config.baseURL || ''}${config.url || ''} ${config.data || ''}`;
}
