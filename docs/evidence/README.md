# Local evidence artifacts

이 폴더에는 민감정보와 AWS account identifier가 없는 재생성 가능한 로컬 검증 산출물만 둔다.

- `worker-image-20260810.cdx.json`: 과거 로컬 컨테이너의 CycloneDX SBOM. 원본은 개인 작업 공간에 보존하며 소스 전용 공개본에서는 제외합니다. 현재 실행 의존성 목록으로 대체한 것이 아닙니다.
- `CLOUD_WORKER_ACCEPTANCE_2026-08-30.md`: 수정된 DynamoDB timeout transition, immutable ECR image, task definition revision 3, 단일 만료 job/Fargate task의 real cloud acceptance 증거
- `IAM_LEAST_PRIVILEGE_VALIDATION_2026-08-30.md`: 배포된 execution/worker/controller role의 required/negative IAM decision 17개 검증
- `DYNAMODB_NORMAL_LIFECYCLE_2026-08-30.md`: 승인된 단일 QLD PRICE job/Fargate task의 `QUEUED → RUNNING → SUCCEEDED` 정상 real-cloud 수명주기 증거
- `PHASE7_LOCAL_CONTROLLER_2026-09-05.md`: API/controller, idempotency, throttle, exposure gate와 browser client의 로컬 검증 증거
- `PHASE7_API_DEPLOY_2026-09-05.md`: IAM 보호 API/Controller Lambda 배포, fail-closed acceptance, 실행 중 task 0개 증거
- `PHASE7_SIGNED_API_ACCEPTANCE_2026-09-07.md`: 승인된 단일 signed PRICE API E2E, transaction 권한, STOPPED task/slot 회수와 fail-closed 복구 증거
- `PHASE8_ANALYZE_PREPARATION_2026-09-09.md`: ANALYZE 검증 도구, 단일 모델 호출 경계와 세 언어/실패 경로의 로컬 준비; cloud ANALYZE 실행은 미수행
- `PHASE8_ANALYZE_ACCEPTANCE_2026-09-10.md`: 단일 한국어 QLD 분석의 실제 API/Fargate/Bedrock 성공, 저장 결과 검증과 OPEN/실행 비활성 복구
- `PHASE8_ACCEPTANCE_SELECTION_2026-09-11.md`: 단일 종목·언어 선택과 30개 합성 조합 검증; AWS 호출 없이 후속 cloud acceptance 준비
- `PHASE8_TSLA_EN_ACCEPTANCE_2026-09-12.md`: TSLA 영어 실제 분석, 비공개 결과 검사, 다국어 통합 회귀 174개 및 안전 종료 증거

배포용 image가 바뀌면 SBOM과 scan을 다시 생성하고, ECR에 저장된 최종 digest를 별도로 검증한다.
