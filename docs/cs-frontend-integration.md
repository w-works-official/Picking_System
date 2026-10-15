# Pink Rocket CS 프론트엔드 통합 — 로컬 검증 완료

## 구현 범위

기존 피킹 헤더에 `피킹시스템 / CS 관리` 메뉴를 추가하고, AI_CS에서 만든 독립 React 정적 빌드를 `cs/`에 포함했습니다. 기존 물류 CS 탭은 그대로이며, 두 화면은 별도 HTML 문서로 실행됩니다.

기존 추적 파일 수정은 `index.html`의 메뉴·참조 6줄과 `scripts/build-pages.mjs`의 `cs` 배포 포함 항목입니다. 새 `src/app/workspaceNavigation.mjs`와 `src/styles/workspaceNavigation.css`가 이동 링크와 메뉴 스타일을 담당합니다. 피킹 업무·로그인·바코드·DB 로직 파일은 수정하지 않았습니다.

모바일은 기존 피킹의 넓은 업무 영역과 가로 탐색을 유지했습니다. 새 메뉴가 화면 밖으로 나가지 않도록 모바일 헤더 폭만 제한했습니다. 새 메뉴 안에서는 전역 업무 단축키로 인한 오동작을 막고 기본 Tab·Enter 링크 이동을 사용합니다.

URL에서는 현재 존재하는 `write`, `events`, `reorder`의 `0/1`만 왕복 전달합니다. 중복·잘못된 값은 `0`, 누락된 값은 누락 상태를 유지합니다. 토큰·임의 return URL·나머지 query/hash는 전달하지 않습니다. 인증 권한 판정은 기존 피킹 코드에 남겨두었습니다.

## 데이터와 Google Sheets

원본 `CS 안내문구 정리본_260827`의 네 탭 전체 범위를 읽기 전용으로 확인했습니다. 시트는 수정하지 않았습니다.

| 탭 | C열 답변 후보 | 공개 반영 | 제외 |
| --- | ---: | ---: | ---: |
| 제품문의 | 17 | 11 | 6 |
| 주문문의 | 26 | 12 | 14 |
| 배송문의 | 10 | 4 | 6 |
| 기타 | 7 | 1 | 6 |
| 합계 | 60 | 28 | 32 |

60개 중 59개는 분류 가능하며 기타 C10은 빈 행 뒤 유형·세부가 없는 고립 문구라 분류하지 않았습니다. 기타 B2 사용 가이드는 C열 답변 후보와 별도입니다.

고객 안내용으로 공개 범위를 검토한 원문 28개만 정적 번들에 포함합니다. 계좌정보가 포함된 주문문의 C10, 내부 정책, 상태표, 현재 적용 여부를 확인할 수 없는 수수료·기한·혜택 규정 등은 원문 전체를 제외했습니다. 부분 출고 기준이 다른 셀 사이에 충돌하며, 판매처별 취소 상태 및 교환·반품 조건도 임의 확정하지 않았습니다. 제외 목록은 본문 없이 셀 위치와 이유만 기록했습니다.

각 원문에는 source 셀·조회 시각·본문 SHA-256이 있습니다. 줄바꿈·공백·오탈자를 포함한 원문은 변경하지 않았습니다. 동일 유형·세부라도 다른 원문인 주문문의 C26/C27은 별도 항목이며 화면에 셀 번호를 표시합니다. 공개 범위 검토는 회사 정책의 최신성 승인이나 실제 주문의 처리 승인을 의미하지 않습니다.

문의 9건과 캡처 9장은 합성입니다. 실제 문의·고객정보·주문번호·상담 이미지는 포함하지 않았습니다. 합성 문의와 실제 문구의 연결은 예시이며 AI 추천 결과가 아닙니다. 분류 적용은 화면 메모리만 변경하고 새로고침하면 초기화됩니다.

AI_CS의 `company-pages/templates/public-templates.json`은 공개 원문, `review-summary.json`은 본문 없는 파싱·제외 기록입니다. 내부 정보를 포함한 전체 원본은 저장소 밖 비공개 백업에만 있습니다.

## 빌드와 버전

- Picking 시작 HEAD: `a7924dc70f2e92ffba5f153cf4208c18a670a32a` — 시작 시 원격 main과 일치.
- 작업 브랜치: `codex/cs-static-integration-20261015`.
- AI_CS 기준 HEAD: `af68b9c4fb50c1552f33c2acae2bfcc233b1bfef` — 기존 dirty 작업과 7개 로컬 커밋 보존.
- CS build: `2026-10-15T05-13-25-382Z`.
- 입력 소스 SHA-256: `5af9dcf64971700fbb7199d1fd4f5d20130cfb1efefd418163dcd2f7b11c938e`.
- CS manifest SHA-256: `e8a9b32ed209beeccdf61e703b8b9a65e05937bf35f69fd661cf460fcf2f9958`.
- 산출물: `cs/`의 정적 파일 15개. 소스 버전은 HEAD와 별도로 입력 체크섬으로 식별합니다.
- asset base: `./`; 예정 회사 진입 경로: `/Picking_System/cs/`.

