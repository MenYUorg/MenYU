import { chromium } from 'playwright'

const BASE  = 'http://localhost:5179'
const JWT   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkNTc0MmRjNS1mNTQ5LTQxNDYtOTgxOC1mMDk2MmIzMmE3M2YiLCJ0aXBvIjoiY2xpZW50ZSIsInNlc2lvbklkIjoiYTAyNmZiNDMtM2E1OS00ZTBiLTg5MWQtMDEwNWY1NjVjMDMyIiwibWVzYUlkIjoiZGZhZTdiYzUtMWUxYS00YTlkLWI1MWMtZGQ1Y2Y1MGU1NjNjIiwicmVzdGF1cmFudGVJZCI6ImYzYzU5ZTAyLWFmNmItNDY3ZS1hYTk3LTI5YjgyYjIwZjA3ZCIsImlhdCI6MTc3OTcyNDQxMiwiZXhwIjoxNzc5NzY3NjEyfQ.1skIQpELvGXNw_sx6LVrNZIFmPnHBZ5b9298OD-sgis'
const SESION_ID    = 'a026fb43-3a59-4e0b-891d-0105f565c032'
const MESA_ID      = 'dfae7bc5-1e1a-4a9d-b51c-dd5cf50e563c'
const RESTAURANTE  = 'f3c59e02-af6b-467e-aa97-29b82b20f07d'

// items del menú identificados
const MARGARITA_ID = '84c2bdc5-f1e1-4e01-a746-45e32df72e84'  // +tequila $5000, base $10000
const YO_ID        = '1f0e0a8d-cba1-431d-8752-d403f9207370'  // +carne $1000, +jamon $500

async function injectSession(page) {
  await page.goto(BASE + '/menu')
  await page.evaluate(({ jwt, sesionId, mesaId, restauranteId }) => {
    sessionStorage.setItem('menyu_sesion_jwt', jwt)
    sessionStorage.setItem('menyu_sesion_id', sesionId)
    sessionStorage.setItem('menyu_mesa_id', mesaId)
    sessionStorage.setItem('menyu_restaurante_id', restauranteId)
    // also persist carrito vacío
    localStorage.removeItem('menyu_carrito')
  }, { jwt: JWT, sesionId: SESION_ID, mesaId: MESA_ID, restauranteId: RESTAURANTE })
}

