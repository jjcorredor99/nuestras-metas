# Mercado: precios automáticos y lista de compras

## Contexto

Hoy la app sabe en qué se va la plata *después* de gastarla: los SMS del banco llegan a
Gastos y la Caja dice cuánto queda. No sabe nada *antes* de la compra. El mercado es uno de
los gastos más grandes y más repetidos de la casa, y en Bogotá el mismo producto puede
costar muy distinto en Éxito, Carulla, Makro, D1 y Ara.

La idea es cerrar ese hueco: un robot que consulta los precios solo, una página que los
compara producto por producto, y una lista de compras que dice cuánto va a costar y dónde
conviene comprarla. Es el paso que falta para que la Caja se planee, no solo se mida.

Decisiones ya tomadas con el usuario: la infraestructura va en **Supabase** (tabla de
precios + Edge Function programada), **D1 y Ara se intentan por folleto semanal**, el
alcance es **comparar + lista de compras** (la conexión con Caja/Gastos queda para después)
y la ciudad es **Bogotá**.

## Lo que no se pudo verificar desde aquí

El proxy de esta sesión bloquea los dominios de las tiendas (403 en `www.exito.com` y
`www.carulla.com`). **Ningún endpoint de tienda está comprobado.** Lo que sí se sabe:
Éxito y Carulla son del mismo grupo y corren sobre VTEX, que expone un catálogo público
(`/api/catalog_system/pub/products/search`); Makro Colombia muy probablemente también; D1
y Ara casi no tienen tienda en línea y por eso van por folleto.

Por eso la **Fase 0 es un descubrimiento ejecutable** y todo el diseño asume que cualquier
tienda puede resultar ilegible: cada una es un adaptador independiente y cada una puede
caer a "precio anotado a mano" sin tumbar a las demás.

## Arquitectura

```
pg_cron (diario 6am Bogotá) ──► Edge Function `precios`  ──► VTEX Éxito/Carulla/Makro
pg_cron (semanal)           ──► Edge Function `folletos` ──► folleto D1/Ara → Claude (visión)
                                        │
                                        ▼
                            tabla public.precios (histórico por día)
                                        │  (lectura para cualquiera con sesión)
                                        ▼
                    src/pages/Mercado.tsx  ·  canasta, comparación, lista
                                        ▲
                                        │ canasta y listas viajan por la tabla `items`
                                        │ que ya sincroniza los dos celulares
```

Dos mundos separados a propósito:

- **Los precios son datos públicos de catálogo**, no del hogar. Viven en tablas nuevas,
  fuera de `items`, y los escribe solo la Edge Function (service role).
- **La canasta y las listas son del hogar.** Van como tipos nuevos en la tabla `items` que
  ya existe, así se sincronizan entre los dos celulares, funcionan sin internet y entran en
  el respaldo de Ajustes sin código nuevo de sync.

## Fase 0 · Descubrimiento (bloqueante, antes de escribir la función definitiva)

