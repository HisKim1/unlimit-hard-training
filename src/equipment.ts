// 기구 정의 (SPEC 8.1)

export type EquipmentId =
  | 'barbell'
  | 'dumbbell'
  | 'jumprope'
  | 'pullup'
  | 'rower'
  | 'bike'
  | 'kettlebell'
  | 'rope'
  | 'ski'
  | 'mat'
  | 'box'
  | 'wallball'
  | 'rings';

export type Zone = 'floor' | 'rig' | 'ceiling';

/** 운동 모션을 어디에 맞춰 재생하는가 */
export type MotionAnchor =
  | 'feet' // 발 위치 = 기구 위치 (바벨·덤벨·케틀벨·줄넘기·매트)
  | 'machine' // 모션 그림에 기구가 포함, 기구 바닥선에 맞춤 (로잉·바이크·스키)
  | 'bar' // 풀업 바 높이에 맞춤
  | 'rope' // 로프를 따라 오르내림
  | 'rings'; // 링 높이에 맞춤

export interface EquipmentDef {
  id: EquipmentId;
  name: string; // 기구 표시 이름
  exercise: string; // 운동 이름 (세션 라벨 기본값)
  zone: Zone;
  /** 운동 모션 애니 키 후보 (여러 개면 무작위). 매트는 WOD 가 덮어쓴다. */
  motions: string[];
  motionAnchor: MotionAnchor;
  icon: string; // 툴바 아이콘 프레임 키
  sprite: string; // 바닥 기구 프레임 키
  /** 바닥 타원 반지름 (원근 스케일 1 기준) */
  footprint: { rx: number; ry: number };
  /** 원장님이 서는 지점 (기구 위치 기준 오프셋, 스케일 1 기준) */
  usePoint: { dx: number; dy: number };
  /** 모션 스프라이트 원점을 둘 지점 (기구 위치 기준 오프셋, 스케일 1 기준) */
  exerciseAnchor: { dx: number; dy: number };
  sessionDurationSec: number;
  heavy: boolean; // 떨어질 때 카메라 셰이크
  /** 운동 중 바닥 기구 스프라이트를 숨긴다 (모션 그림에 기구가 이미 그려져 있을 때) */
  hideDuringExercise: boolean;
  placeholderColor: number;
}

export const PULLUP_BAR_HEIGHT_PX = 180; // 고해상도 풀업: 바에서 발까지 158px + 바닥 여유
export const RINGS_HEIGHT_PX = 220; // 링 중심에서 매달린 발까지 약 200px + 바닥 여유
export const RINGS_SPACING_PX = 64; // 두 링 중심 사이 거리 (스케일 1)

