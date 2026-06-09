# Plan Hugo — Método de construcción de menú (para integrar a la app)

> Complemento de `plan-hugo-planificador-spec.md`. Este documento NO es la spec de UI;
> es el **algoritmo de decisión** que se usó manualmente para armar el menú del 09/06 en
> conversación con Hugo. Code debe traducir esta lógica al motor del planificador (validaciones
> en vivo) y al prompt del generador IA. Es la "inteligencia" detrás del módulo.

---

## Principio rector

El menú no se arma maximizando un solo número. Se arma satisfaciendo **restricciones duras**
primero y **optimizando preferencias** después, dejando que el total caiga donde caiga dentro
de la banda. Hugo prioriza **adherencia realista sobre perfección**: una pauta que sigue vale
más que una óptima que abandona.

---

## Paso 1 — Anclar lo fijo

El usuario fija comidas inamovibles (típicamente almuerzo y cena, porque dependen de qué tiene
en casa o de su día clínico). El planificador toma esos slots como **dados** y solo trabaja los
huecos restantes. Nunca re-optimizar lo que el usuario ya fijó.

En el caso 09/06: almuerzo (quinoa+pollo+fruta) y cena (atún) fijos → el motor solo arma
desayuno, colación 1 y colación 2.

## Paso 2 — Calcular el déficit a cubrir

Restar lo fijo de los targets y mostrar lo que queda:
```
restante_proteina = 190 − Σ(proteína de slots fijos)
restante_kcal     = 2000 − Σ(kcal de slots fijos)
```
Esto le dice al usuario (y al generador) cuánta proteína hay que repartir en los huecos. En el
chat esto fue explícito: "te quedan ~1.310 kcal y necesitas ~110 g de proteína más para cerrar
en 190". **Mostrar siempre este restante** — es la brújula del armado.

## Paso 3 — Llenar huecos respetando las reglas de toma

Cada hueco se llena con alimentos de la biblioteca apuntando a:
- **≥ 36 g proteína por toma** (umbral de estímulo MPS). Si una combinación queda en 31–35,
  marcarla y ofrecer el "empujón" mínimo (½ scoop, +20 g de un alimento) para cruzar el umbral.
- **≤ 5 h entre tomas con proteína.** Si el desayuno es 08:30 y el almuerzo 14:00 (5,5 h),
  forzar una colación intermedia (~11:00). Esto se detectó y corrigió en el chat.
- **Distribución, no acumulación.** El riesgo conductual de Hugo es subalimentarse de día y
  pasarse de noche. El motor debe front-cargar proteína y kcal antes de las 18:00.

## Paso 4 — Aplicar preferencias blandas (en orden)

1. **No repetir** alimentos dentro del mismo día (Hugo lo pidió explícito). El generador debe
   trackear lo ya usado y penalizar repeticiones.
2. **No nueces** (restricción dura, nunca proponer).
3. **Priorizar fibra** en los huecos: Hugo tiene déficit estructural de fibra (su patrón es
   proteína animal + suplementos, casi sin fibra). Ante dos opciones de proteína equivalente,
   elegir la que aporte más fibra (edamame seco 7 g, Quest Bar 14 g, chía 3,5 g, frambuesa 2 g).
4. **Portabilidad** para colaciones: por turnos/visitas domiciliarias, preferir opciones sin
   refrigeración (charqui, Quest Bar, edamame seco) sobre las que requieren frío.
5. **GI bajo**: con índice visceral 15, penalizar carbo simple y azúcar.

## Paso 5 — Sumar y evaluar contra la banda, no contra un punto

El total NO tiene que dar exactamente 2.000. Tiene que caer en la banda:
- kcal: ≤ 2.000 (techo duro). Quedar 200–400 bajo está bien; **no forzar a comer de más** para
  "llenar" el target. Esto se dijo literal en el chat.
- proteína: ≥ 190 (piso duro). Pasarse es bien.
- carbos/grasa: flexibles, son resultado, no objetivo.
- fibra: apuntar a 30, aceptar 22–25 si el resto cierra.

**Regla crítica anti-error**: las kcal de ejercicio NO abren margen para comer. El total se
evalúa contra 2.000 fijo, sin sumar lo quemado.

## Paso 6 — Cruzar contra el ritmo de pérdida (no contra la aritmética)

Si el peso baja > 0,7 %/semana, el déficit es demasiado agresivo aunque las kcal "cuadren" en
papel. El feedback del lunes debe leer la tendencia de peso, no un día suelto. Un total de
~1.600 kcal puede ser demasiado bajo si la baja semanal se acelera — avisar, no celebrar.

---

## Cómo se traduce esto al producto

### En el planificador manual (validaciones en vivo)
- Mostrar `restante` (Paso 2) actualizándose con cada alimento agregado.
- Badge por slot: verde ≥36 g P / ámbar <36 g / con tooltip explicando el umbral.
- Aviso de brecha temporal >5 h (Paso 3).
- Barra de total contra banda (Paso 5), techo kcal en rojo, piso proteína en rojo.
- Nota de fibra al cierre (Paso 4.3).

### En el prompt del generador IA
Pasarle al modelo, además de targets y biblioteca:
- los slots fijos del usuario (no tocarlos),
- el `restante` calculado (Paso 2),
- las preferencias en orden (Paso 4),
- la instrucción de banda, no punto (Paso 5): "no rellenes hasta 2.000; quedar bajo está bien,
  no propongas comida de más".
Y pedirle que devuelva, junto al JSON de slots, una `nota` de 1 línea con el mismo tipo de
lectura que daría un coach (ej. "déficit amplio hoy, vigila que la baja no pase 0,7%/sem").

### Caso de prueba (debe reproducirse)
Cargando los 5 slots del 09/06 (ver apéndice de la spec), el motor debe:
- detectar que las colaciones de 11:00 (31 g) y 18:00 (30 g) quedan bajo umbral → ámbar,
- confirmar total proteína ~201 g ✓ (sobre piso pese a las dos tomas bajas),
- confirmar kcal ~1.700 bajo techo,
- marcar fibra ~25 < 30 con nota.

---

## Nota sobre exportar el chat crudo

Hugo pidió "exportar este chat". La transcripción completa tiene mucho ruido (correcciones,
cambios de opinión, idas y vueltas sobre gramajes). Para Code, este método destilado es más
útil que el log. Si de todas formas se quiere el chat literal, se exporta desde la app de Claude
(menú de la conversación → exportar), no desde aquí — esta sesión no puede generar el historial
completo como archivo.
