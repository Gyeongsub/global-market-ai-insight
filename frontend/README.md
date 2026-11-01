# Frontend

React/Vite static frontend for Global Market AI Insight.

- `src/components/`: interactive market workspace
- `src/data/`: synthetic UI fixtures and localized insight examples
- `src/locales/`: English, Japanese and Korean strings
- `src/types/`: frontend contract types
- `public/og.png`: project social preview source; its embedded provenance is removed from the build copy only

The application contains no live credential and makes no provider or AWS call in local mode. `vite build` produces a static `dist/` bundle compatible with the planned private S3/CloudFront architecture.

The local release audit rejects unexpected files and unstripped social-image metadata. The release plan proposes an asset-first/HTML-last sequence but does not upload or provide a rollback executor. Review the original image's rights and metadata before publishing this source repository.
