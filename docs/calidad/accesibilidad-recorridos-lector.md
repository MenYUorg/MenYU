# Recorridos con lector de pantalla (RNF-20, WCAG 2.2 AA)

La revisión automática (`scripts/accesibilidad/main.mjs`, con axe) solo encuentra lo que se puede comprobar desde el DOM: contraste, nombres que faltan, atributos ARIA mal puestos. No dice si un recorrido **se puede completar** con un lector de pantalla: si el orden de lectura tiene sentido, si se anuncian los cambios, si el foco va adonde tiene que ir. Eso lo prueba una persona, con estos recorridos.

## Cómo probar

| | VoiceOver | TalkBack |
|---|---|---|
| Dispositivo | iPhone, Safari | Android, Chrome |
| Prender | Ajustes → Accesibilidad → VoiceOver (o triple clic en el botón lateral, si está configurado) | Ajustes → Accesibilidad → TalkBack (o mantener las dos teclas de volumen) |
| Avanzar / retroceder | Deslizar a la derecha / izquierda | Deslizar a la derecha / izquierda |
| Activar | Doble toque | Doble toque |
| Por encabezados | Rotor (girar dos dedos) → Encabezados, y deslizar arriba/abajo | Menú de lectura → Encabezados |

- Ambiente: **staging** (`<app>.staging.menyu-app.com`), con las cuentas de `docs/auth/usuarios-prueba-staging.md` y una mesa del restaurante de prueba.
- Para web-staff y web-admin, además del celular, una pasada en escritorio solo con teclado (Tab, Shift+Tab, Enter, Espacio, Escape) y, si se puede, NVDA en Windows.
- Anotar en cada paso: **qué se anunció**, si se pudo **completar sin ver la pantalla** y, si no, dónde se trabó. Una captura o una grabación de pantalla con el audio ayuda.

En cada pantalla, lo mismo:
1. Al llegar, se anuncia el título de la página o el encabezado principal.
2. Todos los botones e íconos se anuncian con un nombre que dice qué hacen (no "botón" a secas, ni el nombre del ícono).
3. Los campos se anuncian con su etiqueta, y los errores se leen solos cuando aparecen.
4. El orden de lectura sigue el orden visual.
5. Un modal se anuncia como diálogo con su título, el foco entra al abrirlo y vuelve a lo que lo abrió al cerrarlo, y no se puede leer lo que quedó atrás.
6. Lo que cambia solo (un pedido nuevo, un estado, un total) se anuncia, o por lo menos se encuentra fácil al volver a recorrer.

## Recorridos

### web-cliente (comensal), los más importantes: el comensal no elige su dispositivo

| # | Recorrido | Pasos | Qué mirar en especial |
|---|---|---|---|
| C1 | Descubrir y ver la carta sin mesa | Inicio (discovery) → buscar un plato → abrir un restaurante → ver la carta | La búsqueda anuncia cuántos resultados hay; los precios con descuento se leen con el precio anterior y el nuevo (no dos números sueltos); las tarjetas de restaurante tienen un nombre claro |
| C2 | Entrar a la mesa con el QR | Escanear el QR de la mesa con la cámara del celular → "Abriendo tu mesa…" → elegir el nombre → menú | El estado "abriendo" se anuncia; el campo del nombre tiene etiqueta; si falla (QR viejo), el error se lee y la opción del PIN se encuentra |
| C3 | Entrar a la mesa con el PIN | Ficha del restaurante → "Ingresar a la mesa" → escribir el PIN | Cada dígito del PIN se anuncia; un PIN incorrecto se anuncia sin tener que buscarlo |
| C4 | Pedir con modificaciones | Menú → abrir un plato → sacar un ingrediente → cantidad → agregar → carrito → confirmar | Los ingredientes se anuncian como casillas con su estado (marcado o no); el botón de cantidad dice la cantidad actual; al agregar se anuncia; el carrito lee cada ítem con sus modificaciones y el total |
| C5 | Seguir el pedido | "Mis pedidos" → esperar a que la cocina lo marque listo | El cambio de estado se anuncia o se encuentra al volver a recorrer |
| C6 | Llamar al mozo | Botón del mozo → elegir el motivo → confirmar | El botón tiene nombre; la confirmación se anuncia |
| C7 | Pagar | Pagar → elegir efectivo o Mercado Pago (y dividir, si hay varios comensales) → volver de Mercado Pago | Cada opción de pago es un botón o radio con nombre; al volver, el resultado (exitoso, pendiente, fallido) se anuncia |
| C8 | Asistente de la carta | Abrir el asistente → hacer una pregunta → leer la respuesta → cerrarlo | Se anuncia como diálogo; la respuesta, que llega de a poco, se lee entera al terminar (no letra por letra ni nunca) |

