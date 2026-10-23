<script setup lang="ts">
/* 对话主区：消息流 + 输入框（模式/模型切换在输入框内，项目选择在空态输入框下方靠左） */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { message as ElMessage, Modal } from 'antdv-next'
import MessageItem from '@renderer/modules/chat/components/MessageItem.vue'
import ChatComposer from '@renderer/modules/chat/components/ChatComposer.vue'
import EmptyState from '@renderer/components/EmptyState.vue'
import TerminalPanel from '@renderer/modules/workspace/components/TerminalPanel.vue'
import RightPanel from '@renderer/modules/workspace/components/RightPanel.vue'
import { useChatStore } from '@renderer/stores/chat'
import { useSettingsStore } from '@renderer/stores/settings'
import { useLayoutStore } from '@renderer/stores/layout'
import { useProjectStore } from '@renderer/stores/project'
import { usePanelResize } from '@renderer/composables/usePanelResize'
import { t } from '@renderer/i18n'
import type { ChatMode } from '@shared/ipc'

const router = useRouter()
const chat = useChatStore()
const settings = useSettingsStore()
const layout = useLayoutStore()
const project = useProjectStore()
/* 消息滚动容器与输入框组件引用 */
const scrollRef = ref<HTMLElement | null>(null)
const composerRef = ref()

/* 是否有消息、是否具备对话条件（存在启用的供应商） */
const hasMessages = computed(() => chat.messages.length > 0)
const canChat = computed(() => settings.enabledProviders.length > 0)

/* 终端标签名与工作目录：优先当前会话所属项目，回落当前选择项目 */
const terminalProject = computed(() => {
  const id = chat.currentSession?.projectId || project.currentId
  return project.projects.find((item) => item.id === id) || null
})
const terminalName = computed(() => terminalProject.value?.name || t('chat.terminal'))
const terminalCwd = computed(() => terminalProject.value?.path || undefined)

/* 空态项目选择：当前项目名（未选择时展示占位文案） */
const currentProjectName = computed(
  () => project.currentProject?.name || t('project.selectProject')
)

/* 选择项目；选到「新建项目」时弹出目录选择并自动生成 */
async function onProjectChange(value: string): Promise<void> {
  if (value === '__new__') {
    try {
      await project.createProject()
    } catch (error) {
      ElMessage.error((error as Error).message)
    }
    return
  }
  project.selectProject(value)
}

/* 终端面板首次打开后保持挂载（隐藏时仅 v-show，不销毁本地 PTY 会话） */
const terminalOpened = ref(false)
watch(
  () => layout.terminalVisible,
  (visible) => {
    if (visible) {
      terminalOpened.value = true
    }
  }
)

/* 拖拽右侧栏左边缘调整宽度（统一复用 usePanelResize） */
const { startResize: startPanelResize } = usePanelResize({
  getWidth: () => layout.rightPanelWidth,
  setWidth: layout.setRightPanelWidth,
  edge: 'right'
})

let scrollFrame = 0
/* 是否贴近底部：用户上翻阅读时不再强制吸底（避免打断查看思考内容/回翻） */
const nearBottom = ref(true)

/* 用户滚动：按距底部距离更新 nearBottom（80px 阈值） */
function handleScroll(): void {
  const el = scrollRef.value
  if (!el) {
    return
  }
  nearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

/* 滚动到底部：合并到下一动画帧执行；非强制且用户已上翻时不吸底 */
function scrollToBottom(force = false): void {
  if (!force && !nearBottom.value) {
    return
  }
  if (scrollFrame) {
    return
  }
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight
    }
  })
}

/* 点击「回到底部」：恢复吸底并跳到底部 */
function goBottom(): void {
  nearBottom.value = true
  scrollToBottom(true)
}

/*
 * 末条「片段数/正文长度/末段文本长度」签名：思考/工具/正文任一推进都能感知；
 * 流式推进仅在贴近底部时跟随，用户上翻后不强拉到底。
 */
const streamSignature = computed(() => {
  const last = chat.messages[chat.messages.length - 1]
  if (!last) {
    return '0'
  }
  const lastPart = last.parts[last.parts.length - 1]
  const tail = lastPart
    ? lastPart.type === 'tool'
      ? (lastPart.tool.result?.length ?? 0)
      : lastPart.text.length
    : 0
  return `${chat.messages.length}|${last.parts.length}|${last.content.length}|${tail}`
})

/* 新消息（用户提问 / 新增回复）：强制吸底 */
watch(
  () => chat.messages.length,
  () => scrollToBottom(true)
)

/* 流式内容增长：仅在贴近底部时跟随 */
watch(streamSignature, () => scrollToBottom())

