# Nuestras Metas

Una app para los dos: anotar gastos, no olvidar facturas, tumbar deudas, cumplir retos y
llegar a Grecia en 2027. Corre en el celular como una app instalada y guarda todo en el
dispositivo (nada sale a internet).

## Qué tiene

- **Inicio**: resumen del mes, Grecia 2027 con cuenta regresiva, facturas que vienen, retos y
  el muro de fotos.
- **Gastos**: quién pagó, si es compartido o personal, categoría, y el balance del mes
  (quién le debe a quién por lo compartido). Los SMS del banco se anotan solos con un Atajo del
  iPhone, o pegando el mensaje con el botón 📩.
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

Cómo funciona: cada gasto, factura, deuda, reto, meta, foto y el perfil es una fila en la
tabla `items` del hogar. `src/sync.tsx` compara el estado local con lo que ya está arriba y
sube solo lo que cambió; escucha en tiempo real los cambios del otro celular y los aplica.
Si dos personas editan lo mismo, gana el último cambio.

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
parecido. Descarta claves dinámicas, códigos y publicidad, y no anota la plata que entra.

La categoría la propone `src/comercios.ts`. Si la corrigen al guardar, se acuerda de ese comercio
para la próxima (y eso se sincroniza entre los dos). El mismo mensaje no se anota dos veces:
cada gasto guarda la huella del SMS del que salió.

Las reglas del lector viven en `src/mensajes.ts` y están cubiertas con pruebas: `npm test`.
Si un banco les manda un formato que no entiende, agreguen el mensaje al archivo de pruebas
y ajusten el patrón.

## Estructura

```
src/
  types.ts        modelo de datos
  store.tsx       estado, reducer y persistencia (localStorage)
  db.ts           fotos en IndexedDB
  format.ts       dinero, fechas, porcentajes
  categorias.ts   categorías de gasto
  mensajes.ts     lee el SMS del banco y saca el gasto (con pruebas)
  comercios.ts    comercio -> categoría, y lo que ustedes le enseñan
  entrantes.tsx   bandeja de mensajes que mandó el Atajo del celular
  enlace.ts       mensajes que llegan por la URL (#gastos?texto=...)
  components/ui   modal, campos, barras, confeti, toast
  pages/          Inicio, Gastos, Facturas, Deudas, Retos, Metas, Muro, Ajustes
```
