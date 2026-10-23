<script setup lang="ts">
/* 输入框：Enter 发送，Shift+Enter 换行；左下角选择项目、模式与模型 */
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message as ElMessage } from 'antdv-next'
import { useProjectStore } from '@renderer/stores/project'
import { useChatStore } from '@renderer/stores/chat'
import { useSettingsStore } from '@renderer/stores/settings'
import { t } from '@renderer/i18n'
import type { ChatMode } from '@shared/ipc'

const props = defineProps<{ streaming: boolean; disabled?: boolean }>()
const emit = defineEmits<{ submit: [text: string, mode: ChatMode]; stop: [] }>()

const router = useRouter()
const project = useProjectStore()
const chat = useChatStore()
const settings = useSettingsStore()
const text = ref('')
const inputRef = ref()
/* 新建对话草稿模式：会话创建时随会话落库，默认 Build */
const draftMode = ref<ChatMode>('build')

/* 编辑历史消息：回填内容并聚焦输入框（供对话页调用） */
function editText(content: string): void {
  text.value = content
  nextTick(() => inputRef.value?.focus())
}

defineExpose({ editText })

/* 已存在会话时锁定为所属项目（项目不可改）；新建对话时可自由选择 */
const locked = computed(() => Boolean(chat.currentId))

/* 当前模型：已生成对话取会话配置，新建对话取默认配置 */
const currentModelId = computed(() =>
  locked.value ? chat.currentSession?.modelId ?? '' : settings.settings.modelId
)
const currentModelLabel = computed(() => currentModelId.value || t('settings.selectModel'))

/* 当前对话模式：已生成对话取会话配置，新建对话取草稿（默认 Build） */
const currentMode = computed<ChatMode>(() =>
  locked.value ? chat.currentSession?.mode ?? 'build' : draftMode.value
)
const currentModeLabel = computed(() =>
  currentMode.value === 'plan' ? t('chat.modePlan') : t('chat.modeBuild')
)

/* 切换模式：已生成对话落库到会话，新建对话仅改草稿 */
async function onModeChange(mode: ChatMode): Promise<void> {
  if (locked.value) {
    await chat.updateSessionMode(mode)
  } else {
    draftMode.value = mode
  }
}

/* 选择模型（命令格式 providerId::modelId）；顶部入口跳转供应商设置 */
async function onModelChange(command: string): Promise<void> {
  if (command === '__new_provider__') {
    router.push({ path: '/settings', query: { tab: 'providers' } })
    return
  }
  const index = command.indexOf('::')
  if (index < 0) {
    return
  }
  const providerId = command.slice(0, index)
  const modelId = command.slice(index + 2)
  if (locked.value) {
    await chat.updateSessionModel(providerId, modelId)
  } else {
    await settings.saveSettings({ providerId, modelId })
  }
}

/* 发送消息：校验内容与运行状态、要求新建对话已选项目，随后交由父组件提交 */
function onSend(): void {
  const value = text.value.trim()
  if (!value || props.streaming || props.disabled) {
    return
  }
  /* 强要求：新建对话必须先选择项目 */
  if (!chat.currentId && !project.currentId) {
    ElMessage.warning(t('project.needProject'))
    return
  }
  emit('submit', value, currentMode.value)
  text.value = ''
}