/* 切换会话：重置吸底状态并定位到底部 */
watch(
  () => chat.currentId,
  () => {
    nearBottom.value = true
    nextTick(() => scrollToBottom(true))
  }
)

/* 挂载后定位消息到底部 */
onMounted(() => {
  nextTick(() => scrollToBottom(true))
})

/* 发送消息：校验模型与项目后交给会话 store 发起生成 */
async function onSend(text: string, mode: ChatMode = 'build'): Promise<void> {
  if (!canChat.value) {
    ElMessage.warning(t('chat.noModel'))
    router.push('/settings')
    return
  }
  /* 强要求：新建对话必须先选择项目 */
  if (!chat.currentId && !project.currentId) {
    ElMessage.warning(t('project.needProject'))
    return
  }
  await chat.send(text, mode)
}

/* 空态示例：点击直接以该内容发起新对话 */
const examples = ['chat.suggestion1', 'chat.suggestion2', 'chat.suggestion3']

/* 点击空态示例：以其文案直接发起对话 */
function onPickExample(text: string): void {
  void onSend(text)
}

/* 编辑用户消息：回填输入框并聚焦 */
function onEditMessage(content: string): void {
  composerRef.value?.editText(content)
}

/* 删除当前消息：同步删除存储与前端渲染，保持一致 */
async function onRemoveMessage(message: { id: string }): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      Modal.confirm({
        title: t('chat.deleteMessage'), content: t('chat.deleteMessageConfirm'),
        okText: t('common.delete'), cancelText: t('common.cancel'),
        onOk: () => resolve(), onCancel: () => reject('cancel')
      })
    })
    await chat.removeMessages([message.id])
    ElMessage.success(t('common.deleted'))
  } catch {
    /* 取消 */
  }
}
</script>

<template>
  <div class="chat-page">
    <!-- 工作区：左对话内容 + 右侧侧栏（侧边任务） -->
    <div class="chat-workspace">
      <!-- 侧栏隐藏时正文始终显示（放大态一并隐藏）；仅「显示且放大」时让位给侧栏，避免收起后正文被留白 -->
      <div
        v-show="!layout.rightPanelVisible || !layout.rightPanelMaximized"
        class="chat-content"
        :class="{ empty: !hasMessages }"
      >
        <div v-if="!hasMessages" class="chat-body empty">
          <EmptyState />
        </div>
        <div v-else ref="scrollRef" class="chat-body" @scroll="handleScroll">
          <div class="chat-inner">
            <MessageItem
              v-for="message in chat.messages"
              :key="message.id"
              :message="message"
              @edit="onEditMessage"
              @remove="onRemoveMessage(message)"
            />
          </div>
        </div>

        <!-- 上翻阅读时显示：一键回到底部并恢复自动跟随 -->
        <button
          v-if="hasMessages && !nearBottom"
          class="scroll-to-bottom"
          :title="t('chat.scrollToBottom')"
          @click="goBottom"
        >
          <span class="ui-icon"><ArrowDown /></span>
        </button>

        <ChatComposer
          ref="composerRef"
          :streaming="chat.streaming"
          :disabled="!canChat"
          @submit="onSend"
          @stop="chat.abort"
        />

        <!-- 空态：项目选择（输入框下方、左对齐输入框左边、固定宽度） -->
        <div v-if="!hasMessages" class="empty-project">
          <div class="empty-project-inner">
            <a-dropdown :trigger="['click']" >
              <span class="project-trigger" :title="t('project.label')">
                <span class="ui-icon project-icon"><Folder /></span>
                <span class="project-name">{{ currentProjectName }}</span>
                <span class="ui-icon project-arrow"><ArrowDown /></span>
              </span>
              <template #popupRender>
                <a-menu @click="({ key }) => onProjectChange(String(key))">
                  <a-menu-item key="__new__">+ {{ t('project.new') }}</a-menu-item>
                  <a-menu-item v-for="item in project.projects" :key="item.id" >
                    {{ item.name }}
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </div>
        </div>

        <!-- 空态示例：输入框下方以文字入口平铺，点击直接发起对话 -->
        <div v-if="!hasMessages" class="empty-examples">
          <span class="examples-label">{{ t('chat.examplesLabel') }}</span>
          <template v-for="(key, index) in examples" :key="key">
            <span v-if="index > 0" class="examples-sep">{{ t('chat.examplesSep') }}</span>
            <a class="example-link" @click="onPickExample(t(key))">{{ t(key) }}</a>
          </template>
        </div>
      </div>

      <!-- 右侧侧栏（侧边任务）：工具菜单 + 文件/浏览器面板，可拖拽宽度、可放大占满正文区 -->
      <aside
        v-show="layout.rightPanelVisible"
        class="chat-side-panel"
        :class="{ maximized: layout.rightPanelMaximized }"
        :style="layout.rightPanelMaximized ? undefined : { width: `${layout.rightPanelWidth}px` }"
      >
        <!-- 左边缘拖拽手柄：拖拽调整侧栏宽度，双击恢复默认宽度（放大态下不可拖拽） -->
        <div
          v-if="!layout.rightPanelMaximized"
          class="side-panel-resizer"
          :title="t('layout.resetPanelWidth')"
          @mousedown="startPanelResize"
          @dblclick="layout.resetRightPanelWidth"
        ></div>
        <RightPanel :root="terminalProject?.path" :project-name="terminalProject?.name" />
      </aside>
    </div>

    <!-- 底部终端面板：本地 PTY + xterm（首次打开后保持挂载） -->
    <TerminalPanel
      v-if="terminalOpened"
      v-show="layout.terminalVisible"
      :cwd="terminalCwd"
      :title="terminalName"
      :visible="layout.terminalVisible"
      @close="layout.toggleTerminal"
    />
  </div>
