// 레벨(WOD) 정의 (SPEC 9.2). 초기값 — 플레이테스트로 조정.
// 레벨 번호는 WOD_LIST 순서로 1부터 매긴다. 순서는 docs/superpowers/specs/2026-09-28-emom-wod-design.md 10장.
import type { EquipmentId } from './equipment';
import { MOTION_PRESETS, type MotionPreset } from './equipment';

export interface WodRequirement {
  equipment: EquipmentId;
  sessions: number;
  /** 세션별 라벨 (연출용). 길이 = sessions */
  labels: string[];
}

export interface WodDef {
  id: string;
  /** 1부터. WOD_LIST 순서에서 자동으로 매긴다 */
  level: number;
  name: string; // 영문 WOD 이름
  nameKo: string;
  original: string; // 원래 내용
  timeCapSec: number;
  requirements: WodRequirement[];
  /** 이 WOD 에서 기구가 수행할 동작 (예: 매트 → 싯업, 바벨 → 데드리프트) */
  overrides?: Partial<Record<EquipmentId, MotionPreset>>;
  bonus?: boolean; // SPEC 5레벨 이후 추가분
  /** HUD·카드에서 이름이 넘칠 때 쓰는 짧은 이름 */
  shortName?: string;
  /** 기구별 세션 시간(초) 덮어쓰기 */
  sessionSec?: Partial<Record<EquipmentId, number>>;
  /** 연속 지수 감속: 진행률 p 에서 운동 속도 = endSpeed^p (스펙 11장) */
  fatigue?: { equipment: EquipmentId; endSpeed: number };
}

type WodSpec = Omit<WodDef, 'level'>;

const rep = (label: string, n: number) => Array.from({ length: n }, () => label);

