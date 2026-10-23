import './ShortcutInput.scss'
/* 快捷键录制：焦点态录制组合键，Esc 退出并阻止全局快捷键。 */
import { useState, type KeyboardEvent } from 'react'
import { t } from '@renderer/i18n'
import { eventToBinding, formatShortcut, isModifierKey } from '@renderer/utils/shortcut'
export default function ShortcutInput({
  value,
  onChange
}: {
  value?: string
  onChange(value: string): void
}) {
  const [recording, setRecording] = useState(false)
  function onKeydown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!recording) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.currentTarget.blur()
      return
    }
    if (isModifierKey(event.nativeEvent)) return
    onChange(eventToBinding(event.nativeEvent))
  }
  return (
    <div
      className={`shortcut-input${recording ? ' recording' : ''}`}
      tabIndex={0}
      onFocus={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={onKeydown}
    >
      {value ? (
        <span className="shortcut-value">{formatShortcut(value)}</span>
      ) : (
        <span className="shortcut-placeholder">
          {t(recording ? 'settings.shortcutRecording' : 'settings.shortcutEmpty')}
        </span>
      )}
    </div>
  )
}
