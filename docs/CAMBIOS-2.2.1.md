# 2.2.1 — omitir duplicados durante la revisión

El popup de duplicado incluye «Omitir canción y seguir» al revisar un lote de fotos. Avanza sin guardar otra copia y, si es la última canción, termina en la biblioteca. «Volver a revisar» conserva el formulario. El aviso por título coincidente conserva «Guardar igual» cuando las letras son diferentes; una letra idéntica no ofrece duplicarla. La comprobación de letras con otro título y la respuesta de duplicado del servidor utilizan el mismo flujo, sin tratar los conflictos de revisión como duplicados.

Verificado: siete pruebas unitarias, build y prueba de navegador sobre dist con servidor simulado: duplicado por título, misma letra con otro título, volver a revisar, guardar la siguiente canción nueva y omitir la última. Solo se emitió una escritura nueva y la canción existente permaneció intacta. No se hicieron llamadas de IA ni cambios en datos del usuario para esta prueba.