`cs/artifact-manifest.json`에 파일별 체크섬이 있으며 `docs/cs-build-info.json`에는 회사 소스·빌드 검증 정보가 있습니다. 기존 `_site`는 보존하고 별도 새 검증 폴더에서 `npm run build`를 실행했습니다. AI_CS 산출물·회사 `cs/`·최종 `_site/cs/`의 체크섬을 대조했습니다.

## 검증

| 항목 | 결과 |
| --- | --- |
| Picking `npm run check` | 33개 구문 및 경로·credential 검사 통과 |
| Picking `npm test` | 73 통과 / 선택적 PGlite 1 skip / 실패 0 |
| Picking `npm run test:browser` | 기존 합성 브라우저 회귀 통과 |
| 회사 Pages `npm run build` | 새 검증 폴더에서 통과, cs 포함 |
| CS typecheck / ESLint | 오류·경고 0 |
| CS 소스·파서·비공개 원본 대조 | 11/11 통과 |
| CS Chromium 흐름 | 17개 통과; 28개 원문·분류값·출처 전수 확인 포함 |
| 통합 Chromium 흐름 | 7개 묶음 통과; 로그인·바코드·기존 CS·단축키·왕복·세션·모드·피킹/검품 |
| 반응형 | 1440 / 1024 / 390px 확인 |
| 외부 요청 / 업무 API 요청 / pageerror | 모두 0 |

QA에서는 실제 기존 피킹 인증/UI 코드에 명시적인 합성 계정·더미 세션과 메모리 데이터만 연결했습니다. 운영 로그인 서버·운영 DB를 검증하거나 변경하지 않았습니다. CS 파일은 최종 `_site` 산출물 그대로 제공했습니다. 피킹 SDK·외부 자원·이미지는 미리보기 응답에서만 합성 자원으로 교체했습니다.

QA 중 발견한 모바일 메뉴 이탈, 줄바꿈 제목 검색 실패, 줄바꿈 세부 option 값 불일치는 수정 후 재검증했습니다. 긴 캡처·다중 이미지·없음·의도적 404/재시도·확대·복사 성공/거절도 확인했습니다.

## 로컬 미리보기

- 최종 빌드 피킹: http://127.0.0.1:4189/Picking_System/?write=1&events=0
- 최종 빌드 CS: http://127.0.0.1:4189/Picking_System/cs/
- 로컬 전용 계정: `local-preview` / `fixture-only`.

소스 미리보기 재실행:

```powershell
node tests/helpers/csIntegrationPreviewServer.mjs
```

기본 포트는 4188입니다. 최종 `_site` 폴더를 쓰려면 `CS_INTEGRATION_PREVIEW_ROOT`를 해당 절대 경로로, 포트를 4189로 지정합니다. 현재 최종 빌드 위치는 `outputs/reports/cs-final-build-location.json`에 있습니다.

```powershell
$env:CS_INTEGRATION_TEST_URL='http://127.0.0.1:4189/Picking_System/'
node tests/csIntegration.browser.test.mjs
```

통합 결과·캡처: `outputs/ui-qa/phase2-cs/`. 원본 보존·파일 복사·격리 대조: `outputs/reports/cs-phase2-preservation-and-isolation.json`. 이 출력 폴더들은 Git에서 제외합니다.

## 향후 매크로 연동과 보존

AI_CS `company-pages/main.tsx`의 `CsDataSource.load()` 주입과 `sample-data-source.ts`가 연결 경계입니다. 대표님의 실제 저장 형식에 맞는 변환 또는 조회 구현을 이곳에 연결합니다. 모델은 화면 내부 타입이며 NAS/API 계약을 확정한 것이 아닙니다. 분류 영구 저장·실제 이미지 인증 조회·실제 CS 직원 권한은 향후 실제 데이터 연결 단계의 범위입니다.

2차 시작 백업에는 AI_CS 소스 171개와 Picking 소스 161개, Git bundle·변경 patch·checksum이 있습니다. AI_CS의 기존 회사용 폴더 외 파일과 Picking 업무·인증·DB 파일은 보존했습니다. 새 CS 파일은 별도 경로라 메뉴·빌드 포함 항목을 되돌리면 격리할 수 있으며, 복구 전 백업 체크섬과 비교합니다.

이번에는 커밋·push·회사 Pages 배포·개인 Sites 배포·운영 설정 변경을 수행하지 않았습니다. Git 롤백을 DB 복구로 취급하지 않으며 이번 작업에는 DB 변경 자체가 없습니다.

## 피킹 디자인 일관성 보완

CS의 별도 picking-theme.css에서 피킹과 동일한 색상·폰트·8px 패널·7px 버튼·입력·선택 상태·업무 메뉴를 적용했습니다. 기존 3열과 반응형 기능을 유지하고 피킹 원본 CSS는 변경하지 않았습니다. 실제 브라우저의 메뉴·폰트·버튼·패널·브랜드 스타일 8개를 직접 대조했으며 CS 17개 및 통합 7개 검사를 다시 통과했습니다.
