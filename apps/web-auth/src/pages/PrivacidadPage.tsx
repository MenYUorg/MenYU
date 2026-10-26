import type { ReactNode } from 'react'
import { Encabezado } from '../components/Encabezado'
import { Enlace } from '../components/Enlace'
import { Marco } from '../components/Marco'

// Si cambia el contenido, actualizar la fecha y avisar en docs/auth/specs/auth.md (Fase 3b). El texto describe lo que
// hace el código hoy (qué guarda cada tabla, qué proveedores reciben datos): si eso cambia, revisarlo.
const VIGENCIA = '26 de octubre de 2026'
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
        Sistemas de la Universidad Católica de Córdoba (UCC). Acá explicamos qué datos recibimos, para qué los usamos y
        cómo pedir que los borremos.
      </p>

      <Seccion titulo="Qué datos recibimos">
        <Lista>
          <li>
            <strong>Si iniciás sesión con Google:</strong> tu email, tu nombre, tu foto de perfil y un identificador de
            tu cuenta de Google (los permisos <code>openid</code>, <code>email</code> y <code>profile</code>). No
            pedimos otros permisos ni accedemos a tu Gmail, Drive, contactos ni calendario.
          </li>
          <li>
            <strong>Si te registrás con email y contraseña:</strong> tu email y tu contraseña, que nunca se guarda en
            texto: la gestiona Supabase Auth, tanto para las cuentas que se crean en esta página (las de cliente) como
            para las del personal invitado por mail. La base de MenYU ya no guarda ninguna contraseña: el ingreso
            anterior de la app de la mesa y el del panel se retiraron, y con ellos los hashes que quedaban. En el
            registro de cliente también pedimos tu nombre.
          </li>
          <li>
            <strong>Si tenés una cuenta de cliente:</strong> tu nombre, tu email y el identificador de tu cuenta, para
            que las mesas que abrís queden a tu nombre. Si ya habías usado la app de la mesa con el ingreso anterior y
            el mismo email, la cuenta nueva se le suma y conservás tu historial.
          </li>
          <li>
            <strong>Si trabajás en un restaurante que usa MenYU:</strong> tu nombre, tu email y, si lo cargan, tu
            teléfono; tu rol y el restaurante en el que trabajás; y la actividad de tu trabajo: las mesas que tenés
            asignadas, los llamados que atendés, los cobros que registrás y las ediciones de pedidos, con su
            justificación.
          </li>
          <li>
            <strong>Datos de uso del servicio:</strong> las sesiones de mesa (con el nombre con el que te anotás en la
            mesa, aunque no tengas cuenta), los pedidos con sus modificaciones y notas, los llamados al mozo y los
            pagos. Más adelante, también los puntos de fidelización. Los pagos se hacen con Mercado Pago: nosotros
            guardamos el monto, el método y el estado, no los datos de tu tarjeta.
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
            <strong>Resend:</strong> el envío de los mails de invitación, de confirmación de la cuenta y de
            contraseña, que llegan desde no-reply@menyu-app.com.
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
            <strong>Google:</strong> las tipografías de las páginas (Google Fonts recibe tu dirección IP al cargarlas) y
            el inicio de sesión con Google, si lo elegís.
          </li>
        </Lista>
      </Seccion>

      <Seccion titulo="Cuánto tiempo los guardamos y cómo borrarlos">
        <p>
          Guardamos los datos de tu cuenta mientras esté activa. Para pedir la baja, escribinos a {mail} (si tenés
          cuenta, desde su email). Borramos tu cuenta y tus datos personales; los pedidos y los pagos quedan como
          registro del restaurante, sin tus datos.
        </p>
        <p>
          La excepción es el historial de cambios de las cuentas de dueños de restaurantes y de administradores de MenYU,
          que no se puede modificar: si tuviste una de esas cuentas, tu email queda ahí.
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
