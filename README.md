# Mi Cancionero

App: https://fravier3.github.io/Cancionero/

PWA modular, sin build. Fondo blanco fijo, biblioteca local, OCR en español y misas compartidas.

## Navegación y modos

Primera entrada: selector Editor/Visor guardado en `localStorage` (`cancionero.mode.v1`). El botón de la cabecera permite corregir la elección. Es una preferencia de interfaz, no autenticación: se mantiene la edición colaborativa autorizada en Supabase. Visor oculta añadir/editar/borrar; muestra Canciones, Misa y Evangelio.

**Añadir** reúne Escribir y Tomar foto mediante un selector. **Canciones** combina la biblioteca local con copias de las canciones de la misa publicada del domingo correspondiente; las compartidas son de lectura y no se duplican si ya existe la misma letra local. Se eliminó el aviso de instalación.

## Evangelio del domingo

Fuente primaria: Reader Evangelizo (`https://feed.evangelizo.org/v2/reader.php`), calendario romano ordinario en español. Se consulta `type=xml&lang=SP&date=YYYYMMDD` para el mismo domingo usado por Misa. Se comprueba la fecha devuelta antes de mostrar contenido. Se ofrecen primera lectura, salmo, segunda lectura cuando la celebración la incluye y evangelio. Se acredita y enlaza Evangelizo dentro de la app.

Se guarda únicamente la última fecha cargada en `cancionero.sunday-readings.v1`. Una copia de otro domingo nunca se muestra como actual. Ante errores se ofrece reintento y, si existe, la copia del domingo correcto. La fuente se revalida cada seis horas o al pulsar Actualizar. No se copian las lecturas al código del repositorio ni a la base de datos.

Canciones y lecturas se abren a pantalla completa, con fuente inicial de 28 px, A−/A+ persistente (hasta 64 px), navegación entre lecturas y zoom nativo con los dedos. Se respetan áreas seguras y se amplía el ancho útil en escritorio.

## Fotos y letras

- Cámara o galería → recorte con esquinas/controles accesibles y giro → OCR → revisión → guardar.
- La imagen, el recorte y el resultado sin guardar viven solamente en memoria. No se suben fotos ni se persisten borradores de OCR. Una captura nueva reemplaza el texto; «Añadir foto» permite unir páginas explícitamente.
- Se termina el worker después de cada lectura. El motor y el idioma pueden estar en la caché de recursos estáticos; no contienen capturas del usuario.
- Los saltos de línea, espacios y separación entre estrofas se reconstruyen con las coordenadas de palabras. La precisión depende de la foto; revisar antes de guardar.
- Se descartan borradores de la versión antigua porque no distinguían las capturas del texto escrito. Las canciones guardadas en IndexedDB se conservan.

## Misa compartida

- Se abre el domingo actual o el próximo según la fecha local del dispositivo. Sábado y domingo apuntan a la misma celebración. Se puede elegir otra fecha.
- Todos ven las canciones, letras y orden publicados, sin cuenta. Por decisión expresa del propietario, todos pueden pulsar **Editar misa** y **Guardar cambios para todos**.
- Los cambios se consultan cada 10 segundos mientras la sección está visible y al volver a la app. Durante la lectura, una actualización ofrece un botón para cargar el repertorio nuevo sin interrumpir la canción actual.
- Publicación con control de revisión: una edición antigua se rechaza si otra persona guardó primero. Sin conexión se muestra la última copia descargada; no se encolan publicaciones silenciosas.
- Las letras de la misa son copias del repertorio al añadirlas. Las ediciones posteriores de la biblioteca local no cambian una misa publicada.
- Los respaldos incluyen letras y copias descargadas de misas. Importar un respaldo no publica nada; se puede recuperar una misa local desde la edición de una fecha vacía.

## Supabase

Proyecto existente **Desarollos Fran** (`syyealdlapxmpeccaary`). Tabla independiente `public.cancionero_masses`; no se cambian las tablas de otras apps. Esquema de referencia: `docs/supabase-schema.sql`; migración remota `cancionero_shared_sunday_masses`.

El frontend utiliza solamente una clave publicable. RLS permite lectura y edición colaborativa intencional. Los permisos por columna permiten insertar fecha/letras y editar letras; el servidor controla fecha inmutable, revisión y hora. No se otorga DELETE. Se limitan fechas a domingos, cantidad de canciones y tamaño del texto. No hay funciones SECURITY DEFINER ni credenciales privilegiadas en el cliente.

## Desarrollo y verificación

`python -m http.server 8080` para abrir localmente. `node --test tests/logic.test.mjs` comprueba fechas y reconstrucción de estrofas. Subir la versión en `index.html`, `version.json` y `sw.js` en cada publicación.

El service worker actualiza sin reinstalación, conserva IndexedDB y elimina solo cachés de Cancionero. La recarga automática se aplaza mientras hay una captura, una letra sin guardar o una misa en edición.
