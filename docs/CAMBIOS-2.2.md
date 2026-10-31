# Versión 2.2 — categorías, revisión de fotos y salmo

## Cambios

- Las categorías eliminadas en Supabase ya no reaparecen desde las categorías locales iniciales. Se conservan los originales de IndexedDB; solo se muestran categorías locales necesarias para canciones aún pendientes de migrar. Los fallos de borrado se muestran con un aviso. Tras escribir se espera cualquier sincronización anterior y se solicita una copia nueva para evitar mostrar una respuesta previa al borrado.
- Orden compartido `sort_order`: arrastre por el asa ⠿ en Configuración, con flechas como alternativa accesible. Se utiliza la misma lista ordenada en filtros, selectores y ajustes. Las categorías nuevas se añaden al final. Escrituras autenticadas y control de revisiones; no se concede escritura pública.
- Visión devuelve hasta 12 canciones independientes por imagen, con sus propios metadatos y acordes. Revisión en memoria, contador y editor habitual. Guardar avanza solo después de confirmarse el guardado del servidor; los fallos mantienen la canción actual. Se puede omitir una canción. Al terminar vuelve al listado. Salir advierte sobre pendientes; recargar descarta el lote sin guardar y nunca persiste la foto. Para añadir una página a una canción existente se pide recortar una sola canción si se detectan varias.
- Esquema estructurado de OpenAI ampliado a `songs[]`, con validación individual de anclas Unicode. Respuesta de compatibilidad `result` mantiene la primera canción para versiones anteriores de la app. Límite de salida de 14 000 tokens; los límites de llamadas y retención documentados siguen vigentes. Una imagen demasiado extensa puede necesitar un recorte menor; no se garantiza un número de canciones independientemente de su legibilidad.
- Salmo: líneas en blanco antes y después de cada respuesta R., conservando las estrofas. Editor puede modificar la frase desde Evangelio o desde el lector del salmo. La frase se aplica a todas las R. y se comparte por fecha en Supabase; se consulta al abrir/actualizar Evangelio incluso si las lecturas ya estaban guardadas. Conflictos de revisión rechazados. Los versos del lector se conservan.

## Backend y datos

Migración aditiva `backend/settings.sql`: añade orden a las categorías y tabla `cancionero_psalm_responses`, RLS de lectura pública y RPC de ajustes que exige sesión de Editor y tiene EXECUTE exclusivo de service_role. No modifica tablas de otras aplicaciones ni borra canciones o categorías originales del teléfono.

## Pruebas realizadas

- Siete pruebas unitarias y compilación Vite aprobadas, incluidos espacios del salmo y sustitución de todas las respuestas sin alterar versos.
- Llamada **real** de OpenAI con imagen sintética de seis canciones: devuelve seis objetos independientes, números 1–6 y letra correspondiente a cada número. No se usó una foto del usuario ni se guardó una foto en el backend.
- Navegador móvil sobre dist: seis resultados de IA simulados para evitar otro cargo; edición de títulos, seis guardados reales independientes en Supabase, avance secuencial y retorno a biblioteca aprobados. También se verificaron selección UUID de Misa, captura limpia, permisos de Visor y cierre de sesión.
- Navegador: arrastre con puntero, orden en interfaz, eliminación real de una categoría sintética y ausencia de la antigua categoría Salida eliminada. La respuesta de guardar orden se simuló para no reordenar categorías reales del usuario durante la prueba.
- Transacción real de Postgres, revertida al terminar: orden completo de categorías, rechazo de revisión antigua, creación/edición de respuesta y rechazo de token falso. Datos originales de orden y salmo preservados.
- Navegador: edición de respuesta simulada para no cambiar el salmo real durante QA; todas las R. cambian, estrofas separadas y lector inspeccionado visualmente.
- Lectura pública permitida; escritura pública de respuestas y ejecución pública del RPC bloqueadas. Fixtures de canciones eliminados lógicamente y categorías sintéticas borradas tras pruebas.

Pruebas físicas de arrastre/cámara/PWA en iPhone y Android pendientes. La precisión de visión depende de la imagen: revisar cada canción antes de guardarla.
