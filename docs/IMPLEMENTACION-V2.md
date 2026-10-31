# Cancionero: actualización integral v2

## Auditoría y restauración

- Base Git: `ed2d9a740dfa74b96c0e0562f5ee043c9e78270e`.
- Rama de restauración: `restore/pre-integral-v2-20261031`.
- Respaldo remoto previo guardado de forma privada: 1 misa, sin canciones en su repertorio, revisión 5. No se modifican tablas de otras apps.
- IndexedDB `cancionero`: esquemas 1 y 2 preservados. Esquema 3 añade `cloudSongs`, `cloudCategories`, `migrationMap` y `meta`. Jamás borra ni sobrescribe `songs` o `categories` originales.
- Auth separada en IndexedDB `cancionero-auth`: token opaco verificable, caduca a los siete días y se puede revocar. La selección local de rol no concede privilegios.

## Backend

Tablas públicas nuevas `cancionero_songs` y `cancionero_categories`, con lectura pública por RLS y sin escrituras directas de anon/authenticated. Canciones incluyen título, número, letra, categoría, tonalidad estructurada, acordes con posiciones, huella para deduplicar, versiones y fechas. Borrado lógico protege restauraciones y evita pérdida accidental.

Esquema aislado `cancionero_private`: hash bcrypt de contraseña, sesiones con token hasheado, intentos, origen de migraciones y contadores de IA. Las funciones RPC son SECURITY DEFINER con ruta de búsqueda vacía y EXECUTE exclusivo de service_role; ningún cliente público puede invocarlas. Las Edge Functions comprueban sesiones y validan payloads antes de usar esos RPC.

Edge Functions: `cancionero-api` (sesiones, CRUD y migración) y `cancionero-recognize` (visión). Las operaciones de Misa ahora usan la sesión real y conservan su control de revisión.

Protecciones: 8 intentos de acceso por IP hasheada en 15 minutos; sesiones de 7 días; cierre individual y revocación global; peticiones de tamaño acotado; 2 reconocimientos por sesión/minuto; 20/día y 60 en total inicialmente, incluidos intentos fallidos para limitar reintentos de gasto. Los límites se administran en el backend. No equivalen a un límite monetario de la cuenta de OpenAI.

## OpenAI y privacidad

Modelo fijado `gpt-5.4-mini-2026-03-17`, compatible con visión y salidas estructuradas. Precios oficiales comprobados: USD 0.75/1M tokens de entrada y USD 4.50/1M tokens de salida; la factura real depende de imagen y respuesta. Fuente: https://developers.openai.com/api/docs/models/gpt-5.4-mini

Responses API, `store:false`, sin Files, conversaciones persistentes ni background. La imagen se mantiene en memoria, se envía al proveedor para transcripción y no entra en tablas, Storage, logs, GitHub, caché del SW ni respaldos. Solo se guardan identificador/hash de solicitud, estado, fecha y contadores de tokens. OpenAI puede conservar datos conforme a sus controles de retención; `store:false` no garantiza retención nula: https://developers.openai.com/api/docs/guides/your-data

Las instrucciones del usuario solo influyen en la extracción, no en autenticación ni capacidades del servidor. La IA no dispone de herramientas. La salida usa JSON Schema estricto y validación de tipos, longitud y posiciones Unicode; `anchorText` ayuda a resolver el carácter exacto de una palabra identificada. Datos no reconocidos quedan vacíos o marcados para revisión. Nada se guarda automáticamente en la biblioteca tras reconocer una foto.

## Migración desde iPhone

El propietario debe abrir la PWA existente, entrar como Editor y pulsar **Migrar canciones de este teléfono**. Se crea primero una copia de texto inmutable en `meta`, se envían lotes y se comprueban sus identificadores y contenido devueltos por el servidor. Se conserva un mapa de origen para reanudar sin duplicar. Otra importación con el mismo título/letra se deduplica por huella. Los originales permanecen en las tablas antiguas y en los respaldos.

Hasta realizar esta acción en el iPhone, la migración de los datos reales del usuario está **pendiente**: GitHub ni Supabase pueden leer ese almacenamiento local remotamente. Las pruebas con fixtures no sustituyen esa comprobación.

## Música e interfaz

Se mantienen Canciones, Añadir, Misa, Evangelio y Configuración. Añadir integra IA, instrucciones libres/favoritas/opciones rápidas, metadatos y editor de acordes. OCR tradicional desactivado por defecto y activable solo desde Configuración de Editor; no existe fallback silencioso.

Cada acorde se asocia con `{line, offset, chord}`; índices Unicode desde cero, contando líneas vacías. Se dibujan acordes rojos sobre fragmentos de letra negra, con varios acordes por línea y ajuste al tamaño. El selector de tonalidad no transpone. Cambios de letra remapean anclas fuera del fragmento editado y marcan las ambiguas para confirmación explícita.

Compilación Vite: solo `dist` se sube a Pages; fuentes, backend y pruebas quedan fuera del artefacto de hosting. El repositorio público sigue mostrando fuentes; minificar no las vuelve privadas. Se mantiene origen/ruta, icono, manifest y actualización PWA con caché versionada y sin borrar IndexedDB.

## Aceptación por apartado del documento

| Apartado | Estado |
|---|---|
|1 Información/proyecto existente|Comprobado|
|2 Auditoría, rama y respaldo remoto|Completado; datos reales del iPhone pendientes de abrir/migrar|
|3 Biblioteca central/categorías/RLS/offline/conflictos|Implementado; ver pruebas|
|4 Editor/Visor y contraseña servidor|Implementado; sesión backend real|
|5 Cambiar acceso desde Configuración|Implementado|
|6 OpenAI seguro en Edge|Implementado; conexión real verificada|
|7 Foto, recorte, rotación y extracción|Implementado|
|8 Instrucciones, opciones rápidas y favoritos|Implementado|
|9 Instrucción predeterminada|Implementado en servidor|
|10 Autorrelleno y revisión sin auto-guardar|Implementado|
|11 OCR opcional apagado por defecto|Implementado|
|12 Varios acordes por línea|Implementado y probado con Mi− / Do+|
|13 Estructura de acordes|Implementado|
|14 Mostrar/ocultar y lectura adaptable|Implementado|
|15 Edición y revisión de anclas|Implementado|
|16 Tonalidad mayor/menor sin transposición|Implementado|
|17 Privacidad de fotografías|Implementado; se documenta retención del proveedor|
|18 Administración y respaldos|Implementado|
|19 Secciones existentes|Conservadas|
|20 Seguridad integral|Implementada; pruebas descritas en PRUEBAS-V2.md|
|21 PWA/build/compatibilidad|Implementado; validación física pendiente|
|22 Pruebas obligatorias|Pruebas aprobadas y límites en PRUEBAS-V2.md|
|23 Publicación|Preparada para despliegue automático de dist|
|24 Mínima intervención humana|Únicamente apertura/migración del iPhone y prueba física|
|25 Transparencia/preservación|Aplicadas|
|26 Resultado final|Implementación entregada; migración real y hardware pendientes|
