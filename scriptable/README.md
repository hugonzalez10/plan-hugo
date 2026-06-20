# Widget de macros del día — Plan Hugo (iPhone + Mac)

Widget para la pantalla de inicio que muestra tus macros de **hoy** sin abrir la app:
Proteína, Carbos, Grasa y Fibra (valor/meta + barra), más calorías y agua.

Se hace con **[Scriptable](https://scriptable.app)** (app gratis que corre JS y dibuja
widgets nativos). Es **solo lectura**: no toca la app ni el bridge, solo consume el
endpoint que ya existe (`GET <BRIDGE_URL>?totals=YYYY-MM-DD`).

```
┌─────────────────────────────────────┐
│  Macros                sáb 20 jun    │
│  1234 / 2300 kcal      💧 1.2/3.1 L  │
│                                      │
│  Proteína       48/200 g  ▓▓▓░░░░░░  │
│  Carbos         19/178 g  ▓░░░░░░░░  │
│  Grasa           7/59  g  ▓░░░░░░░░  │
│  Fibra           7/30  g  ▓▓░░░░░░░  │
└─────────────────────────────────────┘
```

## Instalación

### 1. Instala Scriptable
- **iPhone**: App Store → "Scriptable" → instalar.
- **Mac** (Apple Silicon): el mismo App Store tiene la versión para Mac, *o* puedes
  mostrar el widget del iPhone vía Continuidad (ver paso 4).

### 2. Pega el script y tu BRIDGE_URL
1. Abre Scriptable → toca **+** (arriba a la derecha) para crear un script nuevo.
2. Pega todo el contenido de [`plan-hugo-macros.js`](plan-hugo-macros.js).
3. En la primera línea de CONFIG, reemplaza `PEGA_AQUÍ_TU_BRIDGE_URL` por tu bridge URL.
   - Es la misma de la app: **Ajustes → bridge URL** (el `/exec` del Apps Script).
   - Si no la ves ahí, está en `localStorage` bajo `state.settings.bridgeUrl`.
4. Renombra el script (toca el nombre arriba) a **"Plan Hugo Macros"**.
5. Toca **▶ (Play)** dentro de Scriptable: debería abrir una vista previa con tus
   números de hoy. Si dice *"Falta configurar BRIDGE_URL"* o *"No se pudo leer el
   bridge"*, revisa el paso 3.

### 3. Añádelo a la pantalla de inicio (iPhone)
1. Mantén pulsada la pantalla de inicio → **+** (arriba a la izquierda).
2. Busca **Scriptable** → elige el tamaño **Mediano** (es el que mejor cabe) → **Añadir
   widget**.
3. Mantén pulsado el widget recién puesto → **Editar widget** → en **Script** elige
   "Plan Hugo Macros". (Deja "When Interacting" en *Run Script* o *Open App*, da igual.)

### 4. En el Mac
Dos opciones:
- **Continuidad (recomendado)**: Ajustes del Sistema → **Escritorio y Dock** → activa
  **"Usar widgets del iPhone"**. Luego edita los widgets del Mac (clic en fecha/hora o
  clic derecho en el escritorio → *Editar widgets*) y añade el de Scriptable. Requiere
  que el iPhone esté cerca / en la misma cuenta.
- **Scriptable en Mac**: instala Scriptable desde el App Store del Mac (Apple Silicon),
  abre el mismo script y añade el widget desde el Centro de Notificaciones.

## Tamaños
- **Mediano** (recomendado): muestra las 4 barras + kcal + agua, como en el dibujo.
- **Grande**: igual que el mediano, con más aire.
- **Pequeño**: oculta las barras y deja solo `valor/meta` por macro + kcal + agua.

## Notas
- **Refresco**: iOS decide cuándo refrescar los widgets; el script *sugiere* ~15 min,
  pero puede tardar más. No es tiempo real. Para forzar, quita y vuelve a añadir el widget.
- **Sin conexión**: guarda el último dato OK del día y lo muestra con un aviso
  *"⚠︎ sin conexión · último dato"*.
- **Token**: el bridge tiene el token desactivado, así que no hace falta `&k=`. Si algún
  día lo reactivas, pega el token en `BRIDGE_TOKEN` dentro del script.

## Prueba rápida del endpoint (opcional)
Antes de depender del widget puedes verificar el JSON desde la terminal:

```bash
curl -L "<TU_BRIDGE_URL>?totals=$(date +%F)"
```

Debe devolver `{ "totals": { "protein": ..., "carbs": ... }, "targets": { ... } }`.
Esos números deben coincidir con la card **Macros** de la portada de la app.
