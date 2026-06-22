// Carga las funciones PURAS de apps-script/bridge-writer.gs en Node para testearlas
// sin desplegar nada. El .gs es JS plano (no se bundlea), así que lo leemos, stubeamos
// los globals de Apps Script (Utilities, DriveApp, LockService, ContentService) y lo
// evaluamos en un Function aislado que devuelve las funciones que nos interesan.
//
// Solo se invocan en los tests funciones puras (sin I/O de Drive): _norm, _sig,
// _entryTs, _contentUnion, _totals, _prune, _mergeInto, _authed. Los stubs cubren lo
// poco que tocan (Utilities.getUuid en _contentUnion); el resto son no-ops.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'apps-script', 'bridge-writer.gs'), 'utf8');

const stubs = `
  let __uuid = 0;
  const Utilities = { getUuid: () => 'uuid-' + (++__uuid) };
  const DriveApp = {
    getFileById: () => ({ getBlob: () => ({ getDataAsString: () => '{}' }), setContent: () => {}, getParents: () => ({ hasNext: () => false }) }),
    getFilesByName: () => ({ hasNext: () => false }),
  };
  const LockService = { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) };
  const ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => s }) };
`;

const factory = new Function(`
  ${stubs}
  ${src}
  return {
    _norm, _sig, _entryTs, _contentUnion, _totals, _prune, _mergeInto, _updateInto, _reconcile, _authed,
    _mealSlot, _slotByTime, _entryFromParams, _checkRedundant,
    SECTIONS, WINDOW_MS, RETENTION, SNAPSHOT_RETENTION_DAYS,
    HEALTH_MERGE_FIELDS, WORKOUT_MERGE_FIELDS, ENERGY_MERGE_FIELDS, WEIGHT_MERGE_FIELDS, LIFT_MERGE_FIELDS,
  };
`);

export const gs = factory();
