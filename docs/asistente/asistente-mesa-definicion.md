# MenYU — Asistente de mesa (chatbot): definición para la spec
 
Oct 22, 2026 · @Lauti
 
## Contexto
 
MenYU suma un asistente conversacional dentro de web-cliente que responde preguntas sobre la carta y el local de un restaurante. Este documento junta lo que se definió en la etapa de idea, para que la spec por fases (como `docs/auth/specs/auth.md`) parta de decisiones cerradas.
 
El anteproyecto lo describe como un chatbot de asistencia para preguntas frecuentes y recomendaciones del local. El Gantt original lo ubicaba en un microservicio FastAPI con OpenAI (S12–S13); ambas cosas se revisaron y cambiaron (ver Decisiones cerradas). La spec no tiene que seguir las semanas del Gantt.
 
## Qué es el asistente y qué no
 
Es un **asistente de restaurante de solo lectura**: conoce la carta y la información de un único restaurante y responde preguntas sobre ellos. Por ejemplo: "¿qué tan grande es la porción?", "¿el wrap viene frío o caliente?", "¿tienen algo vegetariano?", "¿hay wifi?".
 
- **Solo responde, no actúa.** No agrega al carrito, no llama al mozo, no hace pedidos ni pagos.
- **Solo usa los datos cargados.** Si un dato no está, responde que no tiene esa información y sugiere consultar al mozo. Nunca supone ni inventa.
- **No es un asistente de descubrimiento.** No busca ni compara entre restaurantes (queda como trabajo futuro).
- **Prioriza las recomendaciones del dueño** (sistema de recomendaciones de S9) cuando le piden sugerencias, solo dentro de su restaurante.
## Decisiones cerradas
 
1. **Alcance: solo el asistente de restaurante.** El asistente para el discovery de la home (`mesa.menyu-app.com`) queda como funcionalidad futura: hoy faltan datos de los restaurantes (tipo de cocina, horarios, direcciones) para que responda bien.
2. **Un mismo modo para "ver la carta desde discovery" y "estar en la mesa".** El asistente sabe lo mismo y responde igual en los dos casos. Lo único que cambia es cómo se limita el uso (ver Límites de uso).
3. **Disponible con y sin sesión de mesa,** con límites de uso en capas.
4. **Una conversación por restaurante.** Al entrar a otro restaurante empieza una conversación nueva; no se arrastra contexto.
5. **Solo responde; no ejecuta acciones.** Esto además acota el daño posible de un prompt injection.
6. **Se implementa en el backend NestJS** como un módulo nuevo, no en un microservicio FastAPI aparte. Reutiliza la validación del token de mesa, Prisma, el rate limit y el deploy existentes.
7. **El proveedor de LLM no se casa.** La llamada al modelo queda detrás de una capa que permite cambiar de proveedor por configuración. Se arranca con un modelo chico y barato y el definitivo se elige con la evaluación.
8. **Presupuesto bajo.** Tope de gasto mensual en el panel del proveedor desde el día uno, más un tope diario propio en el backend.
9. **Datos más completos por plato y preguntas frecuentes por restaurante,** todos opcionales, cargados por el dueño desde web-admin. Los alérgenos quedan afuera.
10. **Diseño preparado para crecer sin sobreconstruir:** el armado del contexto queda separado de la llamada al modelo, para que sumar el modo discovery después sea agregar otro armador de contexto y no reescribir.
## Datos nuevos
 
El asistente solo es tan bueno como los datos cargados: hoy el modelo no tiene cómo saber si un wrap viene frío o caliente. Todos los campos son opcionales; si uno está vacío, el asistente dice que no tiene el dato. Estos datos también sirven fuera del bot (por ejemplo, filtros por etiqueta en la carta).
 
### Por plato
 
