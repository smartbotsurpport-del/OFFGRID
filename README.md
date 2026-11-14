<div align="center">
  <h1>◈ OFFGRID</h1>
  <p><strong>한 개의 HTML로 즐기는 섬 생존 작전</strong></p>
  <p>기존 에피소드 2의 맵과 매치 시뮬레이션을 유지하면서, 화면과 온라인 로비를 새롭게 구성했습니다.</p>
  <p>
    <img alt="Single HTML" src="https://img.shields.io/badge/build-single%20HTML-43c8d2?style=flat-square">
    <img alt="WebRTC voice" src="https://img.shields.io/badge/voice-WebRTC%20P2P-8b7bf5?style=flat-square">
    <img alt="Firebase" src="https://img.shields.io/badge/backend-Firebase-f0b65d?style=flat-square">
    <img alt="WebGL 2" src="https://img.shields.io/badge/render-WebGL%202-587d9a?style=flat-square">
  </p>
</div>

---

## 시작하기

`index.html`을 HTTPS 웹사이트나 `localhost`에서 열어 주세요. Google 로그인과 마이크 사용은 `file://` 실행에서 지원되지 않습니다.

- **GitHub Pages:** 저장소 설정에서 Pages 배포를 켜면 정적 게임 화면을 호스팅할 수 있습니다.
- **Firebase Hosting:** Firebase CLI 로그인 후 아래 명령으로 사이트와 공개 규칙을 배포합니다.

```sh
firebase deploy --only database,firestore:rules,hosting
```

Firebase 프로젝트 준비 방법은 [Firebase 설정 안내](Firebase-Setup.md)를 참고하세요.

## 작전 기능

| 기능 | 설명 |
|---|---|
| 계정 | Google 로그인 또는 게스트 계정 |
| 파티 | 초대 코드로 최대 20명 참가, 준비 상태와 팀 채팅 |
| 근접 음성 | 파티원이 마이크를 연결하면 20m 안에서 음성 연결, 거리에 따라 볼륨 감소 |
| 무전기 | 최대 5명을 선택하고 `V`를 누르는 동안 송신, 필터와 약한 잡음 효과 |
| OP 콘솔 | 제재, 공지, 이동, 보호, 회복 및 장비 명령과 닉네임 자동완성 |
| 클라우드 전적 | Firestore 프로필과 전적판 |

자세한 명령 문법은 [OP 명령어 안내](Commands.md)에 있습니다.

## 음성 연결 방식

음성은 브라우저 간 WebRTC P2P로 전달하며 Firebase에 오디오를 올리지 않습니다. 근접 판정용 캐릭터 좌표도 P2P 데이터 채널로만 교환합니다. Firebase Realtime Database에는 짧은 연결 신호와 참가 상태만 기록하고, 연결이 성립되면 시그널링 데이터를 지웁니다. 참가 정보와 발신자의 연결 정보에는 `onDisconnect()` 정리를 등록합니다.

음성 기능은 마이크 권한과 HTTPS가 필요합니다. TURN 중계는 사용하지 않으므로 엄격한 NAT나 방화벽 환경에서는 연결에 실패할 수 있습니다. 한 파티가 20명이면 각 기기에서 최대 19개의 직접 연결을 만들 수 있어, 모두 가까이 모였을 때의 성능은 기기와 회선에 따라 달라집니다.

## Firebase 배포 참고

- Realtime Database Spark 무료 사용량은 저장 1GB, 다운로드 월 10GB입니다. 음성 오디오와 위치는 Firebase를 통과하지 않지만 파티·채팅·관리 기능은 Firebase를 사용합니다.
- OP 권한은 서버의 Firebase Auth custom claim으로 확인합니다. OP Cloud Function을 배포하려면 Firebase Blaze 요금제가 필요합니다. 음성 연결에는 해당 Function이 필요하지 않습니다.
- 관리자를 추가하려면 계정으로 먼저 로그인한 뒤 신뢰할 수 있는 환경에서 `node functions/set-admin.cjs 이메일`을 실행합니다. 서비스 계정 파일은 GitHub에 올리지 마세요.

## 현재 온라인 범위

파티는 채팅과 음성 로비입니다. 게임의 매치 시작, 전투 상태, 원격 캐릭터는 동기화하지 않으며 각 플레이어는 기존 로컬 매치를 실행합니다. 따라서 근접 음성 거리 판정은 두 플레이어가 대응되는 매치 좌표를 사용하고 있을 때 가장 정확합니다.

---

<div align="center"><sub>OFFGRID · ISLAND OPERATIONS</sub></div>
