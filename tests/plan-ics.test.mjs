// Verifica el .ics que exporta el planificador: un VTODO por toma con items, DUE a su hora con
// TZID America/Santiago, UID único por toma+día (no duplica al reimportar), macros en la nota.
// Funciones puras extraídas de app.jsx con regex (sin JSX).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DEFAULT_TARGETS, colorForKcal, colorForProtein } from '../src/nutrition.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'app.jsx'), 'utf8');

const grab = (re, label) => { const m = src.match(re); assert.ok(m, `no se encontró ${label}`); return m[0]; };
// DEFAULT_TARGETS/colorForKcal/colorForProtein viven en src/nutrition.mjs y se inyectan al cierre;
// el resto (PLAN_TOMAS, analyzePlannedDay, buildDayICS…) sigue en app.jsx y se extrae por regex.
const pieces = [
  grab(/const PLAN_TOMAS = \[[\s\S]*?\];/, 'PLAN_TOMAS'),
  grab(/const MIN_PROTEIN_TOMA = \d+;/, 'MIN_PROTEIN_TOMA'),
  grab(/const MAX_GAP_HOURS = \d+;/, 'MAX_GAP_HOURS'),
  grab(/function hhmmToMin\([^{]*\)\s*\{[\s\S]*?\n\}/, 'hhmmToMin'),
  grab(/function analyzePlannedDay\([^{]*\)\s*\{[\s\S]*?\n\}/, 'analyzePlannedDay'),
  grab(/const VTIMEZONE_SANTIAGO = \[[\s\S]*?\];/, 'VTIMEZONE_SANTIAGO'),
  grab(/function icsEscape\([^{]*\)\s*\{[\s\S]*?\n\}/, 'icsEscape'),
  grab(/function buildDayICS\([^{]*\)\s*\{[\s\S]*?\n\}/, 'buildDayICS'),
];
const { buildDayICS } = new Function(
  'DEFAULT_TARGETS', 'colorForKcal', 'colorForProtein',
  `${pieces.join('\n')}; return { buildDayICS };`
)(DEFAULT_TARGETS, colorForKcal, colorForProtein);

const planned = [
  { id: 'x1', name: 'Salmón 150g', kcal: 280, protein: 35, carbs: 0, fat: 16, fiber: 0, planSlot: 'desayuno' },
  { id: 'x2', name: 'Pollo 150g', kcal: 250, protein: 38, carbs: 0, fat: 10, fiber: 0, planSlot: 'cena' },
];
const ics = buildDayICS('2026-06-09', planned, { kcalMax: 2000, proteinMin: 200, fiberTarget: 30, kcalMin: 1800, kcalRed: 2160, proteinYellow: 174 }, '2026-06-08T22:30:00Z');

test('estructura VCALENDAR + VTIMEZONE', () => {
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nEND:VCALENDAR$/);
  assert.match(ics, /TZID:America\/Santiago/);
});

test('un VTODO por toma con items (2)', () => {
  const todos = ics.match(/BEGIN:VTODO/g) || [];
  assert.equal(todos.length, 2);
});

test('DUE a la hora de la toma con TZID', () => {
  assert.match(ics, /DUE;TZID=America\/Santiago:20260609T083000/); // desayuno
  assert.match(ics, /DUE;TZID=America\/Santiago:20260609T210000/); // cena
});

test('UID único por toma+día', () => {
  assert.match(ics, /UID:20260609-desayuno@planhugo/);
  assert.match(ics, /UID:20260609-cena@planhugo/);
});

test('macros en la nota y nombre en el summary', () => {
  assert.match(ics, /SUMMARY:Desayuno — Salmón 150g/);
  assert.match(ics, /DESCRIPTION:~280 kcal \| P 35/);
});

test('día sin items → null', () => {
  assert.equal(buildDayICS('2026-06-09', [], {}, '2026-06-08T22:30:00Z'), null);
});
