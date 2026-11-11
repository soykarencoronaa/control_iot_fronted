# Control IoT

Aplicación frontend estática y responsiva para operar la excavadora Makasan mediante la API FastAPI existente. Incluye una foto de cantera de referencia, la foto del modelo de juguete y dos joysticks analógicos virtuales. Está preparada para GitHub Pages; no contiene backend, claves, contraseñas ni acceso a MySQL/RDS.

## Arquitectura y flujo

```text
Joystick y catálogo de comandos ── POST /api/vehiculos/{id}/estado ──┐
Selector de DEMO ──────────────── POST .../demos/{id}/ejecutar ───────┤ API FastAPI / AWS ── MySQL/RDS
Panel de eventos ◀────────────── WSS /ws ◀───────────────────────────┘
Indicador API ────────────────── GET /
```

`index.html` define la vista, `css/styles.css` contiene los estilos responsivos, y los módulos `js/api.js`, `js/commands.js`, `js/socket.js`, `js/view.js` y `js/app.js` separan HTTP, reglas de nombres de comandos, WebSocket, renderizado y coordinación. Bootstrap 5 aporta los controles de formulario; el favicon es `favicon.svg`.

## Contratos observados en el código de la API proporcionado

La base HTTPS por defecto es `https://vehiculo-iot-corona.duckdns.org`; el socket es `wss://vehiculo-iot-corona.duckdns.org/ws`. Se puede cambiar la URL HTTPS desde el botón de configuración (⚙); el navegador deriva WSS usando el mismo host.

| Uso | Contrato |
| --- | --- |
| Comprobar servidor | `GET /` (respuesta JSON cuando el cliente pide JSON); no consulta RDS |
| Vehículos | `GET /api/vehiculos` |
| Comandos del vehículo | `GET /api/vehiculos/{id_vehiculo}/comandos` |
| DEMOs del vehículo | `GET /api/vehiculos/{id_vehiculo}/demos` |
| Ejecutar comando | `POST /api/vehiculos/{id_vehiculo}/estado`, JSON `{ "id_comando": <id>, "conectado": true, "origen": "WEB" }` |
| Ejecutar DEMO | `POST /api/vehiculos/{id_vehiculo}/demos/{id_demo}/ejecutar` |
| Eventos | `WSS /ws`, eventos enviados por la API con tipo, acción y datos |

Los comandos y sus códigos provienen del catálogo activo; no se inventan códigos. El joystick izquierdo controla traslación (avanzar, retroceder, izquierda y derecha) y se asigna buscando el significado en los nombres del catálogo. El joystick derecho toma los cuatro comandos activos restantes: si sus nombres expresan dirección, se asignan por nombre; si no, se ordenan según su aparición en el catálogo, y sus etiquetas visibles muestran el nombre real. Los demás comandos continúan disponibles como botones.

La API de ejemplo valida cada movimiento mediante `POST /estado`, actualiza estado e historial y emite el evento `estado_vehiculo/actualizar`. Para DEMO, el endpoint del servidor itera los movimientos almacenados en su orden con sus duraciones y pausas, transmite `demo/ejecutar_movimiento` y al final `demo/finalizada`. El frontend no genera secuencias ni escrituras de historial por cada paso.

## Límites que hay que resolver para el cumplimiento completo

1. **CORS:** en el `main.py` compartido no aparece middleware CORS. Un sitio de GitHub Pages tiene otro origen, así que el navegador bloqueará Fetch hasta que el backend permita el origen exacto del sitio y los métodos/headers usados. Configura `CORSMiddleware` en FastAPI con `allow_origins` limitado al origen final de Pages, `allow_methods=["GET", "POST"]`, `allow_headers=["Accept", "Content-Type"]` y `allow_credentials=False`; despliega el cambio del backend existente. CORS no autentica.
2. **Cancelación de DEMO:** el código compartido no define ruta, señal ni cancelación de ejecución. El botón DETENER puede enviar el comando prioritario, pero no interrumpe el bucle que ya está ejecutándose en el servidor y la DEMO podría emitir movimientos posteriores. Por eso la interfaz lo informa; no finge que Cancelar funcione. Para soportarlo de verdad, la API existente tendría que ofrecer una operación de cancelación y emitir su resultado. No se agregó un endpoint nuevo desde el frontend.
3. **Amazon RDS:** no se encontró una operación de diagnóstico seguro. El indicador queda en «Sin verificar»; `GET /` confirma que responde la aplicación FastAPI, no la base de datos ni las 21 operaciones.
4. **Evento de código:** el evento de estado del ejemplo incluye id de vehículo, id de comando, nombre del vehículo/comando y origen; no incluye `codigo`. Se puede correlacionar por `id_comando`. No se debe afirmar que el evento lleva el código si la API no lo publica.
5. **Dominio solicitado y GitHub Pages:** `CNAME` deja configurado el nombre deseado para Pages, pero no configura DNS ni publica el sitio. `controlwish-karen-corona.duckdns.org` es un host dinámico de DuckDNS, mientras Pages espera que el DNS del subdominio apunte al host de Pages. Además, el nombre del backend ya usa un host DuckDNS distinto. Antes de anunciar esa URL como operativa, comprueba si el panel/DNS de tu cuenta permite apuntar `controlwish-karen-corona.duckdns.org` a GitHub Pages. Si DuckDNS solo actualiza una dirección IP dinámica, esa URL no se puede conectar directamente a Pages con la configuración de A/WSS de DuckDNS. No cambies el host del backend para apuntar a Pages. La publicación estándar de Pages seguirá disponible en `https://<usuario>.github.io/<repositorio>/`.

