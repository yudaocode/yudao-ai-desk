/* 本地 OpenAI 协议服务器仅替代模型端点；应用、utilityProcess、工具、IPC 和数据库真实运行。 */
import { test, expect, _electron, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
let application: ElectronApplication, page: Page, server: Server, directory: string, root: string, baseUrl: string, projectId: string, projectPath: string, providerId: string
const errors: string[] = [], requests: { body: any; headers: Record<string, unknown> }[] = []
/* SSE 按真实 OpenAI tool_calls 分片返回，验证 Pi SDK 完整调用链。 */
function startServer(): Promise<string> {
  server = createServer(async (request, response) => {
    if (request.url === '/browser') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<title>Desk Browser Fixture</title><h1>Browser loaded</h1><a href="/browser-next" target="_blank">New tab</a>'); return }
    if (request.url === '/browser-next') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<title>Desk Second Tab</title><h1>Second page</h1>'); return }
    if (request.url === '/v1/models') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ data: [{ id: 'fixture-model' }] })); return }
    let raw = ''; for await (const chunk of request) raw += chunk
    const body = JSON.parse(raw || '{}'); requests.push({ body, headers: { ...request.headers } })
    const messages = body.messages ?? [], last = messages[messages.length - 1], userContent = [...messages].reverse().find((item) => item.role === 'user')?.content ?? ''
    const user = typeof userContent === 'string' ? userContent : userContent.map((part) => part.text ?? '').join('')
    if (String(user).includes('TEST_ERROR')) { response.writeHead(400, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: 'fixture provider failure', type: 'invalid_request_error' } })); return }
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    const chunk = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: 'chatcmpl-fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture-model', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    chunk({ role: 'assistant' })
    if (last?.role !== 'tool' && String(user).startsWith('TOOL:')) {
      const match = /^TOOL:([^:]+):([\s\S]+)$/.exec(String(user))!
      chunk({ tool_calls: [{ index: 0, id: 'fixture-call-' + requests.length, type: 'function', function: { name: match[1], arguments: match[2] } }] }); chunk({}, 'tool_calls')
    } else {
      const content = last?.role === 'tool' ? `## Tool completed\n${typeof last.content === 'string' ? last.content : JSON.stringify(last.content)}` : `## Fixture response\n**streamed answer**\n\n\`\`\`ts\nconst safe = 1\n\`\`\``
      if (String(user).includes('TEST_SLOW')) {
        chunk({ content: 'SLOW_FIRST\n' })
        await new Promise((resolve) => setTimeout(resolve, 1800))
      }
      if (!response.destroyed) { chunk({ content }); chunk({}, 'stop') }
    }
    if (!response.destroyed) response.end('data: [DONE]\n\n')
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}/v1`)))
}
test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'yudao-deep-vue-')); root = join(directory, 'project'); mkdirSync(root)
  writeFileSync(join(root, 'read.txt'), 'tool input alpha\n'); writeFileSync(join(root, 'preview.md'), '# Preview Title\n\nhello preview'); writeFileSync(join(directory, 'outside.txt'), 'outside secret')
  baseUrl = await startServer()
  const env = { ...process.env, DESK_TEST_DATA_DIR: join(directory, 'data'), DESK_TEST_PROJECT_DIR: root }; delete env.ELECTRON_RUN_AS_NODE
  application = await _electron.launch({ args: [resolve('tests/fixtures/main.cjs')], env })
  page = await application.firstWindow(); page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.locator('.desk-shell')).toBeVisible()
  const ids = await page.evaluate(async (baseUrl) => {
    const provider = await window.desk.provider.save({ name: 'Fixture Provider', baseUrl, apiKey: 'fixture-key', enabled: true, models: ['fixture-model'], headers: { 'x-desk-session': '{session}' } })
    const project = await window.desk.project.create(); if (!project) throw new Error('No project')
    await window.desk.settings.save({ providerId: provider.id, modelId: 'fixture-model', updateAutoCheck: false })
    return { providerId: provider.id, projectId: project.id, projectPath: project.path }
  }, baseUrl)
  providerId = ids.providerId; projectId = ids.projectId; projectPath = ids.projectPath; await page.reload(); await expect(page.locator('.desk-shell')).toBeVisible()
})
test.afterAll(async () => { await application?.close(); await new Promise<void>((resolve) => server?.close(() => resolve())); if (directory) rmSync(directory, { recursive: true, force: true }) })
async function newSession(title: string, mode: 'plan' | 'build' = 'build'): Promise<string> {
  const id = await page.evaluate(async (input) => (await window.desk.session.create(input)).id, { projectId, providerId, modelId: 'fixture-model', title, mode })
  await page.reload(); await page.locator('.rail-btn[title="首页"]').click(); const item = await sessionItem(title); await expect(item).toBeVisible(); await item.click(); return id
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
async function completed(): Promise<void> { await expect(page.locator('.generating')).toHaveCount(0, { timeout: 20000 }); await expect(page.locator('.message.assistant').last()).toBeVisible() }
test('真实 utilityProcess 流式对话、Markdown、请求头、重载历史', async () => {
  const id = await newSession('Fixture Chat')
  await send('TEST_BASIC'); await expect(page.locator('.message.assistant h2')).toHaveText('Fixture response'); await completed()
  await expect(page.locator('.message.assistant .code-copy')).toBeVisible()
  await expect(page.locator('.message.assistant h2')).toHaveCSS('font-weight', '700')
  await page.waitForTimeout(450); await page.screenshot({ path: 'test-results/style-chat.png' })
  const sent = requests.find((item) => JSON.stringify(item.body.messages).includes('TEST_BASIC'))!
  expect(sent.headers['x-desk-session']).toBe(id); expect(sent.headers.authorization).toBe('Bearer fixture-key')
  const stored = await page.evaluate((id) => window.desk.session.messages(id), id); expect(stored.filter((item) => item.role === 'user')).toHaveLength(1); expect(stored.filter((item) => item.role === 'assistant')).toHaveLength(1)
  await page.reload(); await expect(page.locator('.message.assistant h2')).toHaveText('Fixture response'); expect(errors).toEqual([])
})
test('真实工具读取和写入、执行卡片与 Plan 工具集合', async () => {
  await newSession('Fixture Read')
  await send('TOOL:read_file:{"path":"read.txt"}'); await expect(page.locator('.step-tool .step-label')).toHaveText('读取文件'); await expect(page.locator('.step-tool')).toHaveClass(/done/); await completed(); await page.locator('.step-tool .step-head').click(); await expect(page.locator('.tool-pre').last()).toContainText('tool input alpha')
  await page.waitForTimeout(450); await page.screenshot({ path: 'test-results/style-tools.png' })
  await newSession('Fixture Write')
  await send('TOOL:write_file:{"path":"written.txt","content":"written by real tool"}'); await expect(page.locator('.step-tool')).toHaveClass(/done/); await completed(); expect(readFileSync(join(root, 'written.txt'), 'utf8')).toBe('written by real tool')
  await newSession('Fixture Plan', 'plan'); await send('TEST_PLAN'); await expect(page.locator('.message.assistant h2')).toHaveText('Fixture response'); await completed()
  const plan = requests.find((item) => JSON.stringify(item.body.messages).includes('TEST_PLAN'))!
  const names = plan.body.tools.map((tool) => tool.function.name); expect(names).toContain('read_file'); expect(names).not.toContain('write_file'); expect(names).not.toContain('run_command')
})
test('越界审批的拒绝、允许本次与会话白名单通过真实工具触发', async () => {
  await newSession('Fixture Approval')
  const input = 'TOOL:read_file:' + JSON.stringify({ path: join(directory, 'outside.txt') })
  await send(input); await expect(page.getByRole('dialog')).toContainText('越界访问确认')
  await expect(page.locator('.approval-icon')).toHaveCSS('color', 'rgb(230, 162, 60)'); await page.waitForTimeout(450); await page.screenshot({ path: 'test-results/style-approval.png' }); await page.getByRole('dialog').getByRole('button', { name: /^拒\s*绝$/ }).click(); await expect(page.locator('.step-tool')).toHaveClass(/error/); await completed()
  await send(input); await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('dialog').getByRole('button', { name: '允许本次' }).click(); await expect(page.locator('.step-tool').last()).toHaveClass(/done/); await completed()
  await send(input); await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('dialog').getByRole('button', { name: '本会话允许' }).click(); await expect(page.locator('.step-tool').last()).toHaveClass(/done/); await completed()
  await send(input); await expect(page.locator('.step-tool').last()).toHaveClass(/done/); await completed(); await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('文件面板编辑保存、Markdown 预览、目录变化与隐藏后保留', async () => {
  await newSession('Fixture Files')
  await page.keyboard.press('ControlOrMeta+f')
  await page.locator('.tree-filter input').fill('preview')
  await expect(page.locator('.tree-row[title="read.txt"]')).toHaveCount(0)
  await page.locator('.tree-filter').hover()
  await page.locator('.tree-filter .ant-input-clear-icon').click()
  await expect(page.locator('.tree-filter input')).toHaveValue('')
  await expect(page.locator('.tree-row[title="read.txt"]')).toBeVisible()

  await page.locator('.tree-row[title="read.txt"]').click(); await expect(page.locator('.editor-input')).toHaveValue('tool input alpha\n')
  await page.locator('.editor-input').fill('edited from file panel'); await page.locator('.file-actions').getByTitle('保存（⌘S）', { exact: true }).click(); await expect.poll(() => readFileSync(join(root, 'read.txt'), 'utf8')).toBe('edited from file panel')
  await page.locator('.tree-row').filter({ hasText: 'preview.md' }).click(); await page.locator('.file-actions').getByTitle('查看预览', { exact: true }).click(); await expect(page.locator('.viewer-markdown h1')).toHaveText('Preview Title')
  await page.waitForTimeout(450); await page.screenshot({ path: 'test-results/style-files.png' })
  writeFileSync(join(root, 'watch-created.txt'), 'watched'); await expect(page.locator('.tree-row').filter({ hasText: 'watch-created.txt' })).toBeVisible()
  await page.getByTitle('收起', { exact: true }).click(); await page.getByTitle('显示工具', { exact: true }).click(); await expect(page.locator('.viewer-markdown h1')).toHaveText('Preview Title')
})
test('内嵌浏览器加载本地页、新标签与关闭保留', async () => {
  await newSession('Fixture Browser'); await page.keyboard.press('ControlOrMeta+b')
  await page.locator('.address-input').fill(baseUrl.replace('/v1', '/browser')); await page.locator('.address-input').press('Enter')
  await expect(page.locator('.browser-panel .tab-title')).toHaveText('Desk Browser Fixture', { timeout: 15000 })
  await page.getByTitle('新建标签页', { exact: true }).click(); await expect(page.locator('.browser-panel .tab')).toHaveCount(2)
  await page.locator('.browser-panel .tab').first().click(); await expect(page.locator('.address-input')).toHaveValue(baseUrl.replace('/v1', '/browser'))
  await page.locator('.browser-panel .tab').last().locator('.tab-close').click(); await expect(page.locator('.browser-panel .tab')).toHaveCount(1)
  expect(await page.locator('.browser-body').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(500)
  await application.evaluate(async ({ webContents }) => {
    const guest = webContents.getAllWebContents().find(contents => contents.getType() === 'webview' && contents.getURL().includes('/browser'))!
    await guest.executeJavaScript("document.querySelector('a').click()")
  })
  await expect(page.locator('.browser-panel .tab')).toHaveCount(2)
  await expect(page.locator('.browser-panel .tab-title').last()).toHaveText('Desk Second Tab')
  await page.locator('.browser-panel .tab').last().locator('.tab-close').click()
  expect(errors).toEqual([])
  await page.waitForTimeout(450); await page.screenshot({ path: 'test-results/desktop-browser.png' })
})
test('切换会话期间流式结果保持隔离，返回后继续显示，停止可结束', async () => {
  const first = await newSession('Fixture Slow')
  await send('TEST_SLOW'); await expect(page.locator('.message.assistant')).toContainText('SLOW_FIRST')
  const other = await page.evaluate(async (input) => (await window.desk.session.create(input)).id, { projectId, providerId, modelId: 'fixture-model', title: 'Fixture Other', mode: 'build' as const })
  /* 新会话从侧栏刷新后选择；刷新会中止前端缓存，因此这里使用新建草稿入口检查隔离。 */
  await page.locator('.new-btn').click(); await expect(page.locator('.message')).toHaveCount(0)
  await expect.poll(async () => (await page.evaluate((id) => window.desk.session.messages(id), first)).some((item) => item.content.includes('streamed answer'))).toBe(true)
  await page.reload(); await (await sessionItem('Fixture Slow')).click(); await expect(page.locator('.message.assistant')).toContainText('streamed answer')
  await (await sessionItem('Fixture Other')).click(); await send('TEST_SLOW'); await expect(page.locator('.message.assistant')).toContainText('SLOW_FIRST')
  await page.locator('.composer-actions button').click(); await completed(); expect((await page.evaluate((id) => window.desk.session.messages(id), other)).length).toBeGreaterThan(0)
})
test('模型错误可读提示持久化并允许继续对话', async () => {
  const id = await newSession('Fixture Error'); await send('TEST_ERROR'); await expect(page.locator('.message.assistant')).toContainText('fixture provider failure'); await completed()
  const stored = await page.evaluate((id) => window.desk.session.messages(id), id); expect(stored.some((item) => item.content.includes('fixture provider failure'))).toBe(true)
  await send('TEST_RECOVERY'); await expect(page.locator('.message.assistant').last()).toContainText('streamed answer'); await completed(); expect(errors).toEqual([])
})

test('样式根布局、搜索面板与历史回复操作可用', async () => {
  await newSession('Fixture Layout')
  await expect(page.locator('.empty-logo')).toHaveAttribute('src', /icon/)
  await expect(page.locator('.empty-logo')).toHaveJSProperty('naturalWidth', 1024)
  await page.waitForTimeout(450); await page.screenshot({ path: 'test-results/style-home.png' })
  await page.locator('.rail-btn[title="系统设置"]').click()
  await expect(page.locator('.settings-page')).toBeVisible()
  await page.waitForTimeout(450); await page.screenshot({ path: 'test-results/style-settings.png' })
  for (const [name, file] of [['个性化', 'personalization'], ['模型供应商', 'providers'], ['关于我们', 'about']] as const) {
    await page.locator('.sidebar-panel .menu-item').filter({ hasText: new RegExp(`^${name}$`) }).click()
    await expect(page.locator('.sidebar-panel .menu-item').filter({ hasText: new RegExp(`^${name}$`) })).toHaveClass(/active/)
    await page.waitForTimeout(450); await page.screenshot({ path: `test-results/style-settings-${file}.png` })
    if (file === 'personalization') {
      for (const wrapper of [page.locator('.settings-form .ant-input-affix-wrapper').nth(0), page.locator('.settings-form .ant-input-affix-wrapper').nth(1)]) {
        const input = wrapper.locator('input'), original = await input.inputValue()
        await input.fill('Clear button fixture')
        await wrapper.hover()
        await wrapper.locator('.ant-input-clear-icon').click()
        await expect(input).toHaveValue('')
        await input.fill(original)
      }
    }

  }
  await expect(page.locator('.about-link').first()).toHaveAttribute('href', 'https://gitee.com/yudaocode/yudao-ai-desk')
  await page.locator('.sidebar-panel .menu-item').filter({ hasText: /^模型供应商$/ }).click()
  await page.getByRole('button', { name: '添加供应商' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('添加供应商')
  await page.waitForTimeout(450); await page.screenshot({ path: 'test-results/style-provider-dialog.png' })
  await page.getByRole('dialog').getByRole('button', { name: /^取\s*消$/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await application.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find(window => !window.isDestroyed())!.setContentSize(1080, 720) })
  await page.waitForTimeout(450); await page.screenshot({ path: 'test-results/style-providers-1080.png' })
  const actions = await page.locator('.row-actions button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().right))
  expect(actions.length).toBeGreaterThan(0)
  expect(Math.max(...actions)).toBeLessThanOrEqual(1080)
  expect(await page.locator('.settings-body').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.evaluate(async () => { await window.desk.settings.save({ theme: 'dark' }) })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.locator('.rail-btn[title="系统设置"]').click()
  await page.locator('.sidebar-panel .menu-item').filter({ hasText: /^模型供应商$/ }).click()
  await expect(page.locator('.provider-toolbar')).toBeVisible()
  await expect(page.locator('.sidebar-panel .menu-item').filter({ hasText: /^模型供应商$/ })).toHaveClass(/active/)
  await page.waitForTimeout(450); await page.screenshot({ path: 'test-results/style-providers-dark-1080.png' })
  await page.locator('.rail-btn[title="首页"]').click()
  await page.locator('.new-btn').click()
  await expect(page.locator('.chat-page')).toBeVisible()
  await page.waitForTimeout(450); await page.screenshot({ path: 'test-results/style-home-dark-1080.png' })
  await page.evaluate(async () => { await window.desk.settings.save({ theme: 'light' }) })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await application.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find(window => !window.isDestroyed())!.setContentSize(1440, 920) })
  await page.locator('.rail-btn[title="系统设置"]').click()
  await expect(page.locator('.settings-page')).toBeVisible()
  await page.locator('.rail-btn[title="首页"]').click()
  await page.locator('.new-btn').click()
  await expect(page.locator('.chat-page')).toBeVisible()
  await expect(page.locator('.chat-page')).toHaveCSS('display', 'flex')
  await expect(page.locator('.empty-state')).toHaveCSS('align-items', 'center')
  await expect(page.locator('.composer textarea')).toHaveCSS('border-width', '0px')
  await page.locator('.composer textarea').focus()
  await expect(page.locator('.composer-box')).toHaveCSS('border-color', 'rgb(13, 13, 13)')
  await page.locator('.brand-search').click()
  await expect(page.locator('.palette-mask')).toBeVisible()
  await expect(page.locator('.palette-mask')).toHaveCSS('position', 'fixed')
  await page.locator('.palette-input-field').press('Escape')
  await expect(page.locator('.palette-mask')).toHaveCount(0)
  await send('TEST_UI_COPY')
  await completed()
  await page.reload()
  const reply = page.locator('.message.assistant').last()
  await expect(reply.locator('h2')).toHaveText('Fixture response')
  await reply.hover()
  await expect(reply.locator('.message-actions')).toHaveCSS('opacity', '1')
  await page.evaluate(() => { (window as any).__copied = ''; Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (text: string) => { (window as any).__copied = text } }) })
  await reply.locator('.message-actions .action').first().click()
  await expect.poll(() => page.evaluate(() => (window as any).__copied)).toContain('streamed answer')
})
test('延迟文件读写不会覆盖后选文件或新编辑', async () => {
  await newSession('Fixture File Races')
  await page.keyboard.press('ControlOrMeta+f')
  /* 仅注入IPC响应时延，继续调用原文件服务，不替换磁盘读写。 */
  await application.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as any)._invokeHandlers
    const originalRead = handlers.get('desk:fs:read'), originalWrite = handlers.get('desk:fs:write')
    ;(global as any).__deskHandlers = { originalRead, originalWrite }
    ipcMain.removeHandler('desk:fs:read')
    ipcMain.handle('desk:fs:read', async (...args: any[]) => {
      const result = await originalRead(...args)
      if (String(args[2]).endsWith('read.txt')) await new Promise(resolve => setTimeout(resolve, 600))
      return result
    })
    ipcMain.removeHandler('desk:fs:write')
    ipcMain.handle('desk:fs:write', async (...args: any[]) => {
      await new Promise(resolve => setTimeout(resolve, 600))
      return originalWrite(...args)
    })
  })
  try {
    await page.locator('.tree-row[title="read.txt"]').click()
    writeFileSync(join(root, 'watch-during-read.txt'), 'change while read pending')
    await expect(page.locator('.tree-row').filter({ hasText: 'watch-during-read.txt' })).toBeVisible()
    await expect(page.locator('.editor-input')).toHaveValue(readFileSync(join(root, 'read.txt'), 'utf8'))
    await page.locator('.tree-row[title="read.txt"]').click()
    await page.locator('.tree-row').filter({ hasText: 'preview.md' }).click()
    await expect(page.locator('.editor-input')).toHaveValue('# Preview Title\n\nhello preview')
    await page.waitForTimeout(750)
    await expect(page.locator('.editor-input')).toHaveValue('# Preview Title\n\nhello preview')
    await page.locator('.editor-input').fill('saved A')
    const save = page.locator('.file-actions').getByTitle('保存（⌘S）', { exact: true })
    await save.click()
    await page.locator('.editor-input').fill('unsaved B')
    await expect.poll(() => readFileSync(join(root, 'preview.md'), 'utf8')).toBe('saved A')
    await expect(page.locator('.editor-input')).toHaveValue('unsaved B')
    await expect(save).toBeEnabled()
    await save.click()
    await expect.poll(() => readFileSync(join(root, 'preview.md'), 'utf8')).toBe('unsaved B')
  } finally {
    await application.evaluate(({ ipcMain }) => {
      const { originalRead, originalWrite } = (global as any).__deskHandlers
      ipcMain.removeHandler('desk:fs:read'); ipcMain.handle('desk:fs:read', originalRead)
      ipcMain.removeHandler('desk:fs:write'); ipcMain.handle('desk:fs:write', originalWrite)
    })
  }
})

test('终端创建期间切离页面会释放晚到的PTY', async () => {
  await newSession('Fixture Late Terminal')
  await application.evaluate(({ ipcMain }) => {
    const originalCreate = (ipcMain as any)._invokeHandlers.get('desk:terminal:create')
    const originalDispose = (ipcMain as any)._invokeHandlers.get('desk:terminal:dispose')
    ;(global as any).__terminalRace = { originalCreate, originalDispose, created: [], disposed: [] }
    ipcMain.removeHandler('desk:terminal:create')
    ipcMain.handle('desk:terminal:create', async (...args: any[]) => {
      const result = await originalCreate(...args)
      ;(global as any).__terminalRace.created.push(result.id)
      await new Promise(resolve => setTimeout(resolve, 700))
      return result
    })
    ipcMain.removeHandler('desk:terminal:dispose')
    ipcMain.handle('desk:terminal:dispose', async (...args: any[]) => {
      ;(global as any).__terminalRace.disposed.push(args[1])
      return originalDispose(...args)
    })
  })
  try {
    await page.keyboard.press('ControlOrMeta+t')
    await expect(page.locator('.chat-terminal')).toBeVisible()
    expect(await page.locator('.chat-terminal').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(200)
    await page.locator('.rail-btn[title="系统设置"]').click()
    await expect(page.locator('.settings-page')).toBeVisible()
    await expect.poll(() => application.evaluate(() => {
      const state = (global as any).__terminalRace
      return state.created.length > 0 && state.created.every((id: string) => state.disposed.includes(id))
    })).toBe(true)
  } finally {
    await application.evaluate(({ ipcMain }) => {
      const { originalCreate, originalDispose } = (global as any).__terminalRace
      ipcMain.removeHandler('desk:terminal:create'); ipcMain.handle('desk:terminal:create', originalCreate)
      ipcMain.removeHandler('desk:terminal:dispose'); ipcMain.handle('desk:terminal:dispose', originalDispose)
    })
  }
})

test('文件打开方式菜单保留上游app命令前缀', async () => {
  await application.evaluate(({ ipcMain }) => {
    const originalApps = (ipcMain as any)._invokeHandlers.get('desk:shell:open-with-apps')
    const originalOpen = (ipcMain as any)._invokeHandlers.get('desk:shell:open-with')
    ;(global as any).__openWithFixture = { originalApps, originalOpen, calls: [] }
    ipcMain.removeHandler('desk:shell:open-with-apps')
    ipcMain.handle('desk:shell:open-with-apps', () => [{ name: 'Fixture Editor', path: '/Applications/Fixture Editor.app' }])
    ipcMain.removeHandler('desk:shell:open-with')
    ipcMain.handle('desk:shell:open-with', (_event, appPath, filePath) => { (global as any).__openWithFixture.calls.push({ appPath, filePath }) })
  })
  try {
    await newSession('Fixture Open With')
    await page.keyboard.press('ControlOrMeta+f')
    await page.locator('.tree-row[title="read.txt"]').click()
    await expect(page.locator('.editor-input')).toBeVisible()
    await page.locator('.file-actions button').filter({ hasText: /^打开$/ }).click()
    await page.getByText('Fixture Editor', { exact: true }).click()
    await expect.poll(() => application.evaluate(() => (global as any).__openWithFixture.calls)).toEqual([{ appPath: '/Applications/Fixture Editor.app', filePath: join(root, 'read.txt') }])
  } finally {
    await application.evaluate(({ ipcMain }) => {
      const { originalApps, originalOpen } = (global as any).__openWithFixture
      ipcMain.removeHandler('desk:shell:open-with-apps'); ipcMain.handle('desk:shell:open-with-apps', originalApps)
      ipcMain.removeHandler('desk:shell:open-with'); ipcMain.handle('desk:shell:open-with', originalOpen)
    })
  }
})
