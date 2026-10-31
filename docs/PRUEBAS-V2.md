# Pruebas v2 — 31 octubre 2026

## Verificado

- `npm test`: 5 pruebas aprobadas (domingo, estrofas/espacios, dos acordes, revisión de anclas y Unicode/escape).
- `npm run build`: compilación de producción y precaché de 20 recursos correctos.
- Backend real: contraseña incorrecta 401, sesión válida, lectura pública, escrituras públicas y RPC privados bloqueados; CRUD de canción y rechazo de revisión antigua 409; migración deduplicada y reanudable; borrado lógico.
- OpenAI real: dos imágenes sintéticas, extracción predeterminada y con instrucción de seleccionar canción 40; metadatos, estrofas y dos acordes. Ancla Do+ corregida al carácter 17 de «preparado». Solicitud repetida rechazada 409 antes de otro procesamiento.
- Navegador Chromium móvil 390×844 sobre compilación: actualización aditiva de IndexedDB antiguo; canción original conservada después de migrar a Supabase; otro contexto aislado ve la canción sin autenticarse; creación manual con número, tonalidad y dos acordes; tonalidad no transpone; mostrar/ocultar acordes y ampliar lector; búsqueda por letra; Visor sin edición; cuatro lecturas de Evangelio; configuración de OCR opcional y cierre de sesión real.
- Autorrelleno de foto en navegador usa el resultado de la prueba real de IA como fixture para evitar cargos repetidos: recorte, campos/acordes, ausencia de imagen en bases locales, recarga elimina captura sin guardar, sesión persiste. No equivale a una nueva llamada real de IA desde cámara física.
- Inspección visual del lector: se ajustó el espacio entre líneas y estrofas al eliminar saltos duplicados del HTML de acordes.
- Datos sintéticos de biblioteca borrados lógicamente tras las pruebas. Misa original y tablas de otras aplicaciones preservadas.

## Límites y pendientes explícitos

No se ha abierto el almacenamiento del iPhone real: sus canciones siguen pendientes de la migración que el propietario ejecutará desde Configuración. No reinstalar ni borrar datos del navegador.

No se han realizado pruebas físicas de cámara, instalación, teclado, áreas seguras y zoom en iPhone/Android; tampoco una actualización instalada de la PWA anterior sobre hardware real. La caché sin conexión y la actualización están implementadas, pero su comportamiento físico debe comprobarse en esos dispositivos. No se certifica precisión perfecta de OCR: revisar siempre el texto y las posiciones antes de guardar.

Los límites de IA y acceso se verificaron por implementación y permisos; no se consumió deliberadamente toda la cuota de OpenAI ni se ejecutó un ataque de carga. Las pruebas de importación masiva, conflictos simultáneos de Misa y recuperación sin conexión no cubren todos los escenarios posibles.

## Para comprobar en el teléfono

1. Abrir la app existente y aceptar la actualización cuando no haya edición pendiente.
2. Entrar como Editor con la contraseña acordada y exportar un respaldo.
3. Migrar canciones del teléfono, comprobar el recuento y abrirlas en otro dispositivo en modo Visor.
4. Probar una foto propia con recorte, revisar estrofas y acordes antes de guardar.
5. Revisar Misa, Evangelio, ampliación, modo avión y reconexión.
