# Nuestras Metas

Una app para los dos: anotar gastos, no olvidar facturas, tumbar deudas, cumplir retos y
llegar a Grecia en 2027. Corre en el celular como una app instalada y guarda todo en el
dispositivo (nada sale a internet).

## Qué tiene

- **Inicio**: resumen del mes, Grecia 2027 con cuenta regresiva, facturas que vienen, retos y
  el muro de fotos.
- **Caja**: lo que entra (esperado y real), repartido en bolsillos de la casa y de cada uno.
  Dice cuánto queda del mes, cuánto queda "de verdad" tras facturas y mínimos de deuda, y
  cómo van contra el mes pasado.
- **Gastos**: quién pagó, si es compartido o personal, categoría, y el balance del mes
  (quién le debe a quién por lo compartido). Los SMS del banco se anotan solos con un Atajo del
  iPhone, o pegando el mensaje con el botón 📩.
- **Mercado**: la canasta de lo que compramos siempre, con el precio en Éxito, Carulla, Makro,
  D1 y Ara comparado por litro o por kilo, y una lista de compras que dice cuánto cuesta en cada
  parte y si vale la pena hacer dos paradas.
- **Facturas**: fijas con día de vencimiento. Se marcan pagadas cada mes y avisan cuando
  falten 3 días o menos (si activan las notificaciones).
- **Deudas**: cada deuda con su saldo, abonos y progreso. Las ordena por método bola de nieve
  (la más chica primero) y celebra cuando una cae.
- **Retos**: ahorrar X, un hábito por N días, o no pasarse de un tope. Con plantillas para
  arrancar y un premio si lo cumplen.
- **Hitos**: Grecia 2027 viene de fábrica (editable, no se borra). Pueden agregar más:
  la casa, el carro, el perro. Calcula cuánto hay que guardar al mes para llegar.
- **Muro "Por nosotros"**: fotos de ustedes, del destino, de lo que sea, estilo polaroid.
  Al estilo del "Do it for her" de Homero pero con su propia gente.
- **Ajustes**: nombres, moneda, exportar/cargar respaldo, empezar de cero.

## Correr local

```bash
npm install
npm run dev
```

## Publicar (GitHub Pages)

1. Cada push a `main` construye la app y la publica en la rama `gh-pages`.
2. Si el sitio no aparece solo: Settings → Pages → Source: **Deploy from a branch** → rama
   `gh-pages`, carpeta `/ (root)` → Save.
3. La app queda en `https://<usuario>.github.io/nuestras-metas/`. Ábranla en el celular y
   "Agregar a inicio" (Safari) o "Instalar app" (Chrome).

Si el repo se llama distinto, cambia el `base` en `vite.config.ts` o exporta
`VITE_BASE=/otro-nombre/` al construir.

## Tenerlo en los dos celulares (sincronización)

La app funciona sola en cada celular, y con Supabase se sincroniza entre los dos en tiempo
real, fotos incluidas. Sigue funcionando sin internet y sube los cambios cuando vuelve.

Configuración, una sola vez:

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. SQL Editor → New query → pega el contenido de `supabase/schema.sql` → Run.
3. Authentication → Sign In / Providers → Email → desactiva **Confirm email** (son solo
   ustedes dos; así entran sin esperar el correo de confirmación).
4. Project Settings → API → copia la **Project URL** y la clave **publishable** en `.env`
   (las que están son las del proyecto original; son públicas por diseño, la seguridad la
   ponen las políticas RLS del esquema).

Uso:

1. El primero crea su cuenta en Ajustes → "Sincronizar entre los dos" → "Crear nuestro hogar".
   Le sale un código de 6 letras. Todo lo que ya tenía se sube.
2. La otra persona instala la app, y en la bienvenida toca "unirme con código", crea su
   cuenta y escribe el código. Listo: los dos ven lo mismo.

Sin `.env` la app corre igual, solo en local, y en Ajustes queda el respaldo manual.

Cómo funciona: cada gasto, factura, deuda, reto, meta, foto, bolsillo, ingreso y el perfil es una fila en la
tabla `items` del hogar. `src/sync.tsx` compara el estado local con lo que ya está arriba y
sube solo lo que cambió; escucha en tiempo real los cambios del otro celular y los aplica.
Si dos personas editan lo mismo, gana el último cambio.

## Preguntarle a Claude (conector MCP)

Con el conector, Claude ve lo mismo que la app y puede anotar por ustedes desde el chat:
*"¿cómo vamos este mes?"*, *"¿en qué se nos fue la plata de salidas?"*, *"anota 45 mil en el Éxito,
compartido"*, *"abona 500 mil a la Falabella"*, *"¿cuánto hay que guardar al mes para Grecia?"*. Lo que
anote aparece en los dos celulares como cualquier cambio del otro.

