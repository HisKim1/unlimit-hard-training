# EMOM형 WOD 설계 (칼수형 · 순환형)

작성일: 2026-09-28 · 상태: 설계 승인, 스펙 검토 대기

## 1. 목표

일정 간격마다 벨이 울리고, 플레이어가 **3초 안에 재촉을 5번** 눌러 원장님을 다음 동작으로 보내는 WOD 방식을 추가한다. 두 종류를 만든다.

- **칼수형 (interrupt)**: 주 운동(스러스터)을 하다가 벨마다 그 자리에서 버피를 끼워 넣고 다시 주 운동으로 돌아간다.
- **순환형 (rotate)**: 벨마다 정해진 다음 기구로 이동한다. 기구는 플레이어가 미리 배치한다.

추가 WOD

| Lv | WOD | 형태 | 간격(초기값) | 게임 세션 |
|---|---|---|---|---|
| 14 | Chelsea (박스 변형) | 순환 | 15초 | 풀업 ↔ 매트(푸쉬업+스쿼트) × 5라운드 = 10구간 |
| 15 | Kalsu | 칼수형 | 10초 | 바벨(스러스터 20개) × 5, 벨마다 버피 5개 |
| 16 | Fight Gone Bad (박스 변형) | 순환 | 15초 | 월볼 → 케틀벨(SDHP 대체) → 박스 → 바벨(푸쉬 프레스 대체) → 로잉 × 3라운드 = 15구간 |

간격 값은 autoplay 측정 후 조정한다. 칼수 10초는 사용자 지정값이라 유지를 우선한다.

원본 표기: Chelsea `EMOM 30분: 풀업 5, 푸쉬업 10, 스쿼트 15`, Kalsu `스러스터 100개, 매분 시작마다 버피 5개`, Fight Gone Bad `3라운드, 각 1분: 월볼, 스모 데드리프트 하이풀, 박스 점프, 푸쉬 프레스, 로잉`.

## 2. 비목표

- 버피 전용 새 그림 (기존 프레임 조합으로 만들고, 나중에 같은 키 `wj_burpee`로 교체)
- Fight Gone Bad 원본의 라운드 사이 1분 휴식
- 자유 모드의 EMOM
- 벨 재촉에 허코(자동 재촉) 버프 적용

## 3. 결정 사항 (사용자 확정)

1. 벨이 울린 뒤 3초 안에 재촉 5번을 못 채우면 **즉시 탈락**.
2. 벨 재촉은 **번아웃을 올리지 않고** 속도 배율도 올리지 않는다. 기존 재촉 쿨타임(100ms)은 그대로 적용한다.
3. 순환형 다음 기구는 **플레이어가 미리 배치**한다. 벨 3초 전에 다음 구간 기구가 없으면 경고한다:
   `"{기구}{이/가} 없어서 원장님이 게으름 피웁니다! 다음 기구를 배치해주세요!"` (받침에 따라 이/가)
4. 벨에 성공했는데 그 구간 기구가 없으면 원장님은 **게으름 대기(릴스)** 상태가 된다. 붉은 테두리가 은은하게 맥박처럼 3번 깜빡이고, 한 번 깜빡일 때마다 `노랩!`이 하나씩 늘어난다 (`노랩!` → `노랩! 노랩!` → `노랩! 노랩! 노랩!`). 3번째가 끝날 때까지 기구를 놓지 않으면 **탈락**한다. 도중에 기구가 착지하면 즉시 취소되고 원장님이 이동한다.
5. 버피 모션은 기존 프레임을 조합해서 만든다.
6. 구조: 독립 순수 로직 `EmomClock` + Brain 최소 확장 (접근 A).

## 4. 데이터

`src/wods.ts`

```ts
export interface EmomDef {
  kind: 'interrupt' | 'rotate';
  intervalSec: number;
  /** 칼수형: 벨마다 끼워 넣는 맨몸 동작 */
  interrupt?: { anim: string; label: string; durationSec: number };
  /** 순환형: 구간 k 의 기구 = rotation[k % rotation.length] */
  rotation?: EquipmentId[];
}
// WodDef 에 추가
emom?: EmomDef;
```

`src/config.ts` 공통값

```ts
EMOM_PREP_SEC: 5,         // 시작 ~ 첫 벨
EMOM_WINDOW_SEC: 3,       // 벨 후 재촉 창
EMOM_PRODS_REQUIRED: 5,
EMOM_WARN_BEFORE_SEC: 3,  // 벨 전 경고 시점
NOREP_COUNT: 3,
NOREP_PULSE_MS: 900,      // 붉은 테두리 한 번 (450ms 켜짐 + 450ms 꺼짐)
```

순환형의 요구 세션 수는 `rotation`에서 각 기구가 나오는 횟수 × 라운드 수와 같아야 한다 (단위 테스트로 검사).
순환형 제한 시간은 `EMOM_PREP_SEC + intervalSec × 총 구간 수 + 10초`로 둔다. 순환형에서 제한 시간은 안전장치이고, 실제 판정은 벨이 한다.