const WOD_LIST: WodSpec[] = [
  {
    id: 'fran', name: 'Fran', nameKo: '프랜', original: '21-15-9 스러스터, 풀업', timeCapSec: 120,
    requirements: [
      { equipment: 'barbell', sessions: 3, labels: ['스러스터 21개', '스러스터 15개', '스러스터 9개'] },
      { equipment: 'pullup', sessions: 3, labels: ['풀업 21개', '풀업 15개', '풀업 9개'] },
    ],
  },
  {
    id: 'karen', name: 'Karen', nameKo: '캐런', original: '월볼 샷 150개', timeCapSec: 85, bonus: true,
    requirements: [
      { equipment: 'wallball', sessions: 5, labels: rep('월볼 30개', 5) },
    ],
  },
  {
    id: 'devil1000', name: '데빌프레스나 1000개 시켜ㅠ', nameKo: '성지윤', shortName: '데빌 1000',
    original: '성지윤 WOD: 데빌프레스 1000개, 10초에 100개씩', timeCapSec: 400, bonus: true,
    sessionSec: { dumbbell: 10 },
    fatigue: { equipment: 'dumbbell', endSpeed: 1 / 8 },
    requirements: [
      { equipment: 'dumbbell', sessions: 10, labels: Array.from({ length: 10 }, (_, i) => `데빌프레스 ${(i + 1) * 100}/1000`) },
    ],
  },
  {
    id: 'diane', name: 'Diane', nameKo: '다이앤 (박스 변형)', original: '21-15-9 데드리프트, 핸드스탠드 푸쉬업', timeCapSec: 115, bonus: true,
    overrides: { barbell: MOTION_PRESETS.deadlift, mat: MOTION_PRESETS.pushup },
    requirements: [
      { equipment: 'barbell', sessions: 3, labels: ['데드리프트 21개', '데드리프트 15개', '데드리프트 9개'] },
      { equipment: 'mat', sessions: 3, labels: ['푸쉬업 21개 (HSPU 대체)', '푸쉬업 15개 (HSPU 대체)', '푸쉬업 9개 (HSPU 대체)'] },
    ],
  },
  {
    id: 'jackie', name: 'Jackie', nameKo: '재키', original: '1000m 로잉, 스러스터 50, 풀업 30', timeCapSec: 160,
    requirements: [
      { equipment: 'rower', sessions: 3, labels: ['로잉 334m', '로잉 333m', '로잉 333m'] },
      { equipment: 'barbell', sessions: 3, labels: ['스러스터 17개', '스러스터 17개', '스러스터 16개'] },
      { equipment: 'pullup', sessions: 3, labels: rep('풀업 10개', 3) },
    ],
  },
  {
    id: 'tommyv', name: 'Tommy V', nameKo: '토미 V', original: '21-15-9 스러스터, 12-9-6 로프 클라임', timeCapSec: 130, bonus: true,
    requirements: [
      { equipment: 'barbell', sessions: 3, labels: ['스러스터 21개', '스러스터 15개', '스러스터 9개'] },
      { equipment: 'rope', sessions: 3, labels: ['로프 클라임 12회', '로프 클라임 9회', '로프 클라임 6회'] },
    ],
  },
  {
    id: 'annie', name: 'Annie', nameKo: '애니', original: '50-40-30-20-10 더블언더, 싯업', timeCapSec: 180,
    overrides: { mat: MOTION_PRESETS.situp },
    requirements: [
      { equipment: 'jumprope', sessions: 5, labels: ['더블언더 50개', '더블언더 40개', '더블언더 30개', '더블언더 20개', '더블언더 10개'] },
      { equipment: 'mat', sessions: 5, labels: ['싯업 50개', '싯업 40개', '싯업 30개', '싯업 20개', '싯업 10개'] },
    ],
  },
  {
    id: 'helen', name: 'Helen', nameKo: '헬렌 (박스 변형)', original: '3라운드: 400m 달리기, KB 스윙 21, 풀업 12', timeCapSec: 150,
    requirements: [
      { equipment: 'bike', sessions: 3, labels: rep('바이크 400m', 3) },
      { equipment: 'kettlebell', sessions: 3, labels: rep('KB 스윙 21개', 3) },
      { equipment: 'pullup', sessions: 3, labels: rep('풀업 12개', 3) },
    ],
  },
  {
    id: 'jerry', name: 'Jerry', nameKo: '제리 (박스 변형)', original: '1마일 달리기, 2K 로잉, 1마일 달리기', timeCapSec: 115, bonus: true,
    requirements: [
      { equipment: 'bike', sessions: 2, labels: rep('바이크 800m (런 대체)', 2) },
      { equipment: 'rower', sessions: 2, labels: rep('로잉 1000m', 2) },
      { equipment: 'ski', sessions: 2, labels: rep('스키 800m (런 대체)', 2) },
    ],
  },
  {
    id: 'cindy', name: 'Cindy', nameKo: '신디 (박스 변형)', original: '20분 AMRAP: 풀업 5, 푸쉬업 10, 스쿼트 15', timeCapSec: 175, bonus: true,
    overrides: { mat: MOTION_PRESETS.pushup_squat },
    requirements: [
      { equipment: 'pullup', sessions: 5, labels: rep('풀업 5개', 5) },
      { equipment: 'mat', sessions: 5, labels: rep('푸쉬업 10개 + 스쿼트 15개', 5) },
    ],
  },
  {
    id: 'christine', name: 'Christine', nameKo: '크리스틴', original: '3라운드: 500m 로잉, 데드리프트 12, 박스 점프 21', timeCapSec: 180, bonus: true,
    overrides: { barbell: MOTION_PRESETS.deadlift },
    requirements: [
      { equipment: 'rower', sessions: 3, labels: rep('로잉 500m', 3) },
      { equipment: 'barbell', sessions: 3, labels: rep('데드리프트 12개', 3) },
      { equipment: 'box', sessions: 3, labels: rep('박스 점프 21개', 3) },
    ],
  },
  {
    id: 'kelly', name: 'Kelly', nameKo: '켈리 (박스 변형)', original: '5라운드: 400m 달리기, 박스 점프 30, 월볼 30', timeCapSec: 150, bonus: true,
    requirements: [
      { equipment: 'rower', sessions: 3, labels: rep('로잉 400m', 3) },
      { equipment: 'box', sessions: 3, labels: rep('박스 점프 30개', 3) },
      { equipment: 'wallball', sessions: 3, labels: rep('월볼 30개', 3) },
    ],
  },
  {
    id: 'nate', name: 'Nate', nameKo: '네이트 (박스 변형)', original: '20분 AMRAP: 머슬업 2, HSPU 4, KB 스윙 8', timeCapSec: 190, bonus: true,
    overrides: { mat: MOTION_PRESETS.pushup },
    requirements: [
      { equipment: 'rings', sessions: 3, labels: rep('링 머슬업 2개', 3) },
      { equipment: 'mat', sessions: 3, labels: rep('푸쉬업 4개 (HSPU 대체)', 3) },
      { equipment: 'kettlebell', sessions: 3, labels: rep('KB 스윙 8개', 3) },
    ],
  },
  {
    id: 'murph', name: 'Murph', nameKo: '머프 (박스 변형)', original: '1마일 달리기, 풀업 100, 푸쉬업 200, 스쿼트 300, 1마일 달리기', timeCapSec: 200,
    overrides: { mat: MOTION_PRESETS.pushup_squat },
    requirements: [
      { equipment: 'bike', sessions: 4, labels: rep('바이크 0.5마일', 4) },
      { equipment: 'pullup', sessions: 4, labels: rep('풀업 25개', 4) },
      { equipment: 'mat', sessions: 4, labels: rep('푸쉬업 50개 + 스쿼트 75개', 4) },
    ],
  },
];

export const WODS: WodDef[] = WOD_LIST.map((w, i) => ({ ...w, level: i + 1 }));

export function wodByLevel(level: number): WodDef | undefined {
  return WODS.find((w) => w.level === level);
}
