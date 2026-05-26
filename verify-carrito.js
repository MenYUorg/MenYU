const { chromium } = require('./apps/web-cliente/node_modules/playwright')

const BASE         = 'http://localhost:5179'
const JWT          = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkNTc0MmRjNS1mNTQ5LTQxNDYtOTgxOC1mMDk2MmIzMmE3M2YiLCJ0aXBvIjoiY2xpZW50ZSIsInNlc2lvbklkIjoiYTAyNmZiNDMtM2E1OS00ZTBiLTg5MWQtMDEwNWY1NjVjMDMyIiwibWVzYUlkIjoiZGZhZTdiYzUtMWUxYS00YTlkLWI1MWMtZGQ1Y2Y1MGU1NjNjIiwicmVzdGF1cmFudGVJZCI6ImYzYzU5ZTAyLWFmNmItNDY3ZS1hYTk3LTI5YjgyYjIwZjA3ZCIsImlhdCI6MTc3OTcyNDQxMiwiZXhwIjoxNzc5NzY3NjEyfQ.1skIQpELvGXNw_sx6LVrNZIFmPnHBZ5b9298OD-sgis'
const SESION_ID    = 'a026fb43-3a59-4e0b-891d-0105f565c032'
const MESA_ID      = 'dfae7bc5-1e1a-4a9d-b51c-dd5cf50e563c'
const RESTAURANTE  = 'f3c59e02-af6b-467e-aa97-29b82b20f07d'
const MARGARITA_ID = '84c2bdc5-f1e1-4e01-a746-45e32df72e84'  // base $10000, extra tequila +$5000
const YO_ID        = '1f0e0a8d-cba1-431d-8752-d403f9207370'  // base $6767, extras carne/jamon

