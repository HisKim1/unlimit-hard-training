// 침팬지 이벤트 확률 (스펙 12장). 나태 벌칙을 받으면 그 판 내내 높은 확률.
import { CONFIG } from '../config';

type Cfg = Pick<typeof CONFIG, 'CHIMP_CHANCE' | 'CHIMP_CHANCE_LAZY'>;

export function chimpChance(punished: boolean, cfg: Cfg = CONFIG): number {
  return punished ? cfg.CHIMP_CHANCE_LAZY : cfg.CHIMP_CHANCE;
}
