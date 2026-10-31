# 2.4 — control de zoom y borrado de misa

## Zoom

La aplicación solicita escala fija mediante viewport y usa touch-action para permitir desplazamiento sin pellizco ni zoom por doble toque. Se bloquean los eventos de gesto multitáctil de Safari, doble clic, rueda con Ctrl y atajos de zoom del navegador que se entregan a la página. Se mantiene el desplazamiento con un dedo y los controles A+/A− del lector. El ampliador interno del recorte de imagen sigue siendo un control explícito independiente; no escala la página.

La configuración de accesibilidad/zoom del sistema operativo o los controles externos del navegador pueden prevalecer sobre una página web. Falta validación física en Safari/PWA de iPhone y Android.

## Borrar misa

Editor dispone de «Borrar misa», con confirmación «¿Estás seguro que quieres borrar esta misa?». Se indica el domingo y que el cambio se comparte para todos; las canciones de la biblioteca se conservan. Se permite cancelar sin cambios.

RPC de borrado exige sesión de Editor y la revisión que vio el usuario. Borrado lógico: se vacía el repertorio y se conserva una marca/versión para impedir que una pestaña antigua lo republique silenciosamente. El plan vacío se actualiza en la caché local y el repertorio compartido; después de actualizar se puede organizar explícitamente una misa nueva para esa fecha. La acción no se ofrece al Visor ni sin conexión.

Migración aditiva `backend/delete-mass.sql` y Edge API actualizada. No se borra ninguna misa real durante las pruebas.

## Verificación

- Trece pruebas unitarias y build aprobados.
- Navegador Chromium móvil: A+ aumenta y A− reduce, eventos de gesto/pellizco/doble clic y rueda Ctrl bloqueados, toque simple permitido. Gesto pinch real mediante CDP mantiene visualViewport.scale en 1.
- Navegador con API simulada: cancelar confirmación emite cero borrados, confirmar emite uno, repertorio queda vacío, canción de biblioteca permanece y Visor carece de botón de borrado.
- Transacción real de Supabase revertida al terminar: sesión falsa rechazada, borrado vacía repertorio y aumenta revisión, escritura antigua rechazada 409 y recreación explícita con revisión actual válida. RPC público sin permiso de ejecución. Misa real preservada.