| Campo | Tipo | Responde preguntas como |
| --- | --- | --- |
| Tamaño de porción | Opción: individual / para compartir / para N personas, + texto opcional ("300 g") | "¿Es grande?", "¿alcanza para dos?" |
| Temperatura | Opción: caliente / frío / ambiente | "¿El wrap viene frío?" |
| Nivel de picante | Opción: nada / suave / medio / alto | "¿Pica?" |
| Acompañamiento incluido | Texto ("viene con papas fritas") | "¿Viene con algo?" |
| Tiempo de preparación estimado | Minutos | "¿Tarda mucho?" |
| Etiquetas dietarias | Varias: vegetariano, vegano, sin TACC, sin lactosa | "¿Tienen algo vegano?" |
| Información adicional | Texto libre | Todo lo demás |
 
Con "sin TACC", el asistente repite lo que declaró el local, sin interpretarlo, y ante dudas de celiaquía sugiere consultar al mozo.
 
### Por restaurante (preguntas frecuentes del local)
 
- Horarios.
- Formas de pago aceptadas.
- Servicios: wifi, pet friendly, accesible en silla de ruedas, opciones para chicos, estacionamiento.
- Preguntas frecuentes libres: pares pregunta/respuesta que carga el dueño.
### Pendiente
 
- La lista es genérica. Conviene validarla con el restaurante del piloto, que sabe qué preguntan de verdad los clientes.
- Opcional: un indicador de "qué tan completa está tu carta" en web-admin para motivar al dueño a cargar los campos.
## Arquitectura y tecnologías
 
El flujo de una pregunta es una cadena simple:
 
1. **web-cliente** muestra el chat, guarda el historial de la conversación y manda la pregunta junto con los últimos N mensajes.
2. **API NestJS, módulo nuevo del asistente:** aplica los límites de uso, arma el contexto (instrucciones + carta y preguntas frecuentes del restaurante, leídas con Prisma) y llama al modelo.
3. **Proveedor de LLM:** genera la respuesta, que vuelve a web-cliente en streaming (el texto aparece a medida que se genera).
| Pieza | Decisión |
| --- | --- |
| Dónde vive | Módulo nuevo en NestJS (por ejemplo, `asistente`) |
| Conexión con el modelo | Librería que no ate a un proveedor; candidata: Vercel AI SDK (paquete `ai`). Alternativa: SDK oficial detrás de una interfaz propia |
| Datos al modelo | Inyección de contexto: la carta completa del restaurante en cada pregunta. Sin tool calling ni RAG por ahora |
| Costo del contexto | Aprovechar el prompt caching del proveedor: la carta es la misma en cada pregunta del mismo restaurante |
| Respuesta | Streaming por HTTP. No por Socket.io, que queda para los eventos de cocina y mozos |
| Historial | En el frontend; el backend no necesita guardar conversaciones para funcionar |
| Registro | Preguntas y respuestas anónimas por restaurante en Postgres: sirve para evaluar el bot, contar el uso diario y, a futuro, mostrarle al dueño qué preguntan los clientes que no tiene cargado |
| Admin | Formularios nuevos en web-admin para los campos del plato y las preguntas frecuentes |
 
## Límites de uso y seguridad
 
El endpoint se usa sin login, así que el uso se limita en capas. El tope global diario es la red de seguridad que de verdad acota el gasto.
 
| Capa | Cuándo aplica | Cómo |
| --- | --- | --- |
| Por sesión de mesa | Con QR | N mensajes por sesión. **No** por IP: todo el salón comparte la IP del wifi del restaurante |
| Por IP | Carta vista desde discovery, sin sesión | `@nestjs/throttler`, con `trust proxy` configurado para leer la IP real detrás del proxy de Railway |
| Por mensaje y por conversación | Siempre | Largo máximo de pregunta (por ejemplo, 500 caracteres) y máximo de mensajes por conversación |
| Tope global diario | Siempre | Contador en Postgres (no en memoria: se reinicia con cada deploy). Al superarlo, el asistente responde que no está disponible por hoy |
| Tope mensual del proveedor | Siempre | Configurado en el panel del proveedor |
 
