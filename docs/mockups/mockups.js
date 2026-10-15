/*
 * Datos de ejemplo y piezas de HTML que comparten los mockups de Discovery (Fase 6).
 * Sin dependencias ni build: se abre desde el disco. Todo lo que se ve es inventado.
 */
(function () {
  'use strict';

  const RUTA_LOGO = '../../apps/web-cliente/public/logo.png';
  const RUTA_LOGO_OSCURO = '../../apps/web-cliente/public/LogoParaOscuro.png';
  const RUTA_PLACEHOLDER = '../../packages/ui/src/assets/item-placeholder.png';

  // ── Utilidades ──────────────────────────────────────────────────────────────

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Igual que la búsqueda del servidor (unaccent + ILIKE): sin acentos ni mayúsculas.
  const sinAcentos = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Igual que formatearPrecio de web-cliente.
  const peso = (n) => '$' + n.toFixed(2);
  const plural = (n, uno, varios) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);
  // Igual que initials() de ClienteMenuPage.
  const iniciales = (nombre) => nombre.split(/\s+/).slice(0, 2).map((w) => (w[0] || '').toUpperCase()).join('');

  // ── Íconos (SVG de trazo, como el de QR de EntradaPage) ────────────────────

  const ICONOS = {
    pin: '<path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    derecha: '<path d="M9 6l6 6-6 6"/>',
    izquierda: '<path d="M15 6l-6 6 6 6"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3"/>',
    escanear: '<path d="M23 7V1h-6M1 7V1h6M23 17v6h-6M1 17v6h6"/>',
    carta: '<path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/>',
    aviso: '<circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 16.5h.01"/>',
    local: '<path d="M3 9l1.2-5h15.6L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8"/>',
    lupa: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    camara: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    camaraOff: '<path d="M1 1l22 22"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"/>',
  };
  function icono(nombre, tam = 16, trazo = 'currentColor', grosor = 2) {
    return `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="${trazo}" stroke-width="${grosor}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[nombre]}</svg>`;
  }

  // ── Logos de ejemplo (SVG inline): cuadrados, redondos, muy anchos y muy altos ─

  const uri = (svg) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  const LOGOS = {
    parrilla: uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' rx='26' fill='#7A1F1F'/><path d='M60 18c8 17 26 28 26 50a26 26 0 0 1-52 0c0-12 6-21 12-27 1 10 6 14 11 15-3-14-1-27 3-38z' fill='#F5B041'/><path d='M60 56c5 9 14 14 14 25a14 14 0 0 1-28 0c0-7 3-11 7-15 1 5 3 7 6 8-2-7-1-13 1-18z' fill='#FFF3D6'/></svg>"),
    vito: uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><circle cx='60' cy='60' r='56' fill='#2E7D32'/><path d='M60 100L28 36a68 68 0 0 1 64 0z' fill='#F9C846'/><path d='M28 36a68 68 0 0 1 64 0l-4 8a60 60 0 0 0-56 0z' fill='#D9A026'/><circle cx='52' cy='56' r='6' fill='#C62828'/><circle cx='70' cy='64' r='6' fill='#C62828'/><circle cx='60' cy='80' r='5' fill='#C62828'/></svg>"),
    // muy ancho (4:1)
    almendra: uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 480 120'><rect width='480' height='120' fill='#fff'/><g fill='none' stroke='#5D4037' stroke-width='5' stroke-linecap='round'><path d='M30 54h44v22a20 20 0 0 1-20 20h-4a20 20 0 0 1-20-20z'/><path d='M74 60h8a10 10 0 0 1 0 20h-8'/></g><text x='108' y='78' font-family='Georgia,serif' font-style='italic' font-size='52' fill='#5D4037'>Café Almendra</text></svg>"),
    // muy alto (1:3)
    kaori: uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 200'><rect width='60' height='200' rx='8' fill='#111'/><circle cx='30' cy='30' r='14' fill='#D32F2F'/><g fill='#fff' font-family='Arial,sans-serif' font-weight='700' font-size='20' text-anchor='middle'><text x='30' y='84'>K</text><text x='30' y='110'>A</text><text x='30' y='136'>O</text><text x='30' y='162'>R</text><text x='30' y='188'>I</text></g></svg>"),
    nandu: uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' rx='26' fill='#2E5E3E'/><text x='60' y='88' text-anchor='middle' font-family='Georgia,serif' font-weight='700' font-size='76' fill='#F3E9C6'>Ñ</text></svg>"),
    burger: uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' rx='26' fill='#FFC107'/><path d='M26 52a34 28 0 0 1 68 0z' fill='#8D5524'/><rect x='24' y='58' width='72' height='9' rx='4.5' fill='#43A047'/><rect x='24' y='69' width='72' height='11' rx='5.5' fill='#5D4037'/><path d='M26 84h68a12 12 0 0 1-12 12H38a12 12 0 0 1-12-12z' fill='#8D5524'/></svg>"),
    bodegon: uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><circle cx='60' cy='60' r='56' fill='#5D4037'/><circle cx='60' cy='60' r='48' fill='none' stroke='#EFD9B4' stroke-width='3'/><text x='60' y='82' text-anchor='middle' font-family='Georgia,serif' font-weight='700' font-size='56' fill='#EFD9B4'>B</text></svg>"),
    rincon: uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' rx='26' fill='#1B3A57'/><text x='60' y='86' text-anchor='middle' font-family='Georgia,serif' font-weight='700' font-size='64' fill='#fff'>R</text></svg>"),
    verde: uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' rx='26' fill='#E3F5D8'/><path d='M30 90C30 52 56 28 92 28c0 38-24 62-58 62' fill='#43A047'/><path d='M34 88C50 66 66 52 86 38' stroke='#E3F5D8' stroke-width='4' fill='none' stroke-linecap='round'/></svg>"),
  };

  // ── Fotos de platos: color + emoji. `null` muestra el placeholder real de la app ─

  const FOTOS = {
    carne: { e: '🥩', a: '#FFE3D6', b: '#F4A58A' },
    parrilla: { e: '🍖', a: '#FBE3CF', b: '#E59A63' },
    pizza: { e: '🍕', a: '#FFF1C7', b: '#F7C86B' },
    cafe: { e: '☕', a: '#EFE2D2', b: '#C9A27E' },
    sushi: { e: '🍣', a: '#FFE6E6', b: '#F5A3A3' },
    empanada: { e: '🥟', a: '#FBEACB', b: '#E8B96A' },
    burger: { e: '🍔', a: '#FFE8BD', b: '#F2B25B' },
    helado: { e: '🍨', a: '#FDE6F2', b: '#F0A9D2' },
    pasta: { e: '🍝', a: '#FFF0CE', b: '#F3CF7A' },
    veg: { e: '🥗', a: '#E6F6DC', b: '#9ED58A' },
    papas: { e: '🍟', a: '#FFF3C4', b: '#F5D04A' },
    queso: { e: '🧀', a: '#FFF1BF', b: '#F2C94C' },
  };

  // ── Restaurantes ────────────────────────────────────────────────────────────

  const R = (id, nombre, direccion, logo, platos, marca) => ({ id, nombre, direccion, logo, platos, marca: marca || null });

  const NORMALES = [
    R('parrilla', 'La Parrilla del Puerto', 'Av. Alicia Moreau de Justo 1150, Puerto Madero', 'parrilla', ['Bife de chorizo', 'Milanesa napolitana', 'Milanesa a caballo', 'Provoleta', 'Flan casero']),
    R('vito', 'Pizzería Don Vito', 'Av. Corrientes 2840, Balvanera', 'vito', ['Pizza muzzarella', 'Pizza fugazzeta', 'Fainá', 'Milanesa napolitana', 'Empanadas de jamón y queso']),
    R('almendra', 'Café Almendra', 'Thames 1620, Palermo', 'almendra', ['Café con leche', 'Medialunas', 'Tostado de jamón y queso', 'Licuado de banana']),
    R('kaori', 'Sushi Kaori', 'Gorriti 4880, Palermo', 'kaori', ['Rolls variados', 'Sashimi de salmón', 'Gyozas']),
    R('nandu', 'Ñandú Cocina Regional', 'Av. Santa Fe 3350, Recoleta', 'nandu', ['Locro', 'Humita en chala', 'Empanadas tucumanas', 'Chipá']),
    R('burger-belgrano', 'Burger Lab Belgrano', 'Av. Cabildo 2290, Belgrano', 'burger', ['Hamburguesa doble', 'Papas rústicas con cheddar', 'Milkshake de vainilla'], 'Burger Lab'),
    R('burger-palermo', 'Burger Lab Palermo', 'Honduras 5100, Palermo', 'burger', ['Hamburguesa doble', 'Papas rústicas con cheddar', 'Milkshake de vainilla'], 'Burger Lab'),
    R('fiore', 'Heladería Fiore', 'Av. Rivadavia 6120, Caballito', null, ['Helado artesanal', 'Affogato de café', 'Tiramisú']),
    R('verde', 'Verde Vivo — Cocina vegetal', 'Arenales 1890, Recoleta', 'verde', ['Bowl de quinoa', 'Hamburguesa de lentejas', 'Milanesa de berenjena', 'Café de especialidad', 'Limonada con menta']),
  ];

  // Casos límite: nombre y dirección larguísimos, sin dirección cargada, palabras sin espacios.
  const LIMITE = [
    R('rincon', 'El Rincón de los Abuelos — Parrilla, pastas y cocina casera de autor', 'Av. Gral. Paz esquina Av. Constituyentes, Torre del Parque, Local 14, Villa Urquiza, Ciudad Autónoma de Buenos Aires', 'rincon', ['Ñoquis de papa', 'Ravioles', 'Milanesa a la suiza', 'Asado de tira']),
    R('mesa7', 'Mesa Siete', null, null, ['Menú del día', 'Ensalada César']),
    R('larga', 'Superlargonombredelrestauranteparaprobarelcortedepalabras', 'Calle-con-un-nombre-larguisimo-sin-espacios 12345', null, ['Plato único']),
    R('bodegon', 'Bodegón Los Hermanos', 'Defensa 780, San Telmo', 'bodegon', ['Milanesa a la suiza', 'Café express', 'Tortilla de papas', 'Vermut']),
  ];

  const TODOS = [...NORMALES, ...LIMITE];

  // ── Ofertas ─────────────────────────────────────────────────────────────────

  const O = (id, rid, nombre, foto, base, desc) => ({
    id, rid, nombre, foto, base, desc,
    pct: Math.round((1 - desc / base) * 100),
  });

  const OFERTAS_NORMALES = [
    O('o1', 'vito', 'Pizza muzzarella grande', FOTOS.pizza, 6800, 4760),
    O('o2', 'nandu', 'Empanadas tucumanas x6', FOTOS.empanada, 6000, 4200),
    O('o3', 'almendra', 'Café + medialuna', FOTOS.cafe, 3200, 2400),
    O('o4', 'kaori', 'Rolls variados x10', FOTOS.sushi, 9500, 7125),
    O('o5', 'parrilla', 'Milanesa napolitana', FOTOS.carne, 4200, 3360),
    O('o6', 'burger-palermo', 'Hamburguesa doble con papas', FOTOS.burger, 8900, 7120),
    O('o7', 'parrilla', 'Bife de chorizo con guarnición', FOTOS.parrilla, 12500, 10000),
    O('o11', 'burger-belgrano', 'Papas rústicas con cheddar', null, 3800, 3040),
    O('o8', 'fiore', 'Affogato de café', FOTOS.helado, 3500, 2975),
    O('o10', 'verde', 'Hamburguesa de lentejas', FOTOS.veg, 6800, 6120),
  ];

  const OFERTAS_LIMITE = [
    O('l1', 'larga', 'Promo gigante de la casa', FOTOS.queso, 125000, 1250),
    O('l2', 'rincon', 'Tabla de fiambres y quesos artesanales para compartir entre dos personas, con pan casero y pickles de la casa', null, 18500, 17575),
    O('l3', 'rincon', 'Ñoquis de papa con salsa', FOTOS.pasta, 5400, 4860),
    O('l4', 'larga', 'Plato casi sin descuento', FOTOS.papas, 9000, 8910),
  ];

  const porPorcentaje = (lista) => lista.map((o, i) => [o, i]).sort((x, y) => y[0].pct - x[0].pct || x[1] - y[1]).map((x) => x[0]);
  const porNombre = (lista) => lista.slice().sort((a, b) => sinAcentos(a.nombre).localeCompare(sinAcentos(b.nombre), 'es'));

  // Muchos restaurantes y ofertas (los topes de la API: 50 y 30)
  function muchos() {
    const base = [...NORMALES, ...LIMITE.filter((r) => r.id === 'bodegon')];
    const restaurantes = [];
    for (let i = 0; i < 50; i += 1) {
      const r = base[i % base.length];
      restaurantes.push(i < base.length ? r : { ...r, id: r.id + '-' + i, nombre: r.nombre + ' · Sucursal ' + (Math.floor(i / base.length) + 1) });
    }
    const ofertas = [];
    for (let i = 0; i < 30; i += 1) {
      const o = OFERTAS_NORMALES[i % OFERTAS_NORMALES.length];
      const resto = restaurantes[(i * 3) % restaurantes.length];
      const desc = Math.round(o.base * (1 - (5 + ((i * 7) % 45)) / 100));
      ofertas.push(O('m' + i, resto.id, o.nombre, o.foto, o.base, desc));
    }
    return { restaurantes: porNombre(restaurantes), ofertas: porPorcentaje(ofertas) };
  }

  /** Lo que devolvería GET /discovery según el estado que se quiera mostrar. */
  function datos(estado) {
    if (estado === 'vacio') return { restaurantes: [], ofertas: [] };
    if (estado === 'sin-ofertas') return { restaurantes: porNombre(NORMALES), ofertas: [] };
    if (estado === 'muchas') return muchos();
    if (estado === 'limite') return { restaurantes: [...LIMITE.slice(0, 3), ...porNombre(NORMALES)], ofertas: porPorcentaje([...OFERTAS_LIMITE, ...OFERTAS_NORMALES]) };
    return { restaurantes: porNombre(NORMALES), ofertas: porPorcentaje(OFERTAS_NORMALES) };
  }

  const todasLasOfertas = () => [...OFERTAS_LIMITE, ...OFERTAS_NORMALES];
  const restauranteDe = (id) => TODOS.find((r) => r.id === id) || null;
  const ofertasDe = (id, ofertas) => porPorcentaje((ofertas || todasLasOfertas()).filter((o) => o.rid === id));

  /**
   * Lo que devolvería GET /discovery/buscar?q= (dos letras como mínimo), con los grupos en el orden en que se muestran:
   * las ofertas que coinciden, los restaurantes que coinciden por nombre (o marca) y los restaurantes con platos que
   * coinciden (sin repetir los anteriores). Los dos grupos de restaurantes son restaurantes comunes: no dicen qué platos
   * coincidieron (los nombres de los platos de cada restaurante solo sirven acá para simular la búsqueda).
   */
  function buscar(q, d) {
    const t = sinAcentos(q.trim());
    const ofertas = d.ofertas.filter((o) => sinAcentos(o.nombre).includes(t));
    const restaurantes = d.restaurantes.filter((r) => sinAcentos(r.nombre).includes(t) || (r.marca && sinAcentos(r.marca).includes(t)));
    const conPlatos = d.restaurantes.filter((r) => !restaurantes.includes(r) && r.platos.some((p) => sinAcentos(p).includes(t)));
    return { ofertas, restaurantes, conPlatos };
  }

  // ── Piezas de HTML ──────────────────────────────────────────────────────────

  // El nombre se muestra tal cual viene: hoy el cliente se guarda en un único campo `nombre` y no se adivina dónde termina
  // el nombre y empieza el apellido. Si algún día vienen separados, se muestra solo el nombre. Nunca se corta con "...":
  // si no entra, pasa a la línea de abajo.
  function appHeader(usuario) {
    const acciones = usuario
      ? `<div class="sesion"><span class="saludo">Hola, <b>${esc(usuario.trim().replace(/\s+/g, ' '))}</b></span><button class="btn-h salir" type="button">Cerrar sesión</button></div>`
      : '<button class="btn-h" type="button">Ingresar</button><button class="btn-h primario" type="button">Registrarme</button>';
    return `<header class="appheader">
      <a class="marca" href="discovery.html"><img src="${RUTA_LOGO}" alt="MenYU"></a>
      <div class="acciones">${acciones}</div>
    </header>`;
  }

  /**
   * El logo de MenYu para fondos oscuros (LogoParaOscuro.png), recortado como el componente LogoMenYuOscuro de @menyu/ui:
   * el PNG trae aire transparente alrededor de las letras (2172 × 724 px) y `alto` es el alto real de las letras.
   */
  function logoOscuro(alto, soloU) {
    const escala = alto / 380;
    const x = soloU ? 1718 : 120;
    const ancho = (soloU ? 334 : 1932) * escala;
    return `<span class="logo-oscuro" style="width:${ancho}px;height:${alto}px"><img src="${RUTA_LOGO_OSCURO}" alt="MenYU" style="left:${-x * escala}px;top:${-165 * escala}px;width:${2172 * escala}px;height:${724 * escala}px"></span>`;
  }

  /**
   * El logo de MenYu para fondos claros (logo.png: letras naranjas y el tenedor azul en la U, 7030 × 1398 px, con las
   * letras de y = 10 a 1397 y la U de x = 5813 a 7029). `alto` es el alto de las letras; con `soloU`, solo la U con el
   * tenedor. En la app va una versión liviana de este PNG (el original pesa 1,5 MB).
   */
  function logoClaro(alto, soloU) {
    const escala = alto / 1388;
    const x = soloU ? 5813 : 0;
    const ancho = (soloU ? 1217 : 7030) * escala;
    return `<span class="logo-oscuro" style="width:${ancho}px;height:${alto}px"><img src="${RUTA_LOGO}" alt="MenYU" style="left:${-x * escala}px;top:${-10 * escala}px;width:${7030 * escala}px;height:${1398 * escala}px"></span>`;
  }

  /**
   * El header del menú (ClienteMenuPage) con el logo del restaurante como botón del menú lateral (propuesta de la Fase 7).
   * `o`: nombre; `logo` (clave de LOGOS) o `menyu` ('u' o 'completo'); `hoy` para el botón de iniciales de hoy;
   * `modo` ('mesa' o 'carta'); `pin` (código de la mesa en modo seguro: se apila debajo de la mesa).
   */
  function menuHeader(o) {
    const hamburguesa = '<span class="mh-badge" aria-hidden="true"><i></i><i></i><i></i></span>';
    let boton;
    if (o.hoy) boton = `<button class="mh-boton hoy" type="button" aria-label="Abrir el menú">${esc(iniciales(o.nombre))}${hamburguesa}</button>`;
    else if (o.menyu === 'u') boton = `<button class="mh-boton" type="button" aria-label="Abrir el menú">${logoClaro(26, true)}${hamburguesa}</button>`;
    else if (o.menyu === 'completo') boton = `<button class="mh-boton ancho" type="button" aria-label="Abrir el menú">${logoClaro(15)}${hamburguesa}</button>`;
    else boton = `<button class="mh-boton" type="button" aria-label="Abrir el menú"><img src="${LOGOS[o.logo]}" alt="">${hamburguesa}</button>`;
    // En la mesa: "Mozo" (con su texto, sin achicar) y la mesa. Con código (modo seguro) "Mesa N" y "PIN xxx" van
    // uno arriba del otro, en sus mismos pills; sin código, solo la mesa, como hoy.
    const mesa = o.modo === 'mesa'
      ? `<button class="mh-mozo" type="button" aria-label="Llamar al mozo"><span aria-hidden="true">🔔</span><span class="txt">Mozo</span></button>` +
        (o.pin
          ? `<div class="mh-mesas apilado"><span class="mh-mesa">Mesa ${o.mesa || 5}</span><span class="mh-pin">PIN ${o.pin}</span></div>`
          : `<div class="mh-mesas"><span class="mh-mesa">Mesa ${o.mesa || 5}</span></div>`)
      : '';
    return `<header class="mh">${boton}<div class="mh-nombre">${esc(o.nombre)}</div>${mesa}</header>`;
  }

  /**
   * El menú lateral abierto (propuesta de la Fase 7): arriba el restaurante (logo grande, nombre y dirección), después la
   * cuenta (sin ella, iniciar sesión o crear una; con ella, el saludo con el nombre y "Cerrar sesión" si se puede) y las
   * filas de cada pantalla. `o`: modo, nombre, direccion, logo / menyu, usuario ({ nombre, email }), comensal, puedeCerrar, cerrado.
   */
  function menuLateral(o) {
    const logoImg = o.menyu ? `<span class="dr-logo menyu">${logoClaro(54, true)}</span>` : `<span class="dr-logo"><img src="${LOGOS[o.logo]}" alt=""></span>`;
    const direccion = o.direccion ? `<div class="dr-dir">${icono('pin', 14)}<span>${esc(o.direccion)}</span></div>` : '';
    let cuenta;
    if (o.usuario) {
      cuenta = `<div class="dr-hola">¡Hola, ${esc(o.usuario.nombre)}!</div><div class="dr-sub">${esc(o.usuario.email)}</div>` +
        (o.puedeCerrar ? '<div class="dr-botones"><span class="dr-btn vidrio">Cerrar sesión</span></div>' : '');
    } else {
      cuenta = `<div class="dr-hola">${o.modo === 'mesa' && o.comensal ? '¡Hola, ' + esc(o.comensal) + '!' : '¡Hola!'}</div><div class="dr-sub">Estás navegando como invitado</div>` +
        '<div class="dr-botones"><span class="dr-btn naranja">Iniciar sesión</span><span class="dr-btn vidrio">Crear cuenta gratis</span></div>';
    }
    const fila = (ic, texto, primaria, badge) => `<div class="dr-fila${primaria ? ' primaria' : ''}"><i>${ic}</i><span>${texto}</span>${badge ? '<small>' + badge + '</small>' : ''}</div>`;
    const filas = o.modo === 'mesa'
      ? fila('🏷️', 'Etiquetar pedidos') + fila('📋', 'Mis pedidos', true) + (o.usuario ? fila('⭐', 'Mis puntos', false, 'Próximamente') : '') + fila('💳', 'Pagar la cuenta')
      : fila('🍽️', 'Ingresar a una mesa', true) + fila('🏠', 'Volver al inicio');
    return `<div class="dr-fondo"><aside class="dr${o.cerrado ? ' cerrado' : ''}">
      <div class="dr-cabeza">
        <div class="dr-resto">${logoImg}<div class="dr-texto"><div class="dr-nombre">${esc(o.nombre)}</div>${direccion}</div></div>
        <div class="dr-linea"></div>
        ${cuenta}
      </div>
      <div class="dr-cuerpo">${filas}</div>
      <div class="dr-pie"><span>v1.0</span><span>powered by<b>MENY</b></span></div>
    </aside></div>`;
  }

  /** Lo que se ve de la cámara en el escáner: una mesa oscura con un QR de mentira (solo para el mockup). */
  function imagenCamara() {
    const n = 25;
    let semilla = 11;
    const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
    const esMarca = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    let modulos = '';
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        if (!esMarca(x, y) && azar() > 0.5) modulos += `<rect x="${x + 2}" y="${y + 2}" width="1" height="1"/>`;
      }
    }
    const marca = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`;
    return `<svg viewBox="0 0 260 260" aria-hidden="true">
      <defs>
        <linearGradient id="mesa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b403a"/><stop offset="1" stop-color="#26211f"/></linearGradient>
        <radialGradient id="vineta" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></radialGradient>
      </defs>
      <rect width="260" height="260" fill="url(#mesa)"/>
      <g transform="translate(130 130) rotate(-7) scale(5.1) translate(-14.5 -14.5)">
        <rect width="29" height="29" rx="1" fill="#fff"/>
        <g fill="#111">${modulos}${marca(2, 2)}${marca(2 + n - 7, 2)}${marca(2, 2 + n - 7)}</g>
      </g>
      <rect width="260" height="260" fill="url(#vineta)"/>
    </svg>`;
  }

  function logo(r, tam) {
    const cls = 'logo' + (tam ? ' ' + tam : '');
    if (r.logo) return `<span class="${cls}"><img src="${LOGOS[r.logo]}" alt=""></span>`;
    return `<span class="${cls} iniciales" aria-hidden="true">${esc(iniciales(r.nombre))}</span>`;
  }

  function tituloSeccion(texto) {
    return `<h2 class="titulo-seccion">${esc(texto)}</h2>`;
  }
  function seccion(texto, contenido, extra) {
    return `<section class="seccion"${extra || ''}>${tituloSeccion(texto)}${contenido}</section>`;
  }

  function direccion(r) {
    return r.direccion
      ? `<p class="resto-dir">${icono('pin', 13, 'currentColor', 2)}<span>${esc(r.direccion)}</span></p>`
      : `<p class="resto-dir vacia">${icono('pin', 13, 'currentColor', 2)}<span>Dirección no cargada</span></p>`;
  }

  /** Tarjeta de restaurante (un enlace a su pantalla). Es la misma en la lista y en todos los grupos de la búsqueda. */
  function cardResto(r, d) {
    const n = ofertasDe(r.id, d.ofertas).length;
    const chip = n > 0 ? `<span class="chip-ofertas">${plural(n, 'oferta', 'ofertas')}</span>` : '';
    return `<a class="resto" href="restaurante.html?id=${encodeURIComponent(r.id)}">
      ${logo(r)}
      <div class="resto-info">
        <h3 class="resto-nombre">${esc(r.nombre)}</h3>
        ${direccion(r)}
        ${chip}
      </div>
      <span class="chevron">${icono('derecha', 20)}</span>
    </a>`;
  }

  /** Tarjeta de oferta: la del menú con el restaurante debajo del nombre y sin botón "+". */
  function cardOferta(o, opciones) {
    const op = opciones || {};
    const resto = restauranteDe(o.rid);
    const foto = o.foto
      ? `<div class="ph" style="background:linear-gradient(135deg,${o.foto.a},${o.foto.b})">${o.foto.e}</div>`
      : `<div class="ph sin-foto"><img src="${RUTA_PLACEHOLDER}" alt=""></div>`;
    const restoLinea = op.sinRestaurante || !resto
      ? ''
      : `<p class="oferta-resto"><span>${esc(resto.nombre)}</span></p>`;
    const etiqueta = op.fija ? 'div' : 'a';
    const enlace = op.fija ? '' : ` href="restaurante.html?id=${encodeURIComponent(o.rid)}"`;
    return `<${etiqueta} class="oferta${op.fija ? ' fija' : ''}"${enlace}>
      <div class="oferta-foto">${foto}<span class="badge-desc" role="img" aria-label="${o.pct}% de descuento">-${o.pct}%</span></div>
      <div class="oferta-info">
        <p class="oferta-nombre">${esc(o.nombre)}</p>
        ${restoLinea}
        <div class="precio"><s>${peso(o.base)}</s><b>${peso(o.desc)}</b></div>
      </div>
    </${etiqueta}>`;
  }

  function carrusel(ofertas) {
    return `<div class="carrusel-caja">
      <button class="flecha izq" type="button" aria-label="Ofertas anteriores" data-dir="-1">${icono('izquierda', 20)}</button>
      <div class="carrusel">${ofertas.map((o) => cardOferta(o)).join('')}</div>
      <button class="flecha der" type="button" aria-label="Más ofertas" data-dir="1">${icono('derecha', 20)}</button>
    </div>`;
  }

  /** Conecta las flechas del carrusel (solo se ven con mouse). */
  function activarCarrusel(raiz) {
    raiz.querySelectorAll('.carrusel-caja').forEach((caja) => {
      const pista = caja.querySelector('.carrusel');
      caja.querySelectorAll('.flecha').forEach((flecha) => {
        flecha.addEventListener('click', () => {
          pista.scrollBy({ left: Number(flecha.dataset.dir) * pista.clientWidth * 0.8, behavior: 'smooth' });
        });
      });
    });
  }

  function esqueletoOferta() {
    return '<div class="sk-oferta"><div class="sk sk-foto"></div><div class="sk-lineas"><div class="sk" style="height:12px;width:90%"></div><div class="sk" style="height:10px;width:60%"></div><div class="sk" style="height:14px;width:45%"></div></div></div>';
  }
  function esqueletoResto() {
    return '<div class="sk-resto"><div class="sk sk-logo"></div><div class="sk-lineas"><div class="sk" style="height:14px;width:70%"></div><div class="sk" style="height:11px;width:90%"></div></div></div>';
  }
  function esqueletoHome() {
    const ofertas = Array.from({ length: 6 }, esqueletoOferta).join('');
    const restos = Array.from({ length: 6 }, esqueletoResto).join('');
    return `<section class="seccion" aria-busy="true">${tituloSeccion('Ofertas')}<div class="carrusel-caja"><div class="carrusel">${ofertas}</div></div></section>
      <section class="seccion" aria-busy="true">${tituloSeccion('Restaurantes')}<div class="grilla-restos">${restos}</div></section>`;
  }

  /** Giro chico para "Buscando…" (naranja de la marca). */
  function spinner() {
    return '<svg class="giro" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle opacity=".25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path opacity=".75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>';
  }

  /** Bloque centrado para error, vacío o sin resultados. */
  function bloqueEstado(opciones) {
    const boton = opciones.boton
      ? `<${opciones.href ? 'a' : 'button'} class="btn-chico${opciones.contorno ? ' contorno' : ''}"${opciones.href ? ` href="${opciones.href}"` : ' type="button"'}${opciones.accion ? ` data-accion="${opciones.accion}"` : ''}>${esc(opciones.boton)}</${opciones.href ? 'a' : 'button'}>`
      : '';
    return `<div class="estado" role="${opciones.rol || 'status'}">
      <div class="icono">${icono(opciones.icono, 32, 'var(--orange)', 2)}</div>
      <h2>${esc(opciones.titulo)}</h2>
      <p>${esc(opciones.texto)}</p>
      ${boton}
    </div>`;
  }

  window.MK = {
    RUTA_LOGO, RUTA_LOGO_OSCURO, RUTA_PLACEHOLDER, LOGOS, TODOS, NORMALES, LIMITE,
    esc, sinAcentos, peso, plural, iniciales, icono,
    datos, buscar, restauranteDe, ofertasDe, todasLasOfertas,
    appHeader, logoOscuro, logoClaro, menuHeader, menuLateral, imagenCamara, logo, tituloSeccion, seccion, direccion, cardResto, cardOferta, carrusel, activarCarrusel,
    esqueletoHome, esqueletoOferta, esqueletoResto, bloqueEstado, spinner,
  };
})();
