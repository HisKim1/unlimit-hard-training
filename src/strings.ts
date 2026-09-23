// 사용자에게 보이는 모든 한국어 문구.

export const STR = {
  title: '원장님 키우기',
  subtitle: '언리밋 트레이닝에서 원장님을 운동시키자!',
  start: '시작하기',
  startHint: '소리를 켜려면 화면을 눌러주세요',
  levelSelect: '와드 선택',
  freeMode: '자유 모드',
  freeModeDesc: '타이머 없이 아무 기구나 놓고 놀기',
  locked: '잠김',
  best: (t: string) => `최고 기록 ${t}`,
  noRecord: '기록 없음',
  timeCap: (t: string) => `제한 ${t}`,
  back: '뒤로',
  mute: '소리 끄기',
  unmute: '소리 켜기',
  rotate: '세로로 돌려주세요',
  paused: '일시정지',
  resume: '계속하기',
  toLevelSelect: '와드 선택으로',
  retry: '다시 하기',
  nextLevel: '다음 와드',
  clearTitle: 'WOD 클리어!',
  failTitle: '실패…',
  failTimeout: '시간 초과',
  failFainted: '원장님이 기절했습니다',
  record: (t: string) => `기록 ${t}`,
  newBest: '최고 기록 갱신!',
  prevBest: (t: string) => `최고 기록 ${t}`,
  mental: '멘탈',
  freeHud: '자유 모드',
  prodButton: '재촉!',
  slap: '찰싹!',
  loading: '불러오는 중…',
  dragHint: '기구를 위로 끌어서 박스에 놓아주세요',
  allCleared: '모든 와드를 클리어했습니다!',

  // ---- 토스트 ----
  toastReels: '원장님이 릴스 촬영 중입니다. 조용히 해주세요.',
  toastFloorLow: [
    '원장님이 무시합니다.', '원장님: 하아… 5분만…', '원장님이 못 들은 척합니다.',
    '원장님: 방금 하려고 했는데 재촉해서 하기 싫어졌어요.',
    '원장님: 제가 쉬는 게 아니라 근육이 회의 중이에요.',
    '원장님: 지금 일어나면 바닥이 서운해해요.',
    '원장님: 잠깐만요. 숨 쉬는 것도 운동이잖아요.',
  ],
  toastFloorMid: [
    '원장님이 꿈틀거립니다.', '원장님: 제발…',
    '원장님: 마지막 한 세트라면서요. 아까도 마지막이었잖아요.',
    '원장님: 물 한 모금만요. 물 뜨러 집에 좀 다녀올게요.',
    '원장님: 코치님… 숨을 못 쉬겠어요…',
    '원장님: 다음 기구 말고 다음 생으로 갈 것 같아요.',
  ],
  toastFloorHigh: ['원장님이 일어나려 합니다! 좀 더 재촉해볼까요?'],
  toastGotUp: '원장님이 일어났습니다!',
  toastSpeedUp: '원장님이 속도를 올립니다!',
  toastGaveUp: '원장님: 나 안 해!',
  toastBurnoutWarning: '원장님이 번아웃 오기 직전입니다. 다른 박스로 옮길지도 몰라요!',
  toastFainted: '원장님이 기절했습니다.',
  toastFloorFull: (n: number) => `바닥에는 기구를 ${n}개까지만 놓을 수 있어요.`,
  toastSlotFull: '빈 자리가 없어요.',
  equipmentTab: '운동기구',
  buffTab: '버프',
  buffHint: '탄마는 원장님에게, 코치는 매트 위로 끌어주세요. 효과 2초 · 쿨타임 10초',
  buffCooldown: (sec: number) => `다시 사용하려면 ${Math.ceil(sec)}초 기다려 주세요.`,
  buffActive: (sec: number) => `효과 ${sec.toFixed(1)}초`,
  buffReady: '사용 가능',
  toastChalk: '탄마 투입! 2초 동안 운동 속도 2배!',
  toastChalkMiss: '탄마는 원장님에게 떨어뜨려 주세요.',
  toastCoachMiss: '코치는 매트 위에 놓아주세요.',
  bongArrives: ['앗! 봉코치가 등장했다! 도망가!', '봉코치다! 원장님, 빨리 다음 기구로 도망가요!', '봉코치: "다음 기구까지 뛰어갑니다!"'],
  heoArrives: ['허코: "회원님 여기서 쉬시면 안돼요. 빨리 다음 걸로 가세요"', '허코: "회원님, 매트는 침대가 아닙니다. 일어나세요!"', '허코: "쉬는 시간 끝! 다음 운동으로 가실게요!"'],
  coachLeft: '휴,,, 코치가 사라졌다.',
  wonjangRelaxed: '원장님이 안일해집니다',
  toastWodDone: 'WOD 완료!',
  toastTimeLow: '10초 남았습니다!',

  gaveUpBubble: '나 안 해!',
  offWod: (name: string) => `(딴짓) ${name}`,
  moreThanNeeded: (name: string) => `(추가) ${name}`,
};

export function pick<T>(arr: readonly T[], rnd: () => number = Math.random): T {
  return arr[Math.floor(rnd() * arr.length) % arr.length];
}

export function formatTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** 기록용 mm:ss.d */
export function formatRecord(sec: number): string {
  const m = Math.floor(sec / 60);
  const r = sec - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
}
