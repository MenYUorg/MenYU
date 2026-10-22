/* Consola de ROOT (mockup). Todos los datos son inventados y nada se guarda. Actualizado el 2026-10-21 para la Fase 4 de auth:
   los dueños y las cuentas ROOT se invitan por mail (no hay contraseñas temporales, ni restablecer, ni primer ingreso). */
(function () {
  'use strict';

  var Q = new URLSearchParams(location.search);
  var S = {
    vista: Q.get('vista') || 'marcas',     // marcas | marca | duenos | roots | historial
    estado: Q.get('estado') || 'normal',   // normal | cargando | vacio | error | sin-conexion | muchas
    id: Q.get('id') || 'm1',               // marca abierta
    dialogo: Q.get('dialogo') || '',
    dato: Q.get('dato') || '',             // restaurante o dueño del diálogo, o 'desde-duenos'
    error: Q.get('error') || '',           // email | slug | red
    bajas: Q.get('bajas') === '1',
    q: Q.get('q') || '',
    confirmar: Q.get('dato') === 'escrito' ? 'BurgerLab' : '',
    actor: Q.get('actor') || '',           // filtro del historial: email de quien lo hizo, o 'script'
    tipo: Q.get('tipo') || '',             // filtro del historial: MARCA | RESTAURANTE | OWNER | ROOT
    desde: Q.get('desde') || '', hasta: Q.get('hasta') || '',
    abiertos: (Q.get('abierto') || '').split(',').filter(Boolean),   // filas del historial con el detalle desplegado
    mas: Q.get('estado') === 'muchas',
    drawer: Q.get('menu') === '1',         // menú lateral abierto (celular)
    pop: Q.get('pop') || '',               // menú de acciones abierto: dd1 (dueño d1) o rr1 (restaurante r1)
    toast: ''
  };

  var ICONS = {
    store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/><path d="M3 9h18"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5c2 .8 3.5 2.8 3.5 5.5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    chevR: '<path d="M9 6l6 6-6 6"/>',
    chevL: '<path d="M15 6l-6 6 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    dots: '<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    pencil: '<path d="M4 20l1-4L17 4l3 3L8 19z"/><path d="M14 7l3 3"/>',
    undo: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chevD: '<path d="M6 9l6 6 6-6"/>'
  };

  /* ── Datos de ejemplo ─────────────────────────────────────────────────── */
  var MARCAS = [
    { id: 'm1', nombre: 'La Parrilla de Juan', slug: 'la-parrilla-de-juan', activa: true,
      restaurantes: [
        { id: 'r1', nombre: 'La Parrilla Centro', direccion: 'Av. Colón 1200, Córdoba', activo: true },
        { id: 'r2', nombre: 'La Parrilla Nueva Córdoba', direccion: 'Bv. Illia 450, Córdoba', activo: true },
        { id: 'r3', nombre: 'La Parrilla Villa Allende', direccion: 'Av. Goycoechea 80, Villa Allende', activo: false }
      ],
      duenos: [{ id: 'd1', nombre: 'Juan Pérez', email: 'juan.perez@laparrilla.com.ar', desactivada: false }] },
    { id: 'm2', nombre: 'Fiore Cucina', slug: 'fiore-cucina', activa: true,
      restaurantes: [
        { id: 'r4', nombre: 'Fiore Nueva Córdoba', direccion: 'Obispo Trejo 120, Córdoba', activo: true },
        { id: 'r5', nombre: 'Fiore Alta Córdoba', direccion: null, activo: true }
      ],
      duenos: [
        { id: 'd2', nombre: 'Lucía Fiore', email: 'lucia@fiorecucina.com', desactivada: true },
        { id: 'd3', nombre: 'Administración Fiore', email: 'administracion@fiorecucina.com', desactivada: false }
      ] },
    { id: 'm3', nombre: 'BurgerLab', slug: 'burgerlab', activa: true,
      restaurantes: [
        { id: 'r6', nombre: 'BurgerLab Centro', direccion: 'Av. Colón 1200, Córdoba', activo: true },
        { id: 'r7', nombre: 'BurgerLab Nueva Córdoba', direccion: 'Av. Hipólito Yrigoyen 300, Córdoba', activo: true },
        { id: 'r8', nombre: 'BurgerLab Palermo', direccion: 'Gorriti 5100, Buenos Aires', activo: true }
      ],
      duenos: [] },
    { id: 'm4', nombre: 'Café del Puerto', slug: 'cafe-del-puerto', activa: false,
      restaurantes: [{ id: 'r9', nombre: 'Café del Puerto Rosario', direccion: 'Av. Belgrano 800, Rosario', activo: true }],
      duenos: [{ id: 'd4', nombre: 'Mateo Puerto', email: 'puerto@cafedelpuerto.com.ar', desactivada: false }] },
    { id: 'm5', nombre: 'Asociación Gastronómica del Litoral Argentino Sociedad Anónima',
      slug: 'asociacion-gastronomica-del-litoral-argentino-sociedad-anonima', activa: true,
      restaurantes: [{ id: 'r10', nombre: 'Restaurante Sucursal Número Uno del Litoral Argentino Costanera Norte',
        direccion: 'Av. Costanera Norte 1234, entre calle 25 de Mayo y bulevar San Martín, Santa Fe', activo: true }],
      duenos: [{ id: 'd5', nombre: 'Gerencia General de Administración Contable de la Asociación Gastronómica del Litoral', email: 'gerencia.general.administracion.contable@asociacion-gastronomica-del-litoral.com.ar', desactivada: false }] }
  ];
  if (S.estado === 'muchas') {
    ['Almendra', 'Kaori', 'Ñandú Cocina Regional', 'El Rincón', 'Pizzería Nápoli', 'Mesa 7', 'Don Julián', 'Sabores del Sur', 'La Esquina',
     'Casa Bonita', 'Tostado', 'Verde Menta', 'Pampa Grill', 'Dulce Hogar', 'Sushi Ren', 'La Cantina', 'Hierba Buena', 'Bar Central', 'Costa Azul'
    ].forEach(function (n, i) {
      MARCAS.push({ id: 'x' + i, nombre: n, slug: n.toLowerCase().replace(/[^a-z0-9]+/g, '-'), activa: i % 7 !== 3,
        restaurantes: [{ id: 'rx' + i, nombre: n + ' Centro', direccion: 'Calle ' + (i + 1) + ' 123', activo: true }],
        duenos: i % 6 === 5 ? [] : [{ id: 'dx' + i, nombre: 'Dueño ' + (i + 1), email: 'dueno' + i + '@ejemplo.com', desactivada: i % 4 === 1 }] });
    });
  }

  /* Cuentas ROOT y historial de acciones de ROOT (datos de ejemplo). Quien mira la consola es ana@ejemplo.com. */
  var YO = 'ana@ejemplo.com';
  var ROOTS = [
    { id: 'ro1', nombre: 'Ana López', email: 'ana@ejemplo.com', yo: true, desactivada: false },
    { id: 'ro2', nombre: 'Bruno Gómez', email: 'bruno@ejemplo.com', yo: false, desactivada: false },
    { id: 'ro3', nombre: 'Carla Díaz', email: 'carla@ejemplo.com', yo: false, desactivada: true }
  ];
  var ACCIONES = {
    MARCA_CREAR: 'Creó la marca', MARCA_EDITAR: 'Editó la marca', MARCA_BAJA: 'Dio de baja la marca', MARCA_REACTIVAR: 'Reactivó la marca',
    RESTAURANTE_CREAR: 'Creó el restaurante', RESTAURANTE_EDITAR: 'Editó el restaurante', RESTAURANTE_BAJA: 'Dio de baja el restaurante', RESTAURANTE_REACTIVAR: 'Reactivó el restaurante',
    DUENO_INVITAR: 'Invitó al dueño', DUENO_QUITAR: 'Quitó al dueño', ROOT_INVITAR: 'Invitó a la cuenta ROOT', ROOT_PROMOVER: 'Hizo ROOT a la cuenta',
    /* códigos de antes de las invitaciones: las filas que ya están guardadas se siguen mostrando */
    DUENO_CREAR: 'Creó la cuenta de dueño', DUENO_CAMBIAR_EMAIL: 'Cambió el email del dueño', DUENO_RESTABLECER: 'Restableció la contraseña del dueño', DUENO_ELIMINAR: 'Eliminó la cuenta de dueño',
    ROOT_CREAR: 'Creó la cuenta ROOT', ROOT_RESTABLECER: 'Restableció la contraseña de ROOT', ROOT_ELIMINAR: 'Eliminó la cuenta ROOT'
  };
  var TIPOS = { MARCA: 'Marca', RESTAURANTE: 'Restaurante', OWNER: 'Dueño', ROOT: 'ROOT' };
  // cada acción: quién (o 'script'), qué, sobre qué (tipo, nombre, marca de contexto) y los cambios (campo, antes, después). Nunca una contraseña.
  var HIST = [
    { id: 'h1', cuando: '2026-10-16T11:20', actor: 'ana@ejemplo.com', accion: 'DUENO_QUITAR', tipo: 'OWNER', nombre: 'lucia@fiorecucina.com', ctx: 'Fiore Cucina', cambios: [['Dueño de', 'Fiore Cucina', '—']] },
    { id: 'h2', cuando: '2026-10-16T10:58', actor: 'bruno@ejemplo.com', accion: 'DUENO_INVITAR', tipo: 'OWNER', nombre: 'juan.perez@laparrilla.com.ar', ctx: 'La Parrilla de Juan', cambios: [['Dueño de', '—', 'La Parrilla de Juan'], ['Invitación', '—', 'mail enviado']] },
    { id: 'h3', cuando: '2026-10-16T10:41', actor: 'bruno@ejemplo.com', accion: 'RESTAURANTE_CREAR', tipo: 'RESTAURANTE', nombre: 'La Parrilla Centro', ctx: 'La Parrilla de Juan', cambios: [['Nombre', '—', 'La Parrilla Centro'], ['Dirección', '—', 'Av. Colón 1200, Córdoba']] },
    { id: 'h4', cuando: '2026-10-16T10:35', actor: 'bruno@ejemplo.com', accion: 'MARCA_CREAR', tipo: 'MARCA', nombre: 'La Parrilla de Juan', ctx: '', cambios: [['Nombre', '—', 'La Parrilla de Juan'], ['Identificador', '—', 'la-parrilla-de-juan']] },
    { id: 'h5', cuando: '2026-10-15T19:20', actor: 'script', operador: 'marga', accion: 'ROOT_ELIMINAR', tipo: 'ROOT', nombre: 'root@menyu.com', ctx: '', cambios: [['Cuenta', 'root@menyu.com', 'eliminada (quedaban 3 cuentas ROOT personales)'], ['Cómo', '—', 'script de línea de comandos, operador: marga']] },
    { id: 'h6', cuando: '2026-10-15T18:02', actor: 'ana@ejemplo.com', accion: 'MARCA_BAJA', tipo: 'MARCA', nombre: 'BurgerLab', ctx: '', cambios: [['Estado', 'Activa', 'De baja']] },
    { id: 'h7', cuando: '2026-10-15T17:55', actor: 'ana@ejemplo.com', accion: 'RESTAURANTE_EDITAR', tipo: 'RESTAURANTE', nombre: 'Fiore Alta Córdoba', ctx: 'Fiore Cucina', cambios: [['Nombre', 'Fiore Alta', 'Fiore Alta Córdoba']] },
    { id: 'h8', cuando: '2026-10-15T17:31', actor: 'carla@ejemplo.com', accion: 'DUENO_CAMBIAR_EMAIL', tipo: 'OWNER', nombre: 'administracion@fiorecucina.com', ctx: 'Fiore Cucina', cambios: [['Email', 'admin@fiorecucina.com', 'administracion@fiorecucina.com']] },
    { id: 'h9', cuando: '2026-10-15T17:10', actor: 'carla@ejemplo.com', accion: 'MARCA_EDITAR', tipo: 'MARCA', nombre: 'Café del Puerto', ctx: '', cambios: [['Identificador', 'cafe-puerto', 'cafe-del-puerto']] },
    { id: 'h10', cuando: '2026-10-15T16:12', actor: 'ana@ejemplo.com', accion: 'ROOT_INVITAR', tipo: 'ROOT', nombre: 'carla@ejemplo.com', ctx: '', cambios: [['Cuenta ROOT', '—', 'carla@ejemplo.com'], ['Invitación', '—', 'mail enviado']] },
    { id: 'h11', cuando: '2026-10-15T16:10', actor: 'ana@ejemplo.com', accion: 'ROOT_INVITAR', tipo: 'ROOT', nombre: 'bruno@ejemplo.com', ctx: '', cambios: [['Cuenta ROOT', '—', 'bruno@ejemplo.com'], ['Invitación', '—', 'mail enviado']] },
    { id: 'h12', cuando: '2026-10-15T15:40', actor: 'script', operador: 'marga', accion: 'ROOT_CREAR', tipo: 'ROOT', nombre: 'ana@ejemplo.com', ctx: '', cambios: [['Email', '—', 'ana@ejemplo.com'], ['Cómo', '—', 'script de línea de comandos, operador: marga']] },
    { id: 'h13', cuando: '2026-10-14T12:05', actor: 'bruno@ejemplo.com', accion: 'RESTAURANTE_REACTIVAR', tipo: 'RESTAURANTE', nombre: 'La Parrilla Villa Allende', ctx: 'La Parrilla de Juan', cambios: [['Estado', 'De baja', 'Activo']] }
  ];
  if (S.estado === 'muchas') {
    for (var k = 0; k < 40; k++) {
      var dia = 13 - Math.floor(k / 4), hora = 18 - (k % 4) * 2;
      HIST.push({ id: 'hx' + k, cuando: '2026-10-' + (dia < 10 ? '0' : '') + dia + 'T' + (hora < 10 ? '0' : '') + hora + ':' + (10 + k % 5 * 9),
        actor: ['ana@ejemplo.com', 'bruno@ejemplo.com', 'carla@ejemplo.com'][k % 3], accion: k % 2 ? 'RESTAURANTE_EDITAR' : 'DUENO_INVITAR',
        tipo: k % 2 ? 'RESTAURANTE' : 'OWNER', nombre: k % 2 ? 'Sucursal ' + (k + 1) : 'cuenta' + k + '@ejemplo.com', ctx: 'Marca ' + (k % 5 + 1),
        cambios: [['Nombre', 'Antes ' + k, 'Después ' + k]] });
    }
  }
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function diaLargo(iso) { var p = iso.split('-'); return Number(p[2]) + ' de ' + MESES[Number(p[1]) - 1] + ' de ' + p[0]; }

  function marca(id) { return MARCAS.filter(function (m) { return m.id === id; })[0] || MARCAS[0]; }
  function todosLosDuenos() {
    var out = [];
    MARCAS.forEach(function (m) { m.duenos.forEach(function (d) { out.push({ d: d, m: m }); }); });
    return out;
  }
  function buscarDueno(id) { var t = todosLosDuenos().filter(function (x) { return x.d.id === id; })[0]; return t || todosLosDuenos()[0]; }
  function buscarRoot(id) { return ROOTS.filter(function (r) { return r.id === id; })[0] || ROOTS[1]; }
  function buscarRest(m, id) { return m.restaurantes.filter(function (r) { return r.id === id; })[0] || m.restaurantes[0]; }

  /* ── Utilidades ───────────────────────────────────────────────────────── */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(n, s) { s = s || 18; return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + '</svg>'; }
  function siglas(n) { var p = n.split(/\s+/).filter(Boolean); return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase(); }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  function sinAcentos(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function slugDe(n) { return sinAcentos(n).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  /** El logo de MenYU para fondos oscuros, recortado igual que `LogoMenYuOscuro` (packages/ui): `alto` es el alto de las letras. */
  function logo(alto) {
    var e = alto / 380, p = function (n) { return Math.round(n * e * 100) / 100; };
    return '<span style="display:inline-block;position:relative;overflow:hidden;flex:none;width:' + p(1932) + 'px;height:' + alto + 'px">' +
      '<img src="../../../apps/web-admin/public/LogoParaOscuro.png" alt="MenYU" draggable="false" style="position:absolute;left:-' + p(120) + 'px;top:-' + p(165) + 'px;width:' + p(2172) + 'px;height:' + p(724) + 'px;max-width:none"></span>';
  }
  function chipEstado(activa) { return activa ? '<span class="chip chip-ok">Activa</span>' : '<span class="chip chip-baja">De baja</span>'; }
  function chipRest(activo) { return activo ? '<span class="chip chip-ok">Activo</span>' : '<span class="chip chip-baja">De baja</span>'; }
  function btn(txt, cls, attrs, icono) { return '<button type="button" class="btn ' + (cls || '') + '" ' + (attrs || '') + '>' + (icono ? ico(icono, 16) : '') + txt + '</button>'; }
  function act(a, extra) { return 'data-act="' + a + '"' + (extra ? ' ' + extra : ''); }

  function kebab(clave, items) {
    var abierto = S.pop === clave;
    var h = '<div class="pop-wrap"><button type="button" class="btn btn-ico" aria-label="Acciones" aria-haspopup="menu" aria-expanded="' + abierto + '" ' + act('pop', 'data-k="' + clave + '"') + '>' + ico('dots', 18) + '</button>';
    if (abierto) {
      h += '<div class="pop" role="menu">';
      items.forEach(function (it) {
        if (it === '-') { h += '<hr>'; return; }
        h += '<button type="button" role="menuitem" class="' + (it.peligro ? 'peligro' : '') + '" ' + act('abrir', 'data-d="' + it.d + '" data-x="' + (it.x || '') + '"') + '>' + ico(it.ic, 16) + it.t + '</button>';
      });
      h += '</div>';
    }
    return h + '</div>';
  }

  function aviso(tipo, icono, html, extra) {
    return '<div class="aviso aviso-' + tipo + '" role="' + (tipo === 'err' ? 'alert' : 'note') + '">' + ico(icono, 18) + '<div>' + html + (extra || '') + '</div></div>';
  }
  function bannerError() {
    var sinRed = S.estado === 'sin-conexion';
    return aviso('err', 'alert', '<b>' + (sinRed ? 'Sin conexión.' : 'No pudimos cargar los datos.') + '</b> ' + (sinRed ? 'Revisá tu internet y probá de nuevo.' : 'Probá de nuevo en un momento.'),
      '<br>' + btn('Reintentar', 'btn-danger', act('reintentar'), 'refresh'));
  }
  function skeletonFilas(n) {
    var h = '<div class="card lista" aria-busy="true" aria-label="Cargando">';
    for (var i = 0; i < n; i++) h += '<div class="sk-fila"><div class="sk" style="width:40px;height:40px"></div><div style="flex:1"><div class="sk" style="height:14px;width:' + (50 + (i % 3) * 12) + '%;margin-bottom:8px"></div><div class="sk" style="height:11px;width:30%"></div></div><div class="sk" style="width:64px;height:22px;border-radius:999px"></div></div>';
    return h + '</div>';
  }

  /* ── Pantallas ────────────────────────────────────────────────────────── */
  function vMarcas() {
    var h = '<div class="barra"><div class="barra-izq">' +
      '<div class="buscar campo" style="margin:0">' + ico('search', 16) + '<input type="search" placeholder="Buscar marca" aria-label="Buscar marca" data-in="q" value="' + esc(S.q) + '"></div>' +
      '<button type="button" class="interruptor" role="switch" aria-checked="' + S.bajas + '" ' + act('bajas') + '><i></i>Mostrar dadas de baja</button>' +
      '</div>' + btn('Nueva marca', 'btn-primary', act('abrir', 'data-d="nueva-marca"'), 'plus') + '</div>';

    if (S.estado === 'cargando') return h + skeletonFilas(5);
    if (S.estado === 'error' || S.estado === 'sin-conexion') return h + bannerError();
    if (S.estado === 'vacio') {
      return h + '<div class="card vacio"><div class="ic">' + ico('store', 22) + '</div><b>Todavía no hay marcas</b><p>Creá la primera, después invitá a su dueño y sumale sus restaurantes.</p>' +
        btn('Crear la primera marca', 'btn-primary', act('abrir', 'data-d="nueva-marca"'), 'plus') + '</div>';
    }
    var q = sinAcentos(S.q.trim());
    var lista = MARCAS.filter(function (m) { return (S.bajas || m.activa) && (!q || sinAcentos(m.nombre).indexOf(q) >= 0 || m.slug.indexOf(q) >= 0); });
    if (!lista.length) {
      return h + '<div class="card vacio"><div class="ic">' + ico('search', 22) + '</div><b>No encontramos marcas' + (S.q ? ' con «' + esc(S.q) + '»' : '') + '</b><p>' +
        (S.bajas ? 'Probá con otra palabra.' : 'Probá con otra palabra o activá «Mostrar dadas de baja».') + '</p></div>';
    }
    h += '<div class="card lista"><div class="cab"><span>Marca</span><span>Restaurantes</span><span>Dueños</span><span>Estado</span></div>';
    lista.forEach(function (m) {
      var nR = m.restaurantes.length, nD = m.duenos.length, bR = m.restaurantes.filter(function (r) { return !r.activo; }).length;
      var rest = plural(nR, 'restaurante', 'restaurantes') + (bR ? ' <span class="sub-gris">(' + bR + ' de baja)</span>' : '');
      var due = nD ? plural(nD, 'dueño', 'dueños') : '<span class="chip chip-aviso">' + ico('alert', 12) + ' Sin dueño</span>';
      h += '<div class="fila' + (m.activa ? '' : ' baja') + '" role="link" tabindex="0" ' + act('ir', 'data-v="marca" data-id="' + m.id + '"') + '>' +
        '<div class="sigla">' + esc(siglas(m.nombre)) + '</div>' +
        '<div class="nom"><b class="cortar2">' + esc(m.nombre) + '</b><small class="cortar">' + esc(m.slug) + '</small></div>' +
        '<div class="c-rest">' + rest + '</div><div class="c-due">' + due + '</div>' +
        '<div class="est">' + chipEstado(m.activa) + '</div>' +
        '<div class="meta"><span>' + rest + '</span><span>·</span><span>' + due + '</span></div>' +
        '<div class="chev">' + ico('chevR', 16) + '</div></div>';
    });
    return h + '</div>';
  }

  function vMarca() {
    var volver = '<button type="button" class="volver" ' + act('ir', 'data-v="marcas"') + '>' + ico('chevL', 16) + 'Marcas</button>';
    if (S.estado === 'cargando') {
      return volver + '<div class="card" aria-busy="true"><div style="display:flex;gap:14px"><div class="sk" style="width:56px;height:56px"></div><div style="flex:1"><div class="sk" style="height:20px;width:55%;margin-bottom:10px"></div><div class="sk" style="height:12px;width:35%"></div></div></div></div>' +
        skeletonFilas(2) + skeletonFilas(3);
    }
    if (S.estado === 'error' || S.estado === 'sin-conexion') return volver + bannerError();

    var m = marca(S.id), activos = m.restaurantes.filter(function (r) { return r.activo; }).length;
    var h = volver;
    if (!m.activa) {
      h += aviso('amb', 'alert', '<b>Esta marca está dada de baja.</b> Sus restaurantes no están disponibles y su dueño no puede iniciar sesión. No se borró ningún dato: al reactivarla vuelve todo como estaba.',
        '<br>' + btn('Reactivar la marca', 'btn-primary', act('abrir', 'data-d="reactivar-marca"'), 'undo').replace('class="btn btn-primary"', 'class="btn btn-primary" style="margin-top:8px"'));
    }
    if (m.activa && !m.duenos.length) {
      h += aviso('amb', 'alert', '<b>Esta marca no tiene dueño.</b> Nadie puede administrar su menú, sus mesas ni su logo hasta que invites a uno.',
        '<br>' + btn('Invitar dueño', 'btn-primary', act('abrir', 'data-d="invitar-dueno"'), 'mail').replace('class="btn btn-primary"', 'class="btn btn-primary" style="margin-top:8px"'));
    }

    // Cabecera
    h += '<section class="card ' + (m.activa ? '' : 'baja') + '"><div class="cab-marca"><div class="sigla sigla-g">' + esc(siglas(m.nombre)) + '</div><div style="min-width:0;flex:1">' +
      '<p class="eyebrow">Marca</p><h2>' + esc(m.nombre) + '</h2></div></div>' +
      '<dl class="datos"><div><dt>Identificador</dt><dd class="mono" style="font:500 12px ui-monospace,Consolas,monospace">' + esc(m.slug) + '</dd></div>' +
      '<div><dt>Estado</dt><dd>' + chipEstado(m.activa) + '</dd></div>' +
      '<div><dt>Restaurantes</dt><dd>' + activos + ' activos de ' + m.restaurantes.length + '</dd></div>' +
      '<div><dt>Dueños</dt><dd>' + m.duenos.length + '</dd></div></dl>' +
      '<div class="acciones">' + btn('Editar', '', act('abrir', 'data-d="editar-marca"'), 'pencil') +
      (m.activa ? btn('Dar de baja', 'btn-danger', act('abrir', 'data-d="baja-marca"'), 'trash') : '') + '</div></section>';

    // Dueños (se invitan por mail; el acceso se quita, la cuenta no se borra)
    h += '<section class="card"><div class="card-head"><div><h3 class="titulo">Dueños</h3><p class="ayuda">Cuentas con acceso total a la marca. Se invitan por mail: la persona elige su contraseña al entrar. Los gerentes los invita el dueño desde su panel.</p></div>' +
      (m.activa ? btn('Invitar dueño', '', act('abrir', 'data-d="invitar-dueno"'), 'mail') : '') + '</div>';
    if (!m.duenos.length) h += '<p class="vacio-inline">Todavía no hay ningún dueño.</p>';
    m.duenos.forEach(function (d) { h += filaDueno(d, m, false, 'd'); });
    h += '</section>';

    // Restaurantes
    h += '<section class="card"><div class="card-head"><div><h3 class="titulo">Restaurantes</h3><p class="ayuda">ROOT solo cambia el nombre y el estado. La dirección y el logo los carga el dueño.</p></div>' +
      (m.activa ? btn('Agregar restaurante', '', act('abrir', 'data-d="nuevo-restaurante"'), 'plus') : '') + '</div>';
    if (!m.restaurantes.length) h += '<p class="vacio-inline">Todavía no tiene restaurantes.</p>';
    m.restaurantes.forEach(function (r) {
      h += '<div class="item' + (r.activo ? '' : ' baja') + '"><div class="sigla">' + esc(siglas(r.nombre)) + '</div><div class="item-txt"><b>' + esc(r.nombre) + '</b>' +
        '<small class="cortar2">' + (r.direccion ? esc(r.direccion) : 'Dirección no cargada') + '</small><div class="item-chips">' + chipRest(r.activo) + '</div></div>' +
        kebab('r' + r.id, [
          { ic: 'pencil', t: 'Editar nombre', d: 'editar-restaurante', x: r.id },
          '-',
          r.activo ? { ic: 'trash', t: 'Dar de baja', d: 'baja-restaurante', x: r.id, peligro: true } : { ic: 'undo', t: 'Reactivar', d: 'reactivar-restaurante', x: r.id }
        ]) + '</div>';
    });
    h += '</section>';

    h += '<p class="nota-priv">' + ico('lock', 16) + '<span>ROOT no ve ni decide sobre el menú y los precios, los descuentos, las mesas y sus QR, los mozos, los pedidos, los reportes ni la caja. Tampoco cambia el logo ni la dirección: eso lo hace el dueño de la marca.</span></p>';
    return h;
  }

  /** Una fila de dueño: nombre, email y, si todavía no aceptó la invitación, el aviso. Su único menú es "Quitar acceso". */
  function filaDueno(d, m, conMarca, clave) {
    var marcaLink = conMarca ? '<small><a href="#" style="color:var(--navy);font-weight:600;text-decoration:none" ' + act('ir', 'data-v="marca" data-id="' + m.id + '"') + '>' + esc(m.nombre) + '</a>' + (m.activa ? '' : ' · marca de baja') + '</small>' : '';
    var chips = conMarca && d.desactivada ? '<div class="item-chips"><span class="chip chip-aviso" title="Su cuenta está desactivada: no entra a ningún lado">Cuenta desactivada</span></div>' : '';
    return '<div class="item"><div class="sigla">' + esc(siglas(d.nombre)) + '</div><div class="item-txt"><b>' + esc(d.nombre) + '</b><small class="cortar2">' + esc(d.email) + '</small>' + marcaLink + chips + '</div>' +
      kebab(clave + d.id, [{ ic: 'trash', t: 'Quitar acceso', d: 'quitar-acceso', x: d.id, peligro: true }]) + '</div>';
  }

  function vDuenos() {
    var h = '<div class="barra"><div class="barra-izq"><div class="buscar campo" style="margin:0">' + ico('search', 16) +
      '<input type="search" placeholder="Buscar por nombre, email o marca" aria-label="Buscar dueño" data-in="q" value="' + esc(S.q) + '"></div></div>' +
      btn('Invitar dueño', 'btn-primary', act('abrir', 'data-d="invitar-dueno" data-x="desde-duenos"'), 'mail') + '</div>';
    if (S.estado === 'cargando') return h + skeletonFilas(5);
    if (S.estado === 'error' || S.estado === 'sin-conexion') return h + bannerError();
    var q = sinAcentos(S.q.trim());
    var lista = todosLosDuenos().filter(function (x) { return !q || sinAcentos(x.d.email).indexOf(q) >= 0 || sinAcentos(x.d.nombre).indexOf(q) >= 0 || sinAcentos(x.m.nombre).indexOf(q) >= 0; });
    if (S.estado === 'vacio' || !lista.length) {
      return h + '<div class="card vacio"><div class="ic">' + ico('users', 22) + '</div><b>' + (S.estado === 'vacio' ? 'Todavía no hay dueños' : 'No encontramos dueños con «' + esc(S.q) + '»') + '</b><p>' +
        (S.estado === 'vacio' ? 'Un dueño es la cuenta que administra una marca. Se lo invita por mail.' : 'Probá con otro nombre, email o marca.') + '</p></div>';
    }
    h += '<section class="card" style="padding:8px 20px">';
    lista.forEach(function (x) { h += filaDueno(x.d, x.m, true, 'u'); });
    return h + '</section>';
  }

  function vRoots() {
    var h = '<div class="barra"><span class="ayuda">Cada integrante del equipo tiene la suya.</span>' + btn('Invitar cuenta ROOT', 'btn-primary', act('abrir', 'data-d="invitar-root"'), 'mail') + '</div>' +
      aviso('info', 'lock', '<b>Las cuentas ROOT no se quitan desde la consola.</b> Cada persona maneja su contraseña desde la pantalla de ingreso («Olvidé mi contraseña»).');
    if (S.estado === 'cargando') return h + skeletonFilas(3);
    if (S.estado === 'error' || S.estado === 'sin-conexion') return h + bannerError();
    h += '<section class="card" style="padding:8px 20px">';
    ROOTS.forEach(function (r) {
      var chips = (r.yo ? '<span class="chip chip-ok">Vos</span>' : '') + (r.desactivada ? '<span class="chip chip-aviso" title="Su cuenta está desactivada: no entra a la consola">Cuenta desactivada</span>' : '');
      h += '<div class="item"><div class="sigla">' + esc(siglas(r.nombre)) + '</div><div class="item-txt"><b>' + esc(r.nombre) + '</b><small class="cortar2">' + esc(r.email) + '</small>' + (chips ? '<div class="item-chips">' + chips + '</div>' : '') + '</div></div>';
    });
    return h + '</section>';
  }

  function histFiltrado() {
    return HIST.filter(function (x) {
      var d = x.cuando.slice(0, 10);
      return (!S.actor || x.actor === S.actor) && (!S.tipo || x.tipo === S.tipo) && (!S.desde || d >= S.desde) && (!S.hasta || d <= S.hasta);
    });
  }
  function opcion(valor, texto, actual) { return '<option value="' + esc(valor) + '"' + (valor === actual ? ' selected' : '') + '>' + esc(texto) + '</option>'; }
  function filaHist(x) {
    var abierto = S.abiertos.indexOf(x.id) >= 0;
    var quien = x.actor === 'script' ? '<span class="chip chip-temp">Script</span> <span class="sub-gris">operador: ' + esc(x.operador) + '</span>' : esc(x.actor);
    var h = '<div class="h-fila' + (abierto ? ' abierta' : '') + '">' +
      '<div class="h-hora">' + x.cuando.slice(11) + '</div>' +
      '<div class="h-main"><b>' + ACCIONES[x.accion] + '</b><span class="h-quien">' + quien + '</span></div>' +
      '<div class="h-sobre"><span class="chip chip-baja">' + TIPOS[x.tipo] + '</span><span class="h-nombre">' + esc(x.nombre) + '</span>' + (x.ctx ? '<small>' + esc(x.ctx) + '</small>' : '') + '</div>' +
      '<button type="button" class="btn btn-ico h-ver" aria-label="' + (abierto ? 'Ocultar' : 'Ver') + ' los cambios" aria-expanded="' + abierto + '" ' + act('ver', 'data-h="' + x.id + '"') + '>' + ico('chevD', 18) + '</button></div>';
    if (abierto) {
      h += '<div class="h-detalle">';
      x.cambios.forEach(function (c) {
        h += '<div class="h-cambio"><b>' + esc(c[0]) + '</b><div><span class="e">Antes</span>' + esc(c[1]) + '</div><div><span class="e">Después</span>' + esc(c[2]) + '</div></div>';
      });
      h += '<p class="ayuda">Acción ' + x.id + ' · ' + diaLargo(x.cuando.slice(0, 10)) + ', ' + x.cuando.slice(11) + ' h</p></div>';
    }
    return h;
  }
  function vHistorial() {
    var hayFiltro = !!(S.actor || S.tipo || S.desde || S.hasta);
    var h = '<section class="card filtros" aria-label="Filtros"><div class="campo"><label for="f-actor">Quién</label><select id="f-actor" data-sel="actor">' + opcion('', 'Todos', S.actor) +
      ROOTS.map(function (r) { return opcion(r.email, r.email, S.actor); }).join('') + opcion('script', 'Script (línea de comandos)', S.actor) + '</select></div>' +
      '<div class="campo"><label for="f-tipo">Sobre qué</label><select id="f-tipo" data-sel="tipo">' + opcion('', 'Todo', S.tipo) + opcion('MARCA', 'Marcas', S.tipo) + opcion('RESTAURANTE', 'Restaurantes', S.tipo) + opcion('OWNER', 'Dueños', S.tipo) + opcion('ROOT', 'Cuentas ROOT', S.tipo) + '</select></div>' +
      '<div class="campo"><label for="f-desde">Desde</label><input id="f-desde" type="date" data-in="desde" value="' + esc(S.desde) + '"></div>' +
      '<div class="campo"><label for="f-hasta">Hasta</label><input id="f-hasta" type="date" data-in="hasta" value="' + esc(S.hasta) + '"></div></section>';
    if (hayFiltro) h += '<div><button type="button" class="btn" ' + act('limpiar') + '>Limpiar filtros</button></div>';
    var nota = '<p class="nota-priv">' + ico('lock', 16) + '<span><b>El historial no se puede editar ni borrar:</b> ni desde la consola ni desde la API, y la base de datos lo impide. Guarda quién, qué, sobre qué y cuándo; nunca una contraseña.</span></p>';

    if (S.estado === 'cargando') return h + skeletonFilas(6) + nota;
    if (S.estado === 'error' || S.estado === 'sin-conexion') return h + bannerError() + nota;
    if (S.estado === 'vacio') {
      return h + '<div class="card vacio"><div class="ic">' + ico('clock', 22) + '</div><b>Todavía no hay acciones registradas</b><p>Cada cosa que haga un ROOT queda acá.</p></div>' + nota;
    }
    var lista = histFiltrado();
    if (!lista.length) {
      return h + '<div class="card vacio"><div class="ic">' + ico('search', 22) + '</div><b>Ninguna acción coincide con los filtros</b><p>Probá con otras fechas o con otra persona.</p>' +
        btn('Limpiar filtros', '', act('limpiar')) + '</div>' + nota;
    }
    h += '<section class="card hist" aria-label="Acciones de ROOT">';
    var dia = '';
    lista.forEach(function (x) {
      var d = x.cuando.slice(0, 10);
      if (d !== dia) { if (dia) h += '</div>'; h += '<p class="h-dia">' + diaLargo(d) + '</p><div class="h-grupo">'; dia = d; }
      h += filaHist(x);
    });
    h += '</div></section>';
    if (S.estado === 'muchas') {
      h += S.fin ? '<p class="ayuda" style="text-align:center">Llegaste al principio del historial.</p>'
        : '<div style="text-align:center">' + btn('Cargar más', '', act('cargar-mas')) + '</div>';
    }
    return h + nota;
  }

  /* ── Diálogos ─────────────────────────────────────────────────────────── */
  function campo(id, etiqueta, valor, extra) {
    extra = extra || {};
    return '<div class="campo' + (extra.error ? ' con-error' : '') + '"><label for="' + id + '">' + etiqueta + '</label>' +
      '<input id="' + id + '" type="' + (extra.tipo || 'text') + '" value="' + esc(valor || '') + '" placeholder="' + esc(extra.ph || '') + '"' + (extra.ro ? ' readonly' : '') + (extra.mono ? ' style="font-family:ui-monospace,Consolas,monospace;font-size:15px"' : '') + (extra.data ? ' ' + extra.data : '') + ' autocomplete="off">' +
      (extra.error ? '<p class="error">' + ico('alert', 14) + extra.error + '</p>' : '') +
      (extra.ayuda ? '<p class="ayuda">' + extra.ayuda + '</p>' : '') + '</div>';
  }
  function pie(cancelar, accion) { return '<div class="dlg-pie">' + (cancelar === false ? '' : btn(cancelar || 'Cancelar', '', act('cerrar'))) + accion + '</div>'; }
  function fijo(txt, icono) { return '<div class="campo"><label>Marca</label><div class="fijo">' + ico(icono || 'store', 16) + '<span class="cortar">' + esc(txt) + '</span></div></div>'; }
  function errRed() { return S.error === 'red' ? aviso('err', 'alert', '<b>No pudimos completar la acción.</b> Probá de nuevo en un momento.').replace('class="aviso', 'style="margin-bottom:14px" class="aviso') : ''; }

  function dlgContenido() {
    var m = marca(S.id), d = S.dialogo, x = S.dato;
    if (d === 'nueva-marca' || d === 'editar-marca') {
      var edit = d === 'editar-marca';
      return '<h3 id="dlg-t">' + (edit ? 'Editar marca' : 'Nueva marca') + '</h3><p class="lead">' + (edit ? 'ROOT cambia el nombre y el identificador. El logo lo carga el dueño.' : 'Una marca agrupa los restaurantes de un mismo dueño. Después invitás al dueño y sumás los restaurantes.') + '</p>' + errRed() +
        campo('f-nombre', 'Nombre *', edit ? m.nombre : (S.error === 'slug' ? 'La Parrilla de Juan' : ''), { ph: 'Ej.: La Parrilla de Juan' }) +
        campo('f-slug', 'Identificador *', edit ? m.slug : (S.error === 'slug' ? 'la-parrilla-de-juan' : ''), { mono: true, ph: 'la-parrilla-de-juan', error: S.error === 'slug' ? 'Ya existe una marca con ese identificador. Cambialo para poder crearla.' : '', ayuda: 'Es interno y único: no lo ven los clientes. Se arma solo con el nombre; podés cambiarlo.' }) +
        pie('Cancelar', btn(edit ? 'Guardar cambios' : 'Crear marca', 'btn-primary', act('guardar')));
    }
    if (d === 'baja-marca') {
      var act_ = m.restaurantes.filter(function (r) { return r.activo; }).length, ok = S.confirmar.trim().toLowerCase() === m.nombre.toLowerCase();
      return '<h3 id="dlg-t">Dar de baja «' + esc(m.nombre) + '»</h3><p class="lead">Es reversible: la podés reactivar cuando quieras.</p>' + errRed() + '<ul>' +
        '<li><b>' + plural(act_, 'restaurante deja', 'restaurantes dejan') + ' de estar disponible' + (act_ === 1 ? '' : 's') + '</b>: no aparecen en Discovery, no se ve su carta y los QR y PIN de sus mesas no abren mesas nuevas.</li>' +
        '<li><b>Las mesas que ya están abiertas se pueden terminar</b>: se sigue pidiendo la cuenta y cobrando.</li>' +
        '<li><b>Sus dueños, gerentes, mozos y cocina no pueden iniciar sesión</b> mientras esté de baja.</li>' +
        '<li><b>No se borra ningún dato</b> (menú, mesas, pedidos, pagos). Al reactivarla vuelve todo como estaba.</li></ul>' +
        campo('f-conf', 'Para confirmar, escribí el nombre de la marca', S.confirmar, { ph: m.nombre, data: 'data-in="confirmar"' }) +
        pie('Cancelar', btn('Dar de baja', 'btn-danger-solid', act('guardar') + (ok ? '' : ' disabled')));
    }
    if (d === 'reactivar-marca') {
      return '<h3 id="dlg-t">Reactivar «' + esc(m.nombre) + '»</h3><p class="lead">Vuelve a estar disponible tal como estaba.</p><ul>' +
        '<li>Sus restaurantes activos vuelven a Discovery, a mostrar su carta y a abrir mesas.</li><li>Sus dueños, gerentes, mozos y cocina pueden iniciar sesión de nuevo.</li></ul>' +
        pie('Cancelar', btn('Reactivar', 'btn-primary', act('guardar')));
    }
    if (d === 'nuevo-restaurante') {
      return '<h3 id="dlg-t">Nuevo restaurante</h3><p class="lead">Se crea dentro de la marca y queda activo.</p>' + errRed() + fijo(m.nombre) +
        campo('f-rnombre', 'Nombre *', '', { ph: 'Ej.: La Parrilla Centro' }) +
        campo('f-rdir', 'Dirección *', '', { ph: 'Calle y número, ciudad', ayuda: 'Se carga acá una sola vez. Después solo la puede cambiar el dueño de la marca.' }) +
        pie('Cancelar', btn('Crear restaurante', 'btn-primary', act('guardar')));
    }
    if (d === 'editar-restaurante') {
      var r = buscarRest(m, x);
      return '<h3 id="dlg-t">Editar restaurante</h3><p class="lead">ROOT solo cambia el nombre.</p>' + campo('f-rnombre', 'Nombre *', r.nombre) +
        '<div class="campo"><label>Dirección</label><div class="fijo">' + ico('lock', 16) + '<span class="cortar">' + (r.direccion ? esc(r.direccion) : 'Dirección no cargada') + '</span></div><p class="ayuda">La dirección y el logo los cambia el dueño de la marca.</p></div>' +
        pie('Cancelar', btn('Guardar cambios', 'btn-primary', act('guardar')));
    }
    if (d === 'baja-restaurante') {
      var rb = buscarRest(m, x);
      return '<h3 id="dlg-t">Dar de baja «' + esc(rb.nombre) + '»</h3><p class="lead">Es reversible: lo podés reactivar cuando quieras.</p><ul>' +
        '<li><b>Deja de estar disponible</b>: no aparece en Discovery, no se ve su carta y los QR y PIN de sus mesas no abren mesas nuevas.</li>' +
        '<li><b>Las mesas que ya están abiertas se pueden terminar</b>: se sigue pidiendo la cuenta y cobrando.</li>' +
        '<li><b>Sus gerentes, mozos y cocina no pueden iniciar sesión.</b></li><li><b>No se borra ningún dato.</b> Al reactivarlo vuelve todo como estaba.</li></ul>' +
        pie('Cancelar', btn('Dar de baja', 'btn-danger-solid', act('guardar')));
    }
    if (d === 'reactivar-restaurante') {
      var rr = buscarRest(m, x);
      return '<h3 id="dlg-t">Reactivar «' + esc(rr.nombre) + '»</h3><p class="lead">Vuelve a Discovery, a mostrar su carta y a abrir mesas. Sus gerentes, mozos y cocina pueden iniciar sesión de nuevo.</p>' +
        pie('Cancelar', btn('Reactivar', 'btn-primary', act('guardar')));
    }
    if (d === 'invitar-dueno') {
      var desde = x === 'desde-duenos';
      var selMarca = '<div class="campo"><label for="f-marca">Marca *</label><select id="f-marca">' + MARCAS.filter(function (z) { return z.activa; }).map(function (z) { return '<option>' + esc(z.nombre) + '</option>'; }).join('') + '</select></div>';
      return '<h3 id="dlg-t">Invitar dueño</h3><p class="lead">Una cuenta con acceso total a su marca. Le mandamos un mail con un enlace para que elija su contraseña y entre. Los gerentes los invita el dueño.</p>' + errRed() + (desde ? selMarca : fijo(m.nombre)) +
        campo('f-nombre', 'Nombre *', S.error === 'email' ? 'Juan Pérez' : '', { ph: 'Ej.: Juan Pérez' }) +
        campo('f-email', 'Email *', S.error === 'email' ? 'juan.perez@laparrilla.com.ar' : '', { tipo: 'email', ph: 'dueno@restaurante.com', error: S.error === 'email' ? 'Esa persona ya es dueña de esta marca.' : '', ayuda: 'Si ya tiene una cuenta de MenYU, no hace falta mail: entra con la que tiene.' }) +
        pie('Cancelar', btn('Enviar invitación', 'btn-primary', act('guardar', 'data-next="invitacion-enviada" data-x="dueno"'), 'mail'));
    }
    if (d === 'invitacion-enviada') {
      var tipo = x || 'dueno', esRoot = tipo.indexOf('root') === 0, ya = tipo.indexOf('existente') >= 0;
      var quien = esRoot ? 'dana@ejemplo.com' : 'juan.perez@laparrilla.com.ar';
      return '<div class="ok-ic">' + ico(ya ? 'check' : 'mail', 24) + '</div><h3 id="dlg-t">' + (ya ? 'Ya tenía una cuenta' : 'Invitación enviada') + '</h3>' +
        '<p class="lead">' + (ya
          ? '<b>' + esc(quien) + '</b> ya tiene una cuenta ' + (esRoot ? 'de acceso (por ejemplo, la que creó con Google), así que no hace falta ningún mail: ya puede entrar y usar la consola de ROOT' : 'de MenYU, así que no se le mandó ningún mail: ya figura como dueño y entra') + ' con su contraseña de siempre o con Google.'
          : 'Le mandamos un mail a <b>' + esc(quien) + '</b> con el enlace para elegir su contraseña y entrar. Si no le llega, que revise el correo no deseado.') + '</p>' +
        (ya ? (esRoot ? '' : '<p class="ayuda">Si nunca llegó a aceptar una invitación anterior, puede pedir un enlace desde «Olvidé mi contraseña» con ese mismo email.</p>') : '<p class="ayuda">Si el enlace deja de servir, puede pedir uno nuevo desde «Olvidé mi contraseña» con ese mismo email.</p>') +
        '<p class="ayuda" style="margin-top:10px">Esta acción quedó registrada en el historial.</p>' +
        pie(false, btn('Listo', 'btn-primary', act('cerrar')));
    }
    if (d === 'quitar-acceso') {
      var dq = buscarDueno(x);
      return '<h3 id="dlg-t">Quitar el acceso de ' + esc(dq.d.nombre) + '</h3><p class="lead"><b>' + esc(dq.d.email) + '</b> deja de poder administrar «' + esc(dq.m.nombre) + '».</p><ul>' +
        '<li>Su cuenta de MenYU <b>no se borra</b>: si tiene otras marcas o es cliente, todo sigue igual.</li>' +
        '<li>La marca y sus restaurantes <b>no se tocan</b>.</li><li>Lo podés volver a invitar cuando quieras.</li>' +
        '</ul>' +
        pie('Cancelar', btn('Quitar acceso', 'btn-danger-solid', act('guardar')));
    }
    if (d === 'ultimo-dueno') {
      return '<h3 id="dlg-t">No se puede quitar todavía</h3><p class="lead"></p>' +
        aviso('amb', 'alert', 'Es el <b>único dueño</b> de «' + esc(m.nombre) + '». Invitá a otro antes de quitarle el acceso, así la marca no queda sin nadie que la administre.') +
        pie('Cerrar', btn('Invitar a otro dueño', 'btn-primary', act('abrir', 'data-d="invitar-dueno"'), 'mail'));
    }
    if (d === 'invitar-root') {
      return '<h3 id="dlg-t">Invitar cuenta ROOT</h3><p class="lead">Para otra persona del equipo. Va a poder lo mismo que vos: administrar marcas, restaurantes y dueños, invitar a otras cuentas ROOT y ver el historial. Le mandamos un mail con un enlace para elegir su contraseña.</p>' + errRed() +
        campo('f-nombre', 'Nombre *', S.error === 'email' ? 'Dana Ruiz' : '', { ph: 'Ej.: Bruno Gómez' }) +
        campo('f-email', 'Email *', S.error === 'email' ? 'dana@ejemplo.com' : '', { tipo: 'email', ph: 'persona@menyu.com', error: S.error === 'email' ? 'Ese email ya tiene una cuenta de MenYU, así que no se puede invitar desde acá. Para hacerla ROOT, el equipo usa el script de cuentas ROOT.' : '', ayuda: 'Tiene que ser una persona que todavía no tenga cuenta en MenYU.' }) +
        pie('Cancelar', btn('Enviar invitación', 'btn-primary', act('guardar', 'data-next="invitacion-enviada" data-x="root"'), 'mail'));
    }
    return '';
  }

  /** Los diálogos que cambian algo avisan que la acción queda en el historial de ROOT (el que lo muestra ya lo dice por su cuenta). */
  var SIN_AVISO = ['invitacion-enviada', 'ultimo-dueno'];
  function conRegistro(html) {
    if (SIN_AVISO.indexOf(S.dialogo) >= 0) return html;
    return html.replace('<div class="dlg-pie">', '<p class="ayuda aviso-registro">' + ico('clock', 14) + 'Esta acción queda registrada en el historial.</p><div class="dlg-pie">');
  }

  /* ── Armado ───────────────────────────────────────────────────────────── */
  function nav(v, etiqueta, icono) {
    var activo = (v === 'marcas' && (S.vista === 'marcas' || S.vista === 'marca')) || v === S.vista;
    return '<a class="nav" tabindex="0" role="link" ' + (activo ? 'aria-current="page"' : '') + ' ' + act('ir', 'data-v="' + v + '"') + '>' + ico(icono, 15) + etiqueta + '</a>';
  }

  function render() {
    var main = document.querySelector('main'), scroll = main ? main.scrollTop : 0;
    var foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.in : '';
    var pos = foco ? document.activeElement.selectionStart : 0;

    var VISTAS = { marcas: vMarcas, marca: vMarca, duenos: vDuenos, roots: vRoots, historial: vHistorial };
    var TITULOS = { marcas: ['Marcas', 'Marcas, restaurantes y dueños'], duenos: ['Dueños', 'Cuentas de dueño (OWNER)'], roots: ['Cuentas ROOT', 'Quién administra MenYU'], historial: ['Historial', 'Todo lo que hizo cada ROOT'] };
    var cuerpo = (VISTAS[S.vista] || vMarcas)();
    var titulo = S.vista === 'marca' ? 'Marcas' : (TITULOS[S.vista] || TITULOS.marcas)[0];
    var sub = S.vista === 'marca' ? marca(S.id).nombre : (TITULOS[S.vista] || TITULOS.marcas)[1];

    document.getElementById('app').innerHTML =
      '<div class="app' + (S.drawer ? ' drawer' : '') + '">' +
      '<div class="overlay" ' + act('drawer') + ' aria-hidden="true"></div>' +
      '<div class="side-wrap"><button type="button" class="side-close" aria-label="Cerrar menú" ' + act('drawer') + '>' + ico('x', 20) + '</button>' +
      '<aside class="side"><div class="side-logo">' + logo(20) + '</div>' +
      '<div class="side-brand"><div><b>Administración</b><small>Cuenta ROOT · sin acceso a los datos de las marcas</small></div></div>' +
      '<nav><p class="side-sec">Administración</p>' + nav('marcas', 'Marcas', 'store') + nav('duenos', 'Dueños', 'users') +
      '<p class="side-sec">Sistema</p>' + nav('roots', 'Cuentas ROOT', 'shield') + nav('historial', 'Historial', 'clock') + '</nav>' +
      '<div class="side-foot"><p>' + YO + '</p><button type="button">' + ico('logout', 13) + 'Cerrar sesión</button></div></aside></div>' +
      '<div class="main-col"><header class="top"><div class="top-l"><button type="button" class="burger" aria-label="Abrir menú" aria-expanded="' + S.drawer + '" ' + act('drawer') + '>' + ico('menu', 22) + '</button>' +
      '<div style="min-width:0"><h2>' + titulo + '</h2><p>' + esc(sub) + '</p></div></div><div class="avatar">' + YO.slice(0, 2).toUpperCase() + '</div></header>' +
      '<main><div class="page">' + cuerpo + '</div></main></div>' +
      (S.dialogo ? '<div class="dlg-bg" ' + act('fondo') + '><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t">' + conRegistro(dlgContenido()) + '</div></div>' : '') +
      (S.toast ? '<div class="toast" role="status">' + esc(S.toast) + '</div>' : '') + '</div>';

    var nuevoMain = document.querySelector('main');
    if (nuevoMain) nuevoMain.scrollTop = scroll;
    if (foco) {
      var el = document.querySelector('[data-in="' + foco + '"]');
      if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) { /* tipo sin selección */ } }
    }
  }

  function mostrarToast(t) { S.toast = t; render(); setTimeout(function () { S.toast = ''; render(); }, 2400); }
  function cerrar() { S.dialogo = ''; S.dato = ''; S.error = ''; S.confirmar = ''; }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) { if (S.pop) { S.pop = ''; render(); } return; }
    var a = t.dataset.act;
    if (a === 'fondo') { if (e.target === t) { cerrar(); render(); } return; }
    if (a === 'ir') { e.preventDefault(); S.vista = t.dataset.v; if (t.dataset.id) S.id = t.dataset.id; S.estado = 'normal'; S.pop = ''; S.drawer = false; S.q = ''; render(); return; }
    if (a === 'drawer') { S.drawer = !S.drawer; render(); return; }
    if (a === 'ver') { var h = t.dataset.h, i = S.abiertos.indexOf(h); if (i >= 0) S.abiertos.splice(i, 1); else S.abiertos.push(h); render(); return; }
    if (a === 'limpiar') { S.actor = ''; S.tipo = ''; S.desde = ''; S.hasta = ''; render(); return; }
    if (a === 'cargar-mas') { S.fin = true; render(); return; }
    if (a === 'pop') { S.pop = S.pop === t.dataset.k ? '' : t.dataset.k; render(); return; }
    if (a === 'bajas') { S.bajas = !S.bajas; render(); return; }
    if (a === 'reintentar') { S.estado = 'normal'; render(); return; }
    if (a === 'cerrar') { cerrar(); render(); return; }
    if (a === 'abrir') {
      var d = t.dataset.d, x = t.dataset.x || '';
      if (d === 'quitar-acceso' && marca(S.id).activa && marca(S.id).duenos.length === 1 && S.vista === 'marca') d = 'ultimo-dueno';
      S.pop = ''; S.dialogo = d; S.dato = x; S.error = ''; S.confirmar = ''; render(); return;
    }
    if (a === 'guardar') {
      if (t.disabled) return;
      var sig = t.dataset.next;
      if (sig) { S.dialogo = sig; if (t.dataset.x) S.dato = t.dataset.x; render(); return; }
      cerrar(); mostrarToast('Listo. Así quedaría: el mockup no guarda nada.'); return;
    }
  });
  document.addEventListener('input', function (e) {
    var k = e.target.dataset && e.target.dataset.in;
    if (!k) return;
    S[k] = e.target.value;
    render();
  });
  document.addEventListener('change', function (e) {
    var k = e.target.dataset && e.target.dataset.sel;
    if (!k) return;
    S[k] = e.target.value;
    render();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (S.dialogo) cerrar(); else if (S.pop) S.pop = ''; else S.drawer = false; render(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.fila, .nav')) { e.preventDefault(); e.target.click(); }
  });

  render();
})();
