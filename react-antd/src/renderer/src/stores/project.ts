/* 项目状态：项目 1:1 绑定本地目录，会话归属项目。 */
import { create } from 'zustand'
import { api } from '@renderer/api'
import { t } from '@renderer/i18n'
import type { ProjectDTO } from '@shared/ipc'

interface ProjectState {
  projects: ProjectDTO[]
  currentId: string
  loaded: boolean
  loadProjects(): Promise<void>
  selectProject(id: string): void
  createProject(): Promise<ProjectDTO | null>
  renameProject(id: string, name: string): Promise<void>
  removeProject(id: string): Promise<void>
  revealProject(id: string): Promise<void>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentId: '',
  loaded: false,
  /* 加载项目列表（保留当前选择，失效则清空） */
  loadProjects: async () => {
    const projects = await api.project.list()
    const currentId = get().currentId
    set({
      projects,
      currentId: projects.some((item) => item.id === currentId) ? currentId : '',
      loaded: true
    })
  },
  selectProject: (id) => set({ currentId: id }),
  /* 新建项目：主进程弹系统目录对话框，取消返回 null */
  createProject: async () => {
    const created = await api.project.create({ dialogTitle: t('project.selectDirTitle') })
    if (created) set((state) => ({ projects: [created, ...state.projects], currentId: created.id }))
    return created
  },
  renameProject: async (id, name) => {
    const updated = await api.project.rename(id, name)
    set((state) => ({
      projects: state.projects.map((item) =>
        item.id === id ? { ...item, name: updated.name } : item
      )
    }))
  },
  /* 删除项目（主进程级联删除会话与消息） */
  removeProject: async (id) => {
    await api.project.remove(id)
    set((state) => ({
      projects: state.projects.filter((item) => item.id !== id),
      currentId: state.currentId === id ? '' : state.currentId
    }))
  },
  revealProject: async (id) => {
    await api.project.reveal(id)
  }
}))
