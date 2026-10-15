import {playCity,errandSpec,normalizeRecipe} from './travel-play.js?v=6.11.1';
import {resumeWalk} from './city-streets.js?v=6.11.1';
import {normalizeExperience,recordExperience,experience} from './travel-experience.js?v=6.11.1';
import {CITY_DISCOVERIES} from './city-discoveries.js?v=6.11.1';
import {ROUTES,routeOpen,newFlight,levelFor} from './passenger-model.js?v=6.11.1';
import {suitcaseCapacity,shopItem,DUTY_ITEMS} from './shopping.js?v=6.11.1';
import {roomProgress,restoreRoomLayout} from './room-model.js?v=6.11.1';
import {cityGuide} from './city-guide.js?v=6.11.1';
import {wishProgress,TRAVEL_WISHES} from './travel-wishes.js?v=6.11.1';
import {tripFunds,returnTripFunds,publishTrip} from './travel-blog.js?v=6.11.1';
export const STAGES=['packing','to-airport','airport','flight','arrival','to-hotel','hotel','complete'];
export const PACKING=[
 {id:'passport',name:'여권',weight:0,icon:'book',tags:['document'],hint:'탑승에 꼭 필요해요'},
 {id:'phone',name:'휴대폰',weight:0,icon:'camera',tags:['electronic'],hint:'예약 확인과 연락'},
 {id:'umbrella',name:'접는 우산',weight:2,icon:'umbrella',tags:['rain'],hint:'비 오는 여행지'},
 {id:'coat',name:'포근한 코트',weight:3,icon:'bow',tags:['cold'],hint:'추운 여행지'},
 {id:'sandals',name:'가벼운 샌들',weight:1,icon:'shoe',tags:['beach'],hint:'바다와 따뜻한 날씨'},
 {id:'sunglasses',name:'선글라스',weight:1,icon:'glasses',tags:['sun'],hint:'햇살이 강한 곳'},
 {id:'charger',name:'충전기',weight:1,icon:'charger',tags:['electronic','power'],hint:'밤에 휴대폰 충전'},
 {id:'pajamas',name:'잠옷',weight:1,icon:'bow',tags:['sleep'],hint:'숙소에서 편안하게'},
 {id:'camera',name:'필름 카메라',weight:2,icon:'camera',tags:['electronic','photo'],hint:'사진을 좋아한다면'},
 {id:'book',name:'작은 책',weight:1,icon:'book',tags:['read'],hint:'기다리는 시간을 즐겁게'},
 {id:'snack',name:'간식 주머니',weight:1,icon:'cake',tags:['food'],hint:'이동 중 출출할 때'},
 {id:'scarf',name:'얇은 스카프',weight:1,icon:'bow',tags:['cold'],hint:'가방에 쏙 들어가요'},
 {id:'animal-treat',name:'동물 간식',weight:1,icon:'gift',tags:['animal'],hint:'우연히 만난 친구와 교감해요'}
];
export const HOTELS=[{id:'guesthouse',name:'동네 게스트하우스',cost:38,tag:'작은 방 · 따뜻한 조명'},{id:'boutique',name:'창가 부티크 호텔',cost:58,tag:'큰 창 · 포근한 침대'},{id:'resort',name:'풍경 리조트',cost:78,tag:'테라스 · 넓은 휴식 공간'}];
export const TO_AIRPORT=[{id:'subway',name:'지하철',cost:9,minutes:40,comfort:-3,description:'가볍게 경비를 아껴요'},{id:'bus',name:'공항 버스',cost:12,minutes:35,comfort:-5,description:'경비를 아끼며 천천히'},{id:'train',name:'공항철도',cost:25,minutes:20,comfort:0,description:'시간과 경비의 균형'},{id:'limousine',name:'공항 리무진',cost:30,minutes:25,comfort:8,description:'짐을 싣고 넓은 좌석에서'},{id:'taxi',name:'택시',cost:45,minutes:12,comfort:10,description:'빠르고 편안하게'}];
export const TO_HOTEL=[{id:'subway',name:'지하철',cost:12,minutes:28,comfort:-3,description:'도시의 일상을 따라가요'},{id:'bus',name:'동네 버스',cost:10,minutes:25,comfort:-5,description:'낯선 골목을 지나가요'},{id:'train',name:'도시 열차',cost:18,minutes:18,comfort:0,description:'차창으로 도시 구경'},{id:'limousine',name:'공항 리무진',cost:24,minutes:20,comfort:5,description:'숙소 근처 정류장까지'},{id:'taxi',name:'택시',cost:35,minutes:10,comfort:10,description:'숙소 앞까지 편안하게'}];
export const AIRPORT_SHOPS=[{id:'coffee',name:'공항 카페',cost:14,minutes:10,comfort:15,joy:0,icon:'coffee',description:'따뜻한 한 잔 · 편안함 +15'},{id:'restaurant',name:'공항 식당',cost:20,minutes:18,comfort:20,joy:10,icon:'bento',description:'든든한 한 끼 · 편안함 +20'},{id:'dutyfree',name:'면세점',cost:10,minutes:4,comfort:0,joy:0,icon:'gift',description:'기념품 마그넷 · 안경 · 초콜릿 · 양주 · 선물'},{id:'postcard',name:'공항 전망대',cost:0,minutes:8,comfort:0,joy:15,icon:'camera',description:'활주로 구경 · 공항 엽서'}];
export function destination(id){const i=Math.max(0,ROUTES.findIndex(r=>r.id===id));let need=['rain','power'];let weather='비가 살짝 내리는 날';
 if(['jeju','hawaii','dps','dad','moon'].includes(id)){need=['beach','sleep'];weather='바닷바람이 부는 따뜻한 날';}
 else if(['kef','hel','zrh','yvr'].includes(id)){need=['cold','power'];weather='서늘한 바람이 부는 날';}
 else if(['dxb','bkk','lim','mex'].includes(id)){need=['sun','power'];weather='햇살이 선명한 날';}
 const guide=cityGuide(id);
 return {weather,need,hotelNames:guide.hotels,note:guide.note,keepsake:guide.keepsake,accent:guide.accent,gate:`${12+i%17}`,claim:`ICN-${String(7+i%83).padStart(2,'0')}`,room:`${203+i%9}`};
}
export function bagWeight(j){return j.bag.reduce((n,id)=>n+(PACKING.find(x=>x.id===id)?.weight||0),0);}
export function packingGoals(j){return destination(j.routeId).need.map(tag=>j.bag.some(id=>PACKING.find(x=>x.id===id)?.tags.includes(tag)));}
export function togglePack(j,id){const item=PACKING.find(x=>x.id===id);if(!item||j.stage!=='packing')return {ok:false,message:'지금은 짐을 바꿀 수 없어요.'};if(j.bag.includes(id)){j.bag=j.bag.filter(v=>v!==id);return {ok:true};}if(bagWeight(j)+item.weight>j.capacity)return {ok:false,message:'가방이 가득 찼어요. 다른 물건을 빼볼까요?'};j.bag.push(id);return {ok:true};}
import {normalizeTripLife,tripLife,cityLife} from './travel-life.js?v=6.11.1';
export function newJourney(p,hotel='guesthouse',now=Date.now()){
 if(!routeOpen(p,p.route)||!HOTELS.some(h=>h.id===hotel))return null;
 const room=HOTELS.find(h=>h.id===hotel),funds=tripFunds(p);if(funds<room.cost+55)return null;
 return {version:1,life:normalizeTripLife(),knownFriend:!!p.animals?.[p.route+':animal'],id:`trip-${now}-${Math.random().toString(36).slice(2,8)}`,routeId:p.route,stage:'packing',seat:p.seat,cabin:p.cabin,departure:p.departure,duration:p.duration,hotel,wish:TRAVEL_WISHES.some(w=>w.id===p.tripWish)?p.tripWish:'scenery',budget:funds-room.cost,fundTotal:funds,funded:false,fundsReturned:false,capacity:suitcaseCapacity(p),bag:[],purchases:[],minutes:0,comfort:35,joy:35,airport:{ticket:false,security:false,coffee:false,restaurant:false,dutyfree:false,postcard:false},entry:{passed:p.route==='jeju'},baggage:false,hotelTask:null,memories:[],flightId:null,flightResult:null,ride:null,checkedIn:false,completed:false,startedAt:now};
}
export function moveTrip(j,id,now=Date.now()){
 const outgoing=j.stage==='packing',incoming=j.stage==='arrival';if(!outgoing&&!incoming)return {ok:false,message:'이동할 준비를 먼저 해주세요.'};
 if(outgoing&&(!j.bag.includes('passport')||!j.bag.includes('phone')))return {ok:false,message:'여권과 휴대폰을 꼭 챙겨주세요.'};
 if(incoming&&!j.baggage)return {ok:false,message:'내 가방을 먼저 찾아주세요.'};
 const option=(outgoing?TO_AIRPORT:TO_HOTEL).find(x=>x.id===id);if(!option)return {ok:false};if(j.budget<option.cost)return {ok:false,message:'경비가 부족해요. 다른 이동 수단을 골라주세요.'};
 j.transport={...(j.transport||{}),[outgoing?'outbound':'inbound']:id};j.budget-=option.cost;j.minutes+=option.minutes+(outgoing?5:0);j.comfort=Math.max(0,Math.min(100,j.comfort+option.comfort));j.stage=outgoing?'to-airport':'to-hotel';j.ride={id,from:now,until:now+6000,next:outgoing?'airport':'hotel'};return {ok:true};
}
export function settleRide(j,now=Date.now()){if(!j?.ride||now<j.ride.until)return false;j.stage=j.ride.next;j.ride=null;return true;}
export function airportAction(j,action,selection=[]){
 if(j.stage!=='airport')return {ok:false};
 if(action==='checkin'){if(j.airport.ticket)return {ok:false,message:'탑승권은 이미 받았어요.'};j.airport.ticket=true;j.minutes+=5;return {ok:true,message:'탑승권을 받았어요. 이제 보안 검색대로 가요.'};}
 if(action==='security'){if(!j.airport.ticket)return {ok:false,message:'먼저 체크인해서 탑승권을 받아주세요.'};if(j.airport.security)return {ok:false};j.airport.security=true;j.minutes+=8;return {ok:true,message:'검색대를 통과했어요. 이제 공항을 둘러보거나 탑승해요.'};}
 if(action==='dutyfree')return {ok:false,message:'면세점에서 물건을 골라주세요.'};
 const shop=AIRPORT_SHOPS.find(s=>s.id===action);if(shop){if(j.airport[action])return {ok:false,message:'이곳은 이번 여행에서 이미 들렀어요.'};if(!j.airport.security)return {ok:false,message:'체크인과 보안 검색을 마치면 들를 수 있어요.'};if(j.budget-shop.cost<10)return {ok:false,message:'숙소로 가는 경비 10은 남겨두어야 해요.'};if(j.minutes+shop.minutes>85)return {ok:false,message:'이제 탑승할 시간이에요. 게이트로 가요.'};j.airport[action]=true;j.budget-=shop.cost;j.minutes+=shop.minutes;j.comfort=Math.min(100,j.comfort+shop.comfort);j.joy=Math.min(100,j.joy+shop.joy);if(action==='postcard')j.memories.push('airport');if(action==='dutyfree')j.memories.push('gift');return {ok:true,message:shop.name+'에서 기분 좋게 시간을 보냈어요.'};}
 return {ok:false};
}
export function board(p,j,now=Date.now()){
 if(j.stage!=='airport'||!j.airport.ticket||!j.airport.security)return null;
 const f=newFlight({...p,route:j.routeId,seat:j.seat,cabin:j.cabin,departure:j.departure,duration:j.duration},now);if(!f)return null;
 f.comfort=Math.min(100,j.comfort+(p.collection?.[p.equipped?.glasses]?5:0)+(j.bag.includes('snack')?10:0));f.joy=j.joy;f.packedCamera=j.bag.includes('camera');f.readBonus=j.bag.includes('book')?5:0;f.journeyId=j.id;j.flightId=f.id;j.stage='flight';j.preparedCount=packingGoals(j).filter(Boolean).length;return f;
}
export function land(j,f,result){if(j.stage!=='flight'||j.flightId!==f.id)return false;j.stage='arrival';j.flightResult=result;j.flightMoments={photoGoal:f.photoGoal===true,comfort:f.comfort,joy:f.joy};j.comfort=Math.min(100,f.comfort+(j.bag.includes('coat')?10:j.bag.includes('scarf')?5:0)+(destination(j.routeId).need.includes('rain')&&j.bag.includes('umbrella')?8:0));j.joy=Math.min(100,f.joy+(j.bag.includes('sandals')||j.bag.includes('sunglasses')?5:0));return true;}
export function immigration(j,purpose,hotel){if(j.stage!=='arrival'||j.entry?.passed)return {ok:false};if(purpose!=='holiday'||hotel!==j.hotel)return {ok:false,message:'여행 목적과 예약한 숙소를 다시 확인해요.'};j.entry={passed:true};j.minutes+=12;return {ok:true,message:'입국 수속을 마쳤어요. 수하물 찾는 곳으로 가요.'};}
export function collectBaggage(j,tag){if(j.stage!=='arrival'||j.baggage)return {ok:false};if(!j.entry?.passed)return {ok:false,message:'먼저 입국 수속을 마쳐주세요.'};if(tag!==destination(j.routeId).claim)return {ok:false,message:'이 가방은 다른 여행자의 것이에요. 내 수하물표를 확인해요.'};j.baggage=true;return {ok:true,message:'내 가방을 찾았어요. 숙소로 출발해볼까요?'};}
export function roomTask(j,task){if(j.stage!=='hotel'||!j.checkedIn||j.hotelTask)return false;if(!['sleep','charge','unpack'].includes(task))return false;if(task==='charge'&&!j.bag.includes('charger'))return false;if(task==='unpack'&&!roomProgress(j).complete)return false;if(task==='sleep')j.comfort=Math.min(100,j.comfort+(j.bag.includes('pajamas')?20:10));if(task==='charge')j.joy=Math.min(100,j.joy+15);if(task==='unpack')j.comfort=Math.min(100,j.comfort+15);j.hotelTask=task;return true;}
export function checkIn(j,code){if(j.stage!=='hotel'||j.checkedIn||code!==destination(j.routeId).room)return false;j.checkedIn=true;j.memories.push('hotel');return true;}
export function finishJourney(p,j,now=Date.now()){
 if(j.stage!=='hotel'||!j.checkedIn||!j.hotelTask||j.completed||p.journeyClaimed?.includes(j.id))return null;
 const prepared=packingGoals(j).filter(Boolean).length,thrifty=j.budget>=20,cozy=j.comfort>=70;
 j.preparedCount=prepared;const wish=wishProgress(j);const freshCity=!p.stays.some(x=>x.route===j.routeId),xp=p.moneyVersion===1?((j.discovered?.length||j.craftCount||j.animalMet||j.errandActions||j.quietRest||experience(j).photoIds.length||!j.quick&&j.hotelTask||(j.nights||1)>1)?(freshCity?50:5):0):70+prepared*25+(thrifty?20:0)+(cozy?20:0)+(wish?.xp||0),coins=p.moneyVersion===1?0:35+prepared*15+(thrifty?15:0)+(wish?.coins||0);const before=levelFor(p.xp);
 p.xp+=xp;p.coins+=coins;p.journeys=(p.journeys||0)+1;p.journeyClaimed=[...(p.journeyClaimed||[]),j.id].slice(-150);j.completed=true;j.stage='complete';
 const record={id:j.id,route:j.routeId,hotel:j.hotel,date:now,startedAt:j.startedAt,bag:[...j.bag],budget:j.budget,memories:[...j.memories],purchases:{...(j.orders||{}),...Object.fromEntries((j.purchases||[]).map((id,i)=>['item-'+i,shopItem(id)?.name||'']))},prepared,transport:j.transport||null,roomLayout:{...(j.roomLayout||{})},hotelTask:j.hotelTask,nights:j.nights||1,departure:j.departure,seat:j.seat,traveler:{avatar:p.avatar,style:p.style},wish:j.wish,wishCount:wish?.count||0,discovered:[...(j.discovered||[])],animalMet:j.animalMet===true,animalFed:j.animalFed===true};
 const localPlay=playCity(p,j.routeId);record.playStory=j.errandActions?{item:errandSpec(j.routeId).item,answer:localPlay.answer,reunited:localPlay.errand===4,place:errandSpec(j.routeId).hideaway}:null;record.postcard=Number.isInteger(j.postcardStamp);record.quick=j.quick===true;record.quietRest=j.quietRest===true;record.craftCount=j.craftCount||0;record.craftNotes=j.craftNotes||[];record.errandActions=j.errandActions||0;record.experience=recordExperience(j);record.life={orders:tripLife(j).paid.length,recipe:cityLife(p,j.routeId).recipe};
 record.friendEvent=friendEventState(j.friendEvent,j.routeId);
 p.stays=[record,...(p.stays||[])].slice(0,40);p.visitedRooms=[...new Set([...(p.visitedRooms||[]),j.routeId+':'+j.hotel])];
 const returned=returnTripFunds(p,j),post=publishTrip(p,record,now);
 return {xp,coins,prepared,thrifty,cozy,wish,returned,post,before,after:levelFor(p.xp),totalXP:xp+(j.flightResult?.xp||0),totalCoins:coins+(j.flightResult?.coins||0)};
}
export function restoreJourney(raw){
 if(!raw||raw.version!==1||typeof raw.id!=='string'||!ROUTES.some(r=>r.id===raw.routeId)||!STAGES.includes(raw.stage)||!HOTELS.some(h=>h.id===raw.hotel))return null;
 const j={...raw,life:normalizeTripLife(raw.life),capacity:[7,8,9,10,11].includes(raw.capacity)?raw.capacity:7,purchases:Array.isArray(raw.purchases)?[...new Set(raw.purchases.filter(id=>shopItem(id)))]:[],bag:Array.isArray(raw.bag)?[...new Set(raw.bag.filter(id=>PACKING.some(x=>x.id===id)))]:[],budget:Number.isFinite(raw.budget)?Math.max(0,Math.min(300,raw.budget)):0,minutes:Number.isFinite(raw.minutes)?Math.max(0,raw.minutes):0,comfort:Number.isFinite(raw.comfort)?Math.max(0,Math.min(100,raw.comfort)):35,joy:Number.isFinite(raw.joy)?Math.max(0,Math.min(100,raw.joy)):35,airport:{ticket:raw.airport?.ticket===true,security:raw.airport?.security===true,coffee:raw.airport?.coffee===true,restaurant:raw.airport?.restaurant===true,dutyfree:raw.airport?.dutyfree===true,postcard:raw.airport?.postcard===true},entry:{passed:raw.entry?.passed===true||raw.routeId==='jeju'},memories:Array.isArray(raw.memories)?raw.memories.filter(x=>['airport','hotel','road','city','gift'].includes(x)):[],ride:null};
 if(raw.ride&&['to-airport','to-hotel'].includes(j.stage)&&Number.isFinite(raw.ride.from)&&Number.isFinite(raw.ride.until))j.ride={...raw.ride,next:j.stage==='to-airport'?'airport':'hotel'};
 if(['to-airport','to-hotel'].includes(j.stage)&&!j.ride)j.stage=j.stage==='to-airport'?'airport':'hotel';
 j.craftCount=Number.isFinite(raw.craftCount)?Math.max(0,Math.min(90,Math.floor(raw.craftCount))):0;j.craftNotes=Array.isArray(raw.craftNotes)?raw.craftNotes.filter(x=>x&&typeof x.name==='string'&&typeof x.recipe==='string').slice(-12).map(x=>({guest:[0,1,2].includes(x.guest)?x.guest:0,name:x.name.slice(0,20),recipe:x.recipe.slice(0,20),fresh:x.fresh===true})):[];j.errandActions=Number.isFinite(raw.errandActions)?Math.max(0,Math.min(10,Math.floor(raw.errandActions))):0;j.quietRest=raw.quietRest===true;j.playWalkAction=['pick','hideaway'].includes(raw.playWalkAction)?raw.playWalkAction:null;j.playPending=['cafe','errand'].includes(raw.playPending)?raw.playPending:null;j.craftDraft=raw.craftDraft&&[0,1,2].includes(raw.craftDraft.guest)?{guest:raw.craftDraft.guest,cup:normalizeRecipe(raw.craftDraft.cup)}:null;
 j.experience=normalizeExperience(raw.experience||{visits:raw.discovered,phase:raw.departure==='night'?2:raw.departure==='evening'?1:0,dayTicks:raw.departure==='night'?4:raw.departure==='evening'?2:0},j.routeId,raw.wish);j.discovered=Array.isArray(raw.discovered)?[...new Set(raw.discovered.filter(id=>CITY_DISCOVERIES[j.routeId]&&[...CITY_DISCOVERIES[j.routeId].foods,...CITY_DISCOVERIES[j.routeId].places].some(item=>item.id===id)))]:[];j.animalMet=raw.animalMet===true;j.animalFed=raw.animalFed===true&&j.animalMet;
 j.nights=Number.isInteger(raw.nights)?Math.max(1,Math.min(30,raw.nights)):1;j.hotelLocation=['room','lobby','neighborhood'].includes(raw.hotelLocation)?raw.hotelLocation:'room';j.visitedToday=Array.isArray(raw.visitedToday)?raw.visitedToday.filter(id=>j.discovered.includes(id)):[...j.discovered];j.convenienceToday=Array.isArray(raw.convenienceToday)?raw.convenienceToday.filter(id=>['water','snack','animal-treat'].includes(id)):[];j.walkPosition=raw.walkPosition&&Number.isFinite(raw.walkPosition.x)&&Number.isFinite(raw.walkPosition.y)?{x:Math.max(20,Math.min(340,raw.walkPosition.x)),y:Math.max(42,Math.min(230,raw.walkPosition.y))}:null;j.walkTarget=null;j.walkPath=null;j.friendEvent=friendEventState(raw.friendEvent,j.routeId);j.wish=TRAVEL_WISHES.some(w=>w.id===raw.wish)?raw.wish:null;j.preparedCount=packingGoals(j).filter(Boolean).length;j.roomLayout=restoreRoomLayout(j);if(bagWeight(j)>j.capacity)return null;resumeWalk(j,raw);return j;
}
import {friendEventState} from './local-friends.js?v=6.11.1';