async function run() {
  const log = []
  const orderRequests = []

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext()

  ctx.on('request', req => {
    if (req.url().includes('/orders') && req.method() === 'POST') {
      orderRequests.push({ url: req.url(), headers: req.headers(), body: req.postDataJSON() })
    }
  })

  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', e => consoleErrors.push(e.message))

  // ── 1. Inyectar sesión ────────────────────────────────────────────────────
  await page.goto(BASE + '/menu')
  await page.evaluate((s) => {
    sessionStorage.setItem('menyu_sesion_jwt', s.jwt)
    sessionStorage.setItem('menyu_sesion_id', s.sesionId)
    sessionStorage.setItem('menyu_mesa_id', s.mesaId)
    sessionStorage.setItem('menyu_restaurante_id', s.restauranteId)
    localStorage.removeItem('menyu_carrito')
  }, { jwt: JWT, sesionId: SESION_ID, mesaId: MESA_ID, restauranteId: RESTAURANTE })

  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'ss-01-menu.png' })
  const menuBody = await page.textContent('body')
  if (menuBody.includes('Margaritaaaaaaaa') || menuBody.includes('Milanesa')) {
    log.push('✅ 1. Menú cargado: ' + page.url())
  } else {
    log.push('❌ 1. Menú no cargó ítems. Body: ' + menuBody.slice(0, 150))
  }

  // ── 2. ItemDetail "Margaritaaaaaaaa" ─────────────────────────────────────
  await page.goto(BASE + '/menu/' + MARGARITA_ID)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'ss-02-margarita-detail.png' })
  const detailBody = await page.textContent('body')
  if (detailBody.includes('Margaritaaaaaaaa')) {
    log.push('✅ 2. ItemDetailPage muestra "Margaritaaaaaaaa"')
  } else {
    log.push('❌ 2. ItemDetailPage no muestra el ítem. URL: ' + page.url())
  }

  // ── 3. Extra "tequila" visible + precio ──────────────────────────────────
  const hasTequila = detailBody.toLowerCase().includes('tequila')
  const has10000   = detailBody.includes('10.000') || detailBody.includes('10,000') || detailBody.match(/\$\s*10\.?000/)
  log.push(`${hasTequila ? '✅' : '❌'} 3a. Extra "tequila" visible`)
  log.push(`${has10000 ? '✅' : '⚠️'} 3b. Precio base $10.000 visible`)

  // ── 4. Click "+" en tequila → precio tiempo real ─────────────────────────
  // buscar botón + cerca de "tequila"
  let priceAfterExtra = ''
  try {
    const tequilaRow = page.locator('*').filter({ hasText: /tequila/i }).last()
    const plusNearTequila = tequilaRow.locator('button').filter({ hasText: /^\+$/ })
    const plusCount = await plusNearTequila.count()
    if (plusCount > 0) {
      await plusNearTequila.first().click()
      await page.waitForTimeout(400)
      priceAfterExtra = await page.textContent('body')
      const has15000 = priceAfterExtra.includes('15.000') || priceAfterExtra.includes('15,000') || priceAfterExtra.match(/15\.?000/)
      log.push(`${has15000 ? '✅' : '⚠️'} 4. Precio actualizado a $15.000 tras agregar tequila (+$5.000)`)
      await page.screenshot({ path: 'ss-04-extra-added.png' })
    } else {
      // try generic "+" buttons
      const allPlus = page.locator('button').filter({ hasText: /^\+$/ })
      const allPlusCount = await allPlus.count()
      if (allPlusCount > 0) {
        await allPlus.first().click()
        await page.waitForTimeout(400)
        priceAfterExtra = await page.textContent('body')
        await page.screenshot({ path: 'ss-04-extra-added.png' })
        log.push(`⚠️ 4. Click en "+" genérico. Body snippet: ${priceAfterExtra.slice(-150)}`)
      } else {
        log.push('⚠️ 4. No se encontró botón "+" para agregar extra')
        await page.screenshot({ path: 'ss-04-no-plus.png' })
      }
    }
  } catch (e) {
    log.push('⚠️ 4. Error buscando extra: ' + e.message)
  }

  // ── 5. "Agregar al carrito" (primera vez, con tequila) ───────────────────
  try {
    const addBtn = page.locator('button').filter({ hasText: /agregar al carrito|agregar/i }).first()
    if (await addBtn.count() > 0) {
      const txt = await addBtn.textContent()
      log.push(`✅ 5. Botón "${txt.trim()}" encontrado`)
      await addBtn.click()
      await page.waitForTimeout(600)
      await page.screenshot({ path: 'ss-05-after-add1.png' })
      log.push('✅ 5. Click en "Agregar". URL actual: ' + page.url())
    } else {
      log.push('❌ 5. Botón "Agregar al carrito" no encontrado')
      await page.screenshot({ path: 'ss-05-no-add-btn.png' })
    }
  } catch (e) {
    log.push('❌ 5. Error: ' + e.message)
  }

  // ── 6. Botón flotante en /menu ────────────────────────────────────────────
  const currentUrl6 = page.url()
  if (currentUrl6.includes('/menu')) {
    await page.screenshot({ path: 'ss-06-menu-float.png' })
    const menuBody6 = await page.textContent('body')
    // buscar totales posibles: 10000, 15000
    const floatTotals = menuBody6.match(/\$[\d.,]+/g) ?? []
    log.push('✅ 6. Está en /menu. Totales encontrados en body: ' + floatTotals.join(', '))
  } else {
    log.push('⚠️ 6. No redirigió a /menu tras agregar. URL: ' + currentUrl6)
  }

  // ── 7. Mismo ítem "Margaritaaaaaaaa" SIN extras → segunda línea ───────────
  await page.goto(BASE + '/menu/' + MARGARITA_ID)
  await page.waitForLoadState('networkidle')
  // NO agregar tequila esta vez
  try {
    const addBtn7 = page.locator('button').filter({ hasText: /agregar al carrito|agregar/i }).first()
    if (await addBtn7.count() > 0) {
      await addBtn7.click()
      await page.waitForTimeout(500)
      log.push('✅ 7. Margaritaaaaaaaa SIN extras agregada (debería ser línea separada)')
    }
  } catch (e) {
    log.push('⚠️ 7. ' + e.message)
  }

  // ── 8. CarritoPage — dos líneas ───────────────────────────────────────────
  await page.goto(BASE + '/carrito')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'ss-08-carrito.png' })
  const carritoBody = await page.textContent('body')

  const margaritaLines = (carritoBody.match(/Margaritaaaaaaaa/gi) ?? []).length
  if (margaritaLines >= 2) {
    log.push(`✅ 8. CarritoPage muestra ${margaritaLines} líneas de "Margaritaaaaaaaa" (mods distintas → separadas)`)
  } else {
    log.push(`⚠️ 8. CarritoPage muestra ${margaritaLines} línea(s) de "Margaritaaaaaaaa". Esperadas: 2`)
  }

  // totales: linea1 = $15000 (con tequila), linea2 = $10000 (sin extras), total = $25000
  const has15k = carritoBody.includes('15.000') || carritoBody.includes('15,000')
  const has10k = carritoBody.includes('10.000') || carritoBody.includes('10,000')
  const has25k = carritoBody.includes('25.000') || carritoBody.includes('25,000')
  log.push(`${has15k ? '✅' : '⚠️'} 8. Línea con tequila ($15.000) visible`)
  log.push(`${has10k ? '✅' : '⚠️'} 8. Línea sin extras ($10.000) visible`)
  log.push(`${has25k ? '✅' : '⚠️'} 8. Total carrito ($25.000) visible`)

  const allPrices = carritoBody.match(/\$[\d.,]+/g) ?? []
  log.push('   Precios en carrito: ' + allPrices.join(', '))

  // ── 9. Confirmar pedido ───────────────────────────────────────────────────
  const confirmBtn = page.locator('button').filter({ hasText: /confirmar|hacer pedido|pedir/i }).first()
  if (await confirmBtn.count() > 0) {
    const cTxt = await confirmBtn.textContent()
    log.push(`✅ 9. Botón "${cTxt.trim()}" encontrado`)
    await confirmBtn.click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'ss-09-after-confirm.png' })
    const urlPost = page.url()
    log.push('9. URL post-confirmar: ' + urlPost)
    if (urlPost.includes('/pedidos') || urlPost.includes('/menu') || urlPost.includes('/confirmacion')) {
      log.push('✅ 9. Navegación post-pedido correcta')
    } else {
      log.push('⚠️ 9. URL post-pedido inesperada: ' + urlPost)
    }
  } else {
    log.push('❌ 9. Botón "Confirmar pedido" no encontrado. Snippet: ' + carritoBody.slice(0, 200))
    await page.screenshot({ path: 'ss-09-no-confirm.png' })
  }

  // ── 10. Verificar POST /orders ────────────────────────────────────────────
  if (orderRequests.length > 0) {
    const o = orderRequests[0]
    const auth = o.headers['authorization'] ?? '(missing)'
    log.push('✅ 10. POST /orders interceptado')
    log.push(`   Authorization: ${auth.startsWith('Bearer ') ? '✅ Bearer <jwt>' : '❌ ' + auth}`)
    if (o.body?.items) {
      log.push(`   Items en body: ${o.body.items.length}`)
      o.body.items.forEach((item, i) => {
        const mods = JSON.stringify(item.modificaciones ?? [])
        log.push(`   Item[${i}]: itemMenuId=${item.itemMenuId} cantidad=${item.cantidad} mods=${mods}`)
      })
    } else {
      log.push('   Body: ' + JSON.stringify(o.body).slice(0, 200))
    }
  } else {
    log.push('⚠️ 10. POST /orders no interceptado')
  }

  // ── Errores de consola ────────────────────────────────────────────────────
  if (consoleErrors.length > 0) {
    log.push(`⚠️ Errores de consola (${consoleErrors.length}):`)
    consoleErrors.slice(0, 8).forEach(e => log.push('   ' + e.slice(0, 200)))
  } else {
    log.push('✅ Sin errores de consola')
  }

  await browser.close()

  console.log('\n=== VERIFY RESULT ===')
  log.forEach(l => console.log(l))
}

run().catch(e => {
  console.error('Fatal:', e.message)
  process.exit(1)
})