## 5. EmomClock (`src/systems/Emom.ts`, Phaser 무관)

벨 k(0부터)의 시각 = `EMOM_PREP_SEC + k × intervalSec`. 구간 k는 벨 k에서 시작한다.

```ts
type EmomEvent =
  | { type: 'warn'; bell: number }      // 벨 k 의 EMOM_WARN_BEFORE_SEC 전
  | { type: 'bell'; bell: number }      // 창 열림
  | { type: 'answered'; bell: number }  // 창 안에서 재촉 수 충족
  | { type: 'missed'; bell: number };   // 창 종료까지 미충족

class EmomClock {
  constructor(def: EmomDef, cfg?: Cfg);
  update(dtSec: number): EmomEvent[]; // 큰 dt 로 경계를 여러 번 넘어도 시간 순서대로 모두 반환
  prod(): boolean;                    // 창이 열려 있으면 카운트하고 true
  stop(): void;                       // 클리어·탈락 후 이벤트 중지
  readonly windowOpen: boolean;
  readonly prodCount: number;         // 현재 창의 재촉 수
  readonly windowRemainingSec: number;
  readonly secToNextBell: number;
  readonly interval: number;          // 현재 구간 번호 (첫 벨 전 -1)
  station(k: number): EquipmentId | null; // 순환형 구간 k 의 기구
}
```

- 창이 열린 동안 받은 재촉은 모두 벨 카운트로만 쓴다. 창 밖의 재촉은 `prod()`가 false를 반환하고, 호출한 쪽이 일반 재촉으로 처리한다.
- 5번째 재촉에서 바로 `answered`가 나오고 창이 닫힌다.
- 시간은 GameScene의 `dt`(TIME_SCALE 포함)만 사용한다. 그래서 일시정지하면 자동으로 멈추고 `?speed=`도 적용된다.

## 6. Brain 확장

- 새 상태 `BURPEE`. `beginInterrupt(durationSec)`
  - 현재 상태, `targetId`, `sessionProgress`를 저장한다. 운동 중이었으면 `exercisePaused` 이벤트를 보낸다 (뷰는 기구 숨김과 라벨을 해제).
  - `BURPEE` 동안 세션 진행도는 오르지 않는다. 번아웃 감소는 DEFAULT 값을 쓴다. 재촉은 `none`으로 처리한다.
  - 끝나면 복귀한다:
    - 운동 중이었고 기구가 남아 있으면 → `EXERCISING` 복귀 + 저장한 진행도 복원 + `startExercise` 이벤트
    - 걷던 중이었으면 → `WALKING` (목표가 사라졌으면 `goNext`)
    - 그 밖의 상태(바닥, 릴스, 일어나는 중, 포기)였으면 → `goNext()`. 바닥 재촉이 필요 없다.
  - `FAINTED`, `CELEBRATING`에서는 무시한다.
- `bellProd(): boolean`: 쿨타임을 검사하고 `lastProdMs`만 갱신한다. 번아웃, 속도, 상태는 바꾸지 않는다.
- `bellAnswered()` (순환형): `EXHAUSTED`이면 `GETTING_UP`을 거쳐 `goNext()`, 릴스이면 바로 `goNext()`.
- `floorProdLocked` 플래그 (순환형에서 true): 바닥 재촉과 허코 자동 재촉을 막는다. 대신 재촉하면 `벨 기다리는 중` 토스트를 띄운다. 원장님은 세션을 마친 뒤 벨까지 바닥에서 쉰다.
- 목표 선택: GameScene의 `candidates()`가 순환형일 때 **현재 구간 기구 종류만** 돌려준다. 첫 벨 전에는 빈 목록이다. Targeting 코드는 바꾸지 않는다.

## 7. GameScene 흐름

공통

- `wod.emom`이 있으면 `EmomClock`을 만들고 매 프레임 `update(dt)`를 호출해서 이벤트를 처리한다. 클리어하거나 탈락하면 `stop()`한다.
- 재촉 버튼: 창이 열려 있고 `brain.bellProd()`가 true이면 `emom.prod()`를 호출한다. 효과음, 찰싹 이펙트, 진동은 일반 재촉과 같다. 침팬지 이벤트는 굴리지 않는다. 창이 닫혀 있으면 기존 `brain.prod()`를 쓴다.
- `bell`: 벨 효과음, 벨 배너(HUD 아래 가운데: `🔔 버피! 0/5`, 순환형이면 `🔔 {다음 기구}! 0/5`), 3초 게이지, 재촉 버튼 맥동.
- `missed`: `fail('emomMissed')`.
- HUD: 타이머 옆에 `벨 N초`와 구간 번호(`3/15`)를 보여준다. 벨 3초 전부터 숫자를 붉게 한다.

칼수형

- `answered` → `brain.beginInterrupt(interrupt.durationSec)`. 창이 열려 있는 3초 동안 원장님은 하던 동작을 그대로 계속한다.

순환형

