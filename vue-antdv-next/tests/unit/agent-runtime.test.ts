/* 验证真实工具与沙箱，不访问外部模型或业务数据。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clearSessionPermissions, guardPath, resolveTarget, setApprovalRequester } from '../../src/main/agent/worker/sandbox'
import { createBuiltinTools } from '../../src/main/agent/worker/tools'
import { buildModels, normalizeBaseUrl, USER_AGENT } from '../../src/main/agent/worker/models'
let directory: string, root: string, outside: string
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'desk-unit-')); root = join(directory, 'project'); outside = join(directory, 'outside.txt'); mkdirSync(root); writeFileSync(join(root, 'a.txt'), 'alpha\nbeta alpha\n'); writeFileSync(outside, 'private outside'); setApprovalRequester(null); clearSessionPermissions('test'); clearSessionPermissions('other') })
afterEach(() => { setApprovalRequester(null); clearSessionPermissions('test'); clearSessionPermissions('other'); rmSync(directory, { recursive: true, force: true }) })
const request = (rootDir: string, target: string, sessionId = 'test') => guardPath({ rootDir, target, sessionId, action: 'read', tool: 'read_file' })
describe('sandbox', () => {
  it('resolves relative and empty paths against project', () => { expect(resolveTarget(root, 'a.txt')).toBe(join(root, 'a.txt')); expect(resolveTarget(root, '')).toBe(root) })
  it('allows internal existing and new files without approval', async () => { const approve = vi.fn(); setApprovalRequester(approve); expect((await request(root, 'a.txt')).allowed).toBe(true); expect((await request(root, 'new/nested.txt')).allowed).toBe(true); expect(approve).not.toHaveBeenCalled() })
  it('denies traversal without approval provider', async () => { expect((await request(root, '../outside.txt')).allowed).toBe(false) })
  it('denies symbolic links to outside files and nonexistent tails', async () => { symlinkSync(directory, join(root, 'link')); expect((await request(root, 'link/outside.txt')).allowed).toBe(false); expect((await request(root, 'link/new/deep.txt')).allowed).toBe(false) })
  it('once approval prompts on each attempt', async () => { const approve = vi.fn(async () => 'once' as const); setApprovalRequester(approve); expect((await request(root, outside)).allowed).toBe(true); expect((await request(root, outside)).allowed).toBe(true); expect(approve).toHaveBeenCalledTimes(2) })
  it('session approval applies to the same path/session only and can be cleared', async () => { const approve = vi.fn(async () => 'session' as const); setApprovalRequester(approve); await request(root, outside); await request(root, outside); expect(approve).toHaveBeenCalledTimes(1); await request(root, outside, 'other'); expect(approve).toHaveBeenCalledTimes(2); clearSessionPermissions('test'); await request(root, outside); expect(approve).toHaveBeenCalledTimes(3) })
  it('approval errors fail closed', async () => { setApprovalRequester(async () => { throw new Error('closed window') }); expect((await request(root, outside)).allowed).toBe(false) })
})
describe('actual builtin tools', () => {
  async function tools(mode: 'plan' | 'build') { return createBuiltinTools({ rootDir: root, sessionId: 'test', mode }) }
  async function execute(name: string, params: unknown) { const tool = (await tools('build')).find((item) => item.name === name)!; return tool.execute('call', params, undefined, undefined) }
  it('Plan exposes only the five readonly tools; Build also exposes write/edit/command', async () => { expect((await tools('plan')).map((item) => item.name).sort()).toEqual(['get_current_time', 'glob_files', 'list_directory', 'read_file', 'search_files']); expect((await tools('build')).map((item) => item.name)).toContain('run_command'); expect((await tools('build')).length).toBe(8) })
  it('reads line ranges with one-based line numbers', async () => { const result = await execute('read_file', { path: 'a.txt', offset: 2, limit: 1 }); expect(result.content).toEqual([{ type: 'text', text: '2\tbeta alpha' }]) })
  it('creates nested files and edits first vs all occurrences', async () => { await execute('write_file', { path: 'nested/new.txt', content: 'a a' }); expect(readFileSync(join(root, 'nested/new.txt'), 'utf8')).toBe('a a'); await execute('edit_file', { path: 'nested/new.txt', old_string: 'a', new_string: 'b' }); expect(readFileSync(join(root, 'nested/new.txt'), 'utf8')).toBe('b a'); await execute('edit_file', { path: 'nested/new.txt', old_string: 'a', new_string: 'c', replace_all: true }); expect(readFileSync(join(root, 'nested/new.txt'), 'utf8')).toBe('b c') })
  it('returns an error for denied outside reads and writes without altering files', async () => { expect(await execute('read_file', { path: outside })).toMatchObject({ isError: true }); expect(await execute('write_file', { path: outside, content: 'changed' })).toMatchObject({ isError: true }); expect(readFileSync(outside, 'utf8')).toBe('private outside') })
  it('returns an error for absent edit source', async () => { expect(await execute('edit_file', { path: 'a.txt', old_string: 'nonexistent', new_string: 'bad' })).toMatchObject({ isError: true }) })
  it('glob includes nested files and skips dependency directories', async () => { mkdirSync(join(root, 'nested')); writeFileSync(join(root, 'nested/b.txt'), 'beta'); mkdirSync(join(root, 'node_modules')); writeFileSync(join(root, 'node_modules/skip.txt'), 'alpha'); const result = await execute('glob_files', { pattern: '**/*.txt' }); const text = JSON.stringify(result.content); expect(text).toContain('nested/b.txt'); expect(text).not.toContain('skip.txt') })
  it('runs an actual command in the project cwd', async () => { const result = await execute('run_command', { command: 'pwd', timeout: 3000 }); expect(JSON.stringify(result.content)).toContain(root) })
})
describe('model construction', () => {
  it.each([[' http://localhost:11434/ ', 'http://localhost:11434/v1'], ['https://example.com/custom/v1/', 'https://example.com/custom/v1'], ['https://example.com', 'https://example.com/v1']])('normalizes %s', (input, expected) => { expect(normalizeBaseUrl(input)).toBe(expected) })
  it('retains model configuration and substitutes the real session header', async () => { const models = await buildModels([{ id: 'provider', name: 'test', baseUrl: 'http://localhost:1234', apiKey: '', models: ['test-model'], headers: { 'x-session': '{session}/{session}', 'User-Agent': 'custom' }, sessionId: 'real-session' }]); const model = models.getModel('provider', 'test-model')!; expect(model.baseUrl).toBe('http://localhost:1234/v1'); expect(model.headers).toMatchObject({ 'x-session': 'real-session/real-session', 'User-Agent': USER_AGENT }); const auth = await models.getAuth(model); expect(auth?.auth).toMatchObject({ apiKey: 'not-required' }) })
  it('omits session-dependent headers before a session exists', async () => { const models = await buildModels([{ id: 'provider', name: 'test', baseUrl: 'http://127.0.0.1:1234/v1', apiKey: 'key', models: ['model'], headers: { 'x-session': '{session}', 'x-static': 'static' } }]); expect(models.getModel('provider', 'model')?.headers).toEqual({ 'x-static': 'static', 'User-Agent': USER_AGENT }) })
})
