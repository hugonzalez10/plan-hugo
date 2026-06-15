/** Config del build de Tailwind (reemplaza el Play CDN cdn.tailwindcss.com).
 *  Debe espejar la config inline que tenía index.html: darkMode 'class' + fuente del sistema.
 *  El content escanea app.jsx (fuente, NO el app.js minificado) + index.html: ahí viven todas
 *  las clases como literales completos (incl. los mapas tipo COLOR_CLASSES), así que el purge
 *  no se come ninguna. */
module.exports = {
  content: ['./index.html', './app.jsx'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
};
