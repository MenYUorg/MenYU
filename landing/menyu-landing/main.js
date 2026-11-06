/* ============================================================
   MenYU — Landing
   Regla del DESIGN.md: con prefers-reduced-motion la página salta
   al estado final y sigue contando la historia completa. Por eso
   cada secuencia de acá tiene un "estado final" explícito y
   ninguna aporta información que el HTML no tenga ya.
   ============================================================ */

(function () {
  'use strict';

  var quieto = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- navegación pegada ---------- */

  var nav = document.getElementById('nav');
  if (nav) {
    var marcarNav = function () {
      nav.dataset.pegada = window.scrollY > 80 ? 'true' : 'false';
    };
    marcarNav();
    window.addEventListener('scroll', marcarNav, { passive: true });
  }

  /* ---------- entradas al viewport ---------- */

  function alEntrar(elementos, alVerse, unaVez) {
    if (!elementos.length) return;

    if (quieto.matches || !('IntersectionObserver' in window)) {
      elementos.forEach(function (el) { alVerse(el, true); });
      return;
    }

    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (!entrada.isIntersecting) return;
        alVerse(entrada.target, false);
        if (unaVez !== false) observador.unobserve(entrada.target);
      });
    }, { threshold: 0.35, rootMargin: '0px 0px -8% 0px' });

    elementos.forEach(function (el) { observador.observe(el); });
  }

  /* las cuatro esperas se tachan en cascada al entrar */
  var esperas = Array.prototype.slice.call(document.querySelectorAll('.espera'));
  alEntrar(esperas, function (el, inmediato) {
    var retraso = inmediato ? 0 : esperas.indexOf(el) % 4 * 110;
    setTimeout(function () { el.dataset.visible = 'true'; }, retraso);
  });

  var entradas = Array.prototype.slice.call(document.querySelectorAll('.entra'));
  alEntrar(entradas, function (el) { el.dataset.visible = 'true'; });

  /* ---------- secuencia del hero ---------- */

  var panel = document.getElementById('panel-vivo');
  var cronometro = document.getElementById('cronometro');
  var pasos = Array.prototype.slice.call(document.querySelectorAll('#flujo .paso'));

  // Segundo en que se marca cada paso. No son promesas de rendimiento:
  // es el ritmo de una mesa cualquiera, y por eso no aparece como dato en el copy.
  var MARCAS = [3, 54, 56, 1847];
  var TOPE = 1920;

  function formato(segundos) {
    var m = Math.floor(segundos / 60);
    var s = Math.floor(segundos % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function estadoFinalHero() {
    pasos.forEach(function (p) { p.dataset.estado = 'hecho'; });
    if (cronometro) cronometro.textContent = formato(MARCAS[MARCAS.length - 1]);
  }

  if (pasos.length && panel) {
    if (quieto.matches) {
      estadoFinalHero();
    } else {
      var reloj = null;
      var inicio = 0;
      var corriendo = false;

      var avanzar = function (ahora) {
        var t = (ahora - inicio) / 1000 * 46; // el tiempo de mesa corre comprimido
        if (t > TOPE) t = 0, inicio = ahora;

        if (cronometro) cronometro.textContent = formato(t);

        pasos.forEach(function (paso, i) {
          var marca = MARCAS[i];
          var siguiente = MARCAS[i + 1];
          if (t >= marca && (siguiente === undefined || t < siguiente)) paso.dataset.estado = 'activo';
          else if (t >= marca) paso.dataset.estado = 'hecho';
          else paso.dataset.estado = 'espera';
        });

        reloj = window.requestAnimationFrame(avanzar);
      };

      var arrancar = function () {
        if (corriendo) return;
        corriendo = true;
        inicio = performance.now();
        reloj = window.requestAnimationFrame(avanzar);
      };
      var frenar = function () {
        corriendo = false;
        if (reloj) window.cancelAnimationFrame(reloj);
      };

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
          es.forEach(function (e) { e.isIntersecting ? arrancar() : frenar(); });
        }, { threshold: 0.2 }).observe(panel);
      } else {
        arrancar();
      }

      // No seguir animando en una pestaña que nadie mira.
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) frenar();
        else if (panel.getBoundingClientRect().top < window.innerHeight) arrancar();
      });
    }
  }

  /* ---------- comanda: el ciclo real de estados ---------- */

  var comanda = document.getElementById('comanda');
  var chapa = document.getElementById('estado-comanda');
  var horaEstado = document.getElementById('estado-hora');

  var ESTADOS = [
    { clave: 'PENDIENTE',      texto: 'Pendiente',       espera: 2600 },
    { clave: 'EN_PREPARACION', texto: 'En preparación',  espera: 4200 },
    { clave: 'LISTO',          texto: 'Listo',           espera: 3000 },
    { clave: 'ENTREGADO',      texto: 'Entregado',       espera: 3600 }
  ];

  if (comanda && chapa) {
    if (quieto.matches) {
      // Estado final: el pedido completó su ciclo.
      chapa.dataset.estado = 'ENTREGADO';
      chapa.textContent = 'Entregado';
      if (horaEstado) horaEstado.textContent = 'hace 31 min';
      var avisoQuieto = document.getElementById('aviso-mozo');
      if (avisoQuieto) avisoQuieto.dataset.visible = 'true';
    } else {
      var indice = 0;
      var tiempo = null;
      var desde = Date.now();

      var pintar = function () {
        var e = ESTADOS[indice];
        chapa.dataset.estado = e.clave;
        chapa.textContent = e.texto;
        desde = Date.now();
        tiempo = setTimeout(function () {
          indice = (indice + 1) % ESTADOS.length;
          pintar();
        }, e.espera);
      };

      var contarDesde = setInterval(function () {
        if (!horaEstado) return;
        var s = Math.floor((Date.now() - desde) / 1000);
        horaEstado.textContent = 'hace ' + s + ' s';
      }, 1000);

      var arrancarComanda = function () {
        if (tiempo) return;
        pintar();
      };
      var frenarComanda = function () {
        clearTimeout(tiempo);
        tiempo = null;
      };

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
          es.forEach(function (e) { e.isIntersecting ? arrancarComanda() : frenarComanda(); });
        }, { threshold: 0.3 }).observe(comanda);
      } else {
        arrancarComanda();
      }

      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { frenarComanda(); clearInterval(contarDesde); }
      });

      /* el llamado al mozo aparece una vez, mientras el pedido se prepara */
      var aviso = document.getElementById('aviso-mozo');
      if (aviso) {
        alEntrar([aviso], function (el) {
          setTimeout(function () { el.dataset.visible = 'true'; }, 2200);
        });
      }
    }
  }

  /* ---------- formulario ----------

     ÚNICA LÍNEA A CONFIGURAR ANTES DE PUBLICAR: DESTINO.

       Web3Forms   'https://api.web3forms.com/submit'  (y completar CLAVE_WEB3FORMS)
       Propio      '/api/contacto'                     (dejar CLAVE_WEB3FORMS vacía)

     Mientras DESTINO esté vacío el formulario avisa que todavía no está
     conectado, en vez de fingir que el mensaje llegó. */

  var DESTINO = 'https://api.web3forms.com/submit';
  var CLAVE_WEB3FORMS = '0a2aba6a-8cea-4607-b6b9-645c2d9d9b0f';

  var form = document.getElementById('form-contacto');
  var boton = document.getElementById('form-enviar');
  var error = document.getElementById('form-error');
  var listo = document.getElementById('form-listo');

  function mostrarError(texto) {
    if (!error) return;
    error.textContent = texto;
    error.hidden = false;
  }

  function limpiarError() {
    if (!error) return;
    error.hidden = true;
    error.textContent = '';
  }

  if (form && boton) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      limpiarError();

      // Un bot completó el campo oculto: no mandamos nada y no lo decimos.
      var trampa = form.querySelector('[name="apellido-2"]');
      if (trampa && trampa.value) return;

      // La validación nativa se muestra recién al intentar enviar.
      form.dataset.intentado = 'true';
      if (!form.checkValidity()) {
        var primero = form.querySelector('.campo :invalid');
        if (primero) primero.focus();
        mostrarError('Revisá los campos marcados: falta completar algo o el email no tiene un formato válido.');
        return;
      }

      if (!DESTINO) {
        mostrarError('El formulario todavía no está conectado. Escribinos mientras tanto a hola@menyu-app.com.');
        return;
      }

      var datos = {};
      new FormData(form).forEach(function (valor, clave) {
        if (clave !== 'apellido-2') datos[clave] = valor;
      });
      if (CLAVE_WEB3FORMS) {
        datos.access_key = CLAVE_WEB3FORMS;
        datos.subject = 'MenYU — nueva consulta de ' + (datos.restaurante || 'un restaurante');
        datos.from_name = 'Landing de MenYU';
      }

      boton.disabled = true;
      boton.dataset.enviando = 'true';
      var textoOriginal = boton.textContent;
      boton.textContent = 'Enviando…';

      var reponer = function () {
        boton.disabled = false;
        delete boton.dataset.enviando;
        boton.textContent = textoOriginal;
      };

      fetch(DESTINO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(datos)
      })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          form.hidden = true;
          if (listo) {
            listo.hidden = false;
            listo.setAttribute('tabindex', '-1');
            listo.focus();
          }
        })
        .catch(function () {
          reponer();
          mostrarError('No pudimos enviar el mensaje. Probá de nuevo en un momento, o escribinos a hola@menyu-app.com.');
        });
    });

    // Al corregir un campo marcado, el aviso general se va.
    form.addEventListener('input', function () {
      if (!error || error.hidden) return;
      if (form.checkValidity()) limpiarError();
    });
  }

})();
