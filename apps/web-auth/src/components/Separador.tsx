/** Una línea con un texto en el medio, entre dos formas de entrar ("o con tu email"). */
export function Separador({ texto }: { texto: string }) {
  return (
    <div className="my-6 flex items-center gap-4 text-sm text-menyu-gris">
      <span aria-hidden="true" className="h-px flex-1 bg-menyu-linea" />
      {texto}
      <span aria-hidden="true" className="h-px flex-1 bg-menyu-linea" />
    </div>
  )
}
