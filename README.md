# Mi Cancionero

PWA para guardar y leer letras de canciones: búsqueda por título o fragmento, categorías (entrada, ofertorio, comunión, salida…), lectura en fondo blanco y captura de letras con la cámara (OCR en el dispositivo; la foto nunca se guarda ni se sube).

App: https://fravier3.github.io/cancionero/

Sin build: HTML + módulos ES. Datos en IndexedDB (solo en el dispositivo; usa Ajustes → Exportar para respaldar). Al actualizar, subir la versión en `index.html`, `version.json` y `sw.js`.