Un script corto (`scripts/descubrir.ts`, se corre con `node --experimental-strip-types`
desde una máquina sin proxy, o se pega en una Edge Function temporal) que por cada tienda
imprime: código HTTP, forma de la respuesta y el precio de un producto de prueba ("leche
entera 1 litro"). Cubre:

- Éxito / Carulla / Makro: `https://<dominio>/api/catalog_system/pub/products/search/?ft=leche`
  y, si eso falla, el endpoint de *intelligent search* de VTEX.
- D1 y Ara: dónde está el folleto de la semana y en qué formato (PDF, imágenes, o una
  página que hay que leer).

**Salida de la fase**: una tabla de tres columnas — tienda · cómo se lee · qué devuelve —
que decide qué adaptador se escribe. Una tienda que no se pueda leer queda registrada con
`fuente = 'manual'` y sigue apareciendo en la comparación, solo que con el precio que
ustedes anoten. Esto no se negocia con esfuerzo: si Makro no abre, Makro es manual.

## Fase 1 · Esquema (`supabase/precios.sql`)

Archivo nuevo, idempotente, en español y con el mismo estilo de `supabase/schema.sql`
(`create ... if not exists`, RLS explícita, comentarios que explican el porqué).

- `public.tiendas` — `id` ('exito', 'carulla', 'makro', 'd1', 'ara'), nombre, `fuente`
  ('api' | 'folleto' | 'manual'), `ciudad` (default 'bogota'), `activa`, `config jsonb`
  (dominio, canal de venta, URL del folleto).
- `public.productos_tienda` — el SKU tal como existe en cada tienda: `(tienda, sku)` como
  llave, nombre, marca, presentación, `cantidad` + `unidad` ('g' | 'ml' | 'un'), url,
  imagen. Estas filas nacen cuando alguien vincula un producto desde la app; el robot solo
  refresca lo que ya está vinculado, así no se consulta catálogo de más.
- `public.precios` — histórico: llave `(tienda, sku, dia)`, `precio`, `precio_lista` (el de
  antes del descuento), `disponible`, `fuente`, `confianza` (1 para API, menos para
  folleto), `vigente_hasta` (las ofertas de folleto caducan), `visto_en`. El histórico es lo
  que después permite decir "esto subió" sin código nuevo.
- `public.precios_hoy` — vista con `security_invoker = true` (si no, la vista se salta la
  RLS): el último precio por `(tienda, sku)` con el nombre del producto y la tienda pegados.
- `public.corridas` — bitácora: cuándo corrió, qué tienda, cuántos precios, qué falló. Sin
  esto, una tienda que empieza a devolver vacío se rompe en silencio.

RLS: lectura para cualquier usuario autenticado (`auth.uid() is not null` — son precios
públicos, no hay nada del hogar ahí); escritura solo para el service role, con una única
excepción: un usuario autenticado puede insertar en `precios` si `fuente = 'manual'`, que es
como se anota el precio de D1/Ara visto en la tienda.

Programación con `pg_cron` + `pg_net`, con la clave de servicio en Vault (nunca en el SQL):
`precios` diario a las 11:00 UTC (6am Bogotá) y `folletos` una vez por semana. El bloque de
`cron.schedule` va envuelto en un `do $$ ... $$` que primero desprograma, para poder pegar
el archivo varias veces.

## Fase 2 · Edge Function `precios` (tiendas con API)

`supabase/functions/precios/index.ts` (Deno, TypeScript) + `supabase/functions/_shared/`:

- `tiendas/vtex.ts` — un solo adaptador para Éxito, Carulla y Makro si las tres son VTEX;
  se parametriza con dominio y canal de venta desde `tiendas.config`. Expone
  `buscar(termino)` (para la pantalla de vincular) y `precios(skus)` (para el refresco).
- `index.ts` — lee las tiendas activas con `fuente = 'api'`, agrupa los SKUs vinculados por
  tienda, consulta en lotes con una pausa corta entre lotes, y hace `upsert` en `precios`.
  Cada tienda corre en su propio `Promise.allSettled`: **una tienda caída no tumba a las
  demás**, queda anotada en `corridas` y la app muestra su precio como viejo.
- Reintentos: dos, con espera creciente, solo para errores de red y 5xx. Un 403 o un 404 no
  se reintenta — se anota y se sigue.
- Buena vecindad: es un uso personal y de bajo volumen (una consulta por SKU vinculado al
  día). Nada de paralelismo agresivo ni de recorrer catálogos enteros.

## Fase 3 · Modelo de la canasta y emparejamiento entre tiendas

Este es el problema difícil: "Leche Colanta 1L" no se llama igual en cinco tiendas y buscar
por texto en cada consulta da comparaciones falsas (compara 1L contra 900ml contra un six
pack). La solución es **vincular una vez a mano y comparar siempre por unidad**.

En `src/types.ts`, dos tipos nuevos dentro de `Estado`:

```ts
export type TiendaId = 'exito' | 'carulla' | 'makro' | 'd1' | 'ara'

export interface VinculoTienda { tienda: TiendaId; sku: string; nombre: string }

export interface Producto {
  id: string
  nombre: string              // como lo dicen ustedes: "Leche"
  emoji: string
  unidad: 'g' | 'ml' | 'un'   // en qué se compara
  cantidadHabitual: number    // lo que suelen llevar
  vinculos: VinculoTienda[]   // el SKU exacto en cada tienda
  creadoEn: string
}

export interface ItemLista { productoId: string; cantidad: number; comprado: boolean }
export interface ListaCompras {
  id: string; titulo: string; fecha: string; items: ItemLista[]; cerrada: boolean
}
```

Cambios mínimos para que se sincronicen, siguiendo el camino que ya existe. **No hay
migración SQL**: la tabla `items` es genérica y la RLS ya la cubre.

- `src/types.ts` — las dos interfaces y los dos campos nuevos en `Estado`.
- `src/supabase.ts:22,25` — agregar `'producto'` y `'lista'` al tipo `TipoItem` y a
  `TIPOS_ITEM`. Una versión vieja de la app **ignora los tipos que no conoce y no los anota
  como conocidos** (`src/sync.tsx:128-130`), justo para no borrárselos al otro celular: un
  teléfono sin actualizar no se rompe, simplemente no ve el Mercado.
- `src/store.tsx`, cuatro puntos (es el checklist que ya siguieron `bolsillo` e `ingreso`):
  (a) las colecciones en `estadoInicial()`; (b) las variantes en la unión `Accion`;
  (c) los `case` del reducer — `producto/agregar|editar|borrar|vincular` y
  `lista/agregar|editar|borrar|marcar`, con el patrón
  `{ ...s, col: [{ ...a.x, id: uid() }, ...s.col] }`; (d) **registrarlas en `COLECCION`
  (`:331-340`) y en `filasDeEstado()` (`:369-383`)** — si se olvida esto, la sección
  funciona local y nunca sincroniza.
- `src/sync.tsx` — nada que tocar: `aplicarFilas()` resuelve por `COLECCION[f.tipo]` y el
  empuje sale de `filasDeEstado()`.

Flujo de vinculación en la UI: escriben "leche" → la app busca en las tiendas con API (vía
la Edge Function, que también expone `?buscar=`) → eligen el resultado exacto de cada tienda
→ se guarda el vínculo y se crea la fila en `productos_tienda` para que el robot lo refresque
de ahí en adelante. Para D1 y Ara, el vínculo es contra lo que haya salido del folleto, o se
deja el campo de precio a mano.

## Fase 4 · Lógica pura (`src/mercado.ts`) y página (`src/pages/Mercado.tsx`)

Toda la matemática en un archivo sin React, como ya se hizo con `src/caja.ts`:

- `precioPorUnidad(precio, cantidad, unidad)` — normaliza a precio por kilo, por litro o por
  unidad. Es lo único que hace honesta la comparación.
- `comparar(producto, precios)` — devuelve la fila de tiendas ordenada, con la más barata
  marcada y las que no tienen dato aparte.
- `frescura(visto_en, vigente_hasta, hoy)` — `'fresco'` | `'viejo'` (más de 7 días) |
  `'vencido'` (oferta de folleto que ya pasó). La UI nunca muestra un precio sin decir de
  cuándo es.
- `totalPorTienda(lista, precios)` — cuánto cuesta la lista completa en cada tienda, y qué
  productos le faltan a esa tienda (una tienda que no tiene la mitad de la lista no es una
  ganga).
- `repartoOptimo(lista, precios)` — cada producto en su tienda más barata: total, ahorro
  contra la mejor tienda única, y en cuántas tiendas tocaría parar. Sirve para la pregunta
  real: *¿vale la pena la segunda parada?*

Una página nueva son cinco ediciones, las mismas de siempre: el archivo
`src/pages/Mercado.tsx` con `export function Mercado()`; su import y su entrada en `PAGINAS`
y en la cadena de render de `src/App.tsx` (navegación por hash, sin router); y el trazo SVG
en `TRAZOS` de `src/components/iconos.tsx` **con la clave `'mercado'`, idéntica al id de la
página** (el nav hace `<Icono nombre={p.id} />` y devuelve `null` si falta). El molde es
`src/pages/Facturas.tsx`: `type Borrador` local con `id?` (con id = editar, sin id = crear),
lecturas con `useMemo`, escrituras solo por `dispatch`, y la estructura
`div.pila > div.cabecera > div.grid2 > lista de div.item > FAB > Modal`.

Ojo: con Mercado la barra queda en diez botones; entra después de Gastos y, si se aprieta en
el celular, se le pone la clase `solo-escritorio` a alguna de las de más abajo, como ya se
hace con Muro y Ajustes.

- **Canasta**: cada producto con su precio por tienda, la más barata resaltada, el precio por
  unidad debajo en letra chica, y un sello de cuándo se vio. Los de folleto van marcados
  como tales.
- **Lista**: se marcan productos y cantidades; arriba, "todo en Éxito: $X · repartido: $Y
  (ahorran $Z en 2 paradas)". En modo compra, cada línea se tacha al marcarla.
- **Precio a mano**: en cualquier tienda, un botón para escribir el precio que vieron; queda
  con `fuente = 'manual'` y su fecha.

Nada de UI nueva desde cero: `Modal`, `Campo`, `Segmento`, `Vacio`, `InputMonto`,
`EmojiPicker` y `useToast` ya están en `src/components/ui.tsx`, y `dinero()` de
`src/format.ts` formatea la plata. La página usa `useStore()` y `dispatch` igual que
`src/pages/Facturas.tsx`.

## Fase 5 · Folletos de D1 y Ara (`supabase/functions/folletos`)

Semanal. Baja el folleto de la semana, convierte las páginas a imágenes y se las pasa a
Claude para que devuelva JSON estructurado:

- SDK oficial `npm:@anthropic-ai/sdk` desde Deno, modelo `claude-opus-5`, con
  `output_config: { format: ... }` (structured outputs) y un esquema que pida, por producto:
  nombre, marca, presentación, cantidad, unidad, precio y vigencia.
- `ANTHROPIC_API_KEY` como secreto de la función (`supabase secrets set`), nunca en el repo.
- Lo que sale se inserta con `fuente = 'folleto'`, `confianza` menor que 1 y `vigente_hasta`,
  y la UI lo muestra siempre marcado como "del folleto". Un precio de folleto nunca se
  presenta con la misma cara que uno de API.
- Costo: un folleto de ~20 páginas son unos 30–40K tokens de entrada; a $5 por millón de
  tokens de entrada, es del orden de **US$0.20 por corrida semanal**. Si con el tiempo
  molesta, `claude-haiku-4-5` hace este trabajo por una quinta parte.
- Esta fase es la más frágil del plan y va de última a propósito: si el folleto cambia de
  formato o no se puede bajar, D1 y Ara quedan en precio a mano y **todo lo demás sigue
  funcionando**.

## Pruebas

`src/mercado.test.ts`, con vitest, al estilo de `src/caja.test.ts`: solo lógica pura (el
repo no tiene pruebas de componentes, ni jsdom, ni testing-library), fábricas de fixtures
bajo un comentario de sección, y títulos en prosa española. Casos:

- `precioPorUnidad` con gramos, mililitros y unidades, incluido el caso de "6 unidades de
  330ml".
- `comparar` cuando una tienda no tiene el producto, cuando hay empate, y cuando el precio
  más bajo es el menos fresco.
- `frescura` en los tres estados, con una fecha fija.
- `totalPorTienda` con productos faltantes.
- `repartoOptimo`: que el ahorro nunca sea negativo y que cuente bien las paradas.

## Documentación

El `README.md` es la memoria del proyecto y explica cada pieza con ese mismo tono. Se le
agrega una sección **Mercado** al nivel de las otras: qué hace, cómo se configura en
Supabase (pegar `supabase/precios.sql`, desplegar las dos funciones, poner los secretos),
qué tienda se lee sola y cuál toca a mano, y cómo se vincula un producto la primera vez.
También la línea nueva en el mapa de `src/` del final.

## Verificación de punta a punta

1. `npm install && npm test` — las pruebas nuevas y las que ya existen (`caja`, `mensajes`).
2. `npm run build` — incluye `tsc --noEmit`. No hay linter; la única puerta es TypeScript en
   modo `strict` con `noUnusedLocals`, y el workflow de Pages corre `npm test` y
   `npm run build` antes de publicar: **si algo de esto falla, el deploy no sale**.
3. Pegar `supabase/precios.sql` en el SQL Editor de Supabase y correrlo dos veces seguidas:
   la segunda no debe fallar (idempotencia).
4. `supabase functions deploy precios` e invocarla a mano una vez; revisar que `corridas`
   registre la corrida y que `precios_hoy` tenga filas.
5. `npm run dev`: crear un producto, vincularlo en dos tiendas, ver la comparación, armar una
   lista y contrastar el total contra la suma hecha a mano.
6. Abrir la app en el otro celular y confirmar que la canasta y la lista llegaron por sync.
7. Esperar (o disparar a mano) la corrida de `pg_cron` y confirmar que el precio del día
   siguiente entra como fila nueva, sin pisar la de ayer.

## Lo que queda para después (fuera de este alcance)

Conectar el Mercado con la Caja: al cerrar una lista, anotar el gasto en la categoría
`mercado` y descontarlo del bolsillo. El terreno ya está abonado — `src/categorias.ts:4` ya
tiene `mercado` 🛒 de primera, y `src/comercios.ts:10-13` ya reconoce EXITO, CARULLA, D1,
ARA y MAKRO en los SMS del banco —, así que el día que se quiera, el puente es corto: un
gasto con el total de la lista y el comercio ya categorizado.

## Riesgos, dichos de frente

- **Los endpoints no están verificados.** La Fase 0 puede cambiar el alcance de las Fases 2
  y 5. Lo que no cambia es el esquema ni la app: una tienda ilegible es una tienda manual.
- **Las tiendas pueden cerrar la puerta** (bloqueo por bot, cambio de plataforma). Por eso la
  bitácora `corridas` y el sello de frescura: la app tiene que *verse* desactualizada cuando
  lo está, en vez de mentir con un precio viejo.
- **Es raspado de sitios ajenos**, aunque sea del catálogo público y para uso personal de dos
  personas. Una consulta por SKU vinculado al día, sin paralelismo agresivo: si algún día
  molesta a alguien, que sea por poco.
- **Los precios de Bogotá no son los de otra ciudad.** Queda fijo en `tiendas.ciudad` y se
  puede cambiar después sin tocar el modelo.
