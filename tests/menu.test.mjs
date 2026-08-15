// Menú semanal (src/menu.mjs): integridad de los datos del docx, toma activa por hora,
// cobertura de tomas cruzando lo ya registrado (chat/banco/card), extra registrable y
// proyección de cierre (debe reproducir la tabla del docx: 1.822 kcal · P 222 · F 47).
//   node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEEKLY_MENU, menuAppliesToDate, hasStrengthWorkout, menuTomasForDay, defaultVariant,
  activeMenuToma, tomaCoverage, menuExtraFromVariant, projectedMenuTotals, slotDoubleLogWarning,
} from '../src/menu.mjs';
import { PLAN_SLOTS } from '../src/meals.mjs';

const at = (h, m = 0) => new Date(2026, 6, 1, h, m, 0); // miércoles 01-jul-2026, hora local
const tomaById = (id) => WEEKLY_MENU.tomas.find((t) => t.id === id);
const MACRO_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fiber'];

// ── Integridad del menú ──────────────────────────────────────────────────────────────
test('toda toma con slot usa un slot del plan; ids y variantes bien formados', () => {
  const tomaIds = new Set();
  for (const t of WEEKLY_MENU.tomas) {
    assert.ok(!tomaIds.has(t.id), `id de toma duplicado: ${t.id}`);
    tomaIds.add(t.id);
    if (t.slot != null) assert.ok(PLAN_SLOTS.has(t.slot), `slot desconocido en ${t.id}: ${t.slot}`);
    const defaults = t.variants.filter((v) => v.isDefault);
    assert.equal(defaults.length, 1, `${t.id} debe tener exactamente 1 variante default`);
    const varIds = new Set();
    for (const v of t.variants) {
      assert.ok(!varIds.has(v.id), `variante duplicada en ${t.id}: ${v.id}`);
      varIds.add(v.id);
      assert.ok(v.name && typeof v.name === 'string', `variante sin nombre en ${t.id}`);
      for (const k of MACRO_KEYS) {
        assert.equal(typeof v.macros[k], 'number', `${t.id}/${v.id}: macro ${k} no numérico`);
      }
    }
  }
  const presueno = tomaById('presueno');
  assert.equal(presueno.condition, 'strength-day');
  const psyllium = tomaById('psyllium');
  assert.ok(psyllium.isSupplement);
  assert.equal(psyllium.variants[0].macros.kcal, 0);
  assert.equal(psyllium.variants[0].macros.fiber, 8);
});

test('menuAppliesToDate: L–V sí, fin de semana no', () => {
  assert.equal(menuAppliesToDate('2026-07-01'), true);  // miércoles
  assert.equal(menuAppliesToDate('2026-07-03'), true);  // viernes
  assert.equal(menuAppliesToDate('2026-07-04'), false); // sábado
  assert.equal(menuAppliesToDate('2026-07-05'), false); // domingo
  assert.equal(menuAppliesToDate('2026-07-06'), true);  // lunes
  assert.equal(menuAppliesToDate('basura'), false);
  assert.equal(menuAppliesToDate(null), false);
});

// ── Toma activa por hora ─────────────────────────────────────────────────────────────
test('activeMenuToma recorre el día y nunca devuelve el psyllium', () => {
  const tomas = menuTomasForDay({ hasStrength: false });
  const CASES = [
    [5, 'desayuno'], [6, 30, 'desayuno'], [10, 'colacion1'], [13, 'almuerzo'],
    [17, 'colacion2'], [20, 'cena'], [23, 'cena'],
  ];
  for (const c of CASES) {
    const [h, m, expected] = c.length === 3 ? c : [c[0], 0, c[1]];
    assert.equal(activeMenuToma(tomas, at(h, m))?.id, expected, `falló a las ${h}:${m}`);
  }
});

// ── Cobertura de tomas ───────────────────────────────────────────────────────────────
test('tomaCoverage: extra con mealSlot directo cubre su toma', () => {
  const day = { extras: [{ id: 'a', mealSlot: 'colacion1', name: 'Charqui', kcal: 190 }] };
  assert.equal(tomaCoverage(day, tomaById('colacion1')).status, 'cubierta');
  assert.equal(tomaCoverage(day, tomaById('colacion2')).status, 'pendiente');
});

test('tomaCoverage: paraguas "colacion" del chat se resuelve por hora del ts', () => {
  const am = { extras: [{ id: 'a', mealSlot: 'colacion', name: 'Charqui', kcal: 190, ts: at(10, 30).getTime() }] };
  assert.equal(tomaCoverage(am, tomaById('colacion1')).status, 'cubierta');
  const pm = { extras: [{ id: 'b', mealSlot: 'colacion', name: 'Quest', kcal: 330, ts: at(18, 15).getTime() }] };
  assert.equal(tomaCoverage(pm, tomaById('colacion2')).status, 'cubierta');
  assert.equal(tomaCoverage(pm, tomaById('colacion1')).status, 'pendiente');
});

