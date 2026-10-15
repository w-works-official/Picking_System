# Picking System

GitHub Pages: <https://w-works-official.github.io/Picking_System/>

## CS 관리 — 대표님 / Claude 작업 인계

CS 화면: <https://w-works-official.github.io/Picking_System/cs/>

**실제 피킹은 운영 중이고, 신규 CS는 합성 문의로 동작하는 프론트엔드입니다.**
다음 작업자는 [CS 인계 문서](docs/cs-frontend-integration.md)를 먼저 읽어 주세요.

- 현재 구현: 문의 목록·검색·필터, 캡처 표시·확대·다중 이미지 탐색, 템플릿 검색·선택·복사, 화면 안에서의 임시 분류.
- 대분류는 `전체 / 제품문의 / 주문문의 / 배송문의 / 기타` 태그를 한 번 눌러 선택합니다. 선택한 태그를 다시 누르면 전체로 돌아갑니다. 검색어와 태그는 함께 적용됩니다.
- 문의 9건과 캡처 9장은 합성입니다. 템플릿은 Google Sheets 원문 중 공개 범위를 검토한 28개이며 실시간 동기화되지 않습니다. 분류 변경은 새로고침 시 초기화됩니다.
- **미구현:** 실제 수집, 로컬/NAS 연결, 실제 문의 조회, 분류 영구 저장, AI 실행, 고객 답변 전송. 화면에서 운영 API를 호출하는 구조가 아닙니다.
- 대표님 측 작업: 수집 매크로와 저장·전달 방식 개발, 이후 데이터 연결. 저장 위치·파일 형식·API는 아직 확정하지 않았습니다.
- `cs/`는 생성된 정적 배포 파일입니다. 수정할 때는 아래 로컬 `AI_CS/company-pages/` 작업본을 직접 열고, 빌드한 산출물을 이곳에 반영합니다. 최신 원본에는 미커밋 작업이 있으므로 그대로 보존합니다.
- 연결 경계: 원본의 `company-pages/main.tsx` → `CsDataSource.load()` 주입 → `sample-data-source.ts`. `model.ts`는 화면 내부 타입이며 매크로 데이터 계약이 아닙니다.
- 실제 개인정보·상담 캡처·계좌정보·로그인 세션·관리자 키를 공개 저장소/Pages에 넣지 마세요. 피킹 로그인 화면이 CS 정적 파일까지 비공개로 보호하는 것은 아닙니다. 로컬/UNC 경로는 공개 웹페이지에서 직접 읽을 수 없으므로 실제 데이터 연결 시 인증된 조회 방법을 확인해야 합니다.
- 기존 피킹 로그인·바코드·단축키·주문·검품·물류 CS·DB는 보존합니다. 신규 CS와 같은 DOM에서 실행하지 않습니다.

### 바로 이어서 작업할 로컬 경로

대표님 측 Claude는 아래 **현재 작업 PC의 기존 폴더**를 사용하면 됩니다. 먼저 폴더 존재 여부와 Git 상태를 확인하세요.

```text
CS 원본 저장소:
C:/Users/hihi0/Documents/Codex/2026-08-12/cs/work/AI_CS

CS 프론트엔드 원본 및 자체 README:
C:/Users/hihi0/Documents/Codex/2026-08-12/cs/work/AI_CS/company-pages/
C:/Users/hihi0/Documents/Codex/2026-08-12/cs/work/AI_CS/company-pages/README.md

회사 피킹 저장소:
C:/Users/hihi0/Documents/Codex/2026-10-01/git-1-product-hub-system-v3/work/company-split-20261005/Picking_System

회사에 반영할 CS 정적 산출물 위치:
C:/Users/hihi0/Documents/Codex/2026-10-01/git-1-product-hub-system-v3/work/company-split-20261005/Picking_System/cs/
```

CS 데이터 연결은 원본 `company-pages/sample-data-source.ts`와 `main.tsx`부터 확인합니다. 회사용 빌드는 AI_CS 루트에서 `node company-pages/scripts/build.mjs`로 실행하며, 새 산출물 경로는 `output/company-pages-builds/latest-build.json`에 기록됩니다. 피킹 기능 파일은 수정하지 않습니다.

위 경로가 없는 환경에서는 실제 작업본 위치를 먼저 확인하세요. 기존 미커밋 파일을 원격 코드로 덮어쓰거나 새 프로젝트로 대체하지 마세요.

회사 저장소의 안전한 합성 데이터 미리보기:

```powershell
node tests/helpers/csIntegrationPreviewServer.mjs
# http://127.0.0.1:4188/Picking_System/cs/
node tests/csIntegration.browser.test.mjs
```

피킹 로컬 미리보기의 합성 계정은 `local-preview` / `fixture-only`입니다. 운영 계정이 아닙니다.
빌드 버전과 체크섬의 기준은 [CS artifact manifest](cs/artifact-manifest.json)와
[빌드 정보](docs/cs-build-info.json)입니다. 배포 완료 여부는 해당 커밋의 GitHub Actions CI/Pages 결과와 운영 manifest를 대조해 확인합니다.

## Sellpia tools

- Scraper: <https://w-works-official.github.io/Picking_System/tools/sellpia_scraper.html>
- Memo updater: <https://w-works-official.github.io/Picking_System/tools/sellpia_memo_updater_0707_stockmatch.html>

The Picking app reads and writes its existing Picking Supabase project. Database
source ownership and migrations are documented in [database ledger](docs/db-ledger.md); publishing
this repository does not deploy or change the database or API.

Product photos use the separate Operations Hub Supabase Storage project. The
consumer contract is documented in
[`docs/product-images-consumer-contract.md`](docs/product-images-consumer-contract.md).

The app is served from the repository subpath. Manifest, icon, and service
worker URLs are relative to that path. The service worker is network-only so
installed clients do not reuse stale operational data or assets.

The existing personal repository and its URL are unchanged by this repository
split.

## Local checks and frontend deployment

Use Node.js 22 or later:

```powershell
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

The curated 54 offline regression files are the CI gate. The browser test uses synthetic fixtures and blocks all production API/Storage requests. See [test baseline](docs/test-baseline.md) for historical tests outside this gate. `_site/` contains frontend runtime only; SQL, baseline archives, tests and dependencies are not deployed to Pages. Pages workflows never deploy Supabase resources.

The source preserves migration provenance, not an automatically replayable database baseline. Do not apply SQL or deploy backend functions as part of a frontend release.
