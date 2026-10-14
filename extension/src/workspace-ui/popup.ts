import type { Workspace } from '../rule-model/schema';
import { updateGroup } from './editor';

/** Popup height is tight. These are the groups that win first. */
export const POPUP_GROUP_LIMIT = 8;

export interface PopupGroup {
  id: string;
  name: string;
  enabled: boolean;
  ruleCount: number;
}

export function popupGroupList(workspace: Workspace): { shown: PopupGroup[]; more: number } {
  const shown = workspace.groups.slice(0, POPUP_GROUP_LIMIT).map((group) => ({
    id: group.id,
    name: group.name,
    enabled: group.enabled,
    ruleCount: group.rules.length,
  }));
  return { shown, more: Math.max(0, workspace.groups.length - shown.length) };
}

export function withGroupEnabled(workspace: Workspace, groupId: string, enabled: boolean): Workspace {
  return updateGroup(workspace, groupId, { enabled });
}
