import './ApprovalDialog.scss'
/* 越界审批队列：并发请求按到达顺序展示，避免覆盖导致挂起。 */
import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from 'antd'
import { WarningFilled } from '@ant-design/icons'
import { t } from '../i18n'
import { api } from '../api'
import type { ChatApprovalChoice, ChatApprovalPrompt } from '../../../shared/ipc'
export default function ApprovalDialog() {
  const [prompt, setPrompt] = useState<ChatApprovalPrompt | null>(null)
  const current = useRef<ChatApprovalPrompt | null>(null)
  const queue = useRef<ChatApprovalPrompt[]>([])
  useEffect(
    () =>
      api.chat.onApproval((payload) => {
        if (current.current) queue.current.push(payload)
        else {
          current.current = payload
          setPrompt(payload)
        }
      }),
    []
  )
  function respond(choice: ChatApprovalChoice): void {
    if (!current.current) return
    void api.chat.respondApproval(current.current.requestId, choice)
    current.current = queue.current.shift() ?? null
    setPrompt(current.current)
  }
  return (
    <Modal
      open={!!prompt}
      width={440}
      centered
      closable={false}
      maskClosable={false}
      keyboard={false}
      className="approval-dialog"
      title={
        <div className="approval-header">
          <WarningFilled className="approval-icon" />
          <span className="approval-title">{t('chat.approvalTitle')}</span>
        </div>
      }
      footer={
        <div className="approval-footer">
          <Button type="primary" onClick={() => respond('once')}>
            {t('chat.approvalOnce')}
          </Button>
          <Button onClick={() => respond('session')}>{t('chat.approvalSession')}</Button>
          <Button onClick={() => respond('deny')}>{t('chat.approvalDeny')}</Button>
        </div>
      }
    >
      <div className="approval-body">
        <p className="approval-message">
          {t('chat.approvalMessage', [
            prompt?.tool ?? '',
            t(prompt?.action === 'write' ? 'chat.approvalWrite' : 'chat.approvalRead')
          ])}
        </p>
        <div className="approval-field">
          <span className="approval-label">{t('chat.approvalPath')}</span>
          <span className="approval-value">{prompt?.abs}</span>
        </div>
        <div className="approval-field">
          <span className="approval-label">{t('chat.approvalRoot')}</span>
          <span className="approval-value">{prompt?.root}</span>
        </div>
        <p className="approval-question">{t('chat.approvalQuestion')}</p>
      </div>
    </Modal>
  )
}
