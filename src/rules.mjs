// Evaluación de las reglas personales (cap de kcal, conteo semanal por categoría), pura
// (sin React/JSX). Extraída de app.jsx en la modularización (Etapa 1). Quedó extraíble
// limpio recién al salir el núcleo de comidas: depende de currentDayKcalIn/countCategoryInWeek
// de meals.mjs. Los catálogos RULE_TYPES/RULE_CATEGORIES (config de UI) se quedan en app.jsx.
import { currentDayKcalIn, countCategoryInWeek } from './meals.mjs';

// Evalúa una regla en un contexto: { action: 'add_extra' | 'add_dulce' | 'add_delivery', state, dateKey, targets, prospectiveKcal }
// Retorna { violated: bool, message: string }
export function evaluateRule(rule, ctx) {
  if (!rule?.enabled) return { violated: false };
  const { state, dateKey, targets, action, prospectiveKcal = 0 } = ctx;

  if (rule.type === 'kcal_cap_extras') {
    // Solo aplica a acciones que suman kcal por encima del cap
    if (action !== 'add_extra' && action !== 'add_dulce' && action !== 'add_delivery') return { violated: false };
    const cap = Number(rule.config?.kcalCap) || 2000;
    const current = currentDayKcalIn(state, dateKey, targets);
    const after = current + Number(prospectiveKcal || 0);
    if (after > cap && current >= cap) {
      return { violated: true, message: `Ya llevas ${Math.round(current)} kcal hoy (cap ${cap}). Sumar este extra te dejaría en ${Math.round(after)} kcal.` };
    }
    if (after > cap) {
      return { violated: true, message: `Esto te llevaría a ${Math.round(after)} kcal (cap ${cap}). Llevas ${Math.round(current)} hoy.` };
    }
    return { violated: false };
  }

  if (rule.type === 'count_per_week') {
    const cat = rule.config?.category;
    const max = Number(rule.config?.max) || 1;
    // Solo si la acción corresponde a esa categoría
    if (cat === 'dulce' && action !== 'add_dulce') return { violated: false };
    if (cat === 'delivery' && action !== 'add_delivery') return { violated: false };
    if (cat === 'alcohol' && action !== 'add_alcohol') return { violated: false };
    const count = countCategoryInWeek(state, cat, dateKey);
    // Cuento ANTES de agregar: si ya estoy en max, este sería el (max+1)-ésimo
    if (count >= max) {
      return { violated: true, message: `Ya llevas ${count}/${max} ${cat}${count === 1 ? '' : 's'} esta semana.` };
    }
    return { violated: false };
  }

  return { violated: false };
}

// Estado de cada regla para mostrar como chip (sin acción): { rule, current, max, tone }
export function getRulesStatus(state, dateKey, targets) {
  const rules = state?.rules || [];
  const out = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.type === 'kcal_cap_extras') {
      const cap = Number(rule.config?.kcalCap) || 2000;
      const current = Math.round(currentDayKcalIn(state, dateKey, targets));
      const tone = current >= cap ? 'red' : current >= cap * 0.9 ? 'amber' : 'green';
      out.push({ rule, current, max: cap, label: 'kcal hoy', tone, unit: 'kcal' });
    } else if (rule.type === 'count_per_week') {
      const cat = rule.config?.category;
      const max = Number(rule.config?.max) || 1;
      const current = countCategoryInWeek(state, cat, dateKey);
      const tone = current >= max ? 'red' : current >= max - 0.001 ? 'amber' : 'green';
      const label = cat === 'dulce' ? 'dulces' : cat === 'delivery' ? 'delivery' : cat === 'alcohol' ? 'alcohol' : cat;
      out.push({ rule, current, max, label, tone, unit: 'sem' });
    }
  }
  return out;
}

// Evalúa todas las reglas para una acción; devuelve array de violaciones
export function evaluateAllRules(state, action, ctx) {
  const rules = state?.rules || [];
  const violations = [];
  for (const rule of rules) {
    const res = evaluateRule(rule, { ...ctx, state, action });
    if (res.violated) violations.push({ rule, message: res.message });
  }
  return violations;
}
