import {ROUTES} from './model.js?v=6.6.0';
import {CITY_DISCOVERIES,DISCOVERY_ITEMS} from './city-discoveries.js?v=6.6.0';
import {COLLECTION_ITEMS} from './shopping.js?v=6.6.0';

// These are fictional, gentle travel episodes, not a real-world itinerary guide.
const rows={
 jeju:['coast','바닷바람 따라 걷기','돌담에 걸린 작은 리본','해안길의 리본이 바람 방향을 알려줘요.','바다를 향해 기록하기','돌담길에서 쉬기','리본이 가리킨 바다','다음 날 돌아오니 바람이 잦아들고 물결이 또렷해졌어요.'],
 tokyo:['lanes','골목에서 찾은 한 장','찻집 주인의 작은 지도','찻집 주인이 조용한 골목과 저녁 산책길을 지도에 표시해 줬어요.','골목의 작은 가게 찾기','저녁 산책길 고르기','골목의 두 번째 인사','다시 들르자 주인이 어제 고른 길은 어땠는지 물어봐요.'],
 taipei:['lanes','등불 아래의 달콤한 밤','차 향기가 나는 쪽지','작은 찻집에 차를 천천히 즐기는 방법이 적혀 있어요.','차 향기 기록하기','등불 길 둘러보기','찻잔 옆의 새 쪽지','다음 날에는 손님들이 남긴 골목 이야기를 읽어봐요.'],
 paris:['plaza','빵 향기와 강변 산책','빵집 앞의 엽서','빵집 창가에서 강변과 광장으로 가는 두 길을 볼 수 있어요.','창가를 사진에 담기','강변에서 쉬기','다시 만난 창가','다음 날 창가 자리에 앉아 어제 남긴 엽서를 다시 펼쳐요.'],
 hawaii:['coast','그늘과 파도를 따라','해변의 작은 그늘','파도를 바라보는 자리와 꽃나무 아래 벤치가 보여요.','파도의 빛 담기','꽃나무 그늘 고르기','해변의 아침 인사','다음 날 잔잔한 파도를 보며 어제의 산책을 떠올려요.'],
 moon:['sky','달빛 발자국 찾기','반짝이는 작은 돌','달의 정원에서 돌과 그림자가 서로 다른 빛을 내요.','반짝임 관찰하기','그림자 옆에서 쉬기','달빛 정원의 답장','다음 날 정원에서 어제의 발자국 옆에 작은 별이 보여요.'],
 bkk:['plaza','물가의 시원한 오후','가게의 부채 한 장','가게 주인이 시원한 물가 자리와 그늘진 골목을 소개해요.','물가 풍경 남기기','그늘진 골목 고르기','다시 펼친 부채','다음 날 부채를 펼치며 골목의 다른 가게를 찾아봐요.'],
 sin:['garden','정원의 작은 산책','정원 안내판의 잎','잎 모양 표식이 물가와 나무 아래 길을 가리켜요.','물가의 정원 담기','나무 아래 걷기','비 뒤의 정원','다음 날 잎에 남은 물방울이 다른 표정을 보여줘요.'],
 dad:['coast','다리와 해변 사이','해변에 남긴 그림','모래에 다리와 바다가 그려져 있어요. 오늘의 산책을 골라봐요.','다리 쪽 빛 담기','해변에 머물기','파도가 지운 그림','다음 날 새 모래 위에 내 산책의 기억을 떠올려요.'],
 dps:['garden','정원에서 쉬는 하루','정원의 꽃 접시','꽃이 놓인 자리와 초록길이 눈에 들어와요.','꽃과 잎 담기','초록길에서 쉬기','정원에 다시 핀 꽃','다음 날 새 꽃이 핀 자리를 찾아 천천히 걸어요.'],
 syd:['coast','항구의 두 산책길','항구의 벤치 지도','벤치 옆 지도에 물가 길과 공원 길이 표시돼 있어요.','항구의 선 담기','공원길 고르기','벤치에서 만난 아침','다음 날 같은 벤치에서 달라진 항구의 빛을 바라봐요.'],
 akl:['garden','초록길과 물가의 하루','풀밭의 작은 표식','풀밭을 지나면 물가와 나무 그늘로 길이 갈라져요.','물가의 반사 담기','나무 그늘 고르기','풀밭의 새 발자국','다음 날 풀밭에서 어제와 다른 작은 흔적을 발견해요.'],
 dxb:['plaza','그늘진 광장의 오후','광장의 물소리','분수 근처와 그늘진 회랑에서 서로 다른 소리가 들려요.','분수의 빛 담기','회랑에서 쉬기','회랑의 아침빛','다음 날 회랑 바닥에 길게 드리운 빛을 따라 걸어요.'],
 ist:['hills','계단과 찻잔의 여행','찻잔 옆의 골목 스케치','찻집 스케치에 계단길과 물가로 가는 길이 있어요.','계단의 풍경 담기','물가에서 쉬기','찻집에서 받은 인사','다시 들른 찻집에서 어제 보았던 풍경을 이야기해요.'],
 fco:['plaza','분수에서 골목까지','광장의 작은 동전 그림','안내판에 광장과 젤라토 가게를 잇는 산책길이 그려져 있어요.','분수의 물결 담기','젤라토 골목 고르기','광장에 돌아온 오후','다음 날 광장의 다른 자리에서 같은 분수를 바라봐요.'],
 bcn:['hills','빛과 모자이크 찾기','벤치의 작은 무늬','벤치의 무늬와 언덕 아래 풍경 중 무엇을 기억할까요?','무늬 자세히 담기','언덕길에서 쉬기','다시 찾은 무늬','다음 날 다른 빛 아래에서 어제의 무늬를 다시 찾아요.'],
 lis:['hills','언덕을 잇는 작은 여행','가게에 놓인 노란 엽서','엽서에는 언덕 위 전망과 낮은 골목이 그려져 있어요.','언덕의 지붕 담기','낮은 골목 고르기','엽서 속 길의 다음 장','다음 날 다른 길로 돌아와 골목의 표정을 더 알아가요.'],
 lhr:['garden','공원에서 보내는 오후','공원 벤치의 책갈피','나무 아래와 물가 근처에 조용한 자리가 있어요.','나뭇잎의 빛 담기','물가에서 책 읽기','책갈피를 다시 펼치며','다음 날 같은 벤치에서 한 페이지를 더 넘겨요.'],
 ams:['canal','다리를 건너는 산책','운하 옆 작은 그림','다리의 그림자와 물에 비친 집들이 나란히 보여요.','물에 비친 집 담기','다리 옆에서 쉬기','운하의 다른 물결','다음 날 다리 반대편에서 달라진 반사를 찾아요.'],
 cph:['canal','항구의 색을 모으기','항구의 색연필 엽서','가게 앞 엽서에 물가의 색과 조용한 뒷길이 그려져 있어요.','물가의 색 담기','뒷길에서 쉬기','엽서에 더한 한 줄','다음 날 어제 본 색 옆에 새 기억을 하나 더 남겨요.'],
 hel:['garden','숲과 따뜻한 한 잔','숲길의 종이 안내','나무 사이 길과 따뜻한 실내 쉼터를 고를 수 있어요.','숲의 빛 담기','쉼터에서 쉬기','숲길을 다시 걸으며','다음 날 나뭇가지 사이로 달라진 빛이 들어와요.'],
 zrh:['canal','호숫가의 느린 하루','호숫가 벤치의 스케치','물의 반사와 작은 골목이 스케치에 담겨 있어요.','호수의 반사 담기','골목에서 쉬기','벤치에서 이어진 기억','다음 날 벤치에 앉아 어제와 오늘의 물빛을 비교해요.'],
 prg:['hills','다리와 지붕의 여행','다리 앞의 작은 지도','다리 위와 지붕이 보이는 언덕으로 길이 이어져요.','지붕의 선 담기','다리에서 쉬기','다시 건넌 다리','다음 날 반대편에서 걸어와 다른 지붕들을 발견해요.'],
 jfk:['plaza','공원과 거리의 한 장','공원의 작은 공연 안내','공원 벤치와 활기찬 거리 사이에서 오늘의 분위기를 골라요.','거리의 순간 담기','공원 벤치 고르기','공원에서 들은 다음 곡','다음 날 벤치에 앉아 어제와 다른 거리의 소리를 들어요.'],
 sfo:['hills','언덕과 항구 사이','언덕의 작은 노선도','언덕 위 전망과 물가 산책길이 한 지도에 보여요.','언덕의 풍경 담기','물가에서 쉬기','언덕 아래의 다음 길','다음 날 내려가는 길에서 어제 못 본 골목을 찾아요.'],
 yvr:['garden','나무 그늘과 바닷바람','공원의 나뭇잎 카드','나뭇잎 카드가 숲길과 물가 길을 소개해요.','숲의 초록 담기','물가에서 쉬기','잎사귀의 두 번째 기억','다음 날 숲길을 걸으며 어제의 카드를 다시 펼쳐요.'],
 mex:['plaza','친구와 광장의 하루','서리라가 남긴 메모','서리라의 메모에 광장 산책과 카페에서 쉬는 약속이 적혀 있어요.','광장의 기억 남기기','카페에서 쉬기','약속의 다음 날','다음 날 어제 고른 길 이야기를 서리라와 나눌 준비를 해요.'],
 lim:['coast','절벽 위 바다 산책','바다를 향한 벤치','벤치에서 바다와 해안 산책길이 한눈에 보여요.','해안의 선 담기','벤치에서 쉬기','다시 앉은 바다 벤치','다음 날 다른 물빛을 보며 어제의 산책을 이어가요.'],
 kef:['coast','차가운 바람과 따뜻한 방','물가의 작은 창','차가운 바깥 풍경과 따뜻한 창가 자리가 대비돼요.','바람 속 풍경 담기','따뜻한 창가 고르기','창가에서 본 새 아침','다음 날 창문을 열고 어제와 다른 하늘을 바라봐요.'],
 stars:['sky','별의 정원을 걷기','별빛 정거장의 쪽지','작은 쪽지가 별의 정원과 고요한 전망을 가리켜요.','별의 빛 담기','고요한 전망 고르기','정거장에 도착한 답장','다음 날 쪽지 옆에서 어제 남긴 빛을 떠올려요.'],
 chengdu:['garden','찻집과 대나무 길','찻집의 대나무 책갈피','책갈피에 대나무 길과 조용한 찻자리 그림이 있어요.','대나무의 빛 담기','찻자리에서 쉬기','책갈피의 다음 장','다음 날 찻집에 들러 어제 걸은 길을 다시 펼쳐요.']
};
export const CITY_EPISODES=Object.fromEntries(Object.entries(rows).map(([id,r])=>[id,{id,terrain:r[0],title:r[1],event:r[2],intro:r[3],choices:[r[4],r[5]],followTitle:r[6],follow:r[7]}]));
export const DAY_PHASES=['낮','저녁','밤'];
export const PHOTO_FRAMES=[{id:'wide',name:'풍경 전체',note:'장소의 분위기를 넓게 담아요.'},{id:'detail',name:'가까운 기억',note:'마음에 든 부분을 가까이 담아요.'}];
const routeOK=id=>ROUTES.some(r=>r.id===id);
const integer=(x,max=999999)=>Number.isFinite(x)?Math.min(max,Math.max(0,Math.floor(x))):0;
export const localItems=id=>{const c=CITY_DISCOVERIES[id];return c?[...c.foods,...c.places]:[];};
export function planFor(route,wish='scenery'){const suffix={scenery:['place-0','place-1'],cozy:['cafe','dessert'],thrifty:['place-0','cafe'],gifts:['meal','place-1']}[wish]||['place-0','place-1'];return suffix.map(s=>route+':'+s);}
export function normalizeExperience(raw,route,wish='scenery'){
 const valid=id=>localItems(route).some(x=>x.id===id);
 const plan=[...new Set((Array.isArray(raw?.plan)?raw.plan:[]).filter(valid))].slice(0,2);
 return {plan:plan.length===2?plan:planFor(route,wish),visits:[...new Set((Array.isArray(raw?.visits)?raw.visits:[]).filter(valid))],ticks:integer(raw?.ticks,10000),dayTicks:integer(raw?.dayTicks,100),phase:integer(raw?.phase,2),choice:[0,1].includes(raw?.choice)?raw.choice:null,followed:raw?.followed===true,photoIds:(Array.isArray(raw?.photoIds)?raw.photoIds:[]).filter(x=>typeof x==='string').slice(0,200),highlights:(Array.isArray(raw?.highlights)?raw.highlights:[]).filter(x=>typeof x==='string').slice(0,3),pageClaimed:raw?.pageClaimed===true};
}
export function experience(j){const phase=j.departure==='night'?2:j.departure==='evening'?1:0;return j.experience||=(normalizeExperience({phase,dayTicks:phase*2},j.routeId,j.wish));}
export function travelState(raw){
 const photos=(Array.isArray(raw?.photos)?raw.photos:[]).filter(x=>x&&routeOK(x.route)&&localItems(x.route).some(i=>i.id===x.place)&&PHOTO_FRAMES.some(f=>f.id===x.frame)&&Number.isFinite(x.date)).slice(-1000).map(x=>({id:`photo:${x.place}:${integer(x.phase,2)}:${x.frame}`,route:x.route,place:x.place,frame:x.frame,phase:integer(x.phase,2),date:integer(x.date,Number.MAX_SAFE_INTEGER)}));
 const events=(Array.isArray(raw?.events)?raw.events:[]).filter(x=>x&&routeOK(x.route)&&[0,1].includes(x.choice)).slice(-100).map(x=>({route:x.route,choice:x.choice,followed:x.followed===true}));
 const owned=id=>photos.some(x=>x.id===id)||COLLECTION_ITEMS.some(x=>x.id===id);
 return {photos,events,unlockFloor:integer(raw?.unlockFloor,31),flightClaims:[...new Set((Array.isArray(raw?.flightClaims)?raw.flightClaims:[]).filter(x=>typeof x==='string'&&routeOK(x.split(':')[0])&&/:(economy|business|first):(day|evening|night)$/.test(x)))].slice(0,300),pages:[...new Set((Array.isArray(raw?.pages)?raw.pages:[]).filter(routeOK))],displays:Array.from({length:3},(_,i)=>{const id=raw?.displays?.[i];return typeof id==='string'&&owned(id)?id:null;})};
}
export function selectPlan(j,id){const e=experience(j);if(!localItems(j.routeId).some(x=>x.id===id))return false;if(e.plan.includes(id))e.plan=e.plan.filter(x=>x!==id);else if(e.plan.length<2)e.plan.push(id);else e.plan=[e.plan[1],id];return true;}
export function advanceDay(j){const e=experience(j);e.ticks++;e.dayTicks++;e.phase=Math.min(2,Math.floor(e.dayTicks/2));j.departure=['day','evening','night'][e.phase];return e.phase;}
export function newDay(j){const e=experience(j);e.dayTicks=0;e.phase=0;j.departure='day';}
export function noteVisit(j,id){const e=experience(j);if(!e.visits.includes(id))e.visits.push(id);advanceDay(j);}
export function episodeReady(j){const e=experience(j);return e.plan.length===2&&e.plan.every(id=>e.visits.includes(id));}
export function chooseEpisode(p,j,choice){
 const e=experience(j);if(!episodeReady(j)||e.choice!==null||![0,1].includes(choice))return false;
 e.choice=choice;j.joy=Math.min(100,j.joy+10);if(choice===1)j.comfort=Math.min(100,j.comfort+12);
 p.travel||=travelState();const seen=p.travel.events.some(x=>x.route===j.routeId&&x.choice===choice);if(!seen){p.travel.events.push({route:j.routeId,choice,followed:false});p.xp+=20;}return true;
}
export function followDestination(j){const e=experience(j);return e.choice===0?e.plan[0]:j.routeId+':cafe';}
export function followEpisode(p,j){const e=experience(j);if(e.choice===null||e.followed||(j.nights||1)<2||!(j.visitedToday||[]).includes(followDestination(j)))return false;e.followed=true;p.travel||=travelState();const old=p.travel.events.find(x=>x.route===j.routeId&&x.choice===e.choice);if(old&&!old.followed){old.followed=true;p.xp+=15;}return true;}
export function takeLocalPhoto(p,j,place,frame,now=Date.now()){
 if(j.completed||j.stage!=='hotel'||!j.checkedIn||!localItems(j.routeId).some(x=>x.id===place)||!PHOTO_FRAMES.some(x=>x.id===frame))return null;
 p.travel||=travelState();const e=experience(j);if(!e.visits.includes(place))return null;const id=`photo:${place}:${e.phase}:${frame}`,old=p.travel.photos.find(x=>x.id===id);let photo=old;
 if(!photo){photo={id,route:j.routeId,place,frame,phase:e.phase,date:now};p.travel.photos.push(photo);p.travel.photos=p.travel.photos.slice(-1000);p.xp+=8;}
 if(!e.photoIds.includes(id))e.photoIds.push(id);return {photo,isNew:!old};
}
export function pageProgress(p,j){const e=experience(j);return [e.plan.length===2&&e.plan.every(id=>e.visits.includes(id)),e.photoIds.some(id=>p.travel?.photos.some(x=>x.id===id&&x.route===j.routeId)),e.choice!==null];}
export function claimPage(p,j){p.travel||=travelState();if(p.travel.pages.includes(j.routeId)||!pageProgress(p,j).every(Boolean))return false;p.travel.pages.push(j.routeId);p.xp+=45;p.coins+=25;experience(j).pageClaimed=true;return true;}
export function recordExperience(j){return {...normalizeExperience(j.experience,j.routeId,j.wish),route:j.routeId};}
export function memoryOptions(record,p){
 const e=normalizeExperience(record?.experience,record?.route,record?.wish),options=[];
 for(const id of record?.discovered||[]){const item=DISCOVERY_ITEMS.find(x=>x.id===id);if(item)options.push({id:'visit:'+id,label:item.name,kind:item.kind});}
 for(const id of e.photoIds){const photo=p.travel?.photos.find(x=>x.id===id);if(photo)options.push({id,label:localItems(photo.route).find(x=>x.id===photo.place).name+' · '+DAY_PHASES[photo.phase]+' 사진',kind:'photo'});}
 if(e.choice!==null)options.push({id:'story:'+record.route,label:CITY_EPISODES[record.route].choices[e.choice],kind:'story'});
 if(record?.animalMet)options.push({id:'animal:'+record.route,label:CITY_DISCOVERIES[record.route].animal.name,kind:'animal'});
 for(const name of Object.values(record?.purchases||{})){const item=COLLECTION_ITEMS.find(x=>x.name===name);if(item)options.push({id:'gift:'+item.id,label:item.name,kind:'gift'});}
 if(!options.length)options.push({id:'rest:'+record.route,label:'숙소에서 보낸 조용한 하루',kind:'rest'});
 return [...new Map(options.map(x=>[x.id,x])).values()];
}
export function automaticHighlights(options){const selected=[],kinds=new Set();for(const x of options){if(kinds.has(x.kind))continue;selected.push(x.id);kinds.add(x.kind);if(selected.length===3)break;}for(const x of options){if(selected.length===3)break;if(!selected.includes(x.id))selected.push(x.id);}return selected;}
export function setHighlights(j,p,ids){const record={route:j.routeId,discovered:j.discovered,purchases:Object.fromEntries((j.purchases||[]).map(id=>[id,COLLECTION_ITEMS.find(x=>x.id===id)?.name])),animalMet:j.animalMet,experience:recordExperience(j)},valid=memoryOptions(record,p).map(x=>x.id);experience(j).highlights=[...new Set(ids.filter(x=>valid.includes(x)))].slice(0,3);return record;}
export function displayMemory(p,id,slot){p.travel||=travelState();if(!Number.isInteger(slot)||slot<0||slot>2)return false;if(id&&!p.travel.photos.some(x=>x.id===id)&&!COLLECTION_ITEMS.some(x=>x.id===id&&p.collection?.[id]))return false;p.travel.displays[slot]=id||null;return true;}
export function unifyWallet(p){
 // One-time 1:1 migration. Reserved journey funds are already outside the wallet.
 if(p.moneyVersion!==1){p.travel||=travelState();p.travel.unlockFloor=Math.min(31,Math.max(3,3+Math.floor(p.flights/0.8),ROUTES.findIndex(r=>r.id===p.route)+1));p.blog.wallet=integer(p.blog.wallet+p.coins);p.moneyVersion=1;}
 Object.defineProperty(p,'coins',{enumerable:true,configurable:true,get(){return p.blog.wallet;},set(value){p.blog.wallet=integer(value);}});return p;
}
