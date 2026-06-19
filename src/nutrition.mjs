// Fórmula nutricional pura (metas diarias, TMB, semáforos de color), sin React/JSX.
// Extraída de app.jsx en la modularización (Etapa 1, sub-etapa 1b). Autocontenida: no
// depende de otros módulos. esbuild la reinjecta en el bundle; los tests la importan directo.

export const DEFAULT_TARGETS = { kcalMin: 2200, kcalMax: 2400, kcalRed: 2500, proteinMin: 160, proteinYellow: 140, carbsTarget: 240, fatTarget: 75, fiberTarget: 30, waterTarget: 3000 };

// Piso innegociable de proteína diaria en déficit (goal 'lose'): 200 g (~2.2-2.4 g/kg de
// peso objetivo 90 kg). Preserva masa magra y maximiza pérdida de grasa (Longland 2016).
export const PROTEIN_FLOOR_LOSE = 200;

export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const KCAL_PER_KG_FAT = 7700;

export function calcMifflinStJeor({ sex, weightKg, heightCm, age }) {
  if (!weightKg || !heightCm || !age) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'F' ? base - 161 : base + 5;
}

export function calcTargets(profile, opts = {}) {
  if (!profile) return DEFAULT_TARGETS;
  const bmr = calcMifflinStJeor(profile);
  const factor = ACTIVITY_FACTORS[profile.activityLevel] ?? 1.55;
  const formulaTdee = bmr != null ? bmr * factor : null;
  // TDEE adaptativo (gasto reconstruido del balance energético) manda sobre Mifflin cuando hay
  // datos suficientes; si no, cae a la fórmula. Reemplaza el factor de actividad poblacional
  // por TU gasto real medido (decisión del usuario).
  const adaptiveTdee = opts && Number.isFinite(opts.adaptiveTdee) && opts.adaptiveTdee > 0 ? opts.adaptiveTdee : null;
  const tdee = adaptiveTdee != null ? adaptiveTdee : formulaTdee;
  const tdeeBasis = adaptiveTdee != null ? 'adaptive' : (formulaTdee != null ? 'formula' : 'none');
  let kcalTarget;
  if (profile.kcalTarget != null) {
    kcalTarget = profile.kcalTarget;
  } else if (tdee != null) {
    const deficit = Number.isFinite(profile.kcalDeficit) ? profile.kcalDeficit : 400;
    if (profile.goal === 'lose') kcalTarget = Math.round(tdee - deficit);
    else if (profile.goal === 'gain') kcalTarget = Math.round(tdee + 300);
    else kcalTarget = Math.round(tdee);
  } else {
    kcalTarget = 2300;
  }
  // Proteína: en déficit calórico marcado el piso es INNEGOCIABLE (200 g/día, ~2.2-2.4
  // g/kg de peso objetivo 90 kg) para preservar masa magra y maximizar pérdida de grasa
  // (Longland 2016). El piso pisa incluso un proteinTarget manual más bajo.
  const proteinPerKg = profile.goal === 'gain' ? 2.0 : 1.8;
  let proteinTarget = profile.proteinTarget != null
    ? profile.proteinTarget
    : Math.round((profile.weightKg || 80) * proteinPerKg);
  // El piso de "bajar" solo pisa el valor AUTO-derivado. Si Hugo fija la proteína a mano
  // (override explícito), manda su número tal cual — manual significa manual.
  if (profile.goal === 'lose' && profile.proteinTarget == null) proteinTarget = Math.max(proteinTarget, PROTEIN_FLOOR_LOSE);
  const carbsTarget = profile.carbsTarget != null
    ? profile.carbsTarget
    : Math.round((kcalTarget * 0.40) / 4);
  const fatTarget = profile.fatTarget != null
    ? profile.fatTarget
    : Math.round((kcalTarget * 0.30) / 9);
  const fiberTarget = profile.fiberTarget != null ? profile.fiberTarget : 30;
  const waterTarget = profile.waterTarget != null
    ? profile.waterTarget
    : Math.round((profile.weightKg || 80) * 35);
  return {
    kcalMin: Math.round(kcalTarget * 0.92),
    kcalMax: kcalTarget,
    kcalRed: Math.round(kcalTarget * 1.08),
    proteinMin: proteinTarget,
    proteinYellow: Math.round(proteinTarget * 0.87),
    carbsTarget, fatTarget, fiberTarget, waterTarget,
    bmr: bmr != null ? Math.round(bmr) : null,
    tdee: tdee != null ? Math.round(tdee) : null,
    formulaTdee: formulaTdee != null ? Math.round(formulaTdee) : null,
    tdeeBasis,
  };
}

export function colorForKcal(kcal, targets) {
  const T = targets || DEFAULT_TARGETS;
  if (kcal > T.kcalRed) return 'red';
  if (kcal > T.kcalMax) return 'amber';
  if (kcal < T.kcalMin) return 'amber';
  return 'green';
}
export function colorForProtein(g, targets) {
  const T = targets || DEFAULT_TARGETS;
  if (g >= T.proteinMin) return 'green';
  if (g >= T.proteinYellow) return 'amber';
  return 'red';
}
export function colorForMacro(value, target, tolerance = 0.15) {
  if (!target) return 'amber';
  const lower = target * (1 - tolerance);
  const upper = target * (1 + tolerance);
  if (value < lower) return 'amber';
  if (value > upper) return 'red';
  return 'green';
}
export function colorForFiber(g, target) {
  if (!target) return 'amber';
  if (g >= target) return 'green';
  if (g >= target * 0.7) return 'amber';
  return 'red';
}
