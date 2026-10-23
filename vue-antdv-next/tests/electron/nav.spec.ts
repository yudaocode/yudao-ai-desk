/* 新导航外壳（P3）：真实应用 / IPC / SQLite / utilityProcess，本地 OpenAI 协议服务器仅替代模型端点。 */
import { test, expect, _electron, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
let application: ElectronApplication, page: Page, server: Server, directory: string, root: string, projectId: string, projectPath: string, providerId: string
const errors: string[] = []
/* SSE：TEST_SLOW 首段后延迟收尾；TOOL:/DELAY_TOOL: 返回真实 tool_calls（DELAY_ 先等待，留出切页时间） */
function startServer(): Promise<string> {
  server = createServer(async (request, response) => {
    if (request.url === '/v1/models') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ data: [{ id: 'fixture-model' }] })); return }
    let raw = ''; for await (const chunk of request) raw += chunk
    const body = JSON.parse(raw || '{}')
    const messages = body.messages ?? [], last = messages[messages.length - 1], userContent = [...messages].reverse().find((item) => item.role === 'user')?.content ?? ''
    const user = String(typeof userContent === 'string' ? userContent : userContent.map((part) => part.text ?? '').join(''))
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    const chunk = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: 'chatcmpl-nav', object: 'chat.completion.chunk', created: 1, model: 'fixture-model', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    chunk({ role: 'assistant' })
    const tool = /^(DELAY_)?TOOL:([^:]+):([\s\S]+)$/.exec(user)
    if (last?.role !== 'tool' && tool) {
      if (tool[1]) await new Promise((resolve) => setTimeout(resolve, 1500))
      chunk({ tool_calls: [{ index: 0, id: 'nav-call-' + Date.now(), type: 'function', function: { name: tool[2], arguments: tool[3] } }] }); chunk({}, 'tool_calls')
    } else {
      const content = last?.role === 'tool' ? `## Tool completed\n${typeof last.content === 'string' ? last.content : JSON.stringify(last.content)}` : '## Nav response\n**streamed answer**'
      if (user.includes('TEST_SLOW')) { chunk({ content: 'SLOW_FIRST\n' }); await new Promise((resolve) => setTimeout(resolve, 1800)) }
      if (!response.destroyed) { chunk({ content }); chunk({}, 'stop') }
    }
    if (!response.destroyed) response.end('data: [DONE]\n\n')
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}/v1`)))
}
test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'yudao-nav-vue-')); root = join(directory, 'project'); mkdirSync(root)
  writeFileSync(join(root, 'read.txt'), 'nav input\n'); writeFileSync(join(directory, 'outside.txt'), 'outside secret')
  const baseUrl = await startServer()
  const env = { ...process.env, DESK_TEST_DATA_DIR: join(directory, 'data'), DESK_TEST_PROJECT_DIR: root }; delete env.ELECTRON_RUN_AS_NODE
  application = await _electron.launch({ args: [resolve('tests/fixtures/main.cjs')], env })
  page = await application.firstWindow(); page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.locator('.desk-shell')).toBeVisible()
  const ids = await page.evaluate(async (baseUrl) => {
    const provider = await window.desk.provider.save({ name: 'Nav Provider', baseUrl, apiKey: 'nav-key', enabled: true, models: ['fixture-model'] })
    const project = await window.desk.project.create(); if (!project) throw new Error('No project')
    await window.desk.settings.save({ providerId: provider.id, modelId: 'fixture-model', updateAutoCheck: false })
    return { providerId: provider.id, projectId: project.id, projectPath: project.path }
  }, baseUrl)
  providerId = ids.providerId; projectId = ids.projectId; projectPath = ids.projectPath; await page.reload(); await expect(page.locator('.desk-shell')).toBeVisible()
})
test.afterAll(async () => { await application?.close(); await new Promise<void>((resolve) => server?.close(() => resolve())); if (directory) rmSync(directory, { recursive: true, force: true }) })

const rail = (title: string): Locator => page.locator(`.sidebar-rail .rail-btn[title="${title}"]`)
const menuItem = (label: string): Locator => page.locator('.sidebar-panel .menu-item').filter({ hasText: new RegExp(`^${label}$`) })
const back = (): Locator => page.locator('.nav-controls button[title="后退"]')
const forward = (): Locator => page.locator('.nav-controls button[title="前进"]')
const route = (): Promise<string> => page.evaluate(() => location.hash.slice(1) || '/')
const width = (selector: string): Promise<number> => page.locator(selector).evaluate((el) => Math.round(el.getBoundingClientRect().width))
async function expectRoute(path: string): Promise<void> { await expect.poll(route).toBe(path) }
async function newSession(title: string): Promise<string> {
  const id = await page.evaluate(async (input) => (await window.desk.session.create(input)).id, { projectId, providerId, modelId: 'fixture-model', title, mode: 'build' as const })
  await page.reload(); await expect(page.locator('.desk-shell')).toBeVisible(); await rail('首页').click()
  await (await sessionItem(title)).click(); await expect(page.locator('.desk-topbar .chat-title')).toHaveText(title)
  return id
}
/* 首页面板随路由重新挂载，项目树可能折叠（与上游一致）：按界面实际状态展开会话所属项目，再定位会话 */
async function sessionItem(title: string): Promise<Locator> {
  const item = page.locator('.session-item').filter({ hasText: title })
  await expect(async () => {
    if (!(await item.isVisible())) await page.locator('.project-item').getByTitle(projectPath, { exact: true }).click()
    await expect(item).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15000 })
  return item
}
async function send(text: string): Promise<void> { await page.locator('.composer textarea').fill(text); await page.locator('.composer textarea').press('Enter') }
/* 拖拽手柄到指定横坐标（真实鼠标事件，经 window mousemove/mouseup） */
async function dragTo(handle: Locator, x: number): Promise<void> {
  const box = (await handle.boundingBox())!
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y); await page.mouse.down(); await page.mouse.move(x, y, { steps: 6 }); await page.mouse.up()
}

test('V09 后退/前进：重复点击不入栈，后退→刷新→前进仍可用，新跳转截断前进', async () => {
  await expectRoute('/')
  await expect(back()).toBeDisabled(); await expect(forward()).toBeDisabled()
  await rail('系统设置').click(); await expectRoute('/settings'); await expect(back()).toBeEnabled(); await expect(forward()).toBeDisabled()
  /* 同一入口 / 同一子菜单重复点击：不新增历史 */
  await rail('系统设置').click(); await rail('系统设置').click(); await menuItem('常规').click(); await menuItem('常规').click()
  await rail('插件').click(); await expectRoute('/plugin/mcp')
  await menuItem('MCP插件').click(); await menuItem('MCP插件').click()
  await menuItem('SKILL技能').click(); await expectRoute('/plugin/skill')
  await back().click(); await expectRoute('/plugin/mcp')
  await back().click(); await expectRoute('/settings')
  await back().click(); await expectRoute('/')
  await expect(back()).toBeDisabled(); await expect(forward()).toBeEnabled()
  await forward().click(); await expectRoute('/settings')
  await forward().click(); await expectRoute('/plugin/mcp')
  await back().click(); await expectRoute('/settings')
  /* 刷新后历史条目仍在：后退/前进均可用，前进回到插件页 */
  await page.reload(); await expect(page.locator('.settings-page')).toBeVisible()
  await expect(back()).toBeEnabled(); await expect(forward()).toBeEnabled()
  await forward().click(); await expectRoute('/plugin/mcp'); await expect(page.locator('.plugin-page')).toBeVisible()
  await expect(forward()).toBeEnabled()
  await forward().click(); await expectRoute('/plugin/skill'); await expect(forward()).toBeDisabled()
  /* 后退后跳转新页面：前进历史被截断 */
  await back().click(); await expectRoute('/plugin/mcp')
  await rail('首页').click(); await expectRoute('/'); await expect(forward()).toBeDisabled()
  /* 首页重复入口（图标栏首页 / 新建对话）不入栈：一次后退即回插件页 */
  await rail('首页').click(); await page.locator('.new-btn').click(); await page.locator('.new-btn').click(); await rail('首页').click()
  await back().click(); await expectRoute('/plugin/mcp')
  await rail('首页').click(); await expectRoute('/')
  expect(errors).toEqual([])
})

test('V08 图标栏高亮与展开，插件 MCP/SKILL 占位页与子菜单', async () => {
  await rail('首页').click(); await expectRoute('/')
  await expect(rail('首页')).toHaveClass(/active/); await expect(page.locator('.sidebar-rail .rail-btn.active')).toHaveCount(1)
  /* 折叠后仅保留图标栏；点击图标栏入口时展开子菜单栏 */
  await page.locator('.nav-controls button[title="收起侧栏"]').click()
  await expect(page.locator('.sidebar-panel')).toBeHidden(); await expect.poll(() => width('.desk-sidebar')).toBe(44)
  await rail('插件').click(); await expectRoute('/plugin/mcp')
  await expect(page.locator('.sidebar-panel')).toBeVisible(); await expect(page.locator('.nav-controls button[title="收起侧栏"]')).toBeVisible()
  await expect(rail('插件')).toHaveClass(/active/); await expect(rail('首页')).not.toHaveClass(/active/)
  await expect(page.locator('.desk-topbar .topbar-title')).toHaveText('插件'); await expect(page.locator('.desk-topbar-actions')).toHaveCount(0)
  await expect(page.locator('.sidebar-panel .panel-title')).toHaveText('插件')
  await expect(page.locator('.sidebar-panel .menu-item')).toHaveText(['MCP插件', 'SKILL技能'])
  await expect(page.locator('.sidebar-panel .menu-item .menu-icon svg')).toHaveCount(2)
  await expect(menuItem('MCP插件')).toHaveClass(/active/); await expect(menuItem('MCP插件')).toHaveCSS('font-weight', '600')
  await expect(page.locator('.plugin-page .plugin-name')).toHaveText('MCP插件'); await expect(page.locator('.plugin-page .plugin-wip')).toHaveText('功能建设中，敬请期待！')
  /* 占位页不提供任何可执行入口 */
  await expect(page.locator('.plugin-page').locator('button, input, textarea, a')).toHaveCount(0)
  await expect(page.locator('.chat-page')).toHaveCount(0)
  await menuItem('SKILL技能').click(); await expectRoute('/plugin/skill')
  await expect(menuItem('SKILL技能')).toHaveClass(/active/); await expect(page.locator('.plugin-page .plugin-name')).toHaveText('SKILL技能')
  /* 同板块折叠后再点入口：只展开，不跳转 */
  await page.locator('.nav-controls button[title="收起侧栏"]').click(); await expect(page.locator('.sidebar-panel')).toBeHidden()
  await rail('插件').click(); await expect(page.locator('.sidebar-panel')).toBeVisible(); await expectRoute('/plugin/skill')
  await rail('首页').click(); await expect(page.locator('.chat-page')).toBeVisible(); await expect(page.locator('.new-btn')).toBeVisible()
})

test('V12 系统设置子菜单：分类切换、隐藏 Tabs 头、上次分类、深链与快捷键', async () => {
  await page.reload(); await expect(page.locator('.desk-shell')).toBeVisible(); await rail('首页').click()
  await rail('系统设置').click(); await expectRoute('/settings'); await expect(page.locator('.settings-page')).toBeVisible()
  await expect(page.locator('.desk-topbar .topbar-title')).toHaveText('系统设置'); await expect(page.locator('.sidebar-panel .panel-title')).toHaveText('系统设置')
  await expect(page.locator('.sidebar-panel .menu-item')).toHaveText(['常规', '个性化', '模型供应商', '关于我们'])
  await expect(page.locator('.sidebar-panel .menu-item .menu-icon svg')).toHaveCount(4)
  await expect(menuItem('常规')).toHaveClass(/active/); await expect(menuItem('常规')).toHaveCSS('font-weight', '400')
  /* 设置页内 Tabs 头部隐藏、无返回按钮 */
  await expect(page.locator('.settings-page .ant-tabs-nav')).toBeHidden()
  await expect(page.getByRole('button', { name: '返回对话' })).toHaveCount(0)
  await menuItem('模型供应商').click(); await expect(menuItem('模型供应商')).toHaveClass(/active/); await expect(page.locator('.provider-toolbar')).toBeVisible(); await expectRoute('/settings')
  await menuItem('关于我们').click(); await expect(page.locator('.about-link').first()).toBeVisible(); await expect(page.locator('.provider-toolbar')).toBeHidden()
  /* 离开再回到系统设置：保留上次分类（仅界面状态，不写入设置） */
  await rail('首页').click(); await rail('系统设置').click(); await expect(menuItem('关于我们')).toHaveClass(/active/); await expect(page.locator('.about-link').first()).toBeVisible()
  expect(await page.evaluate(async () => Object.keys(await window.desk.settings.get()))).not.toContain('activeTab')
  /* 深链：对话页模型选择器「+添加供应商」直达供应商分类 */
  await rail('首页').click(); await page.locator('.new-btn').click()
  await page.locator('.composer .picker-trigger').filter({ hasText: 'fixture-model' }).click()
  await page.getByRole('menuitem', { name: '+ 添加供应商' }).click()
  await expectRoute('/settings?tab=providers'); await expect(menuItem('模型供应商')).toHaveClass(/active/); await expect(page.locator('.provider-toolbar')).toBeVisible()
  /* 已在设置页时切分类只改选中项，不改路由 */
  await menuItem('常规').click(); await expect(menuItem('常规')).toHaveClass(/active/); await expectRoute('/settings?tab=providers')
  /* 快捷键：首页按设置快捷键进入系统设置；在设置页重复按不新增历史 */
  await rail('首页').click(); await expectRoute('/')
  await page.locator('.chat-page').click({ position: { x: 5, y: 5 } }); await page.keyboard.press('ControlOrMeta+s')
  await expectRoute('/settings'); await expect(rail('系统设置')).toHaveClass(/active/); await expect(page.locator('.settings-page')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+s'); await expectRoute('/settings')
  await back().click(); await expectRoute('/')
})

test('V13 顶栏标题随会话变化，重命名与删除走顶栏菜单，删除当前后定位剩余会话', async () => {
  const keep = await newSession('Topbar Keep')
  const id = await newSession('Topbar Session')
  await expect(page.locator('.desk-topbar .topbar-sep')).toBeVisible()
  await expect(page.locator('.desk-topbar-actions .sidebar-toggle')).toHaveCount(2)
  await expect(page.locator('.chat-page .chat-header')).toHaveCount(0)
  await page.locator('.desk-topbar .chat-title-wrap').hover(); await page.locator('.desk-topbar .chat-title-more').click()
  await expect(page.locator('.chat-title-dropdown [role="separator"]')).toHaveCount(1)
  await page.getByRole('menuitem', { name: '重命名会话' }).click()
  await page.getByRole('dialog').locator('input').fill('Renamed Topbar'); await page.getByRole('dialog').getByRole('button', { name: /^确\s*定$/ }).click()
  await expect(page.locator('.desk-topbar .chat-title')).toHaveText('Renamed Topbar')
  await expect(page.locator('.session-item').filter({ hasText: 'Renamed Topbar' })).toBeVisible()
  await expect.poll(async () => (await page.evaluate(() => window.desk.session.list())).find((item) => item.id === id)?.title).toBe('Renamed Topbar')
  await page.locator('.desk-topbar .chat-title-wrap').hover(); await page.locator('.desk-topbar .chat-title-more').click()
  await page.getByRole('menuitem', { name: '删除会话' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^删\s*除$/ }).click()
  await expect.poll(async () => (await page.evaluate(() => window.desk.session.list())).some((item) => item.id === id)).toBe(false)
  await expect(page.locator('.session-item').filter({ hasText: 'Renamed Topbar' })).toHaveCount(0)
  await expect(page.locator('.desk-topbar .chat-title')).not.toHaveText('Renamed Topbar')
  /* 删除当前会话后定位到剩余会话：顶栏标题、侧栏选中项与数据库一致 */
  await expect(page.locator('.desk-topbar .chat-title')).toHaveText('Topbar Keep')
  await expect(page.locator('.session-item.active .session-title')).toHaveText('Topbar Keep')
  expect((await page.evaluate(() => window.desk.session.list())).filter((item) => item.projectId === projectId).map((item) => ({ id: item.id, title: item.title }))).toEqual([{ id: keep, title: 'Topbar Keep' }])
  /* 选中的确是剩余会话：从界面发送，消息写入该会话 ID */
  await send('TEST_AFTER_DELETE')
  await expect.poll(async () => (await page.evaluate((id) => window.desk.session.messages(id), keep)).map((item) => item.role), { timeout: 20000 }).toEqual(['user', 'assistant'])
  await expect(page.locator('.message.assistant').last()).toContainText('streamed answer'); await expect(page.locator('.generating')).toHaveCount(0)
  /* 新建对话：标题回落「新对话」，无会话操作入口 */
  await page.locator('.new-btn').click(); await expect(page.locator('.desk-topbar .chat-title')).toHaveText('新对话'); await expect(page.locator('.desk-topbar .chat-title-more')).toHaveCount(0)
})

test('V11 左右面板宽度：拖拽、上下限、刷新保留、双击恢复默认', async () => {
  await rail('首页').click(); await expectRoute('/')
  const resizer = page.locator('.sidebar-resizer')
  await resizer.dblclick(); await expect.poll(() => width('.desk-sidebar')).toBe(44 + 240)
  expect(await page.evaluate(() => localStorage.getItem('desk-panel-width'))).toBe('240')
  const start = (await resizer.boundingBox())!
  await dragTo(resizer, start.x + start.width / 2 + 100); await expect.poll(() => width('.desk-sidebar')).toBe(44 + 340)
  expect(await page.evaluate(() => localStorage.getItem('desk-panel-width'))).toBe('340')
  await dragTo(resizer, 1100); await expect.poll(() => width('.desk-sidebar')).toBe(44 + 520)
  await dragTo(resizer, 10); await expect.poll(() => width('.desk-sidebar')).toBe(44 + 180)
  expect(await page.evaluate(() => localStorage.getItem('desk-panel-width'))).toBe('180')
  await expect(page.locator('body')).not.toHaveClass(/resizing/)
  /* 三个板块共用同一子菜单宽度 */
  await rail('系统设置').click(); await expect.poll(() => width('.desk-sidebar')).toBe(44 + 180); await rail('首页').click()
  await page.reload(); await expect(page.locator('.desk-shell')).toBeVisible(); await expect.poll(() => width('.desk-sidebar')).toBe(44 + 180)
  await resizer.dblclick(); await expect.poll(() => width('.desk-sidebar')).toBe(44 + 240)
  expect(await page.evaluate(() => localStorage.getItem('desk-panel-width'))).toBe('240')

  await page.locator('.desk-topbar-actions button[title="显示工具"]').click()
  const right = page.locator('.side-panel-resizer')
  await expect(right).toBeVisible(); await right.dblclick(); await expect.poll(() => width('.chat-side-panel')).toBe(320)
  const rightStart = (await right.boundingBox())!
  await dragTo(right, rightStart.x + rightStart.width / 2 - 100); await expect.poll(() => width('.chat-side-panel')).toBe(420)
  expect(await page.evaluate(() => localStorage.getItem('desk-right-panel-width'))).toBe('420')
  /* 拖拽中鼠标移出手柄命中区仍保持高亮（body.resizing），松开后清理；参考色为同一手柄悬停时的实际 primary-soft */
  const rightBackground = (): Promise<string> => right.evaluate((element) => getComputedStyle(element).backgroundColor)
  const rightTransparent = async (): Promise<boolean> => ['transparent', 'rgba(0, 0, 0, 0)'].includes(await rightBackground())
  const rightHovered = (): Promise<boolean> => right.evaluate((element) => element.matches(':hover'))
  await right.hover(); await expect.poll(rightTransparent).toBe(false)
  const primarySoft = await rightBackground()
  await page.mouse.move(800, 500); await expect.poll(rightTransparent).toBe(true)
  const grip = (await right.boundingBox())!, gripX = grip.x + grip.width / 2, gripY = grip.y + grip.height / 2
  await page.mouse.move(gripX, gripY); await page.mouse.down()
  await page.mouse.move(gripX - 70, gripY, { steps: 6 }); await page.mouse.move(20, 5, { steps: 6 })
  await expect(page.locator('body')).toHaveClass(/resizing/); await expect.poll(() => width('.chat-side-panel')).toBe(720)
  expect((await right.boundingBox())!.x - 2).toBeGreaterThan(20); expect(await rightHovered()).toBe(false)
  await expect.poll(rightBackground).toBe(primarySoft)
  await page.mouse.up(); await expect(page.locator('body')).not.toHaveClass(/resizing/)
  expect(await rightHovered()).toBe(false); await expect.poll(rightTransparent).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('desk-right-panel-width'))).toBe('720')
  await dragTo(right, 300); await expect.poll(() => width('.chat-side-panel')).toBe(720)
  await dragTo(right, 1430); await expect.poll(() => width('.chat-side-panel')).toBe(240)
  await page.reload(); await expect(page.locator('.desk-shell')).toBeVisible()
  await page.locator('.desk-topbar-actions button[title="显示工具"]').click(); await expect.poll(() => width('.chat-side-panel')).toBe(240)
  await page.locator('.side-panel-resizer').dblclick(); await expect.poll(() => width('.chat-side-panel')).toBe(320)
  expect(await page.evaluate(() => localStorage.getItem('desk-right-panel-width'))).toBe('320')
  await page.locator('.desk-topbar-actions button[title="隐藏工具"]').click(); await expect(page.locator('.chat-side-panel')).toBeHidden()
})

test('V14 流式中切到插件再返回、设置页响应越界审批', async () => {
  const first = await newSession('Nav Slow')
  await send('TEST_SLOW'); await expect(page.locator('.message.assistant')).toContainText('SLOW_FIRST')
  await rail('插件').click(); await expect(page.locator('.plugin-page')).toBeVisible(); await expect(page.locator('.chat-page')).toHaveCount(0)
  await expect.poll(async () => (await page.evaluate((id) => window.desk.session.messages(id), first)).some((item) => item.content.includes('streamed answer')), { timeout: 20000 }).toBe(true)
  await rail('首页').click(); await expect(page.locator('.message.assistant').last()).toContainText('streamed answer'); await expect(page.locator('.generating')).toHaveCount(0)

  const approval = await newSession('Nav Approval')
  await send('DELAY_TOOL:read_file:' + JSON.stringify({ path: join(directory, 'outside.txt') }))
  await rail('系统设置').click(); await expect(page.locator('.settings-page')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('越界访问确认', { timeout: 15000 }); await expect(page.locator('.settings-page')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: '允许本次' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(async () => (await page.evaluate((id) => window.desk.session.messages(id), approval)).some((item) => item.content.includes('outside secret')), { timeout: 20000 }).toBe(true)
  await rail('首页').click(); await expect(page.locator('.step-tool').last()).toHaveClass(/done/); await expect(page.locator('.generating')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('V14 终端创建期间切到插件页会释放晚到的PTY', async () => {
  await newSession('Nav Late Terminal')
  await application.evaluate(({ ipcMain }) => {
    const originalCreate = (ipcMain as any)._invokeHandlers.get('desk:terminal:create')
    const originalDispose = (ipcMain as any)._invokeHandlers.get('desk:terminal:dispose')
    ;(global as any).__navTerminal = { originalCreate, originalDispose, created: [], disposed: [] }
    ipcMain.removeHandler('desk:terminal:create')
    ipcMain.handle('desk:terminal:create', async (...args: any[]) => {
      const result = await originalCreate(...args)
      ;(global as any).__navTerminal.created.push(result.id)
      await new Promise((resolve) => setTimeout(resolve, 700))
      return result
    })
    ipcMain.removeHandler('desk:terminal:dispose')
    ipcMain.handle('desk:terminal:dispose', async (...args: any[]) => {
      ;(global as any).__navTerminal.disposed.push(args[1])
      return originalDispose(...args)
    })
  })
  try {
    await page.locator('.desk-topbar-actions button[title="显示终端"]').click(); await expect(page.locator('.chat-terminal')).toBeVisible()
    await rail('插件').click(); await expect(page.locator('.plugin-page')).toBeVisible()
    await expect.poll(() => application.evaluate(() => {
      const state = (global as any).__navTerminal
      return state.created.length > 0 && state.created.every((id: string) => state.disposed.includes(id))
    })).toBe(true)
  } finally {
    await application.evaluate(({ ipcMain }) => {
      const { originalCreate, originalDispose } = (global as any).__navTerminal
      ipcMain.removeHandler('desk:terminal:create'); ipcMain.handle('desk:terminal:create', originalCreate)
      ipcMain.removeHandler('desk:terminal:dispose'); ipcMain.handle('desk:terminal:dispose', originalDispose)
    })
  }
  await rail('首页').click(); await expect(page.locator('.chat-page')).toBeVisible()
})

test('V15 顶栏 38px、图标栏 44px，macOS 红黄绿按钮位置与左侧预留区对齐', async () => {
  await rail('首页').click()
  const topbar = (await page.locator('.desk-topbar').boundingBox())!
  expect(Math.round(topbar.height)).toBe(38); expect(Math.round(topbar.y)).toBe(0)
  expect(await width('.sidebar-rail')).toBe(44)
  expect(await page.locator('.desk-topbar').evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region'))).toBe('drag')
  expect(await page.locator('.nav-controls').evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region'))).toBe('no-drag')
  const controls = (await page.locator('.nav-controls').boundingBox())!
  /* 导航控件与红黄绿按钮同在顶栏垂直居中 */
  expect(Math.abs(controls.y + controls.height / 2 - 19)).toBeLessThanOrEqual(2)
  const platform = await application.evaluate(() => process.platform)
  if (platform === 'darwin') {
    await expect(page.locator('.desk-topbar')).toHaveClass(/mac/); await expect(page.locator('.desk-topbar')).toHaveCSS('padding-left', '80px')
    expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getWindowButtonPosition())).toEqual({ x: 14, y: 13 })
    expect(controls.x).toBeGreaterThanOrEqual(80)
  } else {
    await expect(page.locator('.desk-topbar')).not.toHaveClass(/mac/); await expect(page.locator('.desk-topbar')).toHaveCSS('padding-left', '12px')
  }
})

/* N01：输入区底部行几何（选择器 / 发送按钮 / 输入框 / 正文） */
interface Rect { left: number; right: number; top: number; bottom: number }
async function composerLayout(): Promise<{ content: Rect; box: Rect; pickers: Rect[]; send: Rect }> {
  return page.locator('.composer').evaluate((composer) => {
    const rect = (element: Element | null): Rect => { const box = element!.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom } }
    return { content: rect(composer.closest('.chat-content')), box: rect(composer.querySelector('.composer-box')), pickers: [...composer.querySelectorAll('.picker-trigger')].map(rect), send: rect(composer.querySelector('.composer-actions button')) }
  })
}
const intersects = (a: Rect, b: Rect): boolean => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
/* 选择器与发送按钮互不相交，且都在输入框与正文范围内；选择器保留可点击宽度 */
async function expectComposerFits(): Promise<{ content: Rect; box: Rect; pickers: Rect[]; send: Rect }> {
  const layout = await composerLayout()
  expect(layout.pickers).toHaveLength(2)
  for (const item of [...layout.pickers, layout.send]) {
    expect(item.left).toBeGreaterThanOrEqual(layout.box.left - 0.5); expect(item.right).toBeLessThanOrEqual(layout.box.right + 0.5)
    expect(item.right - item.left).toBeGreaterThan(24)
  }
  for (const picker of layout.pickers) expect(intersects(picker, layout.send)).toBe(false)
  expect(intersects(layout.pickers[0], layout.pickers[1])).toBe(false)
  expect(layout.box.left).toBeGreaterThanOrEqual(layout.content.left - 0.5); expect(layout.box.right).toBeLessThanOrEqual(layout.content.right + 0.5)
  return layout
}
async function resizeContent(width: number, height: number): Promise<void> {
  await application.evaluate(({ BrowserWindow }, size) => { BrowserWindow.getAllWindows().find((item) => !item.isDestroyed())!.setContentSize(size.width, size.height) }, { width, height })
  await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
}
/* N02：模型菜单（body portal 弹层）对应上游 max-height 320px，限高、内部可滚动，整体位于窗口内 */
async function openModelMenu(modelPicker: Locator): Promise<Locator> {
  await modelPicker.click()
  const menu = page.locator('.model-dropdown .ant-dropdown-menu').filter({ visible: true })
  await expect(menu).toHaveCount(1)
  /* 弹层重新定位时弹出动画会被取消（finished 以 AbortError 拒绝，属正常），不等 finished：
     有界重试实际几何——无进行中的有限动画、相隔两帧矩形不变后，再断言限高、完整在视口内、内部可滚动 */
  await expect(async () => {
    const box = await menu.evaluate(async (element) => {
      const measure = (): { top: number; bottom: number; height: number } => { const rect = element.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, height: rect.height } }
      const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()))
      const before = measure(); await frame(); await frame(); const after = measure()
      const running = element.closest('.model-dropdown')!.getAnimations({ subtree: true })
        .filter((animation) => animation.playState === 'running' && animation.effect?.getComputedTiming().endTime !== Infinity).length
      return { ...after, stable: before.top === after.top && before.height === after.height, running, viewport: innerHeight, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }
    })
    expect(box.running).toBe(0); expect(box.stable).toBe(true)
    expect(box.height).toBeLessThanOrEqual(320.5)
    expect(box.top).toBeGreaterThanOrEqual(-0.5); expect(box.bottom).toBeLessThanOrEqual(box.viewport + 0.5)
    expect(box.scrollHeight).toBeGreaterThan(box.clientHeight + 1)
  }).toPass({ timeout: 5000 })
  await expect(menu).toBeInViewport({ ratio: 1 })
  return menu
}

test('N01 最小窗口 1080×720 + 默认文件面板：输入区选择器与发送按钮不重叠，模式/模型可选、可发送；1440×900 宽屏保持单行（含 N02 模型菜单限高内滚动）', async () => {
  const longModel = 'deepseek-v4-flash-long-context', tailModel = 'narrow-tail-model', projectName = basename(root)
  /* 长模型名供应商：沿用本文件本地 SSE 端点，经真实 worker 回复；补足条目使模型菜单内容超过 320px */
  const narrowModels = [...Array.from({ length: 10 }, (_, index) => `narrow-filler-${index + 1}`), longModel, tailModel]
  const narrowProvider = await page.evaluate(async (models) => {
    const nav = (await window.desk.provider.list()).find((item) => item.name === 'Nav Provider')!
    return (await window.desk.provider.save({ name: 'Narrow Provider', baseUrl: nav.baseUrl, apiKey: 'nav-key', enabled: true, models })).id
  }, narrowModels)
  try {
    await resizeContent(1080, 720)
    await page.reload(); await expect(page.locator('.desk-shell')).toBeVisible()
    await rail('首页').click(); await page.locator('.sidebar-resizer').dblclick(); await expect.poll(() => width('.desk-sidebar')).toBe(44 + 240)
    /* 新草稿：通过界面选中项目 */
    await page.locator('.new-btn').click(); await expect(page.locator('.empty-state')).toBeVisible()
    await page.locator('.empty-project .project-trigger').click()
    await page.getByRole('menuitem', { name: projectName, exact: true }).click()
    await expect(page.locator('.empty-project .project-name')).toHaveText(projectName)
    /* 默认 560 文件面板，正文 236px */
    await page.locator('.chat-page').click({ position: { x: 5, y: 5 } }); await page.keyboard.press('ControlOrMeta+f')
    await expect.poll(() => width('.chat-side-panel')).toBe(560); await expect.poll(() => width('.chat-content')).toBe(1080 - 284 - 560)
    /* 模型菜单在 720 高窗口内限高定位：滚轮在菜单内部滚动，末项与长模型名均正常点击选中 */
    const modePicker = page.locator('.composer .picker-trigger').first(), modelPicker = page.locator('.composer .picker-trigger').nth(1)
    const modelMenu = await openModelMenu(modelPicker)
    await modelMenu.hover(); await page.mouse.wheel(0, 200)
    await expect.poll(() => modelMenu.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await page.getByRole('menuitem', { name: tailModel, exact: true }).click()
    await expect(modelPicker.locator('.picker-name')).toHaveText(tailModel)
    expect(await page.evaluate(async () => (await window.desk.settings.get()).modelId)).toBe(tailModel)
    /* 选中长模型名后仍不与发送按钮重叠 */
    await openModelMenu(modelPicker); await page.getByRole('menuitem', { name: longModel, exact: true }).click()
    await expect(modelPicker.locator('.picker-name')).toHaveText(longModel)
    expect(await page.evaluate(async () => (await window.desk.settings.get()).modelId)).toBe(longModel)
    await expectComposerFits()
    /* 模式菜单可点可选 */
    await modePicker.click(); await page.getByRole('menuitem', { name: /Plan/ }).click(); await expect(modePicker).toContainText('Plan')
    await modePicker.click(); await page.getByRole('menuitem', { name: /Build/ }).click(); await expect(modePicker).toContainText('Build')
    await expectComposerFits()
    /* 发送按钮可用：真实链路回复后进入有消息的底部输入区，布局仍成立 */
    await page.locator('.composer textarea').fill('N01 narrow send')
    const sendButton = page.locator('.composer-actions button')
    await expect(sendButton).toBeEnabled(); await sendButton.click()
    await expect(page.locator('.message.assistant').last()).toContainText('streamed answer'); await expect(page.locator('.generating')).toHaveCount(0)
    await expect(page.locator('.chat-content.empty')).toHaveCount(0)
    const session = (await page.evaluate(() => window.desk.session.list())).find((item) => item.title === 'N01 narrow send')!
    expect({ providerId: session.providerId, modelId: session.modelId, projectId: session.projectId }).toEqual({ providerId: narrowProvider, modelId: longModel, projectId })
    expect((await page.evaluate((id) => window.desk.session.messages(id), session.id)).map((item) => item.role)).toEqual(['user', 'assistant'])
    await expect(modelPicker.locator('.picker-name')).toHaveText(longModel)
    await expectComposerFits()
    /* 宽屏 1440×900：带文件面板与收起面板时两个选择器均保持同一行 */
    await resizeContent(1440, 900)
    let layout = await expectComposerFits(); expect(Math.abs(layout.pickers[0].top - layout.pickers[1].top)).toBeLessThan(1)
    await page.locator('.desk-topbar-actions button[title="隐藏工具"]').click(); await expect(page.locator('.chat-side-panel')).toBeHidden()
    layout = await expectComposerFits(); expect(Math.abs(layout.pickers[0].top - layout.pickers[1].top)).toBeLessThan(1)
    expect(errors).toEqual([])
  } finally {
    await page.evaluate((id) => window.desk.settings.save({ providerId: id, modelId: 'fixture-model' }), providerId)
    await resizeContent(1440, 920)
    if (await page.locator('.chat-side-panel').isVisible()) await page.locator('.desk-topbar-actions button[title="隐藏工具"]').click()
  }
})

test('V08 非法路由回落首页', async () => {
  for (const path of ['/plugin/unknown', '/no/such/page']) {
    await page.evaluate((path) => { location.hash = '#' + path }, path)
    await expectRoute('/'); await expect(page.locator('.chat-page')).toBeVisible(); await expect(rail('首页')).toHaveClass(/active/)
  }
  expect(errors).toEqual([])
})
