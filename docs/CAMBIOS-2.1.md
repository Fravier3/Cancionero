# Cambios 2.1

- Recorte con panel amplio, imagen ampliable hasta 4× y desplazamiento dentro de la vista; bordes por arrastre o controles de precisión.
- Pestaña Foto y botones de cámara/galería al comienzo.
- Reserva superior adicional después del área segura; diálogos, lector, acceso y ajustes respetan los insets laterales, superiores e inferiores.
- Tonalidad en un selector (Do +, Do −, etc.), sin transponer acordes. Eliminado el botón de primera línea como título.
- Comparación de letra antes de guardar contra la biblioteca del servidor, ignorando tildes, signos, mayúsculas y variaciones de espacios; informa el título existente incluso si el nuevo título es distinto. No es una detección semántica de versiones diferentes; la comprobación de interfaz no sustituye la restricción de huella existente en el servidor.
- Organizar misa y opción Editar misa para repertorios existentes. Corregida la selección: conserva UUID de Supabase en lugar de convertirlo a número. Añadir, quitar, ordenar y publicar usan el editor existente.
- Salmo responsorial completo con respuesta R. desde USCCB, consultado por fecha mediante Edge Function pública de solo lectura. No necesita sesión ni IA. Si la fuente falla, se indica que falta la respuesta y se permite reintentar. Se identifica la variante del leccionario de México, que puede variar por parroquia; no se inventan respuestas.

## Verificación

Cinco pruebas unitarias y build aprobados. Navegador sobre dist: login, migración preservando originales, lectura pública desde otro contexto, tonalidad combinada, acordes, selección UUID de Misa, recorte ampliado 2×, captura limpia tras recarga, salmo con R., OCR opcional y logout aprobados. Endpoint público de salmo probado con 2026-11-01 y respuesta real de USCCB.

Áreas seguras positivas simuladas: 59px arriba, 34px abajo y 12px laterales; botones de encabezado y cierre de ajustes quedan fuera del área superior y son accionables. Validación física en iPhone/Android pendiente.