export const EQUIPMENT: Record<EquipmentId, EquipmentDef> = {
  barbell: {
    id: 'barbell', name: '바벨', exercise: '스러스터', zone: 'floor',
    motions: ['wj_thruster'], motionAnchor: 'feet',
    icon: 'icon_barbell', sprite: 'equip_barbell',
    footprint: { rx: 92, ry: 16 }, usePoint: { dx: 0, dy: 14 }, exerciseAnchor: { dx: 0, dy: 6 },
    sessionDurationSec: 5, heavy: true, hideDuringExercise: true, placeholderColor: 0x3d6bd6,
  },
  dumbbell: {
    id: 'dumbbell', name: '덤벨', exercise: '데빌프레스', zone: 'floor',
    motions: ['wj_devilpress'], motionAnchor: 'feet',
    icon: 'icon_dumbbell', sprite: 'equip_dumbbell',
    footprint: { rx: 42, ry: 14 }, usePoint: { dx: 0, dy: 14 }, exerciseAnchor: { dx: 0, dy: 6 },
    sessionDurationSec: 5, heavy: true, hideDuringExercise: true, placeholderColor: 0x555555,
  },
  jumprope: {
    id: 'jumprope', name: '줄넘기', exercise: '더블언더', zone: 'floor',
    motions: ['wj_jumprope'], motionAnchor: 'feet',
    icon: 'icon_jumprope', sprite: 'equip_jumprope',
    footprint: { rx: 34, ry: 12 }, usePoint: { dx: 0, dy: 10 }, exerciseAnchor: { dx: 0, dy: 4 },
    sessionDurationSec: 4.5, heavy: false, hideDuringExercise: true, placeholderColor: 0xe0e0e0,
  },
  pullup: {
    id: 'pullup', name: '풀업 바', exercise: '풀업', zone: 'rig',
    motions: ['wj_pullup'], motionAnchor: 'bar',
    icon: 'icon_pullup', sprite: 'equip_pullup',
    footprint: { rx: 70, ry: 16 }, usePoint: { dx: 0, dy: 16 }, exerciseAnchor: { dx: 0, dy: -PULLUP_BAR_HEIGHT_PX },
    sessionDurationSec: 4.5, heavy: true, hideDuringExercise: false, placeholderColor: 0x222222,
  },
  rower: {
    id: 'rower', name: '로잉머신', exercise: '로잉', zone: 'floor',
    motions: ['wj_row'], motionAnchor: 'machine',
    icon: 'icon_rower', sprite: 'equip_rower',
    footprint: { rx: 88, ry: 20 }, usePoint: { dx: 0, dy: 22 }, exerciseAnchor: { dx: 0, dy: 0 },
    sessionDurationSec: 5.5, heavy: true, hideDuringExercise: true, placeholderColor: 0x2a2a2a,
  },
  bike: {
    id: 'bike', name: '어설트 바이크', exercise: '바이크', zone: 'floor',
    motions: ['wj_bike'], motionAnchor: 'machine',
    icon: 'icon_bike', sprite: 'equip_bike',
    footprint: { rx: 52, ry: 20 }, usePoint: { dx: 0, dy: 22 }, exerciseAnchor: { dx: 0, dy: 0 },
    sessionDurationSec: 5, heavy: true, hideDuringExercise: true, placeholderColor: 0x333333,
  },
  kettlebell: {
    id: 'kettlebell', name: '케틀벨', exercise: 'KB 스윙', zone: 'floor',
    motions: ['wj_kb_swing'], motionAnchor: 'feet',
    icon: 'icon_kettlebell', sprite: 'equip_kettlebell',
    footprint: { rx: 26, ry: 12 }, usePoint: { dx: 0, dy: 12 }, exerciseAnchor: { dx: 0, dy: 6 },
    sessionDurationSec: 4.5, heavy: true, hideDuringExercise: true, placeholderColor: 0x1d1d1d,
  },
  rope: {
    id: 'rope', name: '로프', exercise: '로프 클라임', zone: 'ceiling',
    motions: ['wj_rope_climb'], motionAnchor: 'rope',
    icon: 'icon_rope', sprite: 'equip_rope',
    footprint: { rx: 26, ry: 12 }, usePoint: { dx: 0, dy: 14 }, exerciseAnchor: { dx: 0, dy: 0 },
    sessionDurationSec: 6, heavy: false, hideDuringExercise: false, placeholderColor: 0xc8955a,
  },
  ski: {
    id: 'ski', name: '스키 머신', exercise: '스키', zone: 'floor',
    motions: ['wj_ski'], motionAnchor: 'machine',
    icon: 'icon_ski', sprite: 'equip_ski',
    footprint: { rx: 44, ry: 18 }, usePoint: { dx: 0, dy: 22 }, exerciseAnchor: { dx: 0, dy: 0 },
    sessionDurationSec: 5, heavy: true, hideDuringExercise: true, placeholderColor: 0x2f2f2f,
  },
  mat: {
    id: 'mat', name: '맨몸 매트', exercise: '싯업', zone: 'floor',
    motions: ['wj_situp'], motionAnchor: 'feet',
    icon: 'icon_mat', sprite: 'equip_mat',
    footprint: { rx: 72, ry: 20 }, usePoint: { dx: 0, dy: 16 }, exerciseAnchor: { dx: 0, dy: -12 },
    sessionDurationSec: 5, heavy: false, hideDuringExercise: false, placeholderColor: 0x303030,
  },
  box: {
    id: 'box', name: '플라이오 박스', exercise: '박스 점프', zone: 'floor',
    motions: ['wj_boxjump'], motionAnchor: 'machine',
    icon: 'icon_box', sprite: 'equip_box',
    footprint: { rx: 40, ry: 16 }, usePoint: { dx: -30, dy: 14 }, exerciseAnchor: { dx: 0, dy: 0 },
    sessionDurationSec: 5, heavy: true, hideDuringExercise: true, placeholderColor: 0xc9a46a,
  },
  wallball: {
    id: 'wallball', name: '메디신볼', exercise: '월볼 샷', zone: 'floor',
    motions: ['wj_wallball'], motionAnchor: 'feet',
    icon: 'icon_wallball', sprite: 'equip_wallball',
    footprint: { rx: 24, ry: 12 }, usePoint: { dx: 0, dy: 12 }, exerciseAnchor: { dx: 0, dy: 6 },
    sessionDurationSec: 5, heavy: true, hideDuringExercise: true, placeholderColor: 0x222222,
  },
  rings: {
    id: 'rings', name: '링', exercise: '링 머슬업', zone: 'ceiling',
    motions: ['wj_ringmu'], motionAnchor: 'rings',
    icon: 'icon_rings', sprite: 'equip_rings',
    footprint: { rx: 40, ry: 14 }, usePoint: { dx: 0, dy: 14 }, exerciseAnchor: { dx: 0, dy: -RINGS_HEIGHT_PX },
    sessionDurationSec: 5, heavy: false, hideDuringExercise: true, placeholderColor: 0xd9b27c,
  },
};

/** 툴바 순서 */
export const TOOLBAR_ORDER: EquipmentId[] = [
  'barbell', 'pullup', 'rower', 'dumbbell', 'jumprope', 'kettlebell', 'bike', 'wallball', 'box', 'mat', 'ski', 'rope', 'rings',
];

export interface MotionPreset {
  motions: readonly string[];
  exercise: string;
}

/** WOD 별로 기구 동작을 바꿀 때 쓰는 프리셋 */
export const MOTION_PRESETS = {
  situp: { motions: ['wj_situp'], exercise: '싯업' },
  pushup: { motions: ['wj_pushup'], exercise: '푸쉬업' },
  pushup_squat: { motions: ['wj_pushup', 'wj_airsquat'], exercise: '푸쉬업+스쿼트' },
  deadlift: { motions: ['wj_deadlift'], exercise: '데드리프트' },
} satisfies Record<string, MotionPreset>;

/** 자유 모드에서 기본 동작 대신 무작위로 섞이는 동작 (풀업은 머슬업과 무작위, SPEC 8.1) */
export const FREE_MODE_EXTRA_MOTIONS: Partial<Record<EquipmentId, MotionPreset[]>> = {
  pullup: [{ motions: ['wj_muscleup'], exercise: '머슬업' }],
  barbell: [MOTION_PRESETS.deadlift],
  mat: [MOTION_PRESETS.situp, MOTION_PRESETS.pushup, { motions: ['wj_airsquat'], exercise: '에어스쿼트' }],
};
