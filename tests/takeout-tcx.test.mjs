// Parser de curva de FC intra-sesión desde .tcx + downsample. Los .tcx traen ~600 pts (1/seg);
// se bajan a ~1 pt/30s (~60-120 pts) para no inflar el JSON del bridge (la app lo baja entero).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTcxHeartRate, downsampleHrSeries } from '../tooling/takeout-parse.mjs';

// Genera un .tcx con trackpoints cada `stepSec` desde t0, con bpm = base + i.
function tcx(n, { t0 = '2026-07-01T10:00:00Z', stepSec = 1, base = 100 } = {}) {
  const start = Date.parse(t0);
  let body = '';
  for (let i = 0; i < n; i++) {
    const t = new Date(start + i * stepSec * 1000).toISOString();
    body += `<Trackpoint><Time>${t}</Time><HeartRateBpm><Value>${base + i}</Value></HeartRateBpm></Trackpoint>`;
  }
  return `<?xml version="1.0"?><TrainingCenterDatabase><Activities><Activity><Lap><Track>${body}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
}

test('parsea Time + HeartRateBpm de cada Trackpoint, ordenado por tiempo', () => {
  const pts = parseTcxHeartRate(tcx(5));
  assert.equal(pts.length, 5);
  assert.equal(pts[0].bpm, 100);
  assert.equal(pts[4].bpm, 104);
  assert.ok(pts[0].t < pts[4].t);
});

test('ignora trackpoints sin FC (solo posición) y tolera el atributo xsi:type', () => {
  const xml = `<Track>
    <Trackpoint><Time>2026-07-01T10:00:00Z</Time><Position><LatitudeDegrees>-33</LatitudeDegrees></Position></Trackpoint>
    <Trackpoint><Time>2026-07-01T10:00:01Z</Time><HeartRateBpm xsi:type="HeartRateInBeatsPerMinute_t"><Value>130</Value></HeartRateBpm></Trackpoint>
  </Track>`;
  const pts = parseTcxHeartRate(xml);
  assert.equal(pts.length, 1, 'contó el punto sin FC');
  assert.equal(pts[0].bpm, 130);
});

test('downsample: ~1 pt/30s, promedia por bucket y usa offsets desde el inicio', () => {
  // 90 pts a 1/seg (0..89s) → buckets 0-29, 30-59, 60-89 → 3 puntos en t=0,30,60.
  const pts = parseTcxHeartRate(tcx(90, { stepSec: 1, base: 100 }));
  const ds = downsampleHrSeries(pts, { stepSec: 30 });
  assert.equal(ds.length, 3);
  assert.deepEqual(ds.map((p) => p.t), [0, 30, 60]);
  // bucket 0 = promedio de bpm 100..129 = 114.5 → 115 (redondeado)
  assert.equal(ds[0].bpm, 115);
  assert.equal(ds[1].bpm, 145); // 130..159 → 144.5 → 145
});

test('downsample recorta al cap para no inflar el JSON', () => {
  // 4000 pts a 1/seg, step 30s → ~134 buckets; cap 60 recorta.
  const pts = parseTcxHeartRate(tcx(4000, { stepSec: 1 }));
  const ds = downsampleHrSeries(pts, { stepSec: 30, cap: 60 });
  assert.equal(ds.length, 60, 'no respetó el cap');
});

test('serie vacía o sin FC → []', () => {
  assert.deepEqual(downsampleHrSeries([]), []);
  assert.deepEqual(parseTcxHeartRate('<Track></Track>'), []);
  assert.deepEqual(parseTcxHeartRate(null), []);
});
