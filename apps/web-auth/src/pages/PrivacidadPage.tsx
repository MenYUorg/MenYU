import type { ReactNode } from 'react'
import { Encabezado } from '../components/Encabezado'
import { Enlace } from '../components/Enlace'
import { Marco } from '../components/Marco'

// Si cambia el contenido, actualizar la fecha y avisar en docs/auth/specs/auth.md (Fase 3b).
const VIGENCIA = '21 de octubre de 2026'
const CONTACTO = 'dantelojeda05@gmail.com'

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-titulo text-xl font-bold">{titulo}</h2>
      <div className="mt-3 space-y-3 leading-relaxed">{children}</div>
    </section>
  )
}

function Lista({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-menyu-coral">{children}</ul>
}

const linkExterno =
  'font-medium underline decoration-menyu-coral decoration-2 underline-offset-4 hover:decoration-menyu-navy focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-menyu-coral'

/**
 * `/privacidad`: la política de privacidad pública que pide Google para publicar la pantalla de consentimiento de
 * OAuth (docs/auth/specs/auth.md, Fase 3b). No usa la sesión ni llama a /auth/me: la ve cualquiera, con o sin sesión.
 */
export function PrivacidadPage() {
  const mail = (
    <a href={`mailto:${CONTACTO}`} className={`break-words ${linkExterno}`}>
      {CONTACTO}
    </a>
  )

  return (
    <Marco titulo="Política de privacidad">
      <Encabezado titulo="Política de privacidad">Vigente desde el {VIGENCIA}.</Encabezado>

      <p className="leading-relaxed">
        MenYU es una plataforma para restaurantes: los clientes ven el menú, piden y pagan desde la mesa, y el personal
        gestiona los pedidos y las mesas. Es un proyecto académico en desarrollo, parte de una tesis de Ingeniería en
        Sistemas de la UCC. Acá explicamos qué datos recibimos, para qué los usamos y cómo pedir que los borremos.
      </p>

      <Seccion titulo="Qué datos recibimos">
        <Lista>
          <li>
            <strong>Si iniciás sesión con Google:</strong> tu email, tu nombre y tu foto de perfil (los permisos{' '}
            <code>openid</code>, <code>email</code> y <code>profile</code>). No pedimos otros permisos ni accedemos a
            tu Gmail, Drive, contactos ni calendario.
          </li>
          <li>
            <strong>Si te registrás con email y contraseña:</strong> tu email y tu contraseña. La contraseña nunca se
            guarda en texto: en las cuentas nuevas la gestiona Supabase Auth, y en las creadas con el sistema anterior
            de MenYU guardamos solo un hash, del que no se puede recuperar la contraseña, hasta que ese sistema se
            retire. En ese registro también podés cargar tu nombre y, si querés, tu teléfono.
          </li>
          <li>
            <strong>Si trabajás en un restaurante que usa MenYU:</strong> tu rol y el restaurante en el que trabajás.
          </li>
          <li>
            <strong>Datos de uso del servicio:</strong> las sesiones de mesa, los pedidos y los pagos. Más adelante,
            también los puntos de fidelización. Los pagos se hacen con Mercado Pago: nosotros guardamos el monto y el
            estado, no los datos de tu tarjeta.
          </li>
        </Lista>
      </Seccion>

      <Seccion titulo="Para qué los usamos">
        <p>
          Solo para identificar tu cuenta, iniciar sesión y hacer funcionar MenYU: abrir la mesa, mandar los pedidos a la
          cocina y cobrar. No los usamos para publicidad y no los vendemos.
        </p>
      </Seccion>

      <Seccion titulo="Con quién los compartimos">
        <p>
          No vendemos ni cedemos tus datos a terceros. Para operar usamos estos proveedores, que los procesan para
          MenYU:
        </p>
        <Lista>
          <li>
            <strong>Supabase:</strong> el inicio de sesión, la base de datos y los archivos (como los logos de los
            restaurantes).
          </li>
          <li>
            <strong>Railway:</strong> el servidor de MenYU.
          </li>
          <li>
            <strong>Vercel:</strong> las páginas web de MenYU.
          </li>
          <li>
            <strong>Mercado Pago:</strong> los pagos que hacés desde la mesa.
          </li>
          <li>
            <strong>Google:</strong> solo si elegís iniciar sesión con Google.
          </li>
        </Lista>
      </Seccion>

      <Seccion titulo="Cuánto tiempo los guardamos y cómo borrarlos">
        <p>
          Los guardamos mientras tu cuenta esté activa. Para pedir que borremos tu cuenta y tus datos, escribinos a{' '}
          {mail} desde el email de la cuenta.
        </p>
        <p>
          Si iniciaste sesión con Google, también podés quitarle el acceso a MenYU desde{' '}
          <a
            href="https://myaccount.google.com/connections"
            target="_blank"
            rel="noreferrer"
            className={linkExterno}
          >
            tu Cuenta de Google
          </a>
          .
        </p>
      </Seccion>

      <Seccion titulo="Contacto">
        <p>Si tenés dudas sobre esta política, escribinos a {mail}.</p>
        <p>Si la cambiamos, actualizamos esta página y la fecha de vigencia.</p>
      </Seccion>

      <p className="mt-10 text-sm">
        <Enlace to="/">Volver</Enlace>
      </p>
    </Marco>
  )
}
