# 주문 정보 포맷 (order JSON v1)

고객이 어떤 경로(카카오 봇·구글폼)로 주문하든, 제작 파이프라인에 들어오는 최종 형태는
아래 JSON 하나다. 카카오 주문봇(`counsel-proxy/order-bot.js`)이 인터뷰를 마치면 이 형태로
판매자 텔레그램에 전송한다. 사람이 읽는 질문지는 `docs/custom-game-order-form.md`(구글폼용)이고,
이 문서는 그 **기계용 대응물**이다. 필드는 1:1로 대응한다.

엔진 매핑: 각 필드가 `docs/dot-rpg-engine.md`의 어느 조각으로 들어가는지 주석으로 적었다.

```jsonc
{
  "version": 1,
  "type": "couple",              // couple | propose | parents | retire | friends | autobio | etc
  "recipient": "아내 ○○",        // 받는 분 (호칭 포함)
  "deadline": "2026-10-07",      // 전달하고 싶은 날 (없으면 null)
  "password": "0316",            // 게임 잠금 4자리 → PASSWORD 상수
  "title": null,                 // 게임 제목 (null이면 제작자가 제안)

  "characters": [                // 2~6명 → FRIENDS[] + pal 팔레트
    {
      "name": "수지",            // 게임 안 호칭
      "relation": "아내",
      "personality": "귀여운 목소리, 화나면 오래 감",
      "look": "단발, 분홍 옷",   // → pal (머리 길이는 SPR/SPR_F, 색은 h/t)
      "catchphrase": "아무거나~" // → FRIEND_LINES
    }
  ],

  "places": [                    // 5~7곳 → MAPS + labels
    { "name": "장충동 주민센터", "meaning": "처음 만난 곳", "photo": true }
  ],                             // photo: 실사진 제공 여부 → showPhoto .bin 슬롯

  "scenes": [                    // 3~7개, 시간순 → CHAPTERS + QUESTS
    {
      "when_where": "2022년 가을, 회사 사무실",
      "what": "홍보물 만들 사람을 찾다가 남편에게 부탁했다. ...",   // 3~5문장
      "must_include": ["밀크커피가 진리예요, 300원이지만", "말 더듬은 것"],  // 실제 대사
      "tone": "comic",           // warm | comic | plain | any
      "minigame": "auto"         // yes | no | auto → playPuzzle/playRhythm/playDrone/ask루프 중 배정
    }
  ],

  "minigame_prefs": ["puzzle", "timing"],  // puzzle | timing | fly | choice | stack | any

  "ending": {
    "message": "고맙고 사랑해.\n앞으로도 잘 부탁해.",  // → FINAL_MESSAGE (크레딧에 그대로)
    "photo": true,               // 엔딩 사진 여부
    "maker": "철우가 수지에게"    // → MAKER (익명 가능)
  },

  "music": "default",            // default | own(권리 보유 음원 별도 전달)

  "consents": {                  // 전부 true여야 접수 완료 → 폼 8부와 동일
    "portrait": true,            // 실명·사진 당사자 동의
    "no_sensitive": true,        // 민감정보(주민번호·주소·계좌) 미포함
    "no_ip": true,               // 타인 가사·상표·캐릭터 불가 이해
    "revisions": true,           // 수정 3회 이해
    "delivery": true             // 링크+비밀번호 전달, 사진 2주 후 삭제 이해
  },

  "contact": "카카오톡 채널 대화명 또는 이메일",
  "note": null                   // 기타 요청
}
```

## 봇이 지켜야 하는 검증 규칙

- `password`: 정확히 숫자 4자리.
- `scenes`: 3개 미만이면 더 묻고, 7개 초과면 "프리미엄 상담으로 안내".
- `characters`: 2~6명. `look`이 비면 "머리 길이·옷 색 한 가지만"이라도 받아낸다.
- `consents`: 하나라도 false/미확인이면 접수하지 않는다.
- 사진 파일은 봇으로 받지 않는다 — **접수 후 채널 1:1 채팅으로** 받는다고 안내(photo는 여부만).
- 저작권 있는 가사·캐릭터 요청은 그 자리에서 "반영 불가"를 알리고 대안을 제안한다.

## 흐름

```
고객 "주문" → 봇 인터뷰(질문 한 번에 하나, 10~15분)
  → 필수 항목이 다 차면 봇이 요약을 보여주고 "이대로 접수할까요?"
  → 고객 확인 → 봇이 <ORDER>{JSON}</ORDER> 생성
  → 서버가 JSON을 떼어 판매자 텔레그램으로 전송, 고객에겐 접수 번호 안내
  → 제작: 템플릿(love-rpg) 복제 → JSON을 엔진 조각에 주입 → 검증 → 비공개 배포
```
