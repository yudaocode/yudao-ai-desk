/* 桌面端真实入口、IPC 与主要业务交互，不以编译代替验收。 */
import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

let application: ElectronApplication
let page: Page
let directory: string
let projectPath: string
const rendererErrors: string[] = []

test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'yudao-desk-vue-'))
  projectPath = join(directory, 'project')
  mkdirSync(projectPath)
  writeFileSync(join(projectPath, 'hello.txt'), 'original content\n')
  const environment = { ...process.env, DESK_TEST_DATA_DIR: join(directory, 'data'), DESK_TEST_PROJECT_DIR: projectPath }
  delete environment.ELECTRON_RUN_AS_NODE
  application = await _electron.launch({ args: [resolve('tests/fixtures/main.cjs')], env: environment })
  page = await application.firstWindow()
  page.on('pageerror', (error) => rendererErrors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  await expect(page.locator('.desk-shell')).toBeVisible()
})

test.afterAll(async () => {
  await application?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

test('启动使用隔离数据、preload 白名单、供应商种子', async () => {
  const info = await page.evaluate(async () => ({ runtime: await window.desk.app.info(), providers: await window.desk.provider.list(), node: typeof (window as unknown as Record<string, unknown>).require }))
  expect(info.runtime.dataDir).toBe(join(directory, 'data'))
  expect(info.providers.length).toBeGreaterThan(0)
  expect(info.node).toBe('undefined')
  expect(rendererErrors).toEqual([])
})

test('设置页面展示供应商表格并通过 UI 新增/修改/删除', async () => {
  await page.locator('.foot-btn').click()
  await expect(page.locator('.settings-page')).toBeVisible()
  await page.getByRole('tab', { name: '供应商' }).click()
  await expect(page.locator('.ant-table-tbody tr').first()).toBeVisible()
  await page.getByRole('button', { name: '添加供应商' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input').nth(0).fill('Migration Test Provider')
  await dialog.locator('input').nth(1).fill('http://127.0.0.1:9099/v1')
  await dialog.locator('input').nth(2).fill('test-key')
  await dialog.locator('.model-input input').fill('test-model')
  await dialog.getByRole('button', { name: /^保\s*存$/ }).click()
  await expect(page.getByRole('cell', { name: 'Migration Test Provider', exact: true })).toBeVisible()
  const row = page.locator('.ant-table-tbody tr').filter({ hasText: 'Migration Test Provider' })
  await row.getByRole('button', { name: '编辑' }).click()
  await page.getByRole('dialog').locator('input').nth(0).fill('Migration Test Updated')
  await page.getByRole('dialog').getByRole('button', { name: /^保\s*存$/ }).click()
  const updated = page.locator('.ant-table-tbody tr').filter({ hasText: 'Migration Test Updated' })
  await expect(updated).toBeVisible()
  await updated.getByRole('button', { name: '删除' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^删\s*除$/ }).click()
  await expect(page.getByRole('cell', { name: 'Migration Test Updated', exact: true })).toHaveCount(0)
})

test('系统目录选择创建项目、会话模式持久化与项目级联删除', async () => {
  const result = await page.evaluate(async () => {
    const project = await window.desk.project.create()
    if (!project) throw new Error('Project canceled')
    const session = await window.desk.session.create({ projectId: project.id, mode: 'plan' })
    const updated = await window.desk.session.update(session.id, { mode: 'build' })
    const duplicate = await window.desk.project.create().then(() => '', (error: Error) => error.message)
    await window.desk.project.rename(project.id, 'Renamed Project')
    const projects = await window.desk.project.list()
    await window.desk.project.remove(project.id)
    const remaining = await window.desk.session.list()
    return { mode: updated.mode, duplicate, name: projects.find((item) => item.id === project.id)?.name, removed: !remaining.some((item) => item.id === session.id) }
  })
  expect(result.mode).toBe('build')
  expect(result.duplicate).toContain('已创建项目')
  expect(result.name).toBe('Renamed Project')
  expect(result.removed).toBe(true)
})

test('文件读写与越界拦截使用真实文件系统', async () => {
  const result = await page.evaluate(async ({ root, outside }) => {
    const entries = await window.desk.fs.list(root, root)
    const file = await window.desk.fs.read(root, root + '/hello.txt')
    await window.desk.fs.write(root, root + '/hello.txt', 'edited content')
    const edited = await window.desk.fs.read(root, root + '/hello.txt')
    const boundary = await window.desk.fs.read(root, outside).then(() => '', (error: Error) => error.message)
    return { entries: entries.map((entry) => entry.name), original: file.content, edited: edited.content, boundary }
  }, { root: projectPath, outside: join(directory, 'outside.txt') })
  expect(result.entries).toContain('hello.txt')
  expect(result.original).toBe('original content\n')
  expect(result.edited).toBe('edited content')
  expect(result.boundary).not.toBe('')
})

test('终端创建、输入、缩放、输出与释放', async () => {
  const output = await page.evaluate(async (cwd) => {
    let text = ''
    const terminal = await window.desk.terminal.create({ cwd, cols: 80, rows: 24 })
    const unbind = window.desk.terminal.onEvent((event) => { if (event.id === terminal.id && event.type === 'data') text += event.data })
    await window.desk.terminal.resize(terminal.id, 100, 30)
    await window.desk.terminal.write(terminal.id, 'printf "DESK_%s\\n" PTY_EXEC_OK\r')
    const deadline = Date.now() + 10000
    while (!text.includes('DESK_PTY_EXEC_OK') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
    await window.desk.terminal.dispose(terminal.id)
    unbind()
    return text
  }, projectPath)
  expect(output).toContain('DESK_PTY_EXEC_OK')
})

test('页面语言与主题设置生效，重载后保留', async () => {
  await page.evaluate(async () => { await window.desk.settings.save({ language: 'en', theme: 'light', updateAutoCheck: false }) })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.locator('.foot-btn').click()
  await expect(page.getByRole('tab', { name: 'General' })).toBeVisible()
  expect(rendererErrors).toEqual([])
})
