import { describe, expect, it } from 'vitest';
import { EQUIPMENT } from '../src/equipment';
import { STR, failText, josa } from '../src/strings';

describe('조사 (스펙 8장)', () => {
  it('받침 있으면 이, 없으면 가 (한글이 아니면 가)', () => {
    expect(josa('바벨', '이/가')).toBe('바벨이');
    expect(josa('로프', '이/가')).toBe('로프가');
    expect(josa('링', '이/가')).toBe('링이');
    expect(josa('스키 머신', '이/가')).toBe('스키 머신이');
    expect(josa('풀업 바', '이/가')).toBe('풀업 바가');
    expect(josa('플라이오 박스', '이/가')).toBe('플라이오 박스가');
    expect(josa('KB', '이/가')).toBe('KB가');
  });

  it('게으름 경고 문구 (사용자 지정 문장)', () => {
    expect(STR.emomLazy(EQUIPMENT.barbell.name)).toBe('바벨이 없어서 원장님이 게으름 피웁니다! 다음 기구를 배치해주세요!');
    expect(STR.emomLazy(EQUIPMENT.pullup.name)).toBe('풀업 바가 없어서 원장님이 게으름 피웁니다! 다음 기구를 배치해주세요!');
  });

  it('노랩 표시와 탈락 사유', () => {
    expect(STR.noRep(1)).toBe('노랩!');
    expect(STR.noRep(3)).toBe('노랩! 노랩! 노랩!');
    expect(failText('emomMissed')).toBe('벨을 놓쳤어요! 3초 안에 5번 재촉해야 해요.');
    expect(failText('emomUnfinished')).toBe('시간 안에 못 끝냈어요!');
    expect(failText('norep')).toBe('노랩 3번! 탈락!');
    expect(failText('timeout')).toBe(STR.failTimeout);
    expect(failText('fainted')).toBe(STR.failFainted);
  });

  it('벨 배너·HUD 문구', () => {
    expect(STR.emomBellBurpee(2, 5)).toBe('🔔 버피! 2/5');
    expect(STR.emomBellStation('메디신볼', 0, 5)).toBe('🔔 메디신볼! 0/5');
    expect(STR.emomHudBell(7, ' · 3/15')).toBe('🔔7 · 3/15');
  });
});