- 구간 완료 추적: 세션이 끝났을 때 기구가 현재 구간 기구와 같으면 `intervalDone = true`.
- `bell`(k ≥ 1)에서 `intervalDone`이 false이면 `fail('emomUnfinished')`. 아니면 `intervalDone = false`로 되돌리고 툴바 강조를 `station(k)`로 바꾼다.
- `warn`: `station(k)` 기구가 착지한 것도 없고 떨어지는 중인 것도 없으면 게으름 경고 토스트를 띄운다.
- `answered` → `brain.bellAnswered()`. 그 뒤 원장님이 릴스(기구 없음)이면 노랩 시퀀스를 시작한다.
- 노랩 시퀀스: `NOREP_PULSE_MS`마다 붉은 테두리 한 번 (침팬지 연출과 같은 방식, 동작 줄이기 설정 존중) + 경고음 + 토스트 `노랩!` × n. 3번째가 끝나면 `fail('norep')`. 원장님이 릴스를 벗어나면(기구 착지 → 이동) 즉시 취소하고 테두리를 끈다. 타이머는 scene time을 써서 일시정지 중에는 멈춘다.

탈락 사유 (`ResultData.reason`, 문구는 `strings.ts`)

- `emomMissed`: `벨을 놓쳤어요! 3초 안에 5번 재촉해야 해요.`
- `emomUnfinished`: `시간 안에 못 끝냈어요!`
- `norep`: `노랩 3번! 탈락!`

## 8. 뷰 · 에셋

- `wj_burpee`: `assets/frames.d/burpee.json`. 서기 → 웅크림(`pose_getup_kneel`) → 플랭크(`pushup_1`) → 가슴 닿기(`pushup_2`) → 플랭크 → 웅크림 → 서기. 기존 크롭을 재사용하고 발 앵커를 맞춘다 (SpriteViewer로 확인). 한 번에 약 0.6초, 3초 동안 반복한다.
- WonjangView `BURPEE`: `['wj_burpee', 'wj_getup', 'wj_idle']`. 라벨 박스에 `interrupt.label`을 표시한다. 애니가 한 바퀴 돌 때마다 코드로 점프 트윈을 넣는다 (y −28px, 150ms yoyo, 동작 줄이기면 생략).
- 레벨 선택 카드: EMOM WOD에 `EMOM` 배지를 붙인다.
- 한국어 조사 헬퍼 `josa(word, '이/가')`: 마지막 글자 받침으로 판단한다 (`strings.ts`).

## 9. 검증

단위 테스트 (Vitest)

- `tests/emom.test.ts`
  - 벨 시각(준비 5초, 간격)과 경고 시각(벨 3초 전)
  - 창 열림/닫힘, 5번째 재촉에서 answered, 4번이면 missed
  - 창 밖 재촉은 false
  - 큰 dt로 여러 경계를 넘으면 이벤트가 순서대로 나옴
  - `station(k)` 순환
  - `stop()` 후 이벤트 없음
- `tests/brain.test.ts`
  - `bellProd`는 번아웃과 속도를 바꾸지 않고 쿨타임을 지킴
  - `beginInterrupt` 복귀 3가지 경우와 진행도 보존
  - `floorProdLocked`가 바닥 재촉과 허코를 막음
  - `bellAnswered`: 바닥 → 일어남 → 이동, 릴스 → 이동
- `tests/logic.test.ts`
  - 순환형 요구 세션 수 = 회전 횟수 × 라운드
  - 라벨 수
  - `josa` 받침 판정 (바벨이, 로프가, 링이, 스키 머신이)

브라우저 검사

- `tools/emom-check.mjs` (새 파일)
  - Kalsu: 실제 탭 5번 성공 → 버피 재생 → 같은 바벨 세션 진행도 이어짐. 4번만 누르면 `emomMissed` 결과.
  - 일시정지 중 벨 카운트다운과 창이 멈춤.
  - Chelsea: 기구 없음 경고 문구(조사 포함). 노랩 3번 깜빡임 후 `norep` 결과. 노랩 도중 기구를 배치하면 취소. 구간 미완료 시 `emomUnfinished`.
- `tools/autoplay.mjs`: 창이 열리면 재촉 5번. 순환형에서는 다음 구간 기구를 미리 배치. Lv14~16 클리어 시간으로 간격과 제한 시간을 조정한다.
- `tools/regression.mjs`: 기존 전체 통과, 16개 WOD 카드와 배너 레이아웃이 맞는지 확인.

## 10. 위험 요소

- 순환형 15초 안에 걷기 + 세션(약 5초) + 벨 재촉(약 1초)이 들어가야 한다. 먼 자리에 놓으면 빠듯하므로 autoplay로 측정해서 간격을 정한다.
- 조합 버피 프레임은 원본 크롭 비율이 서로 달라 발 위치가 튈 수 있다. 앵커 튜닝이 필요하고, 결과가 어색하면 전용 그림으로 교체한다.
- 벨 창 동안의 탭이 일반 재촉 토스트나 침팬지 연출과 겹치지 않아야 한다 (창 안에서는 일반 재촉 경로를 타지 않음).