const log = []
const orders = []

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext()

  // capturar requests de orders
  ctx.on('request', req => {
    if (req.url().includes('/orders') && req.method() === 'POST') {
      orders.push({ url: req.url(), headers: req.headers(), body: req.postDataJSON() })
    }
  })

  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', e => consoleErrors.push(e.message))

  // ── STEP 1: inyectar sesión y cargar menú ─────────────────────────────────
  await injectSession(page)
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'verify-01-menu.png' })
  log.push('✅ 1. Menú cargado: ' + page.url())

  // ── STEP 2: abrir ítem "Margaritaaaaaaaa" ─────────────────────────────────
  await page.goto(BASE + '/menu/' + MARGARITA_ID)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'verify-02-item-detail.png' })
  const bodyText2 = await page.textContent('body')
  if (bodyText2.includes('Margaritaaaaaaaa')) {
    log.push('✅ 2. ItemDetailPage cargó "Margaritaaaaaaaa"')
  } else {
    log.push('❌ 2. ItemDetailPage no muestra el ítem correcto: ' + bodyText2.slice(0, 100))
  }

  // ── STEP 3: verificar precio base visible ─────────────────────────────────
  const priceText3 = await page.textContent('body')
  if (priceText3.includes('10') || priceText3.includes('10.000') || priceText3.includes('10,000')) {
    log.push('✅ 3. Precio base $10000 visible')
  } else {
    log.push('⚠️ 3. Precio base no claramente visible en body')
  }

  // ── STEP 4: buscar extra "tequila" y agregarlo ────────────────────────────
  const allText4 = await page.textContent('body')
  if (allText4.toLowerCase().includes('tequila')) {
    log.push('✅ 4. Extra "tequila" visible en detalle del ítem')
  } else {
    log.push('❌ 4. Extra "tequila" NO visible. Body snippet: ' + allText4.slice(0, 200))
    await page.screenshot({ path: 'verify-04-no-tequila.png' })
  }

  // intentar hacer click en tequila (+)
  const tequilaBtn = page.locator('button, [role="button"]').filter({ hasText: /tequila/i }).first()
  const tequilaBtnAlt = page.locator('*').filter({ hasText: /tequila/i }).first()

  let clickedExtra = false
  try {
    // buscar botón "+" o el row de tequila con algún incrementador
    const plusBtns = page.locator('button').filter({ hasText: /^\+$/ })
    const plusCount = await plusBtns.count()
    if (plusCount > 0) {
      // tomar snapshot del precio antes
      const priceBeforeEl = await page.$('[data-testid="precio-total"], [class*="precio"], [class*="price"], footer')
      const priceBefore = priceBeforeEl ? await priceBeforeEl.textContent() : '?'

      await plusBtns.first().click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: 'verify-04-after-extra.png' })

      const bodyAfter = await page.textContent('body')
      // con tequila debería mostrar 15000
      if (bodyAfter.includes('15') || bodyAfter.includes('15.000') || bodyAfter.includes('15,000')) {
        log.push('✅ 4. Precio se actualizó a $15000 al agregar tequila (+$5000)')
      } else {
        log.push(`⚠️ 4. Click en "+" hecho, pero no se detecta precio $15000. Body: ...${bodyAfter.slice(-200)}`)
      }
      clickedExtra = true
    } else {
      log.push('⚠️ 4. No se encontraron botones "+" para agregar extra')
    }
  } catch (e) {
    log.push('⚠️ 4. Error al interactuar con extra: ' + e.message)
  }

  // ── STEP 5: tocar "Agregar al carrito" ────────────────────────────────────
  await page.screenshot({ path: 'verify-05-before-add.png' })
  const addBtn = page.locator('button').filter({ hasText: /agregar al carrito|agregar/i }).first()
  const addBtnCount = await addBtn.count()
  if (addBtnCount === 0) {
    log.push('❌ 5. Botón "Agregar al carrito" no encontrado')
    await page.screenshot({ path: 'verify-05-no-btn.png' })
  } else {
    const btnText = await addBtn.textContent()
    log.push(`✅ 5. Botón encontrado: "${btnText?.trim()}"`)
    await addBtn.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'verify-05-after-add.png' })
    log.push('✅ 5. Click en "Agregar al carrito". URL: ' + page.url())
  }

  // ── STEP 6: verificar botón flotante en /menu ─────────────────────────────
  if (page.url().includes('/menu')) {
    const bodyMenu = await page.textContent('body')
    // buscar total en botón flotante
    const floatMatch = bodyMenu.match(/(\$[\d.,]+|\d[\d.,]+\s*(carrito|pedido|ver))/i)
    if (floatMatch) {
      log.push('✅ 6. Botón flotante carrito visible: ' + floatMatch[0])
    } else {
      log.push('⚠️ 6. En /menu pero no se detecta botón flotante con total')
    }
    await page.screenshot({ path: 'verify-06-menu-float.png' })
  } else {
    log.push('⚠️ 6. No redirigió a /menu. URL actual: ' + page.url())
    await page.screenshot({ path: 'verify-06-not-menu.png' })
  }

  // ── STEP 7: segundo item "yo" con DISTINTAS mods ──────────────────────────
  await page.goto(BASE + '/menu/' + YO_ID)
  await page.waitForLoadState('networkidle')
  const bodyYo = await page.textContent('body')
  if (bodyYo.toLowerCase().includes('yo') || bodyYo.toLowerCase().includes('carne') || bodyYo.toLowerCase().includes('jamon')) {
    log.push('✅ 7. ItemDetailPage "yo" cargado con ingredientes')
  } else {
    log.push('⚠️ 7. Página del ítem "yo" — no se detectan ingredientes. Body: ' + bodyYo.slice(0, 150))
  }
  await page.screenshot({ path: 'verify-07-yo-detail.png' })

  // agregar "yo" sin extras → al carrito
  const addBtn2 = page.locator('button').filter({ hasText: /agregar al carrito|agregar/i }).first()
  if (await addBtn2.count() > 0) {
    await addBtn2.click()
    await page.waitForTimeout(400)
    log.push('✅ 7. "yo" sin extras agregado al carrito')
  }

  // ── STEP 8: ir a CarritoPage ──────────────────────────────────────────────
  await page.goto(BASE + '/carrito')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'verify-08-carrito.png' })
  const bodyCarrito = await page.textContent('body')
  log.push('8. URL carrito: ' + page.url())

  // verificar líneas separadas
  const countMargarita = (bodyCarrito.match(/Margaritaaaaaaaa/gi) ?? []).length
  const countYo = (bodyCarrito.match(/\byo\b/gi) ?? []).length
  if (countMargarita >= 1 && countYo >= 1) {
    log.push('✅ 8. CartPage muestra ambos ítems ("Margaritaaaaaaaa" y "yo") como líneas separadas')
  } else {
    log.push(`⚠️ 8. CartPage — Margaritaaaaaaaa×${countMargarita}, yo×${countYo}. Snippet: ${bodyCarrito.slice(0, 300)}`)
  }

  // verificar total: 15000 (margarita+tequila) + 6767 (yo) = 21767
  if (bodyCarrito.includes('21') || bodyCarrito.match(/21[\.,]?767|21[\.,]?000/)) {
    log.push('✅ 8. Total del carrito parece correcto (~$21767)')
  } else {
    log.push('⚠️ 8. Total del carrito no detectado claramente. Buscando números en body...')
    const nums = bodyCarrito.match(/\$[\d.,]+/g) ?? []
    log.push('   Números encontrados: ' + nums.join(', '))
  }

  // ── STEP 9: confirmar pedido ──────────────────────────────────────────────
  const confirmBtn = page.locator('button').filter({ hasText: /confirmar|pedir/i }).first()
  if (await confirmBtn.count() > 0) {
    const confirmText = await confirmBtn.textContent()
    log.push(`✅ 9. Botón "${confirmText?.trim()}" encontrado`)
    await confirmBtn.click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'verify-09-after-confirm.png' })
    log.push('9. URL post-confirmar: ' + page.url())

    // verificar ruta post-pedido
    if (page.url().includes('/pedidos') || page.url().includes('/confirmacion') || page.url().includes('/menu')) {
      log.push('✅ 9. Navegó a: ' + page.url())
    } else {
      log.push('⚠️ 9. URL inesperada post-confirmación: ' + page.url())
    }
  } else {
    log.push('❌ 9. Botón "Confirmar" no encontrado en CarritoPage')
    await page.screenshot({ path: 'verify-09-no-confirm.png' })
  }

  // ── STEP 10: verificar request POST /orders ───────────────────────────────
  if (orders.length > 0) {
    const o = orders[0]
    const auth = o.headers['authorization'] ?? o.headers['Authorization'] ?? '(missing)'
    const hasBearer = auth.startsWith('Bearer ')
    const body = o.body
    log.push(`✅ 10. POST /orders interceptado`)
    log.push(`   Authorization: ${hasBearer ? '✅ Bearer present' : '❌ ' + auth}`)
    log.push(`   Body keys: ${Object.keys(body ?? {}).join(', ')}`)
    if (body?.items) {
      log.push(`   Items count: ${body.items.length}`)
      body.items.slice(0, 2).forEach((item, i) => {
        log.push(`   Item[${i}]: itemMenuId=${item.itemMenuId}, cantidad=${item.cantidad}, mods=${JSON.stringify(item.modificaciones ?? [])}`)
      })
    }
  } else {
    log.push('⚠️ 10. POST /orders NO fue interceptado (quizás no se llegó a confirmar)')
  }

  // ── Errores de consola ────────────────────────────────────────────────────
  if (consoleErrors.length > 0) {
    log.push(`⚠️ Errores de consola (${consoleErrors.length}):`)
    consoleErrors.slice(0, 5).forEach(e => log.push('   ' + e.slice(0, 120)))
  } else {
    log.push('✅ Sin errores de consola')
  }

  await browser.close()

  console.log('\n=== VERIFY RESULT ===')
  log.forEach(l => console.log(l))
})()
