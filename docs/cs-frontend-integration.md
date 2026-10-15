# Pink Rocket CS — 프론트엔드 / 매크로 연동 인계

갱신: 2026-10-15. 회사 Picking_System의 독립 CS 페이지를 이어받는 개발자 및 Claude용 문서입니다.

## 먼저 알아둘 현재 상태

- 운영 피킹: https://w-works-official.github.io/Picking_System/
- 신규 CS: https://w-works-official.github.io/Picking_System/cs/
- CS는 별도 React 정적 앱입니다. 기존 피킹과 페이지 이동으로 연결하며 같은 DOM에서 실행하지 않습니다.
- 문의 9건·캡처 9장은 합성이고, 문구 28개는 공개 검토한 Google Sheets 원문입니다.
- 분류는 화면 메모리에만 적용되며 새로고침 시 초기화됩니다. AI가 분류하거나 답변을 생성한 결과가 아닙니다.
- 회사 Pages 정적 배포까지 구현했습니다. **실제 수집·NAS/로컬 조회·영구 저장·CS 직원 인증·자동 답변 전송은 연결되지 않았습니다.**
- 다음 단계는 대표님 측 수집 매크로 개발과 실제 데이터 연결입니다. 매크로의 저장 형식·API·NAS 경로는 이 프론트 작업에서 확정하지 않았습니다.

## 화면 사용

문의 선택 → 원본 캡처 확인 → 대분류 태그 또는 키워드 검색 → 문구 선택 → 전문·적용 조건 확인 → 복사.

대분류는 단일 선택 태그이며 선택된 태그를 다시 누르면 전체로 돌아갑니다. 검색과 태그를 동시에 적용하고 태그 변경 시 결과 첫 페이지로 이동합니다. 문구를 선택하면 분류 입력이 채워지지만 검색 필터는 임의로 바뀌지 않습니다.

후보는 4개씩 탐색합니다. 선택 후 전문을 바로 표시하고 `다른 문구 찾기`로 후보를 다시 엽니다. 복사 버튼은 우측 하단에 유지합니다. 분류·메모는 접기/펼치기로 수정하며 `변경사항 있음`은 아직 임시 적용하지 않은 입력입니다.

원본 캡처는 원본 너비를 넘겨 확대하지 않습니다. 긴 캡처의 상단 도구는 스크롤 중에도 유지되며 확대 화면에서 원본 크기 보기와 다중 이미지 탐색을 지원합니다.

## 소스 위치와 버전 — 회사 저장소만으로 UI를 다시 빌드할 수는 없음

| 위치 | 역할 |
| --- | --- |
| 이 저장소 `cs/` | 빌드된 HTML·CSS·JS·합성 이미지·manifest. Pages 배포 대상 |
| 이 저장소 `src/app/workspaceNavigation.mjs`, `src/styles/workspaceNavigation.css` | 피킹 상단 업무 메뉴. 기존 피킹 업무 로직과 분리 |
| 이 저장소 `tests/helpers/csIntegrationPreviewServer.mjs` | 운영 API를 사용하지 않는 합성 미리보기 |
| 별도 AI_CS `company-pages/` | 편집할 React 소스·어댑터·문구 스냅샷·CS 전용 스타일·빌드·테스트 |
| 별도 AI_CS `app/globals.css`, `app/review-workspace.css` | 재사용하는 기존 UI 스타일 |
| 별도 AI_CS `app/page.tsx` | 회사 런타임에는 미포함. 빌드 입력 manifest 생성 시 읽는 기존 소스 |

원본 작업 위치:

```text
C:/Users/hihi0/Documents/Codex/2026-08-12/cs/work/AI_CS
```

관련 저장소: https://github.com/w-works-official/AI_CS

최신 `company-pages/`는 위 PC의 미커밋 작업본에 있습니다. 원격 AI_CS의 HEAD만으로 최신 UI가 복원된다고 가정하지 마세요. 다른 PC에서는 담당자로부터 현재 소스와 필요한 공유 CSS·설정·잠금 파일을 함께 전달받아야 합니다. 인증정보·브라우저 프로필·실제 고객 산출물·비공개 전체 시트는 전달 패키지나 공개 저장소에 섞지 않습니다.

안전한 인계 대상은 현재 AI_CS 소스 작업본 또는 검증된 소스 패키지입니다. `company-pages/` 외에 root package/lock·TypeScript/ESLint 설정과 공유 CSS가 필요합니다. `company-pages/vite.config.ts`가 실제 회사용 빌드 설정이며, `scripts/build.mjs`는 입력 manifest 생성을 위해 `app/page.tsx`도 읽습니다. 이 파일은 회사 런타임에서 import하지 않습니다. 루트 typecheck는 기존 앱 전체도 검사하므로 필요한 기존 소스 의존성이 누락된 일부 폴더만으로 전체 검사까지 재현된다고 가정하지 마세요.