También lleva **apuntes**: lo que no es plata o no tiene lugar en la app (pendientes, ideas para Grecia,
decisiones, preguntas para después). Viven en el hogar, los ven los dos desde Claude y la app los ignora.

Y resuelve lo que llegó por SMS y quedó **por confirmar**: *"¿qué hay por confirmar?"* → Claude muestra
cada mensaje con lo que leyó y ustedes le dicen *"el de Don Pepe es mercado, compartido; el giro de Lau
descártalo"*. Si corrigen la categoría, la app se acuerda del comercio, igual que al corregir en Gastos.

Herramientas: `como_vamos`, `buscar_gastos`, `ver_ingresos`, `ver_facturas`, `ver_deudas`, `ver_hitos`,
`ver_retos`, `ver_apuntes` para preguntar; `por_confirmar` y `confirmar_mensaje` para resolver los SMS
del banco que esperan en "por confirmar"; `anotar_gasto`, `anotar_ingreso`, `abonar_deuda`,
`aportar_hito`, `pagar_factura`, `avanzar_reto`, `borrar_gasto`, `apuntar`, `marcar_apunte` para anotar.
Usan la misma matemática de la Caja (`src/caja.ts`).

Configuración, una sola vez:

1. Supabase → SQL Editor → New query → pega `supabase/claude.sql` → Run.
2. Publica la función, de una de estas dos formas:
   - **Desde el navegador**: Edge Functions → Deploy a new function → Via Editor. Nombre: `mcp`.
     Pega el contenido completo de `supabase/functions/mcp/index.ts` → Deploy. Después, en los ajustes
     de la función, **apaga "Verify JWT"** (Claude no manda la sesión de Supabase; la puerta es el token).
   - **Con la terminal**: `npx supabase login`, `npx supabase link --project-ref <tu-proyecto>` y
     `npm run mcp:deploy`.
3. En la app: Ajustes → **Conectar con Claude** → elige quién eres → "Generar mi enlace" → copiar.
4. En claude.ai: Configuración → Conectores → **Agregar conector personalizado** → nombre
   `Nuestras Metas`, URL = el enlace. Sin OAuth. Queda también en la app de Claude del celular.
   Cada uno lo agrega en su cuenta con su propio enlace (así lo que anote queda a su nombre).
   En Claude Code: `claude mcp add --transport http nuestras-metas <enlace>`.

El enlace lleva un token: quien lo tenga puede ver y anotar en su plata. Si se filtra, "Generar un
enlace nuevo" o "Desconectar" y el viejo deja de servir.

Cómo funciona: `mcp/` es un servidor MCP sin estado (JSON-RPC por HTTP, sin dependencias) que corre como
Edge Function. Valida el token contra `tokens_claude`, lee y escribe las filas de `items` del hogar con la
llave de servicio, y la app las recibe en tiempo real. `supabase/functions/mcp/index.ts` es un solo archivo
generado desde `mcp/` con `npm run mcp:build` (así se puede pegar en el editor): no se edita a mano, y CI
avisa si quedó desactualizado. Si alguien edita en la app lo mismo que Claude al mismo tiempo, gana el
último cambio, igual que entre los dos celulares. Las pruebas están en `mcp/conector.test.ts`.

## Gastos desde los mensajes del banco

Cuando llega el SMS ("Bancolombia: Compra por $45.900 en EXITO...") no hay que anotar nada a mano.

**Lo que no se puede:** una app web no puede leer los SMS ni ponerle un botón a la app Mensajes.
No existe esa API en iPhone ni en Android. Así que el mensaje no se lee: **se manda** a la app.

Hay dos formas, y conviene tener las dos:

### 1. Automático, con un Atajo del iPhone (para los SMS)

Una vez, en Supabase: SQL Editor → New query → pega `supabase/mensajes.sql` → Run.

Después, en Ajustes → **Anotar desde mensajes** → "Generar mi token". Ahí quedan los tres datos
que pide el Atajo (enlace, clave y token), con botones para copiarlos.

En el iPhone, una sola vez por banco y por celular:

1. **Atajos** → pestaña **Automatización** → **+** → **Mensaje**.
2. Remitente: `Bancolombia` (o "Mensaje contiene" con el nombre del banco) → **Ejecutar inmediatamente**.
3. Acción **Obtener contenido de URL**, con el **enlace** copiado.
4. Método **POST**. Encabezados: `apikey` = la **clave**, `Content-Type` = `application/json`.
5. Cuerpo **JSON** con dos campos de texto: `p_token` = tu **token**, y `p_texto` = la variable
   **Contenido del mensaje**.

Desde ahí el SMS viaja solo. Al abrir la app: lo que se entiende completo ya está anotado, y lo
dudoso espera en **"por confirmar"** con un botón para guardarlo.

Solo funciona con mensajes que lleguen a la app **Mensajes**. Las alertas que llegan como
notificación de la app del banco (RappiCard, Falabella, Lulo) no las ve ningún Atajo.

### 2. Pegando el mensaje (sirve para todo)

En Gastos, el botón **📩**: "Pegar mensaje" y el gasto sale lleno. Es el respaldo para las alertas
que llegan por notificación y para cuando el Atajo no alcanzó.

### Qué entiende y qué aprende

Lee monto, comercio, fecha, tipo de movimiento y los últimos 4 de la tarjeta de Bancolombia,
RappiCard, Falabella/CMR, Lulo, Nequi y Daviplata, y de paso de cualquier banco con formato
parecido. Descarta claves dinámicas, códigos y publicidad. La plata que entra (nómina, una
transferencia recibida, una devolución) la deja en *por confirmar* como ingreso: nunca la anota
sola, porque un giro entre ustedes dos no es plata nueva.

La categoría la propone `src/comercios.ts`. Si la corrigen al guardar, se acuerda de ese comercio
para la próxima (y eso se sincroniza entre los dos). El mismo mensaje no se anota dos veces:
cada gasto guarda la huella del SMS del que salió.

Las reglas del lector viven en `src/mensajes.ts` y están cubiertas con pruebas: `npm test`.
Si un banco les manda un formato que no entiende, agreguen el mensaje al archivo de pruebas
y ajusten el patrón.

## Caja, bolsillos e ingresos

La Caja responde la pregunta que da disciplina: *¿cuánto nos queda de verdad este mes?*

- **Ingresos esperados**: lo que cada uno recibe en un mes normal (Ajustes o Caja → "Ingresos
  esperados"). Con eso se reparten los bolsillos. Mientras no haya un ingreso real anotado en
  el mes, la Caja planea con el esperado y lo marca así.
- **Ingresos reales**: se anotan con el + de la Caja cuando llegan. Los que trae un SMS del
  banco aparecen en *por confirmar* dentro de Gastos.
- **Bolsillos**: cada uno tiene una asignación mensual y unas categorías. Un gasto cae en el
  bolsillo de su ámbito (compartido → de la casa; personal → de quien pagó) que tenga su
  categoría; si ninguno la tiene, en el que no tenga categorías (el comodín); y siempre se
  puede cambiar a mano en el gasto. Una categoría vive en un solo bolsillo por ámbito.
- **Lo que sobra**: cada bolsillo elige. *Se reinicia*: cada mes arranca con su asignación
  (`asignación + ajustes del mes − gastado en el mes`). *Se guarda*: lo que no se gasta pasa al
  mes siguiente (`saldo inicial + asignación × meses que lleva + ajustes − todo lo gastado`).
  "Meter o sacar" y "Mover plata" entre bolsillos quedan como movimientos.
- **Queda** = ingresos − (gastos + abonos a deudas + aportes a hitos). **Libre de verdad** =
  queda − facturas sin pagar − mínimos de deuda sin abonar este mes. **Sin bolsillo** = ingresos
  esperados − asignado: lo que queda para Grecia, deudas y ahorro.
- La primera vez, "Armar mi caja" propone bolsillos con porcentajes sugeridos; se editan
  antes de crear. Toda la matemática vive en `src/caja.ts`, con pruebas en `src/caja.test.ts`.

### Tres cajas, una regla, un número

La caja está armada para una regla: **la casa vive con un solo sueldo** y el otro se va entero a
deudas y a Grecia. Todo lo que entra baja en cascada por tres cajas:

```
Entra                        20.0M   (lo esperado de los dos)
─ 📤 Obligaciones fuera       6.0M   sale primero (lo que cada uno manda a su familia, etc.)
─ 🏠 Vivir                   10.0M   ← UN SUELDO (el menor de los dos, o el que elijan)
─ 💪 Avanzar                  4.0M   = lo que sobra → deudas · Grecia y ahorro
```

- **Obligaciones fuera de casa**: un bolsillo 📤 por persona con la categoría "Fuera de casa". Un gasto
  con esa categoría cae en el bolsillo de quien lo pagó y nunca en el comodín: no es plata para vivir.
  Los giros del banco llegan como "Otros"; con la primera corrección la app se acuerda del destinatario.
- **Vivir**: los bolsillos de la casa y los de cada uno. Las plantillas se reparten sobre el sueldo con el
  que se vive (no sobre el ingreso total) y suman el 80%; el resto queda de colchón, pero también cuenta.
- **Avanzar**: no son bolsillos, son las deudas y los hitos. El plan fija cuánto va a deudas y cuánto a
  Grecia cada mes (`perfil.plan.avanzar`); lo real son los abonos y aportes del mes, y se ven por persona.

La tarjeta de arriba responde *¿vamos viviendo con un sueldo?*: **gastado para vivir** (todo gasto del mes
que no sea una obligación fuera de casa, con o sin bolsillo) contra el sueldo. Amarillo desde el 80%, rojo
al pasarse. En Deudas, la tarjeta **En equipo** compara el ataque del mes con lo abonado entre los dos y
proyecta *libres de deudas en N meses* = `saldo total / ataque mensual`, sin contar intereses.

"Armar mi caja" tiene cuatro pasos: cuánto entra, obligaciones fuera de casa, con qué sueldo se vive (y los
bolsillos propuestos), y cómo repartir lo que sobra. Si ya tenían bolsillos de antes, la Caja ofrece
**Completar el plan**: los mismos pasos sin tocar los bolsillos que ya existen. La matemática está en
`src/caja.ts` (`vistaUnSueldo`, `reparto`, `avanceAvanzar`, `mesesParaLibres`) con pruebas en `src/caja.test.ts`.

Al publicar esta versión: abran la app en los dos celulares (cerrar y volver a abrir) antes
de armar la caja, para que ninguno siga con la versión anterior (un celular sin actualizar muestra
"Fuera de casa" como Otros).

## Mercado: precios de las cinco tiendas

La Caja dice en qué se fue la plata. El Mercado es lo que falta para decidir *antes*: el mismo
producto no cuesta igual en Éxito, Carulla, Makro, D1 y Ara.

### Cómo se usa

1. **La canasta**: agreguen lo que compran siempre (la leche, el arroz, el aceite). De cada uno
   se dice en qué se compara: litros, kilos o unidades.
2. **Vincular, una sola vez por tienda**: ninguna tienda llama igual al mismo producto, así que
   se busca y se toca el correcto. Ahí queda guardado el SKU y el contenido real de *esa*
   presentación. Es lo que hace honesta la comparación: la bolsa de Éxito es de 1.100 ml y la de
   D1 de 900, y la barata en la etiqueta puede ser la cara por litro.
3. **La lista**: se marcan productos y cantidades. Arriba sale la cuenta: *"Todo en Éxito:
   $184.300. Repartido entre D1 y Carulla: $161.900 — ahorran $22.400 por ir a dos sitios."*
   Si el ahorro no pasa de unos $5.000 (o del 3%), lo dice también: no vale la pena cruzar la
   ciudad por eso.

Todo precio sale con su fecha y de dónde vino. Uno del folleto no se muestra con la misma cara
que uno de la API, y una oferta de folleto vencida **no entra en las cuentas**. La app tiene que
verse desactualizada cuando lo está, en vez de mentir en el pasillo del supermercado.

La canasta y las listas se sincronizan entre los dos celulares por la misma tabla `items` de
siempre. Un celular con una versión vieja de la app no ve el Mercado, pero tampoco se rompe ni
borra nada.

### Configuración (una sola vez)

1. Supabase → SQL Editor → New query → pegar `supabase/precios.sql` → Run. **Con esto ya
   funciona**: la comparación y la lista sirven con los precios que ustedes anoten a mano.
2. Para que los precios lleguen solos, desplegar las funciones:

   ```bash
   npx supabase functions deploy precios-descubrir
   npx supabase functions deploy precios-tiendas
   npx supabase functions deploy precios-buscar
   ```

   (Hace falta el proyecto enlazado: `npx supabase link --project-ref TU-PROYECTO`.)

3. **Descubrimiento**: llamar una vez a `precios-descubrir`. Prueba los dos caminos de cada
   tienda y guarda en `tiendas.config` cuál respondió.

   ```bash
   curl -X POST https://TU-PROYECTO.supabase.co/functions/v1/precios-descubrir \
     -H "Authorization: Bearer <service-role-key>"
   ```

   Así está la cosa, según la primera corrida contra las tiendas de verdad:

   | Tienda | Estado |
   |---|---|
   | Éxito | ✅ responde |
   | Carulla | ✅ responde |
   | Makro | ❓ no respondió; el descubridor prueba varios dominios candidatos y guarda el que sirva |
   | D1 y Ara | 📰 no tienen API; van por folleto (o por la foto desde la app) |

   **La tienda que no responda se queda en precio a mano y se compara igual** — nada más se
   rompe. El descubridor vuelve a intentarlo cada lunes, así que si Makro aparece después, se
   engancha sola.
4. Para los folletos de D1 y Ara: `npx supabase secrets set ANTHROPIC_API_KEY=...` y
   `npx supabase functions deploy precios-folletos`. Son unos US$0.20 por corrida semanal.
   Además hay que decirle dónde está el folleto de cada una:

   ```sql
   update public.tiendas set config = config || '{"folleto":"https://..."}'::jsonb where id = 'd1';
   ```

   Sin esa URL no hay corrida automática, pero el camino de la foto **sí funciona desde ya**:
   en Mercado, el botón "Foto del folleto" manda las fotos que tomen en la tienda y las lee
   Claude, sin configurar nada.
5. **Que corra solo**: pegar `supabase/precios-auto.sql` (pg_cron + pg_net + Vault). **Hay que
   cambiarle los dos valores de arriba antes de correrlo** — la URL del proyecto y la service
   role key —; si se pegan tal cual, el archivo revienta a propósito en vez de programar un
   cron que fallaría en silencio. Las llaves van en Vault, nunca en el repo. Queda así, en hora
   de Bogotá:

   | Cuándo | Qué |
   |---|---|
   | lunes 5:30 a.m. | `precios-descubrir` — vuelve a probar por dónde se deja leer cada tienda |
   | todos los días 6:00 a.m. | `precios-tiendas` — refresca lo que ya se sigue |
   | lunes 6:30 a.m. | `precios-folletos` — el folleto de la semana de D1 y Ara |
   | domingos 3:00 a.m. | limpieza de precios de más de 180 días |

   El descubridor va de primero el lunes a propósito: es el que arregla el camino. Si una
   tienda cambió de plataforma el fin de semana, la corrida de las 6:00 ya sale con la
   estrategia nueva en vez de fallar toda la semana. Cada probada queda en
   `precios_corridas` — algo que corre solo y no deja rastro no se puede revisar después.
   Para disparar cualquiera a mano: `select public.disparar_precios('precios-descubrir');`

### Cómo se alimenta la tabla

El robot no le lee los datos a nadie: refresca los SKU que ya están en `precios`. Al vincular un
producto, la búsqueda guarda lo que encontró, y de ahí en adelante el robot lo mantiene al día.
Lo que dejen de seguir se cae solo a los 60 días.

Si una tienda se cae, queda anotada en `precios_corridas` y la app lo dice de frente ("Makro no
se pudo leer desde el martes"). Para D1 y Ara hay un segundo camino cuando el folleto no se deja
bajar: le toman una foto en la tienda y la lee Claude, con el mismo código.

La matemática (precio por unidad, frescura, totales, el reparto óptimo entre tiendas) vive en
`src/mercado.ts` y está cubierta con pruebas: `npm test`.

## Estructura

```
src/
  types.ts        modelo de datos
  store.tsx       estado, reducer y persistencia (localStorage)
  db.ts           fotos en IndexedDB
  format.ts       dinero, fechas, porcentajes
  categorias.ts   categorías de gasto
  mensajes.ts     lee el SMS del banco y saca el gasto o el ingreso (con pruebas)
  caja.ts         bolsillos, resumen del mes y comparación con el mes pasado (con pruebas)
  mercado.ts      precio por unidad, frescura y el reparto entre tiendas (con pruebas)
  precios.ts      lee los precios de Supabase y anota los que ustedes ven en el estante
  comercios.ts    comercio -> categoría, y lo que ustedes le enseñan
  entrantes.tsx   bandeja de mensajes que mandó el Atajo del celular
  enlace.ts       mensajes que llegan por la URL (#gastos?texto=...)
  components/     ui (modal, campos, barras, confeti, toast), IngresoModal, ArmarCaja,
                  DesdeMensaje, AtajoSms, ConectorClaude, Cuenta
  pages/          Inicio, Caja, Gastos, Mercado, Facturas, Deudas, Retos, Metas, Muro, Ajustes
mcp/              conector de Claude: protocolo, herramientas y la función (con pruebas)

supabase/
  schema.sql      hogares, miembros, items y la RLS
  mensajes.sql    la bandeja de los SMS del banco
  precios.sql     tiendas, precios con histórico y la bitácora del robot
  precios-auto.sql  el cron que hace que el robot corra solo
  claude.sql      los tokens del conector de Claude
  functions/      las Edge Functions que traen los precios (Deno) y mcp/, la del conector (generada)
```
