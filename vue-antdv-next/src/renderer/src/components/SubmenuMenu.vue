<script setup lang="ts">
/*
* 通用子菜单列表：插件 / 系统设置 等板块的二级列表（数据来自 config/nav）
* @author xuxueli 2026-10-18
*/
import { t } from '@renderer/i18n'
import type { NavItem } from '@renderer/config/nav'

/* bold：子菜单名是否加粗（插件板块为 true，系统设置板块为 false） */
defineProps<{ titleKey: string; items: NavItem[]; activeKey: string; bold?: boolean }>()
const emit = defineEmits<{ select: [item: NavItem] }>()
</script>

<template>
  <div class="panel-head">
    <div class="panel-title">{{ t(titleKey) }}</div>
  </div>
  <div class="desk-scroll sidebar-list">
    <div
      v-for="item in items"
      :key="item.key"
      class="menu-item"
      :class="{ active: item.key === activeKey, 'is-bold': bold }"
      @click="emit('select', item)"
    >
      <span v-if="item.icon" class="ui-icon menu-icon"><component :is="item.icon" /></span>
      <span class="menu-label">{{ t(item.labelKey) }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 子菜单标题：字体与首页标题保持一致 */
.panel-head {
  padding: 10px 16px 12px;
}

.panel-title {
  font-size: 18px;
  font-weight: 600;
  line-height: 32px;
  color: var(--desk-text);
}

/* 子菜单项：颜色对齐「新建对话」（近黑），加粗由 bold 决定 */
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 2px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--desk-text);
  font-size: 14px;
  font-weight: 400;
  transition: background 0.15s ease;
}

.menu-item.is-bold {
  font-weight: 600;
}

.menu-item:hover {
  background: var(--desk-primary-soft);
}

.menu-item.active {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.menu-icon {
  flex-shrink: 0;
  font-size: 15px;
}

.menu-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
