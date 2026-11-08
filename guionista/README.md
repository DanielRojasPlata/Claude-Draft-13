# Guionista

Editor de guiones original (Electron). Formato de industria automático, formatos personalizables, medidor de tiempo en pantalla, exportación PDF y asistente de IA flotante (ChatGPT / Claude / Gemini).

- Ejecutar en desarrollo: `npm install && npm start`
- Pruebas: `npm test` (lógica) · `xvfb-run -a node_modules/electron/dist/electron --no-sandbox test/smoke.js` (e2e)
- Ejecutable portable de Windows: `npm run dist` → `dist/Guionista-Portable.exe`

## Uso rápido
Enter crea el siguiente elemento según el flujo (Escena→Acción, Personaje→Diálogo, Diálogo→Acción). Tab en una línea vacía cambia el tipo; Tab al final de una línea crea el siguiente (Acción→Personaje). Ctrl+1…9 fuerza el elemento. Escribir `INT.`/`EXT.` crea un encabezado; el autocompletado ofrece localizaciones, momentos del día, personajes y extensiones. Menú Ayuda → Atajos de teclado.

## Seguridad y privacidad
Sin telemetría. `contextIsolation`, `sandbox`, CSP estricta, IPC con validación del remitente. Solo se accede a la red al abrir el asistente de IA, en sesiones aisladas (`persist:ai-*`) y con navegación limitada a los dominios de cada proveedor. No se guardan claves ni contraseñas.
