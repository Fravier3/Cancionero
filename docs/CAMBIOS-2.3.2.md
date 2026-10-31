# 2.3.2 — búsqueda de frase continua

La búsqueda de Canciones exige que el texto escrito aparezca de forma continua en el título o la letra. Se eliminaron las coincidencias por palabras dispersas o reordenadas. Se ignoran mayúsculas, acentos y variaciones de espacios; se conserva la puntuación. Una consulta sin coincidencias muestra cero canciones y «Sin resultados». Vaciar el campo vuelve a mostrar la lista filtrada.

Once pruebas unitarias y build aprobados. Navegador: consulta con palabras dispersas y símbolos ausentes deja cero canciones; frase continua encuentra la letra; borrar consulta recupera la lista. No se modifican datos guardados ni Supabase.
