/**
 * Iconos de línea dibujados a mano para la navegación y los remates de la app.
 * Los emojis se quedan para lo que es del usuario (categorías, bolsillos, hitos);
 * el marco de la app usa estos trazos, que se ven nítidos y toman el color de al lado.
 */

const TRAZOS: Record<string, string> = {
  // Casa con techo ancho y puerta.
  inicio: 'M3 10.6 12 3.4l9 7.2 M5.6 9.6V19.4a1.2 1.2 0 0 0 1.2 1.2H10v-4.9a2 2 0 0 1 4 0v4.9h3.2a1.2 1.2 0 0 0 1.2-1.2V9.6',
  // Billetera con broche.
  caja: 'M3.6 8.4a2.4 2.4 0 0 1 2.4-2.4h11.3a2.4 2.4 0 0 1 2.4 2.4v9.2a2.4 2.4 0 0 1-2.4 2.4H6a2.4 2.4 0 0 1-2.4-2.4z M16.4 11.6h3.9v3.8h-3.9a1.9 1.9 0 0 1 0-3.8z M6.2 6 15 3.2l1 2.7',
  // Recibo con borde dentado.
  gastos: 'M6.4 3.6h11.2v16.8l-1.9-1.3-1.9 1.3-1.8-1.3-1.9 1.3-1.9-1.3-1.8 1.3z M9.4 8.4h5.2 M9.4 12.2h5.2',
  // Sobre cerrado.
  facturas: 'M3.6 7.6a2 2 0 0 1 2-2h12.8a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2z M4.4 8.2 12 13.4l7.6-5.2',
  // Cordillera: la deuda que se sube.
  deudas: 'M2.8 19.2 9.2 8.1l3.3 5.3 2.1-3.2 6.6 9z M9.2 8.1l1.9 3.2',
  // Llama.
  retos: 'M12 3.2c3.4 2.9 5.3 5.7 5.3 8.7a5.3 5.3 0 0 1-10.6 0c0-1.6.7-3 1.8-4.1.2 1.3 1 2.2 2 2.6C10 8.4 10.8 5.6 12 3.2z',
  // Bandera clavada: los hitos.
  metas: 'M6.2 20.8V3.8 M6.2 4.9h10.6l-1.9 3.4 1.9 3.4H6.2',
  // Cámara de fotos.
  muro: 'M4.2 8.6h2.9l1.4-2.1h7l1.4 2.1h2.9a1.6 1.6 0 0 1 1.6 1.6v8a1.6 1.6 0 0 1-1.6 1.6H4.2a1.6 1.6 0 0 1-1.6-1.6v-8a1.6 1.6 0 0 1 1.6-1.6z',
  // Engranaje.
  ajustes: 'M12 3.4v2.2 M12 18.4v2.2 M20.6 12h-2.2 M5.6 12H3.4 M18.1 5.9l-1.6 1.6 M7.5 16.5l-1.6 1.6 M18.1 18.1l-1.6-1.6 M7.5 7.5 5.9 5.9',
}

const CIRCULOS: Record<string, [number, number, number][]> = {
  muro: [[12, 14.2, 3.4]],
  ajustes: [[12, 12, 3.6]],
}

export function Icono({ nombre, tam = 22 }: { nombre: string; tam?: number }) {
  const d = TRAZOS[nombre]
  if (!d) return null
  return (
    <svg
      className="icono-linea"
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {d.split(' M').map((parte, i) => (
        <path key={i} d={i === 0 ? parte : `M${parte}`} />
      ))}
      {(CIRCULOS[nombre] ?? []).map(([cx, cy, r], i) => (
        <circle key={`c${i}`} cx={cx} cy={cy} r={r} />
      ))}
    </svg>
  )
}

/** La marca de la app: el mismo corazón del ícono, en relieve. */
export function Marca({ tam = 84 }: { tam?: number }) {
  return (
    <svg className="marca-svg" width={tam} height={tam} viewBox="0 0 128 128" aria-hidden>
      <defs>
        <linearGradient id="marca-coral" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f88571" />
          <stop offset="1" stopColor="#e35c4c" />
        </linearGradient>
      </defs>
      <path
        d="M64 106 C39 90 21 75 21 54 C21 40 32 29 45 29 C54 29 60 33 64 40 C68 33 74 29 83 29 C96 29 107 40 107 54 C107 75 89 90 64 106Z"
        fill="url(#marca-coral)"
      />
      <path
        d="M40 60 L51 60 L57.5 47 L66 73 L72.5 60 L88 60"
        fill="none"
        stroke="#fff"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
    </svg>
  )
}
