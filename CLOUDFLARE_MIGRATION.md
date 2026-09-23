# Cloudflare 정적 호스팅 전환

## 구성

- Cloudflare Workers Static Assets로 HTML, CSS, JS, 과거 봉 데이터를 제공합니다.
- Worker 실행 코드나 데이터베이스는 사용하지 않습니다.
- `scripts/build-cloudflare.mjs`가 공개할 파일만 `dist/`에 복사합니다.
- GitHub Pages의 HTML 진입점에 `base` 태그를 넣어 차트 코드와 데이터를 Cloudflare에서 가져옵니다.
- 티스토리 iframe 주소와 브라우저 저장소의 origin을 유지해 기존 테스트 기록을 보존합니다.
- Cloudflare 빌드에서는 해당 `base` 태그를 제거해 각 배포의 자산을 직접 사용합니다.
- Cloudflare 주소를 직접 열면 기존처럼 티스토리로 이동하며, iframe 안에서는 차트를 표시합니다.

## 확인 및 배포

배포 주소: `https://parkst-chart-lab.parkst-chart-lab.workers.dev/`

2026-09-24 KST에 Cloudflare 공개 배포를 완료했습니다. 방문자는 기존 티스토리 주소를 사용하며, GitHub Pages는 작은 HTML 진입점을, Cloudflare는 코드와 대용량 데이터를 제공합니다.

Node.js 22 이상과 pnpm을 사용합니다.

```sh
node scripts/build-cloudflare.mjs
pnpm dlx wrangler@4.136.3 deploy --dry-run
pnpm dlx wrangler@4.136.3 login
pnpm dlx wrangler@4.136.3 deploy
```

계정이 여러 개이면 배포할 Cloudflare 계정을 확인한 뒤 선택합니다.
배포 결과에 표시되는 실제 workers.dev 주소를 사용합니다.

## 티스토리 연결과 기록 보존

티스토리의 두 meta 태그는 현재 GitHub Pages 진입점 주소를 사용합니다. HTML의 `base` 태그로 JS, CSS, 데이터, 라이선스 파일의 요청만 Cloudflare로 전환합니다.

- `parkst-records`: `https://whc-mtsc.github.io/parkst-chart-lab/AOA_%EB%A7%A4%EB%A7%A4%EC%B0%A8%ED%8A%B8.html`
- `parkst-trainer`: `https://whc-mtsc.github.io/parkst-chart-lab/trainer.html`

Cloudflare base 주소는 배포된 workers.dev 주소의 루트(`/`)입니다. 기존 `/parkst-chart-lab/` 경로를 붙이지 않습니다. 티스토리의 iframe origin 검사와 재생 일시정지 메시지는 기존대로 동작합니다.

HTML 페이지 사이의 이동 링크는 기존 GitHub Pages 주소를 명시해 같은 문서 origin을 유지합니다.

## 기존 테스트 기록

테스트 기록은 브라우저의 사이트별 localStorage에 저장됩니다. iframe의 문서 주소가 기존 GitHub Pages 주소이므로 저장 기록도 같은 origin에 남습니다. 향후 iframe 주소를 Cloudflare 주소로 직접 바꾼다면 기록이 자동 이전되지 않으므로 `테스트 파일 저장`과 `불러오기`를 이용해야 합니다.

## 로컬 확인 결과

- 공개 자산 853개, 약 175.7 MB를 생성했습니다.
- 기본 BTC 1시간봉, 15분봉 전환, 1분봉 분할 데이터 로딩을 확인했습니다.
- 블라인드 테스트의 초기 로딩과 1시간 진행을 확인했습니다.
- 위 화면에서 JavaScript 오류는 발견되지 않았습니다.
- Cloudflare 공개 주소의 HTML, 차트 코드, BTC 1시간봉 데이터에서 HTTP 200 응답을 확인했습니다.
- 로컬 HTML 진입점에서 실제 Cloudflare 자산을 불러와 기본 BTC 1시간봉, 1분봉 10,081개 표시와 블라인드 테스트의 1시간 진행을 확인했습니다.
- 이 연결 검사에서도 JavaScript 오류는 발견되지 않았습니다.

## 복구

세 HTML 진입점의 `<base data-cloudflare-assets ...>` 태그를 제거해 GitHub Pages에 배포하면 코드와 데이터도 기존 GitHub Pages에서 제공됩니다.

- `https://whc-mtsc.github.io/parkst-chart-lab/AOA_%EB%A7%A4%EB%A7%A4%EC%B0%A8%ED%8A%B8.html`
- `https://whc-mtsc.github.io/parkst-chart-lab/trainer.html`

GitHub Pages를 끄거나 저장소를 비공개로 바꾸는 작업은 이 전환 설정에 포함하지 않습니다.
