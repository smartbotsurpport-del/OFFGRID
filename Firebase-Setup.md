# OFFGRID Firebase 설정

## 1. Firebase Console

1. 프로젝트 `aurorafall-4cfc5`를 확인하거나 `.firebaserc`의 프로젝트 ID를 본인 프로젝트로 바꿉니다.
2. **Authentication → Sign-in method**에서 Google과 익명 로그인을 켭니다.
3. Authentication의 승인된 도메인에 GitHub Pages 또는 Firebase Hosting 주소를 등록합니다.
4. Firestore와 Realtime Database를 만듭니다. Realtime Database 화면에 표시된 정확한 URL을 게임의 **파티 → Firebase 연결 설정**에 입력합니다. 프로젝트에 따라 URL의 리전/도메인이 다를 수 있습니다.
5. 이 저장소의 `firestore.rules`와 `database.rules.json`을 배포합니다. Hosting을 쓸 경우 프로젝트의 Firebase Web 설정과 Database URL이 맞는지도 확인합니다.

`index.html`에 들어 있는 Firebase Web API 키는 웹 클라이언트 식별 값입니다. 데이터 접근은 Authentication과 아래 규칙으로 제한합니다. 서비스 계정 키는 브라우저나 GitHub 저장소에 넣지 않습니다.

## 2. 로컬 도구와 배포

Node.js 22와 Firebase CLI를 설치하고 Firebase 프로젝트에 로그인한 뒤 저장소 폴더에서 실행합니다.

```sh
firebase login
firebase deploy --only database,firestore:rules,hosting
```

Cloud Functions까지 배포할 때는 다음 명령을 사용합니다.

```sh
cd functions
npm install
cd ..
firebase deploy --only functions
```

Cloud Functions 배포는 Firebase Blaze 요금제가 필요합니다. OP 명령 서버가 필요 없다면 Functions를 배포하지 않아도 Google 로그인, 파티, 채팅, WebRTC 음성 기능은 동작합니다. 음성은 Firebase에 오디오를 저장하거나 중계하지 않으며, Realtime Database 무료 한도는 프로젝트 사용량에서 확인하세요. Spark 플랜은 Realtime Database 저장 1 GB 및 다운로드 10 GB/월의 무료 사용 한도가 있습니다. 초과 사용을 막으려면 Firebase Console의 Usage 화면을 확인하세요.

## 3. OP 계정 추가

1. Google로 로그인할 계정으로 게임에 한 번 로그인합니다.
2. 신뢰할 수 있는 관리자 터미널 또는 Cloud Shell에서 `functions` 의존성을 설치합니다.
3. 애플리케이션 기본 인증(ADC)을 설정한 뒤 아래 명령으로 해당 계정에 Firebase Auth의 `admin: true` custom claim을 부여합니다.

```sh
node functions/set-admin.cjs your-account@example.com
```

4. 게임에서 로그아웃했다 다시 로그인하면 OP 콘솔이 나타납니다. 서버 함수가 모든 관리 명령을 custom claim으로 검증합니다.

관리자 지정 스크립트는 높은 권한으로 동작합니다. 승인한 이메일만 지정하고, 사용자 계정 정보를 GitHub에 올리지 마세요.

## 4. 음성 동작과 연결 범위

- 같은 파티에 들어간 뒤 각자 **마이크 연결**을 눌러 권한을 허용해야 합니다. HTTPS 또는 `localhost`에서만 마이크를 사용할 수 있습니다.
- 근접 음성은 두 클라이언트의 캐릭터 좌표를 P2P 데이터 채널로 교환합니다. 좌표는 Firebase에 기록하지 않습니다. 20m 안에서는 직접 오디오를 보내고 거리에 따라 볼륨을 낮춥니다. 범위를 벗어나면 근접 오디오 트랙을 끄고 위치 교환용 데이터 채널만 남겨 재진입을 감지합니다.
- 무전 대상은 파티원 중 최대 5명까지 고릅니다. V를 누르고 있는 동안 선택한 사람에게만 필터가 적용된 무전 트랙을 보냅니다.
- Firebase에는 파티 참가 중임을 나타내는 작은 presence 레코드와 WebRTC SDP/ICE 연결 신호만 놓입니다. 연결이 만들어지면 offer/answer/ICE 자료를 바로 지우며, 참가자와 offer 작성자의 데이터에는 `onDisconnect()` 정리를 설정합니다. 실제 음성 및 위치 값은 P2P로 이동합니다.
- STUN만 사용하며 TURN 중계 서버는 포함하지 않았습니다. 네트워크가 대칭 NAT나 엄격한 방화벽 뒤에 있으면 일부 기기끼리 연결되지 않을 수 있습니다. 서버 비용 없이 모든 네트워크에서 연결을 보장하는 방법은 없습니다.
- 20명 파티에서는 클라이언트 하나가 최대 19개의 직접 WebRTC 연결을 유지합니다. 각 음성 송신은 최대 24 kbit/s로 제한하지만, 모두 가까이 모인 상황에서의 성능은 기기와 회선에 따라 달라집니다.
- 기존 매치 시뮬레이션은 로컬입니다. 파티 시작은 각자의 기존 매치를 시작하며 전투 상태나 원격 캐릭터를 동기화하지 않습니다. 따라서 음성 거리 판정은 각자 같은 기준 좌표계를 쓰는 상황에서만 정확합니다.

## 5. 데이터 및 제재 범위

- Firestore는 프로필과 클라우드 전적을 저장합니다.
- Realtime Database는 파티·채팅, 일시적 온라인 상태와 음성 시그널링, 관리 명령 전달에 사용합니다. 음성 데이터나 음성 위치는 저장하지 않습니다.
- `/mute`는 텍스트 채팅을 차단합니다. 게임에는 보이스가 추가되었으므로 Firebase 관리 이벤트로 대상의 음성 마이크도 음소거할 수 있게 연결됩니다.
- `/sayall`은 전역 공지, `/say`는 현재 파티 채널 공지입니다.
- 클라이언트 제출 전적은 서버 검증 점수가 아니며 부정행위 방지 순위표로 쓰기에는 적합하지 않습니다.

## 공식 참고

- [Realtime Database 사용량과 요금](https://firebase.google.com/docs/database/usage/billing)
- [Cloud Functions 배포 시작하기](https://firebase.google.com/docs/functions/get-started)
- [Firebase Auth custom claims](https://firebase.google.com/docs/auth/admin/custom-claims)
