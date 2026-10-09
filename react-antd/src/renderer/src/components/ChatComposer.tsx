import './ChatComposer.scss'
/* 输入框：Enter 发送、Shift+Enter 换行；草稿/会话分别保存模式与模型。 */
import { useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Dropdown, Input, message, type InputRef } from 'antd'
import {
  DownOutlined,
  ReadOutlined,
  ToolOutlined,
  RobotOutlined,
  PauseCircleOutlined,
  SendOutlined
} from '@ant-design/icons'
import { useProjectStore } from '../stores/project'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import { t } from '../i18n'
import type { ChatMode } from '../../../shared/ipc'
export interface ChatComposerHandle {
  editText(content: string): void
}
export default function ChatComposer({
  streaming,
  disabled,
  onSubmit,
  onStop,
  ref
}: {
  streaming: boolean
  disabled?: boolean
  onSubmit(text: string, mode: ChatMode): void
  onStop(): void
  ref?: Ref<ChatComposerHandle>
}) {
  const navigate = useNavigate(),
    project = useProjectStore(),
    chat = useChatStore(),
    settings = useSettingsStore()
  const [text, setText] = useState(''),
    [draftMode, setDraftMode] = useState<ChatMode>('build')
  const inputRef = useRef<InputRef>(null)
  useImperativeHandle(
    ref,
    () => ({
      editText(content) {
        setText(content)
        inputRef.current?.focus()
      }
    }),
    []
  )
  const locked = Boolean(chat.currentId)
  const currentSession = chat.sessions.find((item) => item.id === chat.currentId)
  const currentModelId = locked ? (currentSession?.modelId ?? '') : settings.settings.modelId
  const currentMode = locked ? (currentSession?.mode ?? 'build') : draftMode
  async function onModeChange(mode: ChatMode): Promise<void> {
    if (locked) await chat.updateSessionMode(mode)
    else setDraftMode(mode)
  }
  async function onModelChange(command: string): Promise<void> {
    if (command === '__new_provider__') {
      navigate('/settings?tab=providers')
      return
    }
    const index = command.indexOf('::')
    if (index < 0) return
    const providerId = command.slice(0, index),
      modelId = command.slice(index + 2)
    if (locked) await chat.updateSessionModel(providerId, modelId)
    else await settings.saveSettings({ providerId, modelId })
  }
  function onSend(): void {
    const value = text.trim()
    if (!value || streaming || disabled) return
    if (!chat.currentId && !project.currentId) {
      message.warning(t('project.needProject'))
      return
    }
    onSubmit(value, currentMode)
    setText('')
  }
  return (
    <div className="composer">
      <div className="composer-box">
        <Input.TextArea
          variant="borderless"
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          autoSize={{ minRows: 1, maxRows: 8 }}
          placeholder={t('chat.inputPlaceholder')}
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              onSend()
            }
          }}
        />
        <div className="composer-bar">
          <div className="composer-left">
            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [currentMode],
                items: [
                  { key: 'plan', icon: <ReadOutlined />, label: t('chat.modePlan') },
                  { key: 'build', icon: <ToolOutlined />, label: t('chat.modeBuild') }
                ],
                onClick: ({ key }) => {
                  void onModeChange(key as ChatMode)
                }
              }}
            >
              <span className="picker-trigger" title={t('chat.modeTip')}>
                {currentMode === 'plan' ? (
                  <ReadOutlined className="picker-icon" />
                ) : (
                  <ToolOutlined className="picker-icon" />
                )}
                <span className="picker-name">
                  {t(currentMode === 'plan' ? 'chat.modePlan' : 'chat.modeBuild')}
                </span>
                <DownOutlined className="picker-arrow" />
              </span>
            </Dropdown>
            <Dropdown
              trigger={['click']}
              classNames={{ root: 'model-dropdown' }}
              menu={{
                items: [
                  { key: '__new_provider__', label: '+ ' + t('settings.addProvider') },
                  ...settings.providers
                    .filter((provider) => provider.enabled && provider.models.length > 0)
                    .map((provider) => ({
                      key: provider.id,
                      type: 'group' as const,
                      label: provider.name,
                      children: provider.models.map((model) => ({
                        key: `${provider.id}::${model}`,
                        label: model,
                        className: 'model-choice'
                      }))
                    }))
                ],
                onClick: ({ key }) => {
                  void onModelChange(key)
                }
              }}
            >
              <span className="picker-trigger">
                <RobotOutlined className="picker-icon" />
                <span className="picker-name">{currentModelId || t('settings.selectModel')}</span>
                <DownOutlined className="picker-arrow" />
              </span>
            </Dropdown>
          </div>
          <div className="composer-actions">
            {streaming ? (
              <Button
                danger
                shape="circle"
                aria-label={t('chat.stop')}
                icon={<PauseCircleOutlined />}
                onClick={onStop}
              />
            ) : (
              <Button
                type="primary"
                shape="circle"
                aria-label={t('chat.send')}
                icon={<SendOutlined />}
                disabled={!text.trim() || disabled}
                onClick={onSend}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