La API procesa la solicitud del navegador; un HTTP exitoso y el evento WebSocket no confirman movimiento físico del vehículo. En esta etapa no se conecta un ESP8266/ESP32.

## Ejecución local

Abre esta carpeta en VS Code y sírvela con `py serve.py` (o la extensión Live Server) en vez de abrir `index.html` como archivo `file://`. Este servidor local fija `Content-Type: text/javascript` para los módulos ES en Windows y desactiva la caché para no reutilizar respuestas antiguas. Usa HTTPS para el sitio publicado; así se permite WSS sin contenido mixto. En el primer uso, verifica la URL API en ⚙ y elige el vehículo. El identificador se toma de la respuesta de la API.

Si el navegador muestra fallo de CORS, configura CORS en el backend como se describe arriba; no hay un arreglo seguro de CORS que se pueda hacer solo en este frontend.

## Publicación en GitHub Pages

1. Crea un repositorio GitHub público para esta carpeta y sube los archivos preservando las carpetas `css/` y `js/`.
2. En **Settings → Pages**, selecciona la rama `main` y la carpeta `/ (root)`.
3. GitHub sirve `index.html` desde la ruta del repositorio. Los assets usan rutas relativas (`./css`, `./js`, `./favicon.svg`) para funcionar bajo subruta.
4. Para el dominio personalizado, configura **Custom domain** en Pages y revisa DNS antes de activar **Enforce HTTPS**. `CNAME` ya contiene el host solicitado, pero por sí solo no crea registros DNS.
5. Después de publicar, abre DevTools, revisa Console/Network, concede permiso si el navegador exige conexión segura y prueba HTTP y WSS. El cliente HTTP personalizado puede requerir la configuración CORS del origen Pages.

## Verificación manual

1. **Carga de datos:** elige vehículo; comprueba que botones y DEMOs corresponden al catálogo de la API y que el panel WSS recibe `conexion`.
2. **Joysticks analógicos:** arrastra la perilla izquierda en las cuatro direcciones para desplazamiento y la derecha para las cuatro funciones restantes; comprueba que las etiquetas reflejen los nombres reales y que al soltar cualquiera la perilla vuelva al centro y se envíe DETENER.
3. **Otros controles y detener:** ejecuta comandos complementarios y usa DETENER. Comprueba que DETENER sigue habilitado ante una solicitud normal pendiente; compara eventos en un cliente externo conectado a `wss://vehiculo-iot-corona.duckdns.org/ws`.
4. **DEMO:** selecciona y ejecuta una existente; comprueba en el cliente externo los eventos de movimiento en orden y `finalizada`. Con la API actual no pruebes cancelación: no está implementada y pulsar DETENER no para la secuencia del backend.
5. **Disponibilidad:** separa el estado real de WSS, la comprobación HTTP periódica de `/` y el valor «Sin verificar» de RDS. Apaga temporalmente WSS o bloquea HTTP en DevTools para comprobar recuperación y mensajes; no interpretes esos estados como conexión física.
6. **Móvil y accesibilidad:** verifica en teléfono real, modo vertical/horizontal, áreas táctiles, teclado, foco visible, lector de pantalla básico y `prefers-reduced-motion`.
7. **Fallos:** prueba API desconectada, respuesta HTTP de error, catálogo vacío, nombre de comando no reconocido y timeout. Comprueba que no se muestre como movimiento físico confirmado.

## Seguridad y accesibilidad

- No se guardan secretos. La configuración URL vive solo en `localStorage` de ese navegador.
- Las respuestas de API y WSS se agregan al DOM con `textContent` y `Option`, no con HTML remoto.
- Fetch tiene timeout y errores legibles; el WSS reconecta con espera creciente.
- El estado no depende solo del color; botones tienen etiquetas y el joystick responde a mouse y táctil.
- No existe conexión del navegador a RDS ni pantalla de historial/administración.

## Estado de pruebas

Este repositorio contiene casos manuales reproducibles. La conexión contra AWS, el navegador móvil, el cliente externo WSS, la publicación de GitHub Pages y DNS del dominio todavía deben comprobarse con la cuenta/dispositivo; no se afirman como realizados.