test('tomaCoverage: skipped → omitida; pick de banco + eaten → cubierta viaBank', () => {
  assert.equal(tomaCoverage({ skipped: ['cena'] }, tomaById('cena')).status, 'omitida');
  const cov = tomaCoverage({ snackId1: 's1', eaten: { colacion1: true } }, tomaById('colacion1'));
  assert.equal(cov.status, 'cubierta');
  assert.equal(cov.viaBank, true);
  // pick sin tick no cubre
  assert.equal(tomaCoverage({ snackId1: 's1' }, tomaById('colacion1')).status, 'pendiente');
});

test('tomaCoverage: psyllium/pre-sueño por menuTomaId o por nombre desde el chat', () => {
  const viaCard = { extras: [{ id: 'a', mealSlot: 'extra', name: 'Psyllium 10 g + agua', menuTomaId: 'psyllium' }] };
  assert.equal(tomaCoverage(viaCard, tomaById('psyllium')).status, 'cubierta');
  const viaChat = { extras: [{ id: 'b', mealSlot: 'extra', name: 'Psyllium husk en agua', source: 'skill-chat' }] };
  assert.equal(tomaCoverage(viaChat, tomaById('psyllium')).status, 'cubierta');
  const caseina = { extras: [{ id: 'c', mealSlot: 'extra', name: 'Caseína 1 scoop', source: 'skill-chat' }] };
  assert.equal(tomaCoverage(caseina, tomaById('presueno')).status, 'cubierta');
  assert.equal(tomaCoverage({ extras: [] }, tomaById('presueno')).status, 'pendiente');
});

// ── Extra registrable ────────────────────────────────────────────────────────────────
test('menuExtraFromVariant estampa slot exacto, macros y source menu', () => {
  const cena = tomaById('cena');
  const op4 = cena.variants.find((v) => v.id === 'op4');
  const x = menuExtraFromVariant(cena, op4, { id: 'u1', ts: 123 });
  assert.deepEqual(x, {
    id: 'u1', ts: 123, name: 'Yogur griego salado + atún + tomate + pepino',
    kcal: 300, protein: 48, carbs: 14, fat: 6, fiber: 4,
    mealSlot: 'cena', source: 'menu', menuTomaId: 'cena',
  });
  const psyllium = tomaById('psyllium');
  const p = menuExtraFromVariant(psyllium, defaultVariant(psyllium), { id: 'u2', ts: 456 });
  assert.equal(p.mealSlot, 'extra'); // no es toma del plan: bucket Extras
  assert.equal(p.fiber, 8);
});

// ── Proyección de cierre ─────────────────────────────────────────────────────────────
test('proyección default (ruta, sin fuerza) reproduce el cierre del docx', () => {
  const tot = projectedMenuTotals(menuTomasForDay({ hasStrength: false }));
  assert.equal(tot.kcal, 1822);
  assert.equal(tot.protein, 222);
  assert.equal(tot.carbs, 148);
  assert.equal(tot.fat, 45.5);
  assert.equal(tot.fiber, 47);
});

test('proyección con fuerza suma el pre-sueño; elegir variante casa cambia el total', () => {
  const conFuerza = projectedMenuTotals(menuTomasForDay({ hasStrength: true }));
  assert.equal(conFuerza.kcal, 1822 + 120);
  assert.equal(conFuerza.protein, 222 + 25);
  const casa = projectedMenuTotals(menuTomasForDay({ hasStrength: false }), { colacion2: 'casa' });
  assert.equal(casa.kcal, 1822 - 330 + 382);
});

// ── Fuerza y doble registro ──────────────────────────────────────────────────────────
test('hasStrengthWorkout detecta fuerza y no cardio', () => {
  assert.equal(hasStrengthWorkout({ exercise: [{ type: 'strength', kcal: 300 }] }), true);
  assert.equal(hasStrengthWorkout({ exercise: [{ type: 'cardio', kcal: 400 }] }), false);
  assert.equal(hasStrengthWorkout({}), false);
});

test('slotDoubleLogWarning solo cuando hay ≥2 registros y uno es de la card', () => {
  const toma = tomaById('colacion1');
  const doble = { extras: [
    { id: 'a', mealSlot: 'colacion1', name: 'Charqui + jalea Colún + edamame seco', source: 'menu' },
    { id: 'b', mealSlot: 'colacion1', name: 'Charqui con edamame', source: 'skill-chat' },
  ] };
  assert.equal(slotDoubleLogWarning(doble, toma), true);
  const soloChat = { extras: [
    { id: 'a', mealSlot: 'colacion1', name: 'Charqui', source: 'skill-chat' },
    { id: 'b', mealSlot: 'colacion1', name: 'Yogur', source: 'skill-chat' },
  ] };
  assert.equal(slotDoubleLogWarning(soloChat, toma), false); // repetición legítima del chat: no opinar
  const unoSolo = { extras: [{ id: 'a', mealSlot: 'colacion1', name: 'Charqui', source: 'menu' }] };
  assert.equal(slotDoubleLogWarning(unoSolo, toma), false);
});
