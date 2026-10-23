/* macOS 打包冒烟：复制产物并注入隔离数据入口，执行真实 ASAR 内主进程、utilityProcess worker 与原生模块。 */
const { _electron } = require('@playwright/test')
const { extractFile, listPackage } = require('@electron/asar')
const { createHash } = require('node:crypto')
const { createServer } = require('node:http')
const { mkdtempSync, cpSync, renameSync, mkdirSync, writeFileSync, rmSync, existsSync } = require('node:fs')
const { homedir, tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
/* 产物目录按 package.json 版本定位，与 electron-builder 输出目录一致 */
const { name, version } = require('../package.json')
const PRODUCT = 'Yudao AI Desk Vue'
/* 结果与失败证据目录（默认 test-results，可用 DESK_PACKAGE_SMOKE_OUT 指定） */
const output = resolve(process.env.DESK_PACKAGE_SMOKE_OUT || 'test-results')
const WORKER = '/out/main/agent/worker/worker.js'
const OLD_WORKER = '/out/main/agent/worker.js'
const MARKER = 'PACK_WORKER_OK'

/* 本地 OpenAI 协议 SSE：仅替代模型端点，记录请求供核对确由打包内 worker 发出 */
function startModelServer(requests) {
  const server = createServer(async (request, response) => {
    if (request.url === '/v1/models') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ data: [{ id: 'pack-model' }] })); return }
    let raw = ''
    for await (const chunk of request) raw += chunk
    let body = {}
    try { body = JSON.parse(raw || '{}') } catch { /* 记录原始请求 */ }
    requests.push({ method: request.method, url: request.url, userAgent: request.headers['user-agent'], authorization: request.headers.authorization, model: body.model, stream: body.stream, messages: (body.messages || []).length })
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: 'chatcmpl-pack', object: 'chat.completion.chunk', created: 1, model: 'pack-model', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    chunk({ role: 'assistant' }); chunk({ content: `## Packaged worker\n${MARKER}` }); chunk({}, 'stop')
    response.end('data: [DONE]\n\n')
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('macOS arm64 package smoke only')
  const source = resolve(`release/${version}/mac-arm64/${PRODUCT}.app`)
  if (!existsSync(source)) throw new Error(`packaged app missing: ${source}`)
  const temporary = mkdtempSync(join(tmpdir(), 'desk-pack-'))
  const data = join(temporary, 'data'), project = join(temporary, 'project')
  const result = { passed: false, edition: 'vue-antdv-next', name, version, product: PRODUCT, source, platform: process.platform, arch: process.arch, steps: [] }
  const requests = [], logs = []
  let application, page, server
  try {
    /* 产物检查：新 worker 在 ASAR 内，旧 worker 路径不存在 */
    const asar = join(source, 'Contents/Resources/app.asar')
    const entries = listPackage(asar)
    if (!entries.includes(WORKER)) throw new Error(`ASAR missing ${WORKER}`)
    if (entries.includes(OLD_WORKER)) throw new Error(`ASAR still contains old ${OLD_WORKER}`)
    const packaged = JSON.parse(extractFile(asar, 'package.json'))
    if (packaged.name !== name || packaged.version !== version) throw new Error('ASAR package.json name/version mismatch')
    result.asar = { path: asar, worker: WORKER, workerSha256: createHash('sha256').update(extractFile(asar, WORKER.slice(1))).digest('hex'), oldWorkerAbsent: true }
    result.steps.push('asar')

    const copied = join(temporary, `${PRODUCT}.app`)
    cpSync(source, copied, { recursive: true, verbatimSymlinks: true })
    const resources = join(copied, 'Contents/Resources')
    const core = join(resources, 'core')
    mkdirSync(core)
    /* node-pty 按 app.asar 名称定位解包资源，保留原名称与相邻目录。 */
    renameSync(join(resources, 'app.asar'), join(core, 'app.asar'))
    renameSync(join(resources, 'app.asar.unpacked'), join(core, 'app.asar.unpacked'))
    const fixture = join(resources, 'app')
    mkdirSync(fixture)
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({ ...packaged, main: 'main.cjs' }))
    /* 先记录默认品牌数据目录，再切到隔离目录；主进程仍从 ASAR 原入口装配 */
    writeFileSync(join(fixture, 'main.cjs'), `const { app } = require('electron'); global.__deskDefaultData = { name: app.getName(), userData: app.getPath('userData') }; app.setPath('userData', ${JSON.stringify(data)}); require('../core/app.asar/out/main/index.js')`)
    mkdirSync(data); mkdirSync(project)
    writeFileSync(join(project, 'README.md'), '# Package smoke project\n')
    server = await startModelServer(requests)
    const baseUrl = `http://127.0.0.1:${server.address().port}/v1`

    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.ELECTRON_RENDERER_URL
    application = await _electron.launch({ executablePath: join(copied, `Contents/MacOS/${PRODUCT}`), env, timeout: 20000 })
    application.process().stdout?.on('data', chunk => logs.push(String(chunk)))
    application.process().stderr?.on('data', chunk => logs.push(String(chunk)))
    page = await application.firstWindow({ timeout: 20000 })
    await page.locator('.desk-topbar').waitFor({ timeout: 20000 })
    await page.locator('.empty-state').waitFor({ timeout: 20000 })
    result.steps.push('launch')

    /* 隔离数据目录与默认品牌数据目录 */
    const state = await application.evaluate(({ app }) => ({ packaged: app.isPackaged, name: app.getName(), version: app.getVersion(), userData: app.getPath('userData'), defaultData: global.__deskDefaultData }))
    if (!state.packaged || state.userData !== data) throw new Error('packaged data isolation failed')
    const expectedDefault = join(homedir(), 'Library/Application Support', name)
    if (state.defaultData.name !== name || state.defaultData.userData !== expectedDefault) throw new Error(`default brand data dir mismatch: ${JSON.stringify(state.defaultData)}`)
    if (state.version !== version) throw new Error('packaged app version mismatch')
    result.app = state
    result.steps.push('data-dir')

    /* SQLite 种子 */
    const providers = await page.evaluate(() => window.desk.provider.list())
    if (!providers.length) throw new Error('packaged SQLite seed missing')
    if (!existsSync(join(data, 'yudao-ai-desk.sqlite'))) throw new Error('isolated SQLite file missing')
    result.sqlite = { file: join(data, 'yudao-ai-desk.sqlite'), seededProviders: providers.length }
    result.steps.push('sqlite')

    /* PTY 输出 */
    const ptyResult = await page.evaluate(async (cwd) => {
      const terminal = await window.desk.terminal.create({ cwd })
      let output = ''
      const off = window.desk.terminal.onEvent(event => { if (event.id === terminal.id && event.type === 'data') output += event.data })
      try {
        await window.desk.terminal.write(terminal.id, 'printf "PACK_%s\\n" PTY_OK\r')
        const deadline = Date.now() + 10000
        while (!output.includes('PACK_PTY_OK') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
        return output.includes('PACK_PTY_OK')
      } finally { off(); await window.desk.terminal.dispose(terminal.id) }
    }, project)
    if (!ptyResult) throw new Error('packaged PTY execution failed')
    result.steps.push('pty')

    /* 真实打包内 worker 对话：IPC → 主进程 → utilityProcess → 本地 SSE → done → SQLite 落库 */
    const ids = await page.evaluate(async ({ baseUrl, path }) => {
      const provider = await window.desk.provider.save({ name: 'Package Smoke Provider', baseUrl, apiKey: 'pack-key', enabled: true, models: ['pack-model'] })
      const created = await window.desk.project.create({ path, name: 'package-smoke' })
      await window.desk.settings.save({ providerId: provider.id, modelId: 'pack-model', updateAutoCheck: false })
      const session = await window.desk.session.create({ projectId: created.id, providerId: provider.id, modelId: 'pack-model', title: 'Package Smoke', mode: 'build' })
      return { providerId: provider.id, projectId: created.id, sessionId: session.id }
    }, { baseUrl, path: project })
    const chat = await page.evaluate(async (sessionId) => {
      const events = []
      const off = window.desk.chat.onEvent(event => { if (event.sessionId === sessionId) events.push({ type: event.type, text: event.text, message: event.message }) })
      try {
        const sent = window.desk.chat.send({ sessionId, text: 'PACK_WORKER_PING' })
        const deadline = Date.now() + 30000
        while (!events.some(event => ['done', 'error', 'aborted'].includes(event.type)) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
        await sent
        return { events, messages: await window.desk.session.messages(sessionId) }
      } finally { off() }
    }, ids.sessionId)
    const types = chat.events.map(event => event.type)
    if (!types.includes('done') || types.includes('error')) throw new Error(`worker chat did not finish: ${JSON.stringify(chat.events)}`)
    const users = chat.messages.filter(item => item.role === 'user'), assistants = chat.messages.filter(item => item.role === 'assistant')
    if (users.length !== 1 || users[0].content !== 'PACK_WORKER_PING') throw new Error('SQLite user message missing')
    if (assistants.length !== 1 || !assistants[0].content.includes(MARKER)) throw new Error('SQLite assistant message missing')
    const completions = requests.filter(item => item.method === 'POST')
    if (completions.length !== 1 || completions[0].userAgent !== 'Yudao-AI-Desk' || completions[0].authorization !== 'Bearer pack-key') throw new Error(`model request not from packaged worker: ${JSON.stringify(requests)}`)
    const utility = await application.evaluate(({ app }) => app.getAppMetrics().filter(metric => metric.type === 'Utility').map(metric => ({ pid: metric.pid, name: metric.name, serviceName: metric.serviceName })))
    if (!utility.some(metric => metric.serviceName === 'yudao-ai-desk-agent' || metric.name === 'yudao-ai-desk-agent')) throw new Error(`agent utilityProcess not running: ${JSON.stringify(utility)}`)
    result.worker = { events: types, messages: chat.messages.map(item => ({ role: item.role, content: item.content })), requests: completions, utility }
    result.steps.push('worker-chat')

    mkdirSync(output, { recursive: true })
    await page.screenshot({ path: join(output, 'packaged-desktop.png') })
    Object.assign(result, { passed: true, nativeSQLite: true, nativePty: true, isolatedEntry: true })
    writeFileSync(join(output, 'package-smoke.json'), JSON.stringify(result, null, 2))
    console.log('PASS: packaged ASAR worker, renderer, preload, SQLite, PTY, worker chat and isolated data')
  } catch (error) {
    /* 保留失败证据：截图、结果、进程输出与隔离数据副本 */
    mkdirSync(output, { recursive: true })
    result.error = String(error && error.stack || error)
    result.requests = requests
    result.logs = logs.join('').slice(-20000)
    if (page) await page.screenshot({ path: join(output, 'package-smoke-failure.png') }).catch(() => {})
    /* 单例锁/套接字不复制 */
    try { if (existsSync(data)) cpSync(data, join(output, 'package-smoke-failure-data'), { recursive: true, filter: path => !/Singleton/.test(path) }) } catch (copyError) { result.copyError = String(copyError) }
    writeFileSync(join(output, 'package-smoke-failure.json'), JSON.stringify(result, null, 2))
    throw error
  } finally {
    if (application) await application.close().catch(() => {})
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(() => resolve())) }
    rmSync(temporary, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