/* 键盘处理：Enter 发送，Shift+Enter 保留换行 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    onSend()
  }
}
</script>

<template>
  <div class="composer">
    <div class="composer-box">
      <a-textarea
        variant="borderless"
        ref="inputRef"
        v-model:value="text"

        :auto-size="{ minRows: 1, maxRows: 8 }"

        :placeholder="t('chat.inputPlaceholder')"
        :disabled="disabled"
        @keydown="onKeydown"
      />
      <div class="composer-bar">
        <div class="composer-left">
          <!-- 模式选择器：Plan（只读）/ Build（读写），默认 Build -->
          <a-dropdown :trigger="['click']" >
            <span class="picker-trigger" :title="t('chat.modeTip')">
              <span class="ui-icon picker-icon">
                <Reading v-if="currentMode === 'plan'" />
                <Tools v-else />
              </span>
              <span class="picker-name">{{ currentModeLabel }}</span>
              <span class="ui-icon picker-arrow"><ArrowDown /></span>
            </span>
            <template #popupRender>
              <a-menu @click="({ key }) => onModeChange(key as ChatMode)">
                <a-menu-item
                  key="plan"
                  :class="currentMode === 'plan' ? 'mode-active' : ''"
                >
                  <span class="ui-icon"><Reading /></span>{{ t('chat.modePlan') }}
                </a-menu-item>
                <a-menu-item
                  key="build"
                  :class="currentMode === 'build' ? 'mode-active' : ''"
                >
                  <span class="ui-icon"><Tools /></span>{{ t('chat.modeBuild') }}
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>

          <!-- 模型选择器：二级展示供应商与模型；顶部入口新建供应商 -->
          <!-- 菜单对应上游 el-dropdown max-height="320px"：限高、内部滚动，避免弹层超出窗口 -->
          <a-dropdown
            :trigger="['click']"

            root-class="model-dropdown"

          >
            <span class="picker-trigger">
              <span class="ui-icon picker-icon"><Cpu /></span>
              <span class="picker-name">{{ currentModelLabel }}</span>
              <span class="ui-icon picker-arrow"><ArrowDown /></span>
            </span>
            <template #popupRender>
              <a-menu
                style="max-height: 320px; overflow-y: auto"
                @click="({ key }) => onModelChange(String(key))"
              >
                <a-menu-item key="__new_provider__">
                  + {{ t('settings.addProvider') }}
                </a-menu-item>
                <template v-for="provider in settings.enabledProviders" :key="provider.id">
                  <a-menu-item class="provider-group" disabled>
                    {{ provider.name }}
                  </a-menu-item>
                  <a-menu-item
                    v-for="model in provider.models"
                    :key="`${provider.id}::${model}`"
                    class="model-choice"

                  >
                    {{ model }}
                  </a-menu-item>
                </template>
              </a-menu>
            </template>
          </a-dropdown>
        </div>

        <div class="composer-actions">
          <a-button v-if="streaming" shape="circle" danger @click="emit('stop')">
            <span class="ui-icon"><VideoPause /></span>
          </a-button>
          <a-button
            v-else
            shape="circle"
            type="primary"
            :disabled="!text.trim() || disabled"
            @click="onSend"
          >
            <span class="ui-icon"><Promotion /></span>
          </a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.composer {
  padding: 12px 32px 22px;
}

.composer-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 880px;
  margin: 0 auto;
  padding: 10px 10px 10px 16px;
  background: var(--desk-bg-elevated);
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius);
  box-shadow: var(--desk-shadow);
}

.composer-box:focus-within {
  border-color: var(--desk-primary);
}

.composer-box :deep(.ant-input) {
  border: 0;
  outline: none;
  background: transparent;
  box-shadow: none;
  padding: 8px 0;
  font-size: 14px;
  color: var(--desk-text);
}

/* 底部操作行：左下选择项目/模型，右下发送/停止 */
.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.composer-left {
  display: flex;
  /* 正文变窄（最小窗口 + 侧栏）时选择器换行，不压住右侧发送按钮 */
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

/* 无边框选择器触发器：图标 + 文本 + 向下角标 */
.picker-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  /* 允许在窄容器内收缩，名称按省略号显示 */
  min-width: 0;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--desk-text-secondary);
  font-size: 13px;
  outline: none;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.picker-trigger:hover {
  color: var(--desk-text);
  background: var(--desk-primary-soft);
}

.picker-trigger .picker-icon,
.picker-trigger .picker-arrow {
  flex-shrink: 0;
  font-size: 13px;
}

.picker-trigger .picker-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.ant-dropdown-trigger) {
  outline: none;
}

/* 模式下拉：当前项高亮；下拉项图标与文案留白 */
:deep(.ant-dropdown-menu-item.mode-active) {
  color: var(--desk-primary);
  font-weight: 600;
}

:deep(.ant-dropdown-menu-item.mode-active .ui-icon) {
  color: var(--desk-primary);
}

:deep(.ant-dropdown-menu-item .ui-icon) {
  margin-right: 6px;
}

.composer-actions {
  flex-shrink: 0;
}
</style>
