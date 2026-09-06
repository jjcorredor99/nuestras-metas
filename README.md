# Nuestras Metas

Una app para los dos: anotar gastos, no olvidar facturas, tumbar deudas, cumplir retos y
llegar a Grecia en 2027. Corre en el celular como una app instalada y guarda todo en el
dispositivo (nada sale a internet).

## Qué tiene

- **Inicio**: resumen del mes, Grecia 2027 con cuenta regresiva, facturas que vienen, retos y
  el muro de fotos.
- **Gastos**: quién pagó, si es compartido o personal, categoría, y el balance del mes
  (quién le debe a quién por lo compartido).
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

## Estructura

```
src/
  types.ts        modelo de datos
  store.tsx       estado, reducer y persistencia (localStorage)
  db.ts           fotos en IndexedDB
  format.ts       dinero, fechas, porcentajes
  categorias.ts   categorías de gasto
  components/ui   modal, campos, barras, confeti, toast
  pages/          Inicio, Gastos, Facturas, Deudas, Retos, Metas, Muro, Ajustes
```
