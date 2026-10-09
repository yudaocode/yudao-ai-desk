/* macOS 打包冒烟：复制产物并注入隔离数据入口，执行真实 ASAR 内代码和原生模块。 */
const { _electron } = require('@playwright/test')
const { extractFile } = require('@electron/asar')
const { mkdtempSync, cpSync, renameSync, mkdirSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
async function main() {
  if (process.platform !== 'darwin') throw new Error('macOS arm64 package smoke only')
  const temporary = mkdtempSync(join(tmpdir(), 'desk-pack-'))
  let application
  try {
    const copied = join(temporary, 'Yudao AI Desk Vue.app')
    cpSync(resolve('release/1.1.1/mac-arm64/Yudao AI Desk Vue.app'), copied, { recursive: true, verbatimSymlinks: true })
    const resources = join(copied, 'Contents/Resources')
    const core = join(resources, 'core')
    mkdirSync(core)
    /* node-pty 按 app.asar 名称定位解包资源，保留原名称与相邻目录。 */
    renameSync(join(resources, 'app.asar'), join(core, 'app.asar'))
    renameSync(join(resources, 'app.asar.unpacked'), join(core, 'app.asar.unpacked'))
    const fixture = join(resources, 'app')
    mkdirSync(fixture)
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({ ...JSON.parse(extractFile(join(core, 'app.asar'), 'package.json')), main: 'main.cjs' }))
    writeFileSync(join(fixture, 'main.cjs'), `const { app } = require('electron'); global.__deskDefaultData = { name: app.getName(), userData: app.getPath('userData') }; app.setPath('userData', ${JSON.stringify(join(temporary, 'data'))}); require('../core/app.asar/out/main/index.js')`)
    mkdirSync(join(temporary, 'data'))
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.ELECTRON_RENDERER_URL
    application = await _electron.launch({ executablePath: join(copied, 'Contents/MacOS/Yudao AI Desk Vue'), env, timeout: 20000 })
    const page = await application.firstWindow({ timeout: 20000 })
    await page.locator('.empty-state').waitFor({ timeout: 20000 })
    const state = await application.evaluate(({ app }) => ({ packaged: app.isPackaged, userData: app.getPath('userData'), defaultData: global.__deskDefaultData }))
    if (!state.packaged || state.userData !== join(temporary, 'data')) throw new Error('packaged data isolation failed')
    const providers = await page.evaluate(() => window.desk.provider.list())
    if (!providers.length) throw new Error('packaged SQLite seed missing')
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
    }, join(temporary, 'data'))
    if (!ptyResult) throw new Error('packaged PTY execution failed')
    mkdirSync('test-results', { recursive: true })
    await page.screenshot({ path: 'test-results/packaged-desktop.png' })
    writeFileSync('test-results/package-smoke.json', JSON.stringify({ passed: true, packaged: state.packaged, nativeSQLite: true, nativePty: true, defaultData: state.defaultData, isolatedEntry: true, platform: process.platform, arch: process.arch }, null, 2))
    console.log('PASS: packaged ASAR, renderer, preload, SQLite, PTY and isolated data')
  } finally {
    if (application) await application.close()
    rmSync(temporary, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