정확한 소스 입력 목록과 체크섬은 `cs/artifact-manifest.json`의 `inputFiles`, `inputSnapshotSha256`을 확인합니다. `sourceCommit`은 기존 AI_CS HEAD이고, 미커밋 회사용 소스의 버전은 입력 체크섬으로 별도 식별합니다. 빌드된 압축 JS를 직접 수정하는 대신 원본을 수정하고 다시 빌드합니다.

## 실제 데이터 연결 지점

AI_CS 원본에서 다음 파일을 확인합니다.

| 파일 | 작업 지점 |
| --- | --- |
| `company-pages/main.tsx` | `CsWorkspace`에 데이터 소스를 주입하는 진입점 |
| `company-pages/model.ts` | 화면 내부의 Inquiry, Capture, Classification, CsTemplate, CsDataSource 타입 |
| `company-pages/sample-data-source.ts` | 합성 데이터 조회 구현. 실제 저장 방식이 정해지면 대체 어댑터 작성 |
| `company-pages/CsWorkspace.tsx` | 목록·캡처·분류·검색·복사 UI. 현재 임시 적용은 메모리 상태만 변경 |
| `company-pages/picking-theme.css`, `company-pages/company.css` | CS 전용 디자인·배치. 피킹 원본 CSS를 수정하지 않음 |

현재 연결 흐름은 `main.tsx` → `sampleDataSource.load()` → `{ inquiries, templates }` → UI입니다. `model.ts`는 프론트 내부 표현이며 매크로 측이 이 구조 그대로 저장해야 한다는 계약이 아닙니다. 실제 형식이 정해지면 어댑터에서 변환합니다.

`CsDataSource`에는 현재 읽기용 `load()`만 있습니다. 영구 저장 API나 `save()`가 이미 있다고 가정하지 마세요. 분류 영구 저장은 실제 저장 방식·권한이 결정된 후 별도로 구현해야 합니다.

실제 캡처를 연결할 때는 브라우저가 접근할 수 있는 인증된 주소나 데이터 전달 방법을 검증합니다. `C:/...` 및 NAS의 UNC 경로를 그대로 `<img src>`에 넣는 방식으로는 회사 Pages에서 조회할 수 없습니다. 공개 파일 URL로 개인정보를 노출하지 마세요. 공개 정적 페이지의 로그인 UI 자체는 파일 접근 제어가 아닙니다.

## 템플릿 출처와 정책 경계

