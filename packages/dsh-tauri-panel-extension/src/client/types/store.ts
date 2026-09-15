/** types/store.ts — valtio-define store 的状态形状（store/modules/* 的 state 类型）。 */

/** 技能创建器草稿预填：等待消费的会话 id 集合。 */
export interface PrefillState {
  pendingSessionIds: string[]
}