</template>

<style scoped lang="scss">
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}

/* 工作区：左对话内容（自适应）+ 右侧侧栏 */
.chat-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
}

.chat-content {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 空态：标题/项目选择、输入框与示例作为一组整体垂直居中（整体略上移） */
.chat-content.empty {
  justify-content: center;
  padding-bottom: 10vh;
}

.chat-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

/* 空态体：仅占内容高度，便于与输入框整体居中 */
.chat-body.empty {
  flex: 0 0 auto;
  display: flex;
  padding: 0;
}

/* 回到底部按钮：悬浮于输入框上方右侧，用户上翻时出现 */
.scroll-to-bottom {
  position: absolute;
  right: 32px;
  bottom: 112px;
  z-index: 10;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--desk-border);
  border-radius: 50%;
  background: var(--desk-bg-elevated);
  color: var(--desk-text-secondary);
  cursor: pointer;
  box-shadow: var(--desk-shadow);
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.scroll-to-bottom:hover {
  color: var(--desk-text);
  border-color: var(--desk-text-tertiary);
}

.chat-inner {
  max-width: 880px;
  margin: 0 auto;
}

/* 空态项目选择：紧贴输入框下沿，宽度比输入框略窄、居中 */
.empty-project {
  flex-shrink: 0;
  /* 抵消输入框容器底部 22px 内边距，使背景框紧贴输入框 */
  margin-top: -22px;
  padding: 0 32px 10px;
}

/* 背景框：比输入框（880px）略窄、居中；浅灰底、圆角，内容靠左 */
.empty-project-inner {
  max-width: 840px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 34px;
  padding: 0 10px;
  background: var(--desk-segment-bg);
  border-radius: 0 0 12px 12px;
}

/* 项目选择：可点击下拉触发器，固定宽度不随项目名长短变化 */
.project-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 150px;
  box-sizing: border-box;
  padding: 6px 10px;
  border-radius: 8px;
  color: var(--desk-text-secondary);
  font-size: 14px;
  cursor: pointer;
  outline: none;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.project-trigger:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.project-trigger .project-icon,
.project-trigger .project-arrow {
  flex-shrink: 0;
  font-size: 14px;
}

.project-trigger .project-name {
  flex: 1;
  min-width: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 空态示例：与输入框同宽居中，纯文字入口（无背景框） */
.empty-examples {
  flex-shrink: 0;
  width: 100%;
  max-width: 880px;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 0 32px 24px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--desk-text-tertiary);
}

.examples-label {
  color: var(--desk-text-tertiary);
}

.examples-sep {
  color: var(--desk-text-tertiary);
  margin: 0 2px;
}

.example-link {
  color: var(--desk-text-secondary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.example-link:hover {
  color: var(--desk-primary);
  text-decoration: underline;
}

/* 右侧侧栏（侧边任务）：可拖拽宽度；放大态占满正文区 */
.chat-side-panel {
  position: relative;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--desk-border);
  background: var(--desk-sidebar);
}

.chat-side-panel.maximized {
  flex: 1;
  min-width: 0;
}

/* 左边缘拖拽手柄：与左侧会话栏保持同宽（5px），视觉条细；下方 ::after 提供更宽命中区 */
.side-panel-resizer {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  -webkit-app-region: no-drag;
}

/* 透明命中区：视觉条保持 5px，实际可抓取范围更宽（近分割线即可拖动） */
.side-panel-resizer::after {
  content: '';
  position: absolute;
  top: 0;
  left: -2px;
  width: 16px;
  height: 100%;
}

.side-panel-resizer:hover,
body.resizing .side-panel-resizer {
  background: var(--desk-primary-soft);
}
</style>
