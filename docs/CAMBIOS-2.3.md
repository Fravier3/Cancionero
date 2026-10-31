# 2.3 — varias categorías por canción

El editor permite marcar varias categorías mediante casillas, en el orden compartido de Configuración. Una canción aparece en cada filtro marcado y sigue contando una sola vez en Todas. Lector, búsquedas, selección de Misa, recuentos y edición muestran las categorías asociadas. Los respaldos incluyen los identificadores y las importaciones resuelven sus nombres.

Migración aditiva `backend/multi-categories.sql`: columna UUID[] `category_ids`, inicializada desde `category_id` sin borrar datos. Se mantiene el campo principal para compatibilidad. RPC validado acepta una lista de nombres; conserva categorías secundarias cuando una versión antigua envía solo una categoría. Eliminar una categoría conserva las restantes y la letra. No se cambian permisos públicos de escritura.

Verificado: nueve pruebas unitarias y build. Transacción real de Supabase, revertida al terminar: crear y editar dos categorías en una canción, eliminar la principal y conservar la secundaria. Prueba de navegador con API simulada: seleccionar Ofertorio/Salida, guardar un solo registro, encontrarlo en ambos filtros, ver ambas en el lector, mantener selección al editar y quitar una conservando la otra. No se alteraron canciones reales para las pruebas.
