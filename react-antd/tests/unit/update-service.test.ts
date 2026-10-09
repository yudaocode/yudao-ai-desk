/* 更新只读取本项目仓库和当前发行版本，防止下载另一前端或上游安装包。 */
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ releases: [] as any[], open: vi.fn(), requested: '' }))
vi.mock('electron', () => ({ app: { getVersion: () => '1.1.1' }, shell: { openExternal: fixture.open }, net: { request: ({ url }) => {
  fixture.requested = url
  const request = new EventEmitter() as EventEmitter & { setHeader(): void; end(): void }
  request.setHeader = () => {}
  request.end = () => queueMicrotask(() => { const response = Object.assign(new EventEmitter(), { statusCode: 200 }); request.emit('response', response); response.emit('data', Buffer.from(JSON.stringify(fixture.releases))); response.emit('end') })
  return request
} } }))
const edition = 'react-antd'
const extension = process.platform === 'darwin' ? 'dmg' : process.platform === 'win32' ? 'exe' : 'AppImage'
const other = edition === 'vue-antdv-next' ? 'react-antd' : 'vue-antdv-next'
function release(name: string, patch = {}) { return { tag_name: 'v1.2.0', draft: false, prerelease: false, html_url: 'https://github.com/test/desk/releases/tag/v1.2.0', body: 'notes', published_at: '2026-10-09', assets: [{ name: `Yudao-1.2.0-${name}-${process.arch}.${extension}`, browser_download_url: `https://github.com/test/desk/releases/download/v1.2.0/${name}.${extension}` }], ...patch } }
beforeEach(() => { vi.resetModules(); fixture.releases = []; fixture.requested = ''; fixture.open.mockClear(); vi.stubEnv('YUDAO_AI_DESK_RELEASE_REPO', 'test/desk') })
afterEach(() => vi.unstubAllEnvs())
it('rejects an unconfigured repository before contacting upstream', async () => { vi.stubEnv('YUDAO_AI_DESK_RELEASE_REPO', ''); const api = await import('../../src/main/services/updateService'); await expect(api.checkForUpdate()).rejects.toThrow(); expect(fixture.requested).toBe('') })
it('uses the configured repository and selects only this distribution', async () => { fixture.releases = [release(other), release(edition)]; const api = await import('../../src/main/services/updateService'); const info = await api.checkForUpdate(); expect(fixture.requested).toBe('https://api.github.com/repos/test/desk/releases?per_page=30'); expect(info.hasUpdate).toBe(true); expect(info.downloadUrl).toContain(`${edition}.${extension}`); expect(info.notes).toBe('notes') })
it('does not treat the other distribution as this version update', async () => { fixture.releases = [release(other)]; const api = await import('../../src/main/services/updateService'); expect((await api.checkForUpdate()).hasUpdate).toBe(false) })
it.each([{ draft: true }, { prerelease: true }, { tag_name: 'v1.1.1' }, { tag_name: 'v1.0.0' }])('ignores draft, prerelease and non-new versions: %j', async (patch) => { fixture.releases = [release(edition, patch)]; const api = await import('../../src/main/services/updateService'); expect((await api.checkForUpdate()).hasUpdate).toBe(false) })
it('only opens valid HTTPS GitHub release links', async () => { const api = await import('../../src/main/services/updateService'); for (const url of ['file:///tmp/payload', 'http://github.com/test', 'https://github.com.evil.test/payload', 'invalid']) await api.openDownload(url); expect(fixture.open).not.toHaveBeenCalled(); await api.openDownload('https://github.com/test/desk/releases'); expect(fixture.open).toHaveBeenCalledOnce() })
