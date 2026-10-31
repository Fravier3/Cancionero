# 2.3.4 — fragmentos de búsqueda coherentes

El fragmento mostrado bajo el título se extrae de la coincidencia completa en la letra, incluyendo frases repartidas entre renglones. Se elimina el fallback que elegía cualquier renglón con una sola palabra y el límite visual que escondía las últimas palabras. La coincidencia completa nunca se recorta del fragmento, aunque la consulta sea larga. Se conserva contexto alrededor y el texto original con sus acentos.

La búsqueda continúa exigiendo una frase continua en título o letra, ignorando diferencias de mayúsculas, acentos y espacios. No se combinan palabras dispersas. Cuando la letra contiene la consulta se muestra su fragmento aunque también coincida el título.

Trece pruebas unitarias y build aprobados. Prueba de navegador con el ejemplo JUNTOS / COMO / HERMANOS en tres renglones: muestra MARCHANDO TODOS JUNTOS COMO HERMANOS completo en móvil, con ajuste de línea. JUNTOS HERMANOS no devuelve resultados. Se comprobaron consultas largas, Unicode y ausencia de coincidencias. Datos del usuario y Supabase intactos.
