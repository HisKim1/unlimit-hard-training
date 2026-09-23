// localStorage 저장 (SPEC 10장). 읽기·쓰기 실패 시 메모리 값으로 계속 진행한다.

export const SAVE_KEY = 'wonjang.save.v1';
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  unlockedLevel: number;
  bestTimes: Record<string, number>;
  settings: { muted: boolean };
}

export function defaultSave(): SaveData {
  return { version: SAVE_VERSION, unlockedLevel: 1, bestTimes: {}, settings: { muted: false } };
}

/** 저장소 인터페이스 (테스트에서 가짜 저장소 주입) */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function sanitize(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<SaveData>;
  if (r.version !== SAVE_VERSION) return d; // 버전이 다르면 기본값으로 마이그레이션
  if (typeof r.unlockedLevel === 'number' && Number.isFinite(r.unlockedLevel)) {
    d.unlockedLevel = Math.max(1, Math.floor(r.unlockedLevel));
  }
  if (r.bestTimes && typeof r.bestTimes === 'object') {
    for (const [k, v] of Object.entries(r.bestTimes)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) d.bestTimes[k] = v;
    }
  }
  if (r.settings && typeof r.settings === 'object' && typeof r.settings.muted === 'boolean') {
    d.settings.muted = r.settings.muted;
  }
  return d;
}

export class SaveStore {
  private data: SaveData;

  constructor(private readonly kv: KV | null = SaveStore.defaultKV()) {
    this.data = this.load();
  }

  static defaultKV(): KV | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null; // 접근 자체가 막힌 환경
    }
  }

  private load(): SaveData {
    try {
      const s = this.kv?.getItem(SAVE_KEY);
      return s ? sanitize(JSON.parse(s)) : defaultSave();
    } catch {
      return defaultSave();
    }
  }

  private persist(): void {
    try {
      this.kv?.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // iOS 사파리 개인정보 보호 모드 등: 메모리 값으로 계속 진행
    }
  }

  get(): Readonly<SaveData> {
    return this.data;
  }

  get muted(): boolean {
    return this.data.settings.muted;
  }

  setMuted(m: boolean): void {
    this.data.settings.muted = m;
    this.persist();
  }

  isUnlocked(level: number): boolean {
    return level <= this.data.unlockedLevel;
  }

  best(wodId: string): number | undefined {
    return this.data.bestTimes[wodId];
  }

  /** 레벨 클리어 기록. 최고 기록을 갱신했으면 true */
  recordClear(wodId: string, level: number, timeSec: number): boolean {
    const prev = this.data.bestTimes[wodId];
    const isBest = prev === undefined || timeSec < prev;
    if (isBest) this.data.bestTimes[wodId] = Math.round(timeSec * 10) / 10;
    this.data.unlockedLevel = Math.max(this.data.unlockedLevel, level + 1);
    this.persist();
    return isBest;
  }
}

export const save = new SaveStore();
