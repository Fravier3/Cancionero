# 2.5 — momentos de Misa y recuperación de lectura de fotos

Misa se organiza en nueve campos: Entrada, Ten piedad, Gloria, Interleccional, Ofertorio, Santo, Cordero, Comunión y Despedida. Cada campo permite seleccionar de la biblioteca o escribir una descripción. Los campos vacíos se omiten al recorrer el repertorio. Descripción muestra `Cantaremos:` y el texto entre comillas con tres puntos finales; Editor y Visor reciben el mismo plan compartido. Se conservan las canciones de misas anteriores, incluidas entradas adicionales a los nueve campos, y el borrado confirmado. No se modifica ninguna misa existente automáticamente.

El servidor antes rechazaba durante cinco minutos la misma imagen/instrucción, incluso cuando el trabajo anterior ya estaba fallido o completado. Ahora la exclusión por contenido solo bloquea trabajos en curso recientes (dos minutos); cada ID de solicitud sigue siendo único, y los límites de gasto permanecen intactos. Un reintento explícito tras fallo o resultado perdido puede generar otra llamada de IA. El cliente conserva en memoria el último texto reconocido para reutilizarlo al reprocesar la misma captura; nada se restaura tras recargar ni se guardan fotos.

La salida de visión ya no descarta toda la transcripción por una tonalidad incompleta o un ancla fuera de rango: esos metadatos se vacían o marcan para revisión. El guardado sigue exigiendo confirmar las posiciones ambiguas. Se evita volver a abrir el teclado de instrucciones al cerrar el recorte para procesar.

## Pruebas

- Quince pruebas unitarias y compilación aprobadas: orden, campos vacíos, descripción con tres puntos, conservación de misas antiguas y extras.
- IA real: imagen sintética con seis canciones extraída correctamente por la Edge Function actualizada. No se guardó la foto en Supabase.
- Transacción real revertida: una segunda llamada concurrente con el mismo contenido se rechaza 409; tras marcar fallido se acepta un ID nuevo. No se cambian límites del usuario.
- Navegador con API simulada: seleccionar canción, introducir descripción interleccional, guardar metadatos, recorrer letras y descripción, cambiar a Visor y comprobar el mismo texto. Flujo galería/instrucciones/edición y guardado también aprobado.
- RPC real conserva `moment`, `kind` y `description` al compartir; prueba revertida. No se cambian misas reales en QA.

Validación física de cámara, recorte y publicación instalada en iPhone/Android pendiente. Los metadatos de OCR siempre requieren revisión.
