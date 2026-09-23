import type { EquipmentId } from './equipment';
import { STR } from './strings';

export const BUFFS = {
  chalk: { name: '탄마', icon: 'icon_chalk', hint: '운동 속도 ×2', messages: [STR.toastChalk] },
  bong: { name: '봉코치', icon: 'icon_bong', hint: '이동 속도 ×2', messages: STR.bongArrives },
  heo: { name: '허코치', icon: 'icon_heo', hint: '자동 재촉', messages: STR.heoArrives },
  jong: { name: '종코치', icon: 'icon_jong', hint: '멘탈 회복 ×2', messages: STR.jongArrives },
};
export type BuffId = keyof typeof BUFFS;
export type CoachId = Exclude<BuffId, 'chalk'>;
export type ToolbarId = EquipmentId | BuffId;
export const BUFF_ORDER: BuffId[] = ['chalk', 'bong', 'heo', 'jong'];
export function isBuff(id: string): id is BuffId { return Object.prototype.hasOwnProperty.call(BUFFS, id); }