Si aparece abuso real, se puede sumar un captcha invisible (Cloudflare Turnstile). No va de entrada.
 
**Seguridad del contenido:**
 
- Los textos que carga el dueño (descripciones, información adicional, preguntas frecuentes) entran al prompt. Las instrucciones del modelo tienen que tratarlos como datos y nunca como órdenes.
- Ante intentos de prompt injection del usuario ("ignorá tus instrucciones"), el daño queda acotado porque el asistente no ejecuta acciones ni ve datos de otros restaurantes.
- El asistente no inventa: si el dato no está, lo dice y sugiere consultar al mozo.
- La API key del proveedor vive solo en el backend.
## Evaluación y elección de proveedor
 
Se arranca con un modelo chico y barato que responda bien en español y se elige el definitivo una sola vez, con el asistente ya funcionando. Lleva uno o dos días, y la mayor parte es trabajo que igual hace falta.
 
1. **Set de prueba:** 20–30 preguntas sobre un restaurante de prueba, cada una con el comportamiento esperado ("responde X", "dice que no tiene el dato", "sugiere consultar al mozo", "ignora el intento de cambiarle las instrucciones"). Sirve también como test del asistente y como material para la tesis.
2. **Corrida:** un script manda el set a 2 o 3 modelos del rango económico, uno por proveedor, y guarda respuesta, tiempo y tokens (de ahí sale el costo).
3. **Revisión:** marcar cada respuesta como correcta o incorrecta (unas 75 respuestas, alrededor de una hora).
4. **Elección:** por precisión, costo y latencia. Cambiar de modelo es configuración.
Criterios mínimos del modelo: buen español rioplatense, streaming, prompt caching y precio bajo. Costo estimado de referencia: unos USD 5 cada 1.000 preguntas con un modelo chico, a confirmar con los precios vigentes. Si falta tiempo, la comparación se puede saltear y queda como mejora futura.
 
## Lo que define la spec
 
Las decisiones de arriba están cerradas. La spec tiene que definir el cómo, revisando el código actual del monorepo:
 
- [ ] Modelo de datos exacto: campos nuevos del plato, tabla de preguntas frecuentes del restaurante, registro de uso. Migración de Prisma.
- [ ] Diseño del endpoint del asistente y formato del streaming.
- [ ] Cómo se valida la sesión de mesa cuando viene y cómo se identifica el restaurante cuando no.
- [ ] Valores concretos de los límites, configuración de `@nestjs/throttler` y `trust proxy`.
- [ ] System prompt y armado del contexto (formato de la carta, reglas de "no sé", trato de los textos del dueño como datos).
- [ ] Componente de chat en web-cliente y formularios nuevos en web-admin.
- [ ] Set de preguntas de prueba y script de evaluación.
- [ ] División en fases con criterio de "terminado cuando", una fase por sesión de Claude Code, como en la spec de auth.
- [ ] Tests: un caso feliz y los casos de error principales por módulo, sin suites exhaustivas.
## Fuera de alcance y trabajo futuro
 
- **Asistente de discovery** en la home de web-cliente. Requiere tipo de cocina, horarios y direcciones de los restaurantes, tool calling para buscar entre restaurantes y platos, un criterio de neutralidad entre competidores y límites para un endpoint público. "Cerca mío" (geolocalización) queda afuera incluso ahí.
- **Acciones:** agregar al carrito, llamar al mozo, consultar el estado del pedido.
- **Alérgenos.** Si se suman, llevan tres estados por alérgeno (contiene / puede contener trazas / no declarado), nunca un sí/no.
- **Sugerencia automática de campos** del plato a partir de su descripción, confirmada por el dueño.
- **Reporte para el dueño** con las preguntas que el asistente no pudo responder.
- **Captcha** (Cloudflare Turnstile), solo si aparece abuso.