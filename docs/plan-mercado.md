# Mercado: precios automáticos y lista de compras

## Contexto

Hoy la app sabe en qué se va la plata *después* de gastarla: los SMS del banco llegan a
Gastos y la Caja dice cuánto queda. No sabe nada *antes* de la compra. El mercado es uno de
los gastos más grandes y más repetidos de la casa, y en Bogotá el mismo producto puede
costar muy distinto en Éxito, Carulla, Makro, D1 y Ara.

Este plan cierra ese hueco: un robot que consulta los precios solo, una página que los
compara producto por producto, y una lista de compras que dice cuánto va a costar y dónde
conviene comprarla. Es el paso que falta para que la Caja se planee, no solo se mida.

Decisiones tomadas de antemano: la infraestructura va en **Supabase** (tablas de precios +
Edge Functions programadas), **D1 y Ara se intentan por folleto semanal**, el alcance es
**comparar + lista de compras** (la conexión con Caja/Gastos queda para después) y la ciudad
es **Bogotá**.

## Lo que no se pudo verificar

El plan se escribió en un entorno cuyo proxy bloquea los dominios de las tiendas (403 en
`www.exito.com` y `www.carulla.com`). **Ningún endpoint de tienda está comprobado.** Lo que
sí se sabe: Éxito y Carulla son del mismo grupo y corren sobre VTEX, que expone un catálogo
público; Makro Colombia muy probablemente también; D1 y Ara casi no tienen tienda en línea y
por eso van por folleto.

De ahí salen las dos decisiones que sostienen todo el diseño: la **Fase 0 es un
descubrimiento ejecutable**, y la **Fase 1 entrega una app completa que funciona sin
raspar nada**. Si el raspado nunca llega, la pareja ya tiene la comparación que hoy haría en
un papel. Cada tienda es un adaptador independiente y cualquiera puede caer a "precio
anotado a mano" sin tumbar a las demás.

## Arquitectura

```
pg_cron (diario 6am Bogotá) ──► Edge Function `precios-tiendas`  ──► VTEX Éxito/Carulla/Makro
pg_cron (lunes)             ──► Edge Function `precios-folletos` ──► folleto D1/Ara → Claude
la app, al vincular         ──► Edge Function `precios-buscar`   ──► búsqueda en vivo
                                        │
                                        ▼
                        tablas public.tiendas · precios · precios_corridas
                                        │  (lectura: cualquiera con sesión)
                                        ▼
                    src/pages/Mercado.tsx  ·  canasta, comparación, lista
                                        ▲
                                        │ canasta y listas viajan por la tabla `items`
                                        │ que ya sincroniza los dos celulares
```

Dos dominios con dueños distintos, separados a propósito:

| Dato | De quién es | Dónde vive | Cómo llega |
|---|---|---|---|
| Precios de catálogo | de nadie, son públicos | tablas nuevas | Edge Function + cron |
| Canasta y lista de compras | del hogar | `public.items` | el sync que ya existe |

Los precios **no** pueden ir en `items`: son miles de filas, no pertenecen al hogar, los
escribe el `service_role`, y meterlos ahí los haría viajar dentro de la carga inicial de
cada celular.

## Fase 0 · Descubrimiento (antes de escribir un solo adaptador)

Se despliega **solo** `supabase/functions/precios-descubrir` y se llama una vez por tienda.
Corre desde la red de Supabase, no desde una máquina con proxy. Por cada tienda prueba una
cascada de endpoints candidatos y escribe en `tiendas.config.estrategia` cuál respondió:

- Éxito / Carulla / Makro — Plan A: *intelligent search* de VTEX. Plan B:
  `/api/catalog_system/pub/products/search`. Plan C: el JSON incrustado en el HTML del
  producto. Plan D: fallar limpio y anotarlo.
- D1 y Ara — dónde está el folleto de la semana y en qué formato (PDF, imágenes, o una
  página que hay que leer).

Qué pasa según el resultado:

| Resultado | Consecuencia |
|---|---|
| Éxito y Carulla responden | Fase 2 sigue; son el núcleo |
| Makro no responde | queda con `fuente = 'manual'`; la columna sigue en la tabla y se llena a mano. Cero cambios de UI |
| Ninguna tienda con API responde | el proyecto **no se cancela**: la Fase 1 ya entregó la app útil. Se replantea con folleto para las cinco |
| D1/Ara sin folleto descargable | se cae al modo "foto del folleto": la misma función, disparada desde la app con las fotos que tomen en la tienda |

## Fase 1 · El seguro: la app completa, con precios a mano

No depende de nada externo. Al terminar esta fase la función ya sirve.

### `supabase/precios.sql` (archivo nuevo)

Mismas convenciones que `supabase/schema.sql` y `supabase/mensajes.sql`: todo en español,
`create ... if not exists`, idempotente, pegable en el SQL Editor.

- `public.tiendas` — `id` ('exito', 'carulla', 'makro', 'd1', 'ara'), nombre, `fuente`
  ('api' | 'folleto' | 'manual'), `ciudad` (default 'Bogotá'), `activa`, `orden`,
  `config jsonb` (dominio, canal de venta, estrategia que funcionó, URL del folleto).
- `public.precios` — llave primaria `(tienda_id, sku, dia)`: **el histórico diario sale
  gratis de la llave**. Correr el robot dos veces el mismo día actualiza la misma fila;
  correrlo mañana crea la del día siguiente. Sin tabla de histórico aparte. Campos: `nombre`,
  `marca`, `precio`, `precio_lista` (antes del descuento), `contenido` + `unidad`
  ('l' | 'kg' | 'un'), `promocion` ('2x1'), `vigente_hasta` (las ofertas de folleto caducan),
  `url`, `imagen`, `fuente`, `capturado_en`.
- `public.precios_corridas` — bitácora: qué tienda, cuándo, si salió bien, cuántas filas y
  qué error. Sin esto, una tienda que empieza a devolver vacío se rompe en silencio; con
  esto, la app puede decir "Makro no se pudo leer desde el martes".
- `public.precios_ultimos` — vista `distinct on (tienda_id, sku)` con
  `security_invoker = on` (si no, la vista se salta la RLS de quien consulta).

**RLS**: lectura para cualquier usuario autenticado — son precios públicos, no hay nada del
hogar ahí. **No hay política de escritura**, y eso no es un olvido: el `service_role` se
salta la RLS, así que escriben las Edge Functions y nadie más. Va comentado en el SQL.

El único camino de escritura desde la app es una función, calcada del patrón de
`entrada_sms` en `supabase/mensajes.sql`:

```sql
create or replace function public.precio_manual(
  p_tienda text, p_nombre text, p_precio numeric,
  p_contenido numeric default null, p_unidad text default null, p_sku text default null)
returns text language plpgsql security definer set search_path = public as $$ ... $$;
grant execute on function public.precio_manual(text,text,numeric,numeric,text,text) to authenticated;
```

El `sku` de un precio manual es determinista y con prefijo (`manual:<sha256 del nombre>`):
nunca choca con uno real, y anotar dos veces el mismo producto actualiza en vez de duplicar.

### El modelo de la canasta (`src/types.ts`)

```ts
export type TiendaId = 'exito' | 'carulla' | 'makro' | 'd1' | 'ara'
export type Unidad = 'l' | 'kg' | 'un'

/** Un producto de la canasta ↔ el SKU con que lo llama una tienda. */
export interface Vinculo {
  tienda: TiendaId
  sku: string
  nombre: string        // como lo escribe la tienda
  contenido: number     // 1.1 (la bolsa de 1.100 ml)
  unidad: Unidad
  confirmado: boolean   // lo tocó una persona, no lo adivinó la app
}

export interface Producto {
  id: string
  nombre: string        // 'Leche Colanta 1L', como lo dicen ustedes
  emoji: string
  unidad: Unidad        // en qué se compara
  contenidoRef: number  // 1 (un litro)
  vinculos: Vinculo[]
  habitual: number      // cuántos suelen llevar
  activo: boolean
}

export interface ItemLista { productoId: string; cantidad: number; listo: boolean }
export interface ListaCompras { id: string; nombre: string; creadaEn: string; items: ItemLista[] }
```

Los vínculos viven **dentro** del producto, no como entidad suelta: un producto es una fila
de `items`, sin huérfanos ni orden de aplicación que cuidar.

### Que se sincronicen (sin tocar SQL ni RLS)

La tabla `items` ya es genérica. Los cambios son los del checklist que ya siguieron
`bolsillo` e `ingreso`:

- `src/supabase.ts:22,25` — `'producto'` y `'lista'` en `TipoItem` y en `TIPOS_ITEM`.
- `src/store.tsx`, cuatro puntos: (a) `productos: []` y `listas: []` en `estadoInicial()`;
  (b) las variantes en la unión `Accion`; (c) los `case` del reducer —
  `producto/agregar|editar|borrar|vincular|desvincular` y
  `lista/crear|editar|borrar|poner|marcar|limpiar`; (d) **registrarlas en `COLECCION`
  (`:331-340`) y en `filasDeEstado()` (`:369-383`)**. Si se olvida (d), la sección funciona
  local y nunca sincroniza.
- `src/sync.tsx` — nada que tocar: `aplicarFilas()` resuelve por `COLECCION[f.tipo]` y el
  empuje sale de `filasDeEstado()`.
- **Sin migración de estado y sin subir `version`**: `cargar()` hace
  `{ ...estadoInicial(), ...guardado }`, así que un localStorage viejo recibe los arrays
  vacíos solo.

Compatibilidad entre celulares: `aplicarRemotas` descarta la fila de tipo desconocido
**antes** de anotarla en `conocidas` (`src/sync.tsx:128-130`), y `empujar()` calcula los
borrados recorriendo solo las llaves de `conocidas`. O sea: un celular con la versión vieja
ve las filas nuevas, las ignora, **y nunca las marca como borradas**. Exactamente lo que se
necesita mientras uno actualiza antes que el otro.

### El problema difícil: emparejar "Leche Colanta 1L" entre cinco tiendas

No se resuelve con un algoritmo. Se resuelve **guardando el trabajo humano una sola vez**.

Cada tienda vende otra presentación: Éxito la bolsa de 1.100 ml, D1 la de 900. Comparar el
precio absoluto sería mentir; se compara **precio por unidad base**. Por eso el `Vinculo`
guarda el contenido real de *esa* presentación.

Flujo de vinculación, una vez por producto y tienda:

1. Crean el producto: nombre, emoji, unidad base (`l`) y contenido de referencia (`1`).
2. "Buscar en las tiendas" → `precios-buscar` con el texto.
3. Vuelven candidatos por tienda, ordenados por puntaje y **ya con el precio por litro
   calculado**. Tocan el correcto → se guarda el vínculo con `confirmado: true`.
4. Tienda sin candidato (D1/Ara sin folleto, o cualquiera caída) → "Anotar el precio a mano"
   llama a `precio_manual` y crea el vínculo con el sku que devuelve.
5. Un candidato con puntaje muy alto y contenido que calza queda preseleccionado pero
   `confirmado: false`, marcado con un asterisco hasta que alguien lo toque.

### La lógica pura (`src/mercado.ts`)

Sin React, como `src/caja.ts`. Es lo que se prueba:

```ts
normalizarNombre(s): string                          // mayúsculas, sin tildes, sin 'X 1 UND'
leerContenido(nombre): { contenido, unidad } | null  // '1.100 ml' → 1.1 l · 'x6 und' → 6 un
precioPorUnidad(precio, contenido): number
puntajeCoincidencia(canonico, deLaTienda, contenidos?): number   // 0..1
frescura(dia, vigenteHasta, hoy): 'hoy' | 'reciente' | 'viejo' | 'vencido'
totalEnUnaTienda(lista, precios, tienda): { total, faltan }
mejorRepartido(lista, precios, maxTiendas = 2): { tiendas, total, asignacion, faltan }
comparativo(lista, precios): { unaTienda, repartido, ahorro, frase }
```

Decisiones que importan:

- **Leer el contenido desde el texto vive solo en el cliente**, no duplicado en Deno. Las
  Edge Functions guardan `contenido`/`unidad` únicamente cuando la fuente los da explícitos
  (VTEX entrega `unitMultiplier` y `measurementUnit`; Claude los devuelve estructurados). Si
  vienen nulos, la app los deduce del nombre. Una implementación, un set de pruebas.
- **"Todo en una tienda"** se ordena por `(faltantes, total)`: una tienda barata a la que le
  falten tres cosas no puede ganar.
- **"Repartido"** es fuerza bruta sobre los 32 subconjuntos de cinco tiendas, con tope de
  paradas (2 por defecto). Resultado exacto y explicable, cero heurística que justificar.
- **El resultado se dice en una frase**, al estilo de `src/caja.ts`: *"Todo en Éxito:
  $184.300. Repartido entre D1 y Carulla: $161.900 — ahorran $22.400 por ir a dos sitios."*
  Y solo se declara ahorro si pasa un umbral (unos $5.000 o 3%); por debajo, "prácticamente
  igual, vayan al que les quede cerca". Un plan que manda a cruzar la ciudad por $900 no
  sirve.

### La página (`src/pages/Mercado.tsx`)

Cinco ediciones, las de siempre: el archivo con `export function Mercado()`; su import, su
entrada en `PAGINAS` y su línea de render en `src/App.tsx` (navegación por hash, sin router);
y el trazo SVG en `TRAZOS` de `src/components/iconos.tsx` **con la clave `'mercado'`,
idéntica al id de la página** (el nav hace `<Icono nombre={p.id} />` y devuelve `null` si
falta). Molde: `src/pages/Facturas.tsx` — `type Borrador` local con `id?`, lecturas con
`useMemo`, escrituras solo por `dispatch`, estructura
`div.pila > div.cabecera > div.grid2 > lista de div.item > FAB > Modal`. Se reusan `Modal`,
`Campo`, `Segmento`, `Vacio`, `InputMonto`, `EmojiPicker` y `useToast` de
`src/components/ui.tsx`, y `dinero()` de `src/format.ts`.

- **Comparar**: una fila por producto, una columna por tienda. En cada celda el precio de la
  presentación y debajo, en letra chica, el precio por litro o kilo; la más barata de la fila
  resaltada. Celda sin vínculo: "vincular". Celda sin precio de hoy: el último conocido,
  atenuado.
- **Lista**: productos con cantidad, marcables al ir comprando, y abajo el panel de decisión
  con la frase.
- **Precio a mano** en cualquier celda, con su fecha.

Cómo se marca lo que no es confiable — un precio de folleto de hace cinco días no vale lo
mismo que uno de la API de hoy:

| Señal | En pantalla |
|---|---|
| API y es de hoy | precio limpio |
| entre 1 y 3 días | precio + "hace 2 d" |
| más de 3 días | atenuado + "puede haber cambiado" |
| del folleto | insignia 📰 "del folleto" |
| `vigente_hasta` ya pasó | tachado, **no cuenta en los totales** |
| anotado a mano | insignia ✍️ + fecha |

Y un interruptor **"solo precios confiables"** que recalcula todo excluyendo folleto y
viejos, para ver si la recomendación aguanta. Más una línea de estado alimentada por
`precios_corridas`. La app tiene que *verse* desactualizada cuando lo está, en vez de mentir
con un precio viejo.

Ojo con la barra: con Mercado quedan diez botones. Entra entre Caja y Gastos y, si se
aprieta en el celular, se le pone la clase `solo-escritorio` a alguna de más abajo, como ya
se hace con Muro y Ajustes.

## Fase 2 · Éxito y Carulla (las tiendas con API)

```
supabase/functions/
  _compartido/  tipos.ts · db.ts (service role, guardarPrecios, abrir/cerrarCorrida) · red.ts
  precios-descubrir/   el checkpoint de la fase 0
  precios-tiendas/     index.ts (orquestador) · vtex.ts · exito.ts carulla.ts makro.ts
  precios-buscar/      búsqueda en vivo para vincular
  precios-folletos/    index.ts · claude.ts · d1.ts ara.ts
```

Contrato de adaptador: `buscar(termino, cfg)`, `traer(skus, cfg)`, `descubrir?()`. Éxito,
Carulla y (probablemente) Makro son VTEX, así que `vtex.ts` es **un solo adaptador
parametrizado** por dominio, canal de venta y región; `exito.ts` y compañía solo exportan su
config.

Reglas de aislamiento, que son la mitad del valor:

- El orquestador corre `Promise.allSettled` por tienda. **Una tienda caída no toca a las
  demás**: cada una abre y cierra su propia corrida y escribe sus propias filas.
- Reintentos con espera creciente y jitter, **solo** para red, 429 y 5xx. Un 404 o un 400 no
  se reintenta: es un SKU que ya no existe, y se anota.
- Timeout duro por petición (`AbortController`), lotes de ~50 SKUs con una pausa corta entre
  lotes.
- La respuesta HTTP **siempre es 200** con un resumen por tienda. Un 500 haría que `pg_net`
  solo registre "falló", sin decir de quién.
- Buena vecindad: es uso personal y de bajo volumen — una consulta por SKU vinculado al día.
  Nada de paralelismo agresivo ni de recorrer catálogos enteros.

Despliegue manual: `npx supabase functions deploy precios-tiendas`.

## Fase 3 · Makro

Según lo que haya dicho la Fase 0. Si es VTEX, es una config más en `vtex.ts` y no hay
código nuevo. Si no, queda en `fuente = 'manual'` y la columna se llena a mano. No se pelea.

## Fase 4 · Folletos de D1 y Ara, leídos por Claude

Cada adaptador de folleto expone `paginas(): Promise<{ tipo: 'pdf'|'imagen'; datos }[]>`. Si
la descarga falla, hay un segundo camino que usa **el mismo código**: la pareja le toma foto
al folleto en la tienda y la app manda las imágenes a la misma función. Automático y manual
asistido comparten todo menos el origen de las páginas.

```ts
// supabase/functions/precios-folletos/claude.ts
import Anthropic from 'npm:@anthropic-ai/sdk'
const cliente = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

const r = await cliente.messages.create({
  model: 'claude-opus-5',
  max_tokens: 16000,
  thinking: { type: 'adaptive' },
  output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
  messages: [{ role: 'user', content: [...paginas, { type: 'text', text: INSTRUCCIONES }] }],
})
```

El esquema pide, por producto: nombre, marca, precio, precio de lista, contenido, unidad,
promoción y vigencia. Detalles que importan: `thinking: { type: 'adaptive' }` (nada de
`budget_tokens`, ese devuelve 400); el PDF va como bloque `document` en base64 y las páginas
sueltas como bloques `image`; **una página por llamada**, para que una página ilegible no
tumbe el folleto entero; si queda largo, `.stream()` + `.finalMessage()` para no chocar con
el timeout HTTP.

El sku de folleto también es determinista (`folleto:<sha256 de nombre+contenido>`), así el
mismo producto la semana entrante cae en la misma fila lógica y el histórico sirve. Todo
entra con `fuente = 'folleto'` y su `vigente_hasta`, y la UI lo muestra siempre marcado: un
precio de folleto nunca se presenta con la misma cara que uno de API.

`ANTHROPIC_API_KEY` va en los secretos de Edge Functions (`npx supabase secrets set`), no en
Vault — Vault solo guarda lo que necesita Postgres para llamarse a sí mismo.

Costo: un folleto de ~20 páginas son unos 30–40K tokens de entrada; a US$5 por millón, del
orden de **US$0.20 por corrida semanal**. Si con el tiempo molesta, `claude-haiku-4-5` hace
este trabajo por una quinta parte.

Esta fase es la más frágil del plan y va casi de última a propósito.

## Fase 5 · Automatizar y pulir

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
```

La URL del proyecto y la service key van en **Vault**, nunca en el SQL versionado: el archivo
trae dos placeholders que se reemplazan una sola vez al pegarlo. Una función
`public.disparar_precios(funcion, cuerpo)` `security definer` y **sin grants** (ni a `anon`
ni a `authenticated`) arma el `net.http_post`; nadie con la clave publishable la puede
invocar.

```sql
do $$ begin
  perform cron.unschedule(jobname) from cron.job
    where jobname in ('precios-tiendas','precios-folletos','precios-limpieza');
end $$;
select cron.schedule('precios-tiendas',  '0 11 * * *', $$select public.disparar_precios('precios-tiendas')$$);
select cron.schedule('precios-folletos', '30 11 * * 1', $$select public.disparar_precios('precios-folletos')$$);
select cron.schedule('precios-limpieza', '0 8 * * 0',
  $$delete from public.precios where dia < current_date - 180$$);
```

El `do $$ ... $$` que desprograma primero es lo que deja pegar el archivo cuantas veces haga
falta. `cron` corre en UTC: 11:00 UTC son las 6:00 a.m. de Bogotá.

Y lo que el histórico ya venía guardando desde la Fase 1 se vuelve útil: un panel de
corridas y un aviso "la leche bajó $800 en D1".

## Pruebas

`src/mercado.test.ts`, con vitest, al estilo de `src/mensajes.test.ts`: solo lógica pura (el
repo no tiene pruebas de componentes, ni jsdom, ni testing-library), fábricas de fixtures
bajo un comentario de sección, y títulos en prosa española.

- **`leerContenido`** — el caso con más trampas, el que decide si la comparación miente:
  `'Leche Entera Colanta Bolsa x 1.100 ml'` → 1.1 l · `'900g'`, `'900 gr'`, `'x900G'` →
  0.9 kg · `'1,5 L'` → 1.5 l · `'Huevos AA x 30 und'` → 30 un · `'Arroz Diana 500 g x 2'` →
  1 kg · sin contenido → `null` · que `'2x1'` **no** se lea como contenido.
- **`precioPorUnidad`** — que Éxito 1.100 ml a $4.800 pierda contra D1 900 ml a $4.100, pese
  a costar más en absoluto. División por cero que no revienta.
- **`puntajeCoincidencia`** — que "Leche Colanta 1L" prefiera "LECHE ENTERA COLANTA 1000ML"
  sobre "LECHE ALPINA DESLACTOSADA 1L"; que la marca pese más que el sustantivo; estabilidad
  ante tildes y mayúsculas.
- **`frescura`** — cada fila de la tabla de arriba, con una fecha fija, incluido el folleto
  vencido que **no** entra en los totales.
- **`totalEnUnaTienda`** — cantidades; faltantes contados aparte y nunca sumados como cero.
- **`mejorRepartido`** — con tope 1 da lo mismo que la mejor tienda única; con tope 2
  encuentra el par óptimo; una tienda a la que le falte un producto no forma solución
  completa; en empate gana la de menos paradas.
- **`comparativo`** — la frase correcta cuando repartir gana, cuando no, y cuando el ahorro
  queda bajo el umbral; canasta vacía y canasta sin ningún precio no revientan.
- **Reducer** — `producto/vincular` reemplaza el vínculo de esa tienda en vez de duplicarlo;
  `producto/borrar` limpia los ítems de lista que lo referencian; `lista/poner` con cantidad
  0 quita el ítem.

Lo que **no** se prueba con vitest: los adaptadores de Deno (dependen de HTTP real) y la
extracción de Claude. Para esos, el instrumento de diagnóstico en producción es
`precios_corridas`.

## Documentación

El `README.md` es la memoria del proyecto y explica cada pieza con ese mismo tono. Se le
agrega una sección **Mercado** al nivel de las otras: qué hace, cómo se configura en Supabase
(pegar `supabase/precios.sql`, desplegar las funciones, poner los secretos), qué tienda se lee
sola y cuál toca a mano, y cómo se vincula un producto la primera vez. Más la línea nueva en
el mapa de `src/` del final.

## Verificación de punta a punta

1. `npm install && npm test` — las pruebas nuevas y las que ya existen (`caja`, `mensajes`).
2. `npm run build` — incluye `tsc --noEmit`. No hay linter; la única puerta es TypeScript en
   modo `strict` con `noUnusedLocals`, y el workflow de Pages corre `npm test` y
   `npm run build` antes de publicar: **si algo de esto falla, el deploy no sale**.
3. Pegar `supabase/precios.sql` en el SQL Editor y correrlo **dos veces seguidas**: la
   segunda no debe fallar.
4. `npm run dev` con la Fase 1 sola: crear un producto, anotarle precios a mano en tres
   tiendas, armar una lista y contrastar el total y la frase contra la suma hecha a mano.
5. Abrir la app en el otro celular y confirmar que la canasta y la lista llegaron por sync.
   Abrirla también en un celular **sin actualizar** y confirmar que no se rompe ni borra nada.
6. Desplegar `precios-tiendas`, invocarla a mano y revisar que `precios_corridas` registre la
   corrida y que `precios_ultimos` tenga filas.
7. Disparar el cron a mano y confirmar que el precio del día siguiente entra como fila nueva,
   sin pisar la de ayer.

## Lo que queda para después (fuera de este alcance)

Conectar el Mercado con la Caja: al cerrar una lista, anotar el gasto en la categoría
`mercado` y descontarlo del bolsillo. El terreno ya está abonado — `src/categorias.ts:4` ya
tiene `mercado` 🛒 de primera, y `src/comercios.ts:10-13` ya reconoce EXITO, CARULLA, D1, ARA
y MAKRO en los SMS del banco —, así que el día que se quiera, el puente es corto.

## Riesgos, dichos de frente

- **Los endpoints no están verificados.** La Fase 0 puede cambiar el alcance de las Fases 2,
  3 y 4. Lo que no cambia es el esquema ni la app: una tienda ilegible es una tienda manual.
- **Las tiendas pueden cerrar la puerta** (bloqueo por bot, cambio de plataforma). Por eso
  `precios_corridas` y el sello de frescura.
- **Es raspado de sitios ajenos**, aunque sea del catálogo público y para uso personal de dos
  personas. Una consulta por SKU vinculado al día: si algún día molesta a alguien, que sea
  por poco.
- **Los precios de Bogotá no son los de otra ciudad.** Queda fijo en `tiendas.ciudad` y se
  puede cambiar después sin tocar el modelo.
