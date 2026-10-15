import {ROUTES} from './model.js?v=6.10.1';
import {CITY_DISCOVERIES} from './city-discoveries.js?v=6.10.1';
import {airportRegion,atLocalAirport} from './airport-context.js?v=6.10.1';
export const SHOP_CATEGORIES=[{id:'magnet',name:'마그넷'},{id:'glasses',name:'안경'},{id:'chocolate',name:'초콜릿'},{id:'liquor',name:'양주'},{id:'gift',name:'작은 선물'}];
export const DUTY_ITEMS=[
 {id:'magnet-tower',category:'magnet',name:'도쿄 타워 마그넷',cost:20,minutes:8,joy:12,color:'#d6c3a0'},
 {id:'magnet-paris',category:'magnet',name:'파리 에펠탑 마그넷',cost:24,minutes:8,joy:15,color:'#d6c3a0'},
 {id:'magnet-windmill',category:'magnet',name:'튤립 풍차 마그넷',cost:30,minutes:8,joy:18,color:'#d6c3a0'},
 {id:'magnet-tram',category:'magnet',name:'리스본 트램 마그넷',cost:34,minutes:8,joy:22,color:'#d6c3a0'},
 {id:'magnet-panda',category:'magnet',name:'대나무 판다 마그넷',cost:18,minutes:8,joy:14,color:'#d6c3a0'},
 {id:'magnet-cactus',category:'magnet',name:'멕시코 선인장 마그넷',cost:22,minutes:8,joy:17,color:'#d6c3a0'},
 {id:'magnet-shell',category:'magnet',name:'바다 조개 마그넷',cost:16,minutes:8,joy:12,color:'#d6c3a0'},
 {id:'magnet-snow',category:'magnet',name:'알프스 산장 마그넷',cost:28,minutes:8,joy:20,color:'#d6c3a0'},
 {id:'round-glasses',category:'glasses',name:'동그란 안경',cost:18,minutes:6,joy:12,comfort:5,color:'#827963'},
 {id:'amber-glasses',category:'glasses',name:'호박빛 안경',cost:24,minutes:6,joy:16,comfort:5,color:'#b28b58'},
 {id:'sage-sunglasses',category:'glasses',name:'세이지 선글라스',cost:26,minutes:6,joy:18,comfort:5,color:'#6d8a77'},
 {id:'rose-glasses',category:'glasses',name:'로즈빛 안경',cost:22,minutes:6,joy:15,comfort:5,color:'#ad7e88'},
 {id:'milk-chocolate',category:'chocolate',name:'밀크 초콜릿',cost:10,minutes:4,joy:10,comfort:5,color:'#ac9375'},
 {id:'dark-chocolate',category:'chocolate',name:'다크 초콜릿',cost:12,minutes:4,joy:12,comfort:5,color:'#7d776c'},
 {id:'berry-chocolate',category:'chocolate',name:'딸기 초콜릿',cost:14,minutes:4,joy:15,comfort:5,color:'#b18e96'},
 {id:'city-chocolate',category:'chocolate',name:'도시 초콜릿 선물함',cost:22,minutes:5,joy:24,comfort:5,color:'#b5a37d'},
 {id:'whisky',category:'liquor',name:'앰버 위스키',cost:28,minutes:7,joy:20,color:'#b29a61'},
 {id:'brandy',category:'liquor',name:'오크 브랜디',cost:32,minutes:7,joy:23,color:'#a58c67'},
 {id:'rum',category:'liquor',name:'섬의 골든 럼',cost:26,minutes:7,joy:18,color:'#acb38a'},
 {id:'gin',category:'liquor',name:'보태니컬 진',cost:30,minutes:7,joy:22,color:'#8fa995'},
 {id:'perfume',category:'gift',name:'작은 여행 향수',cost:24,minutes:6,joy:25,color:'#b1a6b9'},
 {id:'rabbit-keyring',category:'gift',name:'토끼 키링',cost:12,minutes:4,joy:12,color:'#c6b9aa'},
 {id:'silk-scarf',category:'gift',name:'바람빛 스카프',cost:18,minutes:5,joy:18,color:'#a4b4a0'},
 {id:'city-mug',category:'gift',name:'도시 도트 머그',cost:16,minutes:5,joy:16,color:'#abb8ba'}
];
const originalRegions={'magnet-tower':'tokyo','magnet-paris':'paris','magnet-windmill':'ams','magnet-tram':'lis','magnet-panda':'chengdu','magnet-cactus':'mex','magnet-shell':'hawaii','magnet-snow':'zrh'};
for(const item of DUTY_ITEMS)if(item.category==='magnet')item.region=originalRegions[item.id];
for(const route of ROUTES)if(!DUTY_ITEMS.some(x=>x.category==='magnet'&&x.region===route.id))DUTY_ITEMS.push({id:'magnet-'+route.id,category:'magnet',region:route.id,name:route.name+' · '+CITY_DISCOVERIES[route.id].places[0].name+' 마그넷',cost:18,minutes:8,joy:14,color:'#d6c3a0'});
DUTY_ITEMS.push({id:'magnet-incheon',category:'magnet',region:'incheon',name:'인천 공항 관제탑 마그넷',cost:20,minutes:8,joy:12,color:'#d6c3a0'});
export function shopInventory(j){const region=airportRegion(j);return region?DUTY_ITEMS.filter(x=>x.category!=='magnet'||x.region===region):[];}
// Previously purchased bags remain usable; they are no longer for sale.
export const LEGACY_BAGS=[
 {id:'canvas-bag',category:'bag',name:'구름 캔버스백',cost:20,minutes:8,joy:12,capacity:8,color:'#cabd98'},
 {id:'cross-bag',category:'bag',name:'작은 크로스백',cost:24,minutes:8,joy:15,capacity:8,color:'#af9284'},
 {id:'sage-backpack',category:'bag',name:'세이지 배낭',cost:30,minutes:8,joy:18,capacity:9,color:'#839d7c'},
 {id:'night-bag',category:'bag',name:'밤빛 여행 가방',cost:34,minutes:8,joy:22,capacity:9,color:'#73869f'},
 {id:'cream-case',category:'case',name:'크림 미니 캐리어',cost:32,minutes:12,joy:18,capacity:9,color:'#c7b99a'},
 {id:'mint-case',category:'case',name:'민트 캐리어',cost:38,minutes:12,joy:22,capacity:10,color:'#84aaa1'},
 {id:'rose-case',category:'case',name:'로즈 캐리어',cost:42,minutes:12,joy:25,capacity:10,color:'#b99498'},
 {id:'moon-case',category:'case',name:'달빛 큰 캐리어',cost:48,minutes:12,joy:30,capacity:11,color:'#9b9bb6'},
];
export const COLLECTION_ITEMS=[...DUTY_ITEMS,...LEGACY_BAGS];
export function shopItem(id){return COLLECTION_ITEMS.find(x=>x.id===id);}
export function shopIcon(item){return {magnet:'gift',glasses:'glasses',bag:'bag',case:'suitcase',chocolate:'chocolate',liquor:'bottle',gift:'gift'}[item.category];}
export function shoppingState(raw){const collection={};for(const item of COLLECTION_ITEMS)if(Number.isFinite(raw?.collection?.[item.id])&&raw.collection[item.id]>0)collection[item.id]=Math.min(999,Math.floor(raw.collection[item.id]));const equipped={};for(const kind of ['glasses','bag','case']){const item=shopItem(raw?.equipped?.[kind]);if(item?.category===kind&&collection[item.id])equipped[kind]=item.id;}return {collection,equipped};}
export function suitcaseCapacity(p){return Math.max(7,...['bag','case'].map(kind=>p.collection?.[p.equipped?.[kind]]?shopItem(p.equipped[kind])?.capacity||7:7));}
export function equipPurchase(p,id){const item=shopItem(id);if(!item||!['glasses','bag','case'].includes(item.category)||!p.collection?.[id])return false;p.equipped||={};if(p.equipped[item.category]===id)delete p.equipped[item.category];else p.equipped[item.category]=id;return true;}
export function canPurchase(j,id){const item=DUTY_ITEMS.find(x=>x.id===id);if(!item||!(j?.stage==='airport'&&j.airport?.security||atLocalAirport(j)))return {ok:false,message:'출국 수속을 마치거나 현지에서 짐을 찾으면 쇼핑할 수 있어요.'};if(!shopInventory(j).some(x=>x.id===id))return {ok:false,message:'이 마그넷은 해당 지역 공항에서만 살 수 있어요.'};if(j.purchases?.includes(id))return {ok:false,message:'이번 여행에서 이미 고른 물건이에요.'};if(j.budget-item.cost<10)return {ok:false,message:'숙소로 가는 경비 10은 남겨두어야 해요.'};if(j.stage==='airport'&&j.minutes+item.minutes>85)return {ok:false,message:'살펴볼 시간이 부족해요. 게이트로 가요.'};return {ok:true};}
export function purchase(p,j,id){const result=canPurchase(j,id);if(!result.ok)return result;const item=shopItem(id);j.budget-=item.cost;j.minutes+=item.minutes;j.joy=Math.min(100,j.joy+item.joy);j.comfort=Math.min(100,j.comfort+(item.comfort||0));j.airport.dutyfree=true;j.purchases=[...(j.purchases||[]),id];if(!j.memories.includes('gift'))j.memories.push('gift');p.collection||={};p.collection[id]=Math.min(999,(p.collection[id]||0)+1);if(p.travel){p.travel.origins||={};p.travel.origins[id]||={route:j.stage==='airport'?'incheon':j.routeId,date:Date.now()};}return {ok:true,message:item.name+' · 나의 여행가방에 보관했어요.'};}
