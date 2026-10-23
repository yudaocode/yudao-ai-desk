import './FileTreeNode.scss'
/* 文件树节点：目录懒加载，过滤已加载节点及其祖先。 */
import {
  CaretRightOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  FileOutlined,
  LoadingOutlined
} from '@ant-design/icons'
import type { FsEntry } from '@shared/ipc'
interface Props {
  entry: FsEntry
  depth: number
  childrenMap: Record<string, FsEntry[]>
  expandedMap: Record<string, boolean>
  loadingMap: Record<string, boolean>
  selectedPath: string
  keyword: string
  onSelect(entry: FsEntry): void
  onToggle(entry: FsEntry): void
}
export default function FileTreeNode(props: Props) {
  const {
    entry,
    depth,
    childrenMap,
    expandedMap,
    loadingMap,
    selectedPath,
    keyword,
    onSelect,
    onToggle
  } = props
  const filtering = keyword.trim().length > 0,
    expanded = Boolean(expandedMap[entry.path]) || filtering
  function matches(item: FsEntry): boolean {
    const key = keyword.trim().toLowerCase()
    if (!key || item.name.toLowerCase().includes(key)) return true
    return Boolean(childrenMap[item.path]?.some(matches))
  }
  const visibleChildren = (childrenMap[entry.path] ?? []).filter(matches)
  return (
    <div className="tree-node">
      <button
        className={`tree-row${entry.path === selectedPath ? ' selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 13 }}
        title={entry.name}
        onClick={() => (entry.isDir ? onToggle(entry) : onSelect(entry))}
      >
        {entry.isDir ? (
          <CaretRightOutlined className={`tree-caret${expanded ? ' open' : ''}`} />
        ) : (
          <span className="tree-caret is-placeholder" />
        )}
        {entry.isDir ? (
          expanded ? (
            <FolderOpenOutlined className="tree-icon" />
          ) : (
            <FolderOutlined className="tree-icon" />
          )
        ) : (
          <FileOutlined className="tree-icon" />
        )}
        <span className="tree-name">{entry.name}</span>
        {loadingMap[entry.path] && <LoadingOutlined className="tree-loading spin" />}
      </button>
      {entry.isDir && expanded && !!visibleChildren.length && (
        <div className="tree-children">
          {visibleChildren.map((child) => (
            <FileTreeNode key={child.path} {...props} entry={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
