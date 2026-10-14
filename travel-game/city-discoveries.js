import {localFlavor} from './local-flavors.js?v=6.7.0';
// Cultural keepsakes, with game prices rather than real-world ticket or restaurant prices.
const rows={
 chengdu:['훠궈','빙펀','청두 판다 기지','콴자이샹쯔',12,'대나무 판다','보호 쉼터의 대나무 그늘에서 느긋하게 쉬어요.'],
 jeju:['고기국수','오메기떡','성산일출봉','협재해변',0,'귤밭 고양이','돌담 아래에서 꼬리를 살랑거려요.'],
 tokyo:['라멘','도라야키','센소지','도쿄 타워',1,'산책하는 시바견','목줄을 한 강아지가 주인과 함께 쉬고 있어요.'],
 taipei:['우육면','펑리수','타이베이 101','룽산사',0,'골목 고양이','작은 가게 앞 햇볕에 몸을 둥글게 말아요.'],
 paris:['크로크무슈','마카롱','에펠탑','루브르 박물관',0,'카페 고양이','카페 창가에서 지나가는 사람을 구경해요.'],
 hawaii:['포케','셰이브 아이스','와이키키 해변','다이아몬드 헤드',8,'졸린 바다표범','해변 한쪽에서 눈을 감고 쉬고 있어요.'],
 moon:['달빛 주먹밥','별사탕 푸딩','달빛 전망대','조개빛 산책로',3,'달빛 토끼','달빛이 닿은 풀밭에서 귀를 쫑긋해요.'],
 bkk:['팟타이','망고 찹쌀밥','왓 아룬','왕궁',0,'사원 골목 고양이','나무 그늘 아래 작은 발을 가지런히 모아요.'],
 sin:['치킨라이스','카야 토스트','머라이언 파크','가든스 바이 더 베이',9,'정원의 도마뱀','잎사귀 아래에서 작은 얼굴을 내밀어요.'],
 dad:['미꽝','쩨','용다리','미케 해변',1,'해변 강아지','모래 위에서 반가운 듯 꼬리를 흔들어요.'],
 dps:['나시고렝','다다르 굴룽','울루와투','뜨갈랄랑 계단식 논',9,'작은 게코','초록 잎 옆에서 손가락 같은 발을 펼쳐요.'],
 syd:['미트 파이','파블로바','시드니 오페라 하우스','본다이 비치',5,'졸린 코알라','동물 보호 쉼터의 가지 위에서 꾸벅꾸벅 졸아요.'],
 akl:['피시 앤 칩스','호키포키 아이스크림','스카이 타워','와이헤케섬',7,'작은 펭귄','보호 쉼터의 물가를 뒤뚱뒤뚱 걸어요.'],
 dxb:['샤와르마','루카이마트','부르즈 할리파','알 파히디',0,'모래빛 고양이','그늘진 골목에서 눈을 천천히 깜박여요.'],
 ist:['시미트','바클라바','아야 소피아','갈라타 타워',0,'이스탄불 고양이','돌계단 한 칸을 자기 자리로 삼았어요.'],
 fco:['카초 에 페페','젤라토','콜로세움','트레비 분수',0,'광장 고양이','따뜻한 돌바닥에 누워 여유를 즐겨요.'],
 bcn:['파에야','크레마 카탈라나','사그라다 파밀리아','구엘 공원',1,'공원 강아지','주인 옆에서 잠깐 산책을 쉬고 있어요.'],
 lis:['바칼라우','파스텔 드 나타','벨렝 탑','상 조르즈 성',0,'노란 골목 고양이','창턱에 앉아 골목의 소리를 들어요.'],
 lhr:['피시 앤 칩스','스콘','타워 브리지','빅 벤',10,'공원 다람쥐','작은 앞발을 모으고 나무 아래를 살펴요.'],
 ams:['청어 샌드위치','스트로프와플','암스테르담 운하','반 고흐 미술관',0,'운하 고양이','다리 옆 벤치에서 배를 지켜봐요.'],
 cph:['스뫼레브뢰','데니시 페이스트리','니하운','인어공주상',1,'항구 강아지','주인의 발 옆에서 항구 바람을 맡아요.'],
 hel:['연어 수프','시나몬 롤','헬싱키 대성당','수오멘린나',10,'숲 다람쥐','나무의 낮은 가지에서 살짝 얼굴을 보여요.'],
 zrh:['치즈 퐁뒤','스위스 초콜릿','취리히 호수','그로스뮌스터',11,'숲속 아기 사슴','보호 쉼터의 풀밭에서 조용히 쉬어요.'],
 prg:['스비치코바','콜라체','카를교','프라하 성',0,'지붕 고양이','낮은 담 위에서 강을 바라봐요.'],
 jfk:['뉴욕 피자','뉴욕 치즈케이크','자유의 여신상','센트럴 파크',10,'도시 다람쥐','공원 벤치 옆에 작은 발자국을 남겨요.'],
 sfo:['클램 차우더','기라델리 초콜릿','금문교','피어 39',8,'항구 물개 친구','보호 구역의 물가에서 낮잠을 즐겨요.'],
 yvr:['연어 요리','나나이모 바','스탠리 파크','그랜빌 아일랜드',2,'작은 여우','보호 쉼터의 나무 그늘에서 귀를 쫑긋해요.'],
 mex:['타코','추로스','소칼로','차풀테펙 공원',1,'광장 강아지','주인과 함께 분수 옆에서 쉬고 있어요.'],
 lim:['세비체','수스피로 리메뇨','미라플로레스 해안','리마 대광장',0,'해안 고양이','잔디 옆 돌담에 턱을 기대고 있어요.'],
 kef:['양고기 수프','스키르','할그림스키르캬','선 보이저',2,'눈빛 여우','보호 쉼터의 바위 뒤에서 살짝 고개를 내밀어요.'],
 stars:['별빛 샌드위치','은하수 젤리','별빛 정거장','고요한 별의 정원',4,'별빛 레서판다','별 모양 잎 아래에서 꼬리를 꼭 끌어안아요.']
};
export const CITY_DISCOVERIES=Object.fromEntries(Object.entries(rows).map(([route,r])=>[route,{foods:[{id:route+':meal',name:r[0],kind:'meal',cost:8,icon:/샌드위치|시미트|파이|크로크/.test(r[0])?'bread':'bento',note:'여행지의 맛으로 든든한 한 끼를 즐겼어요.'},{id:route+':dessert',name:r[1],kind:'dessert',cost:5,icon:/초콜릿/.test(r[1])?'chocolate':/아이스|쩨|푸딩|젤리|스키르/.test(r[1])?'juice':'cake',note:'달콤한 한 입을 오늘의 수첩에 남겼어요.'}],places:[{id:route+':place-0',name:r[2],kind:'place',cost:0,icon:'camera',note:'잠깐 멈춰 풍경을 바라보았어요.'},{id:route+':place-1',name:r[3],kind:'place',cost:3,icon:'camera',note:'이 도시의 또 다른 모습을 기억했어요.'}],animal:{id:route+':animal',sprite:r[4],name:r[5],note:r[6]},fantasy:['moon','stars'].includes(route)}]));
for(const [id,city] of Object.entries(CITY_DISCOVERIES)){const local=localFlavor(id);city.foods.push({id:id+':cafe',name:local.drink,kind:'cafe',cost:4,icon:'coffee',note:local.cafe+'에서 잠깐 쉬었어요.'});city.animal.hue=local.animalHue;}
export const DISCOVERY_ITEMS=Object.values(CITY_DISCOVERIES).flatMap(c=>[...c.foods,...c.places]);
export function discoveryState(raw){const out={};for(const item of DISCOVERY_ITEMS){const record=raw?.[item.id];if(record&&Number.isFinite(record.date))out[item.id]={date:Math.max(0,record.date),count:Math.max(1,Math.min(999,Math.floor(record.count)||1))};}return out;}
export function animalState(raw){const out={};for(const city of Object.values(CITY_DISCOVERIES)){const record=raw?.[city.animal.id];if(record&&Number.isFinite(record.date))out[city.animal.id]={date:Math.max(0,record.date),count:Math.max(1,Math.min(999,Math.floor(record.count)||1)),bond:Math.max(0,Math.min(999,Math.floor(record.bond)||0))};}return out;}
export function canDiscover(j,id){const city=CITY_DISCOVERIES[j?.routeId],item=[...(city?.foods||[]),...(city?.places||[])].find(i=>i.id===id);if(!item||j.stage!=='hotel'||!j.checkedIn||j.completed)return {ok:false,message:'숙소에 체크인하면 도시를 둘러볼 수 있어요.'};if((j.visitedToday||j.discovered)?.includes(id))return {ok:false,message:'이번 여행에서는 이미 즐겼어요.'};if(j.budget<item.cost)return {ok:false,message:'남은 여행 경비가 부족해요.'};return {ok:true,item};}
export function discover(p,j,id,now=Date.now()){const result=canDiscover(j,id);if(!result.ok)return result;const item=result.item;p.discoveries||={};const old=p.discoveries[id],isNew=!old;j.budget-=item.cost;j.joy=Math.min(100,j.joy+(item.kind==='place'?8:12));j.discovered=[...new Set([...(j.discovered||[]),id])];j.visitedToday=[...(j.visitedToday||[]),id];p.discoveries[id]={date:now,count:(old?.count||0)+1};const xp=isNew?(item.kind==='place'?15:12):0;p.xp+=xp;return {ok:true,item,isNew,xp,message:item.name+' · '+(isNew?'새로운 기억을 수집했어요.':'다시 즐긴 기억을 남겼어요.')};}
function hash(s){let h=2166136261;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
export function animalEncounter(j){if(!j||j.stage!=='hotel'||!j.checkedIn)return null;return hash('friend:'+j.id)%3===0?CITY_DISCOVERIES[j.routeId]?.animal||null:null;}
export function meetAnimal(p,j,feed=false,now=Date.now()){const animal=animalEncounter(j);if(!animal||j.completed)return {ok:false,message:'아직 만난 친구가 없어요.'};if(feed&&(!j.bag.includes('animal-treat')||j.animalFed))return {ok:false,message:j.animalFed?'간식을 이미 나누었어요.':'집에서 동물 간식을 챙겨주세요.'};if(!feed&&j.animalMet)return {ok:false,message:'이번 만남은 이미 수첩에 담았어요.'};p.animals||={};const old=p.animals[animal.id]||{count:0,bond:0};const first=!j.animalMet;j.animalMet=true;if(feed){j.animalFed=true;j.bag=j.bag.filter(id=>id!=='animal-treat');}p.animals[animal.id]={date:now,count:old.count+(first?1:0),bond:old.bond+(feed?1:0)};const xp=(first?20:0)+(feed?10:0);p.xp+=xp;p.coins+=(first?10:0)+(feed?5:0);j.joy=Math.min(100,j.joy+(feed?18:8));return {ok:true,animal,xp,feed,message:feed?'간식을 맛본 친구가 편안하게 곁에 머물러요.':'귀여운 친구를 여행수첩에 담았어요.'};}
