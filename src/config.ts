// 모든 밸런스·레이아웃 수치. 코드 곳곳에 매직 넘버를 두지 않는다.

export type Point = { x: number; y: number };

export const CONFIG = {
  logicalWidth: 720,
  logicalHeight: 1280,

  // ---- 재촉 ----
  PROD_COOLDOWN_MS: 100,
  PROD_REQUIRED_MIN: 5,
  PROD_REQUIRED_MAX: 10,
  PROD_VIBRATE_MS: 15,
  CHEER_COOLDOWN_SEC: 5,
  CHEER_PROD_REDUCTION: 3,
  CHEER_MENTAL_RECOVERY: 20,
  SPEED_TOAST_MIN_GAP_MS: 1500, // 연속 재촉 시 "속도를 올립니다" 토스트 최소 간격

  // ---- 기구 ----
  SESSIONS_PER_EQUIPMENT: 1,
  TIE_EPSILON_PX: 8,
  MAX_FLOOR_EQUIPMENT: 5,
  RIG_SLOTS: 3,
  ROPE_ANCHORS: 3, // 로프·링 공용 천장 고정점

  // ---- 이동 ----
  WALK_SPEED_PX_PER_SEC: 90, // 비실비실
  CRAWL_SPEED_MULT: 0.6,
  CRAWL_THRESHOLD: 60,
  ARRIVE_EPSILON_PX: 4,
  WALK_WOBBLE_DEG: 4, // 걷기 좌우 흔들림
  WALK_WOBBLE_HZ: 2.2,
  STAGGER_CHANCE_PER_SEC: 0.18, // 가끔 휘청임
  STAGGER_DURATION_MS: 450,

  // ---- 속도 배율 ----
  SPEED_MULT_PER_PROD: 0.5,
  MAX_SPEED_MULT: 2.5,
  SPEED_DECAY_DELAY_SEC: 2,
  SPEED_DECAY_PER_SEC: 0.75, // 2초 뒤 1.0까지 서서히 복귀하는 속도

  // ---- 번아웃 ----
  BURNOUT_PER_ACTIVE_PROD: 10,
  BURNOUT_DECAY: { EXHAUSTED: 5, IDLE_REELS: 3, DEFAULT: 1 }, // per sec
  GIVEUP_THRESHOLD: 50,
  GIVEUP_CHANCE: 0.25,
  BURNOUT_WARNING: 70,
  BURNOUT_FAINT: 100,
  CHALK_DROP_RADIUS_PX: 110, // 원장님 몸 근처 이 반경 안에 떨어뜨려야 초크 적용
  FATIGUE_MIN_ANIM_SPEED: 0.35, // 지침으로 느려져도 모션 재생 속도는 이 아래로 내리지 않는다

  // ---- 침팬지 · 나태 (스펙 12장) ----
  CHIMP_CHANCE: 0.005, // 받아들여진 재촉 1번당
  CHIMP_CHANCE_LAZY: 0.01, // 나태 벌칙을 받은 판
  CHIMP_TOAST_MS: 2700,
  CHIMP_PULSE_MS: 450, // 붉은 테두리 켜짐(또는 꺼짐) 시간
  LAZY_WARN_SEC: 5,
  LAZY_GRACE_SEC: 2,
  LAZY_GRACE_PRODS: 5,

  // ---- 버프 (사용 시점부터 쿨타임, 효과는 중첩하지 않음) ----
  BUFF_DURATION_SEC: 2,
  BUFF_COOLDOWN_SEC: 10,
  CHALK_EXERCISE_MULT: 2,
  BONG_WALK_MULT: 2,
  HEO_PROD_INTERVAL_SEC: 0.15,
  JONG_DURATION_SEC: 5,
  JONG_RECOVERY_MULT: 2,
  COACH_ROAM_SEC: 3,
  COACH_EXIT_SPEED: 100,
  COACH_WALK_SPEED: 160,
  BONG_ROAM_SPEED: 90,

  // ---- 상태 연출 시간 ----
  FLOOR_POSE_SWAP_SEC: [4, 6] as [number, number],
  GETTING_UP_MS: 600,
  GAVE_UP_MS: 1200,
  FAINT_TO_RESULT_MS: 2200,
  CLEAR_TO_RESULT_MS: 2200,
  TIME_LOW_WARNING_SEC: 10,
  INTRO_TOAST_MS: 2200,

  // ---- 입력 ----
  DRAG_START_PX: 12,
  DRAG_LIFT_PX: 64, // 드래그 중 기구를 손가락보다 이만큼 위에 그려서 가리지 않게 함
  TOOLBAR_INERTIA_DECAY: 4.5, // 관성 스크롤 감쇠 (1/s)
  TOOLBAR_MAX_FLING_PX_PER_SEC: 3000,

  // ---- UI ----
  TOAST_MS: 1200,
  DROP_FALL_MS: 350,
  DROP_FALL_HEIGHT_PX: 420,
  REMOVE_FADE_MS: 450,

  // ---- 이펙트 ----
  SWEAT_INTERVAL_MS: [900, 260] as [number, number], // 번아웃 0 → 100 에서의 땀 간격
  BREATH_INTERVAL_MS: [800, 420] as [number, number], // 입김 퍼프 간격
  PANT_SOUND_INTERVAL_MS: 1600,
  MAX_PARTICLES: 60,

  // ---- 레이아웃 (논리 좌표 720x1280, 배경 box_bg.jpg 기준) ----
  HUD_HEIGHT: 150,
  TOOLBAR_TOP: 1122,
  TOOLBAR_HEIGHT: 158,
  TOOLBAR_TAB_HEIGHT: 40,
  TOOLBAR_ITEM_W: 124,
  TOOLBAR_ICON_SIZE: 92,
  PROD_BUTTON: { x: 608, y: 1040, r: 66 },

  /** 매트(바닥) 설치 가능 다각형. `?debug` 모드에서 그려진다. */
  FLOOR_POLYGON: [
    { x: 24, y: 712 },
    { x: 700, y: 700 },
    { x: 712, y: 985 },
    { x: 512, y: 985 },
    { x: 500, y: 1010 },
    { x: 10, y: 1010 },
  ] as Point[],
  /** 원장님이 걸어다닐 수 있는 영역 (기구 usePoint 가 이 밖이면 안쪽으로 당긴다) */
  WALK_BOUNDS: { minX: 30, maxX: 690, minY: 690, maxY: 1030 },

  /** 풀업 바 리그 슬롯: 뒷벽 리그 앞 바닥 지점 */
  RIG_SLOT_POINTS: [
    { x: 150, y: 708 },
    { x: 330, y: 700 },
    { x: 510, y: 694 },
  ] as Point[],
  /** 천장 고정점(로프·링): 매단 기구 아래 바닥 지점 (천장은 화면 위쪽 밖) */
  ROPE_ANCHOR_POINTS: [
    { x: 92, y: 888 },
    { x: 362, y: 760 },
    { x: 628, y: 872 },
  ] as Point[],
  SLOT_SNAP_RADIUS_PX: 110,
  ROPE_TOP_Y: -20,

  WONJANG_START: { x: 360, y: 850 } as Point,
  WONJANG_BODY_RADIUS_PX: 34, // 기구 배치 겹침 판정용

  /** 원근: 발 y 좌표에 따른 스케일 */
  DEPTH_Y_FAR: 640,
  DEPTH_Y_NEAR: 1040,
  DEPTH_SCALE_FAR: 0.8,
  DEPTH_SCALE_NEAR: 1.1,
  /** 월드 배율: 기구 수치(footprint·usePoint 등)는 "서 있는 원장님 키 190" 단위로 적혀 있고, 화면에서는 이만큼 키운다 */
  WORLD_SCALE: 1.15,
  /** 아틀라스 텍스처가 190 단위보다 몇 배로 구워졌는가 (assets/frames.json 의 globalScale 과 같아야 함) */
  TEXTURE_SCALE: 1.15,
  CHARACTER_BASE_SCALE: 1.0,
};

