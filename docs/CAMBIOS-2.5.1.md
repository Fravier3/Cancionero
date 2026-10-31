# 2.5.1 — dropdown con búsqueda para Misa

Cada momento permite desplegar la lista de canciones o escribir un título/fragmento literal de la letra dentro del dropdown. Los resultados muestran el título y el fragmento coincidente; tocar uno lo asigna al momento. Se puede quitar la selección. La descripción alternativa permanece disponible.

Quince pruebas unitarias y build aprobados. Navegador: nueve momentos, apertura de lista sin consulta, búsqueda por letra, cero resultados ante frase ausente, selección del resultado y guardado; recorrido de canción y descripción compartido con Visor comprobado. No se modificaron misas reales para probarlo.

Se corrigió además una referencia accidental de versión de la dependencia opcional fsevents en el lockfile; mantiene la versión e integridad del paquete original, sin cambiar las dependencias de ejecución de la app.
