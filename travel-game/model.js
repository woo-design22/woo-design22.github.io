export const FOODS = [
  {id:'coffee',name:'따뜻한 라테',icon:'☕',color:'#ece0ce'},
  {id:'cake',name:'딸기 케이크',icon:'🍰',color:'#f8dce0'},
  {id:'tea',name:'말차 티',icon:'🍵',color:'#dfe9d3'},
  {id:'bread',name:'크루아상',icon:'🥐',color:'#f7e3be'},
  {id:'juice',name:'오렌지 주스',icon:'🍊',color:'#ffe2c2'}
];
export const ROUTES = [
  {id:'jeju',code:'CJU',name:'제주',tag:'바람이 반겨주는 섬',icon:'🍊',stars:0,target:6,duration:60,menu:3,orderSize:1,patience:34,color:'#e7efdc'},
  {id:'tokyo',code:'NRT',name:'도쿄',tag:'벚꽃을 닮은 한 잔',icon:'🌸',stars:2,target:9,duration:70,menu:4,orderSize:2,patience:35,color:'#fae3e6'},
  {id:'taipei',code:'TPE',name:'타이베이',tag:'골목마다 달콤한 향기',icon:'🧋',stars:4,target:11,duration:75,menu:5,orderSize:2,patience:32,color:'#e4e9da'},
  {id:'paris',code:'CDG',name:'파리',tag:'갓 구운 빵과 느긋한 오후',icon:'🥐',stars:6,target:13,duration:80,menu:5,orderSize:3,patience:32,color:'#f2e6d3'},
  {id:'hawaii',code:'HNL',name:'하와이',tag:'파도 소리가 들리는 휴식',icon:'🌺',stars:9,target:15,duration:85,menu:5,orderSize:3,patience:29,color:'#dbece9'},
  {id:'moon',code:'LUNA',name:'달빛 여행',tag:'우리만 아는 별빛 카페',icon:'🌙',stars:12,target:18,duration:90,menu:5,orderSize:3,patience:27,color:'#e5e1f2'}
];
export const OUTFITS = [
  {id:'apron',name:'크림 바리스타',level:1,color:'#d5b791',accent:'#7b6550',perk:'조리 속도 +0%',speed:0,tip:0,icon:'🤎'},
  {id:'mint',name:'민트 승무원',level:2,color:'#8caf9d',accent:'#376555',perk:'조리 속도 +12%',speed:.12,tip:0,icon:'🌿'},
  {id:'rose',name:'로즈 퍼서',level:4,color:'#d898a5',accent:'#8b4a60',perk:'조리 속도 +15% · 팁 +20%',speed:.15,tip:.2,icon:'🎀'},
  {id:'navy',name:'별빛 수석 승무원',level:6,color:'#6d7d9b',accent:'#384461',perk:'조리 속도 +25% · 팁 +30%',speed:.25,tip:.3,icon:'✨'}
];
export const ITEMS = [
  {id:'machine',name:'구름 커피 머신',level:2,icon:'☕',description:'모든 음식 조리 속도 +20%',cost:180},
  {id:'bell',name:'다정한 서비스 벨',level:3,icon:'🔔',description:'승객의 기다리는 시간 +30%',cost:240},
  {id:'ribbon',name:'행운의 리본',level:4,icon:'🎗️',description:'직접 서빙으로 받는 코인 +25%',cost:320}
];
export const ACHIEVEMENTS = [
  {id:'first',name:'첫 번째 착륙',description:'첫 비행 마치기',goal:1,key:'flights',reward:50,icon:'✈'},
  {id:'serve30',name:'단골이 생겼어요',description:'누적 30회 서빙',goal:30,key:'served',reward:100,icon:'☕'},
  {id:'combo8',name:'손끝의 마법',description:'직접 서빙 8콤보',goal:8,key:'maxCombo',reward:120,icon:'⚡'},
  {id:'auto10',name:'든든한 동료',description:'카트로 10회 자동 서빙',goal:10,key:'autoServed',reward:100,icon:'🤖'},
  {id:'stars9',name:'하늘의 작은 별',description:'노선 별점 합계 9개',goal:9,key:'stars',reward:180,icon:'⭐'}
];
const moreFood=[['scone','버터 스콘','🧁'],['pudding','커스터드 푸딩','🍮'],['donut','초코 도넛','🍩'],['sandwich','클럽 샌드위치','🥪'],['waffle','메이플 와플','🧇'],['pancake','베리 팬케이크','🥞'],['cookie','버터 쿠키','🍪'],['salad','싱그러운 샐러드','🥗'],['onigiri','참치 주먹밥','🍙'],['bento','여행 도시락','🍱'],['sushi','작은 초밥','🍣'],['icecream','바닐라 아이스크림','🍦'],['pretzel','솔티 프레첼','🥨'],['pizza','미니 피자','🍕'],['chocolate','다크 초콜릿','🍫'],['peach','복숭아 에이드','🍑'],['lemon','레몬 티','🍋'],['strawberry','딸기 우유','🍓'],['milk','꿀 우유','🥛']];
for(const [id,name,icon] of moreFood) FOODS.push({id,name,icon,color:['#ece0ce','#f8dce0','#dfe9d3','#f7e3be'][FOODS.length%4]});
const cities=[['BKK','방콕','🐘'],['SIN','싱가포르','🌿'],['DAD','다낭','🏮'],['DPS','발리','🌴'],['SYD','시드니','🐨'],['AKL','오클랜드','🥝'],['DXB','두바이','🏜️'],['IST','이스탄불','🧿'],['FCO','로마','🏛️'],['BCN','바르셀로나','🎨'],['LIS','리스본','🚋'],['LHR','런던','🫖'],['AMS','암스테르담','🌷'],['CPH','코펜하겐','🚲'],['HEL','헬싱키','❄️'],['ZRH','취리히','🏔️'],['PRG','프라하','🏰'],['JFK','뉴욕','🗽'],['SFO','샌프란시스코','🌉'],['YVR','밴쿠버','🍁'],['MEX','멕시코시티','🌵'],['LIM','리마','🦙'],['KEF','레이캬비크','🌌'],['STARS','별빛 정거장','🪐']];
for(const [code,name,icon] of cities) {const i=ROUTES.length; ROUTES.push({id:code.toLowerCase(),code,name,tag:'새로운 하늘, 새로운 단골',icon,stars:i*2,target:12+Math.floor(i/4),duration:120,menu:5,orderSize:Math.min(3,2+Math.floor(i/12)),patience:35,color:['#e7efdc','#fae3e6','#dbece9','#f2e6d3'][i%4]});}
const costumeNames=['살구빛 여행자','라벤더 크루','햇살 스튜어드','체리 블로섬','구름 탐험가','숲속 티 소믈리에','오렌지 캡틴','은빛 퍼서','달빛 바리스타','오로라 크루','사파이어 수석','피치 디렉터','에메랄드 캡틴','보랏빛 별지기','골든 윙','하늘의 마에스트로'];
for(let i=0;i<costumeNames.length;i++) OUTFITS.push({id:'uniform'+i,name:costumeNames[i],level:8+i*2,baseIndex:1+i%3,hue:[-25,38,72,135,185,235][i%6],color:'#8caf9d',accent:'#376555',perk:`조리 속도 +${28+i}% · 팁 +${35+i*2}%`,speed:(28+i)/100,tip:(35+i*2)/100,icon:'✦'});
const itemNames=[['thermos','온기 보온병','🫖'],['oven','포근한 오븐','🥖'],['clock','구름 회중시계','🕰️'],['charm','별빛 브로치','💎'],['glove','금빛 서비스 장갑','🧤'],['bag','여행 가방','🧳'],['flower','꽃향기 디퓨저','🌷'],['compass','하늘 나침반','🧭'],['book','비밀 레시피북','📖']];
for(let i=0;i<itemNames.length;i++) {const [id,name,icon]=itemNames[i];const kind=['speed','patience','tip'][i%3]; ITEMS.push({id,name,icon,level:5+i*3,cost:500+i*300,kind,power:.15+i*.03,description:kind==='speed'?`조리 속도 +${15+i*3}%`:kind==='patience'?`승객 기다림 +${15+i*3}%`:`서빙 코인 +${15+i*3}%`});}
export const GUESTS=['여우 유자','곰 마롱','고양이 모카','펭귄 소다','수달 보리','코기 버터','판다 올리브','토끼 라일락','레서판다 밤','사슴 로지','햄스터 푸딩','너구리 루이'].map((name,i)=>({id:i,name,level:i<4?1:2+(i-4)*2,goal:10+i*5}));
export const MODES=[{id:'normal',name:'다정한 비행',description:'차분하게 정확한 주문 서빙',patience:1,tip:1},{id:'rush',name:'출근길 러시',description:'기다림 -25% · 코인 +35%',patience:.75,tip:1.35},{id:'vip',name:'프리미엄 주문',description:'주문 한 가지 추가 · 코인 +50%',patience:1.15,tip:1.5},{id:'bakery',name:'베이커리 데이',description:'빵과 디저트로만 주문을 구성',patience:1,tip:1.1},{id:'tea',name:'티타임',description:'음료가 가득한 기내 카페',patience:1.1,tip:1.05},{id:'duo',name:'둘이 떠나는 여행',description:'모든 승객이 두 가지를 주문',patience:1.2,tip:1.2},{id:'express',name:'익스프레스',description:'조리 속도 +30% · 기다림 -20%',patience:.8,tip:1.15},{id:'festival',name:'축제 비행',description:'레시피 종류 5개 · 코인 +25%',patience:1,tip:1.25}];
export const threshold = level => Math.round(100 * (level - 1) * level / 2 * (1 + Math.max(0,level-2)/12));
export function levelFor(xp) { let level=1; while(level<50 && xp>=threshold(level+1)) level++; return level; }
export function totalStars(p) { return Object.values(p.best).reduce((a,b)=>a+b,0); }
export function defaultProfile() { return {version:1,name:'하늘 바리스타',xp:0,coins:0,outfit:'apron',item:null,cart:false,cartLevel:1,owned:[],best:{},flights:0,served:0,autoServed:0,maxCombo:0,achieved:[],tutorial:false,kitchenTutorial:false,campaign:{},upgrades:{},guestVisits:{},decor:'sage',ownedDecor:['sage'],lastSeen:Date.now(),flownSeconds:0,tickets:0,cabinClass:'economy'}; }
export function normalizeProfile(raw) {
  const p=defaultProfile(); if(!raw||raw.version!==1) return p;
  for(const key of ['xp','coins','flights','served','autoServed','maxCombo']) if(Number.isFinite(raw[key])) p[key]=Math.max(0,Math.floor(raw[key]));
  p.name=typeof raw.name==='string'?raw.name.slice(0,18):p.name;
  p.outfit=OUTFITS.some(o=>o.id===raw.outfit&&o.level<=levelFor(p.xp))?raw.outfit:'apron';
  p.owned=Array.isArray(raw.owned)?[...new Set(raw.owned.filter(id=>ITEMS.some(i=>i.id===id&&i.level<=levelFor(p.xp))))]:[];
  p.item=p.owned.includes(raw.item)?raw.item:null; p.cart=raw.cart===true&&levelFor(p.xp)>=2;
  p.cartLevel=Number.isInteger(raw.cartLevel)?Math.min(10,Math.max(1,raw.cartLevel)):1;
  p.tutorial=raw.tutorial===true;p.kitchenTutorial=raw.kitchenTutorial===true;
  p.achieved=Array.isArray(raw.achieved)?[...new Set(raw.achieved.filter(id=>ACHIEVEMENTS.some(a=>a.id===id)))]:[];
  for(const r of ROUTES) if(Number.isInteger(raw.best?.[r.id])) p.best[r.id]=Math.min(3,Math.max(0,raw.best[r.id]));
  for(const r of ROUTES) if(Array.isArray(raw.campaign?.[r.id])) p.campaign[r.id]=raw.campaign[r.id].slice(0,50).map(n=>Number.isInteger(n)?Math.min(3,Math.max(0,n)):0);
  for(const i of ITEMS) if(Number.isInteger(raw.upgrades?.[i.id])) p.upgrades[i.id]=Math.min(10,Math.max(1,raw.upgrades[i.id]));
  for(const g of GUESTS) if(Number.isInteger(raw.guestVisits?.[g.id])) p.guestVisits[g.id]=Math.max(0,raw.guestVisits[g.id]);
  p.lastSeen=Number.isFinite(raw.lastSeen)?Math.max(0,raw.lastSeen):Date.now();
  p.flownSeconds=Number.isFinite(raw.flownSeconds)?Math.max(0,raw.flownSeconds):0;
  p.ownedDecor=Array.isArray(raw.ownedDecor)?[...new Set(['sage',...raw.ownedDecor.filter(s=>['rose','ocean','sunset','night'].includes(s))])]:['sage'];
  p.decor=p.ownedDecor.includes(raw.decor)?raw.decor:'sage';
  p.tickets=Number.isInteger(raw.tickets)?Math.max(0,raw.tickets):0;
  p.cabinClass=['economy','business','first'].includes(raw.cabinClass)?raw.cabinClass:'economy';
  if((p.cabinClass==='business'&&levelFor(p.xp)<8)||(p.cabinClass==='first'&&levelFor(p.xp)<16))p.cabinClass='economy';
  return p;
}
export function sameOrder(a,b) { return a.length===b.length&&[...a].sort().every((v,i)=>v===[...b].sort()[i]); }
export function starsFor(served,target) { return served>=Math.ceil(target*1.5)?3:served>=target?2:served>=Math.ceil(target*.6)?1:0; }
export function cartInterval(level) { return Math.max(2.6,8-(level-1)*.6); }
export function equipmentStats(p) {const item=ITEMS.find(i=>i.id===p.item);if(!item)return {speed:0,patience:0,tip:0};const kind=item.kind||({machine:'speed',bell:'patience',ribbon:'tip'}[item.id]);const power=(item.power||({machine:.2,bell:.3,ribbon:.25}[item.id]))+(Math.max(1,p.upgrades[item.id]||1)-1)*.025;return {speed:0,patience:0,tip:0,[kind]:power};}
export function mission(p,routeId,stageOverride) {
 const base=ROUTES.find(r=>r.id===routeId)||ROUTES[0]; const index=ROUTES.indexOf(base);
 const completed=p.campaign[base.id]||[]; const stage=stageOverride??Math.min(49,completed.findIndex(n=>!n)<0?completed.length:completed.findIndex(n=>!n));
 const mode=MODES[stage%MODES.length]; const tier=Math.floor(stage/10);
 const duration=p.flights<5?60:120;
 let pool=FOODS; if(mode.id==='bakery') pool=FOODS.filter(f=>['cake','bread','scone','pudding','donut','waffle','pancake','cookie','pretzel'].includes(f.id));
 if(mode.id==='tea')pool=FOODS.filter(f=>['coffee','tea','juice','peach','lemon','strawberry','milk'].includes(f.id));
 const offset=(index*3+Math.floor(stage/4))%pool.length; const menu=stage===0&&index===0?FOODS.slice(0,3):Array.from({length:5},(_,i)=>pool[(offset+i)%pool.length]);
 return {...base,stage,mode,duration,menu,target:Math.min(42,(p.flights<5?6:12)+index%6+tier*2),orderSize:Math.min(3,Math.max(base.orderSize,tier>1?2:1)+(mode.id==='vip'?1:0)),patience:Math.max(23,base.patience-tier)*mode.patience};
}
export function campaignCount(p) {return Object.values(p.campaign).reduce((n,a)=>n+a.filter(v=>v>0).length,0);}
export function settleOffline(p,now=Date.now()) {const elapsed=Math.max(0,Math.min(8*3600,(now-p.lastSeen)/1000));p.lastSeen=now;if(!p.cart||levelFor(p.xp)<2||elapsed<60)return null;const services=Math.floor(elapsed/60)*(1+Math.floor(p.cartLevel/3));const coins=services*(3+p.cartLevel);p.coins+=coins;return {seconds:elapsed,services,coins};}
export function applyFlight(p,result) {
  const beforeLevel=levelFor(p.xp); const stars=starsFor(result.served,result.target);
  const xp=60+result.served*10+stars*20; const coins=result.coins+stars*20;
  p.xp+=xp; p.coins+=coins; p.flights++; p.served+=result.served; p.autoServed+=result.autoServed;
  if(stars===3)p.tickets++;
  p.maxCombo=Math.max(p.maxCombo,result.maxCombo); p.best[result.routeId]=Math.max(p.best[result.routeId]||0,stars);
  if(result.stage!==undefined&&stars>0){const campaign=p.campaign[result.routeId]||[];while(campaign.length<=result.stage)campaign.push(0);campaign[result.stage]=Math.max(campaign[result.stage],stars);p.campaign[result.routeId]=campaign;}
  p.flownSeconds+=result.duration||0;
  if(result.guestVisits)for(const [id,n]of Object.entries(result.guestVisits))p.guestVisits[id]=(p.guestVisits[id]||0)+n;
  const awards=[]; for(const a of ACHIEVEMENTS) {
    const value=a.key==='stars'?totalStars(p):p[a.key];
    if(value>=a.goal&&!p.achieved.includes(a.id)) {p.achieved.push(a.id);p.coins+=a.reward;awards.push(a);}
  }
  return {stars,xp,coins,beforeLevel,afterLevel:levelFor(p.xp),awards};
}

ROUTES.push({id:'chengdu',code:'TFU',name:'청두',tag:'대나무 그늘과 느긋한 골목',icon:'🐼',stars:8,target:14,duration:120,menu:5,orderSize:2,patience:35,color:'#e7efdc'});

const countries={jeju:'대한민국',tokyo:'일본',taipei:'대만',paris:'프랑스',hawaii:'미국',moon:'상상 여행지',bkk:'태국',sin:'싱가포르',dad:'베트남',dps:'인도네시아',syd:'호주',akl:'뉴질랜드',dxb:'아랍에미리트',ist:'튀르키예',fco:'이탈리아',bcn:'스페인',lis:'포르투갈',lhr:'영국',ams:'네덜란드',cph:'덴마크',hel:'핀란드',zrh:'스위스',prg:'체코',jfk:'미국',sfo:'미국',yvr:'캐나다',mex:'멕시코',lim:'페루',kef:'아이슬란드',stars:'상상 여행지',chengdu:'중국'};
for(const r of ROUTES)r.country=countries[r.id];
export function destinationLabel(id){const r=ROUTES.find(x=>x.id===id)||ROUTES[0];return r.name+' · '+r.country;}
