// Endurecimiento de la lectura del bridge (Nivel 1: timeout + retry con backoff) y handshake de
// versión (Nivel 2: bridgeVersionDrift). Se stubea globalThis.fetch; el backoff se anula con
// sleep inyectado para que el test sea instantáneo.
//   node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchBridge, bridgeVersionDrift, EXPECTED_BRIDGE_VERSION } from '../src/sync.mjs';

const noSleep = () => Promise.resolve();
const makeResp = (obj, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => obj,
});
const corruptResp = (status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => { throw new SyntaxError('Unexpected token <'); },
});

function withFetch(fn, body) {
  const prev = globalThis.fetch;
  globalThis.fetch = fn;
  return Promise.resolve(body()).finally(() => { globalThis.fetch = prev; });
}

test('bridgeVersionDrift: al día → null', () => {
  assert.equal(bridgeVersionDrift(EXPECTED_BRIDGE_VERSION), null);
  assert.equal(bridgeVersionDrift(EXPECTED_BRIDGE_VERSION + 1), null);
});

test('bridgeVersionDrift: versión vieja → stale con números', () => {
  const d = bridgeVersionDrift(EXPECTED_BRIDGE_VERSION - 1);
  assert.ok(d && d.stale);
  assert.equal(d.deployed, EXPECTED_BRIDGE_VERSION - 1);
  assert.equal(d.expected, EXPECTED_BRIDGE_VERSION);
});

test('bridgeVersionDrift: sin sello (null) → stale con deployed null', () => {
  const d = bridgeVersionDrift(null);
  assert.ok(d && d.stale);
  assert.equal(d.deployed, null);
});

test('fetchBridge devuelve secciones + bridgeVersion del sello', async () => {
  await withFetch(
    async () => makeResp({ meals: [{ id: 'm1' }], weights: [], bridgeVersion: 2 }),
    async () => {
      const r = await fetchBridge('https://x/exec', null, { sleep: noSleep });
      assert.equal(r.meals.length, 1);
      assert.equal(r.bridgeVersion, 2);
      assert.ok(Array.isArray(r.lifts));
    },
  );
});

test('fetchBridge: bridgeVersion ausente (deploy viejo) → null', async () => {
  await withFetch(
    async () => makeResp({ meals: [] }),
    async () => {
      const r = await fetchBridge('https://x/exec', null, { sleep: noSleep });
      assert.equal(r.bridgeVersion, null);
    },
  );
});

test('fetchBridge reintenta tras error de red y luego tiene éxito', async () => {
  let calls = 0;
  await withFetch(
    async () => { calls++; if (calls === 1) throw new TypeError('network down'); return makeResp({ meals: [], bridgeVersion: 2 }); },
    async () => {
      const r = await fetchBridge('https://x/exec', null, { sleep: noSleep });
      assert.equal(calls, 2);
      assert.equal(r.bridgeVersion, 2);
    },
  );
});

test('fetchBridge reintenta en 5xx', async () => {
  let calls = 0;
  await withFetch(
    async () => { calls++; if (calls < 3) return makeResp({}, 503); return makeResp({ meals: [] }); },
    async () => {
      const r = await fetchBridge('https://x/exec', null, { sleep: noSleep, retries: 2 });
      assert.equal(calls, 3);
      assert.ok(Array.isArray(r.meals));
    },
  );
});

test('fetchBridge NO reintenta en 4xx (falla de inmediato)', async () => {
  let calls = 0;
  await withFetch(
    async () => { calls++; return makeResp({}, 404); },
    async () => {
      await assert.rejects(fetchBridge('https://x/exec', null, { sleep: noSleep }), /HTTP 404/);
      assert.equal(calls, 1);
    },
  );
});

test('fetchBridge NO reintenta token inválido', async () => {
  let calls = 0;
  await withFetch(
    async () => { calls++; return makeResp({ ok: false, reason: 'unauthorized' }); },
    async () => {
      await assert.rejects(fetchBridge('https://x/exec', 'tok', { sleep: noSleep }), /Token del bridge inválido/);
      assert.equal(calls, 1);
    },
  );
});

test('fetchBridge reintenta JSON corrupto (HTML de error de Google) y agota', async () => {
  let calls = 0;
  await withFetch(
    async () => { calls++; return corruptResp(200); },
    async () => {
      await assert.rejects(fetchBridge('https://x/exec', null, { sleep: noSleep, retries: 2 }), /no es JSON/);
      assert.equal(calls, 3); // 1 + 2 reintentos
    },
  );
});

test('fetchBridge timeout aborta y mapea a error de Timeout', async () => {
  // fetch que nunca resuelve salvo por el abort del AbortController.
  const hanging = (u, o) => new Promise((_, reject) => {
    o.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
  });
  await withFetch(hanging, async () => {
    await assert.rejects(
      fetchBridge('https://x/exec', null, { sleep: noSleep, timeoutMs: 10, retries: 1 }),
      /Timeout del bridge/,
    );
  });
});