/** 발 y 좌표에서의 월드 배율 (원근 × WORLD_SCALE). 190 단위 수치에 곱한다. */
export function depthScale(y: number): number {
  const t = Math.min(1, Math.max(0, (y - CONFIG.DEPTH_Y_FAR) / (CONFIG.DEPTH_Y_NEAR - CONFIG.DEPTH_Y_FAR)));
  return (CONFIG.DEPTH_SCALE_FAR + (CONFIG.DEPTH_SCALE_NEAR - CONFIG.DEPTH_SCALE_FAR) * t) * CONFIG.WORLD_SCALE;
}

/** 아틀라스 스프라이트에 줄 setScale 값 (월드 배율을 텍스처 배율로 나눔) */
export function spriteScale(y: number): number {
  return depthScale(y) / CONFIG.TEXTURE_SCALE;
}

export const COLORS = {
  hudBg: 0x0d1117,
  hudText: '#ffffff',
  accentBlue: 0x1f5fd6, // 벽 파란 띠
  accentBlueCss: '#2b6ef2',
  good: 0x3ddc84,
  bad: 0xff4d4d,
  warn: 0xffc53d,
  toolbarBg: 0x111418,
  toolbarItem: 0x232a33,
  toolbarItemDisabled: 0x15191e,
  prod: 0xff6b3d,
  prodPressed: 0xc2471f,
  white: 0xffffff,
  black: 0x000000,
};

export const FONT = "Jua, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";

export const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
export const VIEWER = typeof location !== 'undefined' && new URLSearchParams(location.search).has('viewer');
/** 개발용: `?speed=4` 처럼 주면 게임 로직 시간을 배속 (밸런스 자동 테스트용) */
export const TIME_SCALE = (() => {
  if (typeof location === 'undefined') return 1;
  const v = Number(new URLSearchParams(location.search).get('speed'));
  return Number.isFinite(v) && v > 0 ? Math.min(20, v) : 1;
})();
