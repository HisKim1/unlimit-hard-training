# 원장님 키우기

크로스핏 박스 원장님을 운동시키는 모바일 웹 게임. 기획은 [SPEC.md](SPEC.md).

## 실행

```bash
npm ci
npm run dev        # vite --host : 같은 와이파이의 휴대폰에서 http://<PC IP>:5173 접속
npm test           # Vitest (상태 기계·최근접 선택·저장·배치 규칙)
npm run build      # dist/ 생성 (tsc 타입 검사 포함)
```

브라우저 검증 (Chrome 설치 필요, PowerShell에서 프로젝트 폴더 기준):

```powershell
npm run preview   # 별도 터미널에서 실행: http://localhost:4173
```

```powershell
$env:URL = 'http://localhost:4173/'
node tools/regression.mjs          # 에셋·종료·입력·회전·저장 회귀 검사
node tools/e2e.mjs artifacts       # 실제 드래그·재촉으로 Fran 클리어 및 저장 확인
node tools/autoplay.mjs 1,2,3,4,5,6,7,8 4 artifacts
python tools/test_sprites.py       # 기구 이미지 좌우 반전 검사
```

스크린샷은 `artifacts/`에 남으며 배포에는 포함되지 않는다. 자동 플레이 시간은 배치 위치·무작위 재촉 횟수에 따라 달라진다.

URL 옵션 (개발용)
- `?debug` : 매트 다각형·풋프린트·슬롯, 원장님 머리 위에 상태/N/count/번아웃 표시
- `?viewer` : SpriteViewer (애니 재생, 앵커 십자선, 스케일·오프셋·fps 조정, anim-tuning.json 복사)
- `?speed=2` : 게임 로직 배속 (밸런스 자동 테스트용)

## 배포 (Netlify)

운영 주소: https://unlimit-hard-training.netlify.app/

다른 컴퓨터에서는 저장소를 clone하고 Node.js 22 이상에서 `npm ci` 후 개발한다. 아래 명령으로 기존 사이트를 갱신한다(Netlify 사이트 권한이 있는 계정으로 로그인 필요).

```bash
npx netlify-cli login
npm run build
npx netlify-cli deploy --site 16f4b563-bec9-4904-906e-f267d1ddb813 --dir dist --no-build --prod
```

GitHub push 자체는 자동 배포가 아니다. 자동 배포를 원하면 기존 Netlify 사이트에 이 저장소를 연결하고 빌드 명령 `npm run build`, 게시 디렉터리 `dist`를 설정한다. 인증 토큰과 `.netlify/`, `.env`는 Git에 올리지 않는다.

## 스프라이트 파이프라인

```
assets/raw/          원본 이미지 (수정 금지, 출처는 assets/raw/SOURCES.md) — dist 에 포함되지 않음
assets/frames.json   소스 선언 + 애니/이미지 크롭 박스·앵커 정의
assets/frames.d/     개별 모션·아이콘 정의 (파일명 순서로 병합, 고해상도 정의가 덮어씀)
tools/slice_sprites.py  → public/assets/atlas*.png, atlas.json, anims.json, box_bg.jpg
```

```bash
python tools/slice_sprites.py                                   # 전체 빌드
python tools/slice_sprites.py --grid sheet_a --region 0,380,540,740 --step 10 --zoom 2 --out grid.png
python tools/slice_sprites.py --preview wj_row,wj_bike --out preview.png
python tools/slice_sprites.py --measure sheet_a 20,720,100,890
```

- 원본 시트는 이미 투명 배경이라 배경 제거가 필요 없다. 미색 배경 시트가 추가되면 소스에 `"bg": "flood"`를 주면 가장자리 플러드 필로 지운다 (전역 색상 키는 쓰지 않는다).
- 새 모션 이미지를 받으면: `assets/raw/`에 넣고 `frames.json`의 `sources`에 등록 → `anims`에 프레임 크롭·앵커 추가 → 빌드. 애니 키 이름(`wj_thruster` 등)이 같으면 코드 수정 없이 교체된다.
- 밸런스 수치는 전부 `src/config.ts`, 문구는 `src/strings.ts`, 레벨은 `src/wods.ts`, 기구는 `src/equipment.ts`.
