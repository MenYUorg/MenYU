/** Mientras se revisa la sesión o el link. */
export function Cargando({ texto }: { texto: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-menyu-gris">
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-menyu-linea border-t-menyu-coral motion-reduce:animate-none"
      />
      {texto}
    </div>
  )
}
