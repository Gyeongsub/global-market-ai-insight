# 로컬 검색 화면 실행과 종료

2026-10-26. 본인 PC의 질문 생성 화면과 선택형 오프라인 모의 화면만 실행한다.
AWS 로그인, 시세 API 키, 추가 가입은 필요 없다. 실제 AWS 합성 분석은
[별도 실습](synthetic-bedrock-lab.md)이며 이 명령으로 시작되지 않는다.

## 실행

프로젝트 루트에서 지원 Node 버전과 설치된 고정 의존성을 사용한다.
`node`를 찾을 수 없으면 설치된 지원 Node 실행 파일의 절대 경로를 PowerShell의
`& '실제 경로'`로 호출한다. 다른 사용자의 경로나 임의 다운로드를 복사하지 않는다.
런타임/설치 기준은 [README 로컬 실행](../../README.md#로컬-실행)을 따른다.

```powershell
node frontend/scripts/build.mjs
node scripts/local-search-preview.mjs
node scripts/local-search-preview.mjs --execute-local-search-preview
```

첫 명령은 로컬 빌드, 두 번째는 실행하지 않는 계획 표시다. 세 번째만 서버를
시작한다. `local-search-preview-ready`를 확인한 후 브라우저에서
`http://127.0.0.1:4173/`를 연다. 고정 포트가 사용 중이면 실패하며 다른 프로세스를
종료하거나 다른 포트/LAN 주소로 우회하지 않는다. 개발 서버의 임의 `--host`
설정이나 터널 공개를 사용하지 않는다.

1. 영어·일본어·한국어와 종목, 가격/시장 개요를 선택한다.
2. 질문을 검토하고 복사한다. 복사가 차단되면 질문 상자에서 직접 복사한다.
3. 별도의 ChatGPT 열기 버튼으로 이동하고 **직접 붙여넣어 전송**한다.
4. 검색 결과와 출처는 ChatGPT에서 확인한다. 이 화면은 결과를 가져오지 않는다.

질문 복사는 클립보드를 변경한다. ChatGPT 링크에는 질문이나 인증정보가 없다.
SPCX는 종목 식별 확인부터 요청한다. 선택형 오프라인 실습에서도 SPCX는
`DATA_UNAVAILABLE`이며 다른 종목의 값이나 가상의 상장 사실로 대체하지 않는다.
다른 종목의 모의 가격·분석 역시 실제 시세나 실제 AWS 실행 증거가 아니다.

## 종료와 확인

- 실행한 터미널에서 Enter 또는 `stop` + Enter로 종료한다.
- 입력 종료, SIGINT/SIGTERM 또는 시작 후 최대 5분에도 종료를 시도한다.
  별도 감독 프로세스는 자식 프로세스에 330초 상한을 둔다.
- `local-search-preview-closed`의 `closureVerified: true`와
  `local-search-preview-supervisor-closed`의 `childSuccessful: true`를 확인한다.
- 오류/강제 종료는 정상 종료로 간주하지 않는다. 다음 읽기 전용 점검으로
  프로젝트의 프로세스·리스너 잔여 상태를 별도로 확인한다.

```powershell
node scripts/local-safe-stop-inventory.mjs --execute-local-read-only
```

탭을 닫는 것만으로 서버가 종료되지는 않는다. 반대로 서버 종료 후에는 열린
탭에 이전 화면이 남을 수 있지만 새로고침하면 연결되지 않는다. 점검용 탭도 닫는다.
다른 프로젝트의 서버나 브라우저 전체를 임의로 종료하지 않는다.

## 비용·보안 한계

이 실행 경로는 AWS/모델/공급자 호출과 배포를 수행하지 않으며 자식 프로세스에
AWS 인증 환경을 전달하지 않는다. 기존 AWS 리소스나 별도로 실행한 4175 실습을
종료하는 명령은 아니다. 기존 ECR/S3/로그 등의 보관 비용과 ChatGPT 계정 한도는
별개다. 정확한 loopback만 허용하지만 침해된 PC나 악성 로컬 프로그램을 격리하는
샌드박스는 아니다. GitHub 업로드와 웹 공개는 수행하지 않는다.
