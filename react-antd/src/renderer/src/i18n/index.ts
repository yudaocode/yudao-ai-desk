/* 国际化：沿用上游 zh/en 词条与 t()，语言由设置驱动 */
import zh from '@renderer/i18n/locales/zh.json'
import en from '@renderer/i18n/locales/en.json'

let language: 'zh' | 'en' = 'zh'

/* 应用语言；设置 store 更新同时触发 React 页面重绘 */
export function setLanguage(value: 'zh' | 'en'): void {
  language = value
}

/* 与上游保持 key、中文回退与位置/具名参数插值 */
export function t(key: string, parameters?: unknown[] | Record<string, unknown>): string {
  let value: unknown = language === 'en' ? en : zh
  let fallback: unknown = zh
  for (const part of key.split('.')) {
    value =
      value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined
    fallback =
      fallback && typeof fallback === 'object'
        ? (fallback as Record<string, unknown>)[part]
        : undefined
  }
  const text = typeof value === 'string' ? value : typeof fallback === 'string' ? fallback : key
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const replacement = Array.isArray(parameters) ? parameters[Number(name)] : parameters?.[name]
    return replacement === undefined ? placeholder : String(replacement)
  })
}