원본: [CS 안내문구 정리본_260827](https://docs.google.com/spreadsheets/d/1-nZHkT5whlMSwYPBqUZL4WeoAIqEpr55Ql0g7_25F48/edit)

| 시트 | 답변 후보 | 정적 반영 | 제외 |
| --- | ---: | ---: | ---: |
| 제품문의 | 17 | 11 | 6 |
| 주문문의 | 26 | 12 | 14 |
| 배송문의 | 10 | 4 | 6 |
| 기타 | 7 | 1 | 6 |
| 합계 | 60 | 28 | 32 |

후보 60개 중 59개가 분류 가능하고 1개는 고립 문구입니다. 계좌정보·내부 규정·미확인 요금/기한/혜택·정책 충돌 문구 등의 원문은 공개 빌드에서 제외했습니다. 제외 원문을 현재 번들에서 찾거나 임의로 복구하지 마세요.

원본의 줄바꿈·공백·오탈자와 동일 이름의 서로 다른 행을 보존합니다. 각 문구의 출처 셀과 본문 SHA가 있으며, 날짜 등 치환값과 적용 조건은 상담원이 확인해야 합니다. 공개 범위 검토는 주문 상태나 최신 정책을 승인했다는 의미가 아닙니다. 실시간 Sheets 동기화나 편집기는 없습니다.

원본 파일: AI_CS의 `company-pages/templates/public-templates.json`, 본문 없는 제외 사유: `review-summary.json`.

## 빌드·검증·반영

현재 개발 PC에서는 기존 AI_CS 의존성을 사용합니다. 다른 PC에서는 전달받은 package/lock에 맞춰 의존성을 설치한 뒤 아래를 실행합니다. 기존 미커밋 소스를 덮어쓰거나 `git reset/clean/pull`로 정리하지 마세요.

이번 CS 검증 환경은 Node.js `v24.15.0`입니다. CS 브라우저 테스트는 TypeScript 소스를 직접 import하므로 다른 PC에서도 검증한 런타임과 호환되는 환경을 사용하세요. 패키지 관리자는 전달받은 잠금 파일(`pnpm-lock.yaml`)에 맞추고, 브라우저 테스트 전에 `npx playwright install chromium`을 실행합니다. 회사 피킹의 Node 22 이상 조건만으로 별도 CS 원본의 모든 테스트 환경이 준비됐다고 가정하지 않습니다.

AI_CS 루트:

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js company-pages --ignore-pattern company-pages/public --max-warnings 0
node --test company-pages/tests/source.contract.test.mjs company-pages/tests/templates.parser.test.mjs
node company-pages/scripts/build.mjs
node company-pages/tests/browser.test.mjs
node company-pages/tests/usability.browser.test.mjs
node company-pages/scripts/preview.mjs
```

빌드는 `output/company-pages-builds/<buildId>/cs/`에 새 디렉터리를 만듭니다. `latest-build.json`이 최신 경로를 가리키며 이전 빌드 출력은 덮어쓰지 않습니다. base는 `./`, 회사 마운트 경로는 `/Picking_System/cs/`입니다. 단독 미리보기 기본 포트는 4186이며 새 빌드 적용 시 서버를 재시작합니다.

검증한 `cs/` 산출물을 회사 저장소의 `cs/`에 반영하고 manifest의 파일별 SHA를 대조합니다. 교체 전 기존 산출물과 수정 소스를 별도로 백업하세요. 이전 해시 asset을 정리할 때는 manifest에서 확인된 생성 파일만 대상으로 합니다.

Picking_System 루트:

```powershell
npm run check
npm test
node tests/csIntegration.browser.test.mjs
npm run test:browser
node tests/helpers/csIntegrationPreviewServer.mjs
```

미리보기: `http://127.0.0.1:4188/Picking_System/cs/`. 피킹 복귀 검증용 합성 계정은 `local-preview` / `fixture-only`이며 운영 계정이 아닙니다. 운영 SDK/API/이미지는 응답 단계에서 로컬 fixture로 대체됩니다.

`npm run build`는 `_site/`가 없는 새 작업 폴더/checkout에서 실행합니다. 기존 `_site/`가 있으면 보존을 위해 실패하도록 되어 있습니다. 배포는 main push → CI 성공 → Pages workflow 순서이며 DB 배포는 포함하지 않습니다. 운영 배포 권한은 그 작업을 요청한 사용자에게 확인된 범위로만 적용합니다.

배포 후 Actions의 해당 커밋 CI/Pages 성공과 운영 `/cs/artifact-manifest.json`의 buildId/체크섬을 대조합니다. 기존 피킹 업무 파일의 diff가 생겼다면 CS 연동을 이유로 함께 반영하지 말고 원인을 확인합니다. 롤백은 이전 CS 산출물을 복원하고 재검증·재배포합니다. 이번 프론트 변경에는 DB 쓰기가 없습니다.

## 유지할 범위와 시작 프롬프트

기존 피킹 로그인·공유 세션·바코드·단축키·주문·검품·물류 CS·Supabase 정책을 보존하세요. 상품운영허브는 상품·매칭·이미지 원본의 소유 시스템이며 이번 CS 매크로를 위해 복제하지 않습니다. 자동 수집과 실제 답변 전송은 별개입니다. 실제 답변 전송 권한이 있다고 가정하지 마세요.

다음 작업자에게 전달할 예시:

> README와 docs/cs-frontend-integration.md, 현재 Git 상태, cs/artifact-manifest.json부터 확인해 주세요. 기존 피킹 기능은 변경하지 않습니다. 현재 CS는 합성 프론트이고 실제 수집·NAS 연결·영구 저장은 미구현입니다. 먼저 최신 AI_CS/company-pages 원본을 확보하고 현재 매크로와 저장 방식을 조사한 뒤, 실제 전달 형식에 맞는 별도 데이터 어댑터를 연결해 주세요. 화면 내부 타입을 매크로 계약으로 강제하지 말고, 개인정보를 공개 Pages/저장소에 넣지 마세요. 운영 DB·판매처 상태·실제 답변 전송·배포는 해당 작업에서 확인된 권한 범위만 수행해 주세요. 기존 3열 UI와 태그 검색·복사를 유지하고 로컬 합성 QA를 통과한 후 실제 데이터 연동 검증 범위를 구분해 보고해 주세요.