### web-auth (todos)

| # | Recorrido | Pasos | Qué mirar en especial |
|---|---|---|---|
| A1 | Ingresar | Mail y contraseña → Ingresar (con datos correctos y con una contraseña mal) | El error se lee solo; el botón de mostrar la contraseña tiene nombre y dice si está mostrada |
| A2 | Crear cuenta de cliente | Nombre, mail, contraseña → crear → aviso de confirmación | Los requisitos de la contraseña se leen asociados al campo |
| A3 | Olvidé la contraseña | Pedir el mail → abrir el link → definir la nueva | El aviso de "te mandamos un mail" se anuncia |
| A4 | Elegir a dónde entrar | Con la cuenta que tiene dos roles (`varias.pruebas-auth`) → pantalla de elegir | Cada opción se anuncia con el rol y el lugar |

### web-staff (mozo y cocina)

| # | Recorrido | Pasos | Qué mirar en especial |
|---|---|---|---|
| S1 | Cocina: recibir y avanzar un pedido | Con un pedido nuevo desde una mesa → aparece en cocina → "en preparación" → "listo" | **El pedido nuevo se anuncia** sin tener que volver a recorrer la pantalla; los botones de estado dicen a qué estado pasan |
| S2 | Mozo: mesas y llamados | Mesas → ver una ocupada → atender un llamado | Cada mesa se lee con su número y su estado; el llamado nuevo se anuncia |
| S3 | Mozo: tomar un pedido | Toma de pedidos → elegir la mesa → agregar platos → enviar | Los botones de + y − tienen nombre ("Agregar milanesa", no "+") |
| S4 | Mozo: cobrar | Pagos → elegir la sesión → cobrar en efectivo | El modal de cobro se anuncia como diálogo y el monto se lee |
| S5 | Mozo: historial y editar un pedido | Historial → abrir una sesión → editar un pedido → justificación → guardar → cerrar con Escape | La tarjeta de la sesión se anuncia como botón y se abre con doble toque o Enter; el modal se anuncia como diálogo con el título "Mesa N" o "Editar pedido #…"; el campo se anuncia como "Justificación" (corregido en el PR #464) |
| S6 | Los íconos del encabezado | Recorrer el encabezado de las pantallas del mozo | Cada botón de ícono tiene nombre (axe marcó uno sin nombre en cada pantalla del mozo: `button-name`) |

### web-admin (OWNER y GERENTE)

| # | Recorrido | Pasos | Qué mirar en especial |
|---|---|---|---|
| D1 | Navegar el panel | Recorrer el menú lateral y entrar a cada sección | Los títulos de sección del menú se leen (axe marcó contraste bajo en ellos); la sección actual se anuncia como actual |
| D2 | Cargar un plato | Menú → nuevo plato → nombre, precio, categoría, ingredientes, imagen → guardar | Cada campo con su etiqueta; los errores de validación se leen; la carga de la imagen se anuncia |
| D3 | Mesas | Mesas → nueva mesa → ver el QR y el PIN | Los botones de ícono tienen nombre (axe marcó uno sin nombre: `button-name`); el QR tiene un texto alternativo útil |
| D4 | Invitar personal | Personal → invitar → elegir el rol → enviar | El selector de rol se anuncia con su valor |
| D5 | Reportes | Reportes → cambiar el período | Los gráficos tienen un resumen en texto o una tabla equivalente |
| D6 | Historial (GERENTE) | Historial → abrir una sesión → editar un pedido | Igual que S5 |

## Registro

Una fila por recorrido y lector. Guardar las grabaciones o capturas en la carpeta del informe, no en el repo.

| Fecha | Persona | Recorrido | Lector, dispositivo y versión | ¿Se completó sin ver? | Problemas (paso, qué se anunció, qué se esperaba) |
|---|---|---|---|---|---|
| | | | | | |
