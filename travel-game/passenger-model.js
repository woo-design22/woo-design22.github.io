import {wanderState} from './wander-model.js?v=6.12.0';
import {playState} from './travel-play.js?v=6.12.0';
import {COLLECTION_ITEMS} from './shopping.js?v=6.12.0';
import {lifeState} from './travel-life.js?v=6.12.0';
import {travelState,normalizeExperience,planFor} from './travel-experience.js?v=6.12.0';
import {STYLES,wardrobeState} from './wardrobe-model.js?v=6.12.0';
import {ROUTES,levelFor,threshold} from './model.js?v=6.12.0';
import {flightAtmosphere} from './scenery.js?v=6.12.0';
import {restoreJourney} from './journey-model.js?v=6.12.0';
import {shoppingState} from './shopping.js?v=6.12.0';
import {discoveryState,animalState} from './city-discoveries.js?v=6.12.0';
import {blogState} from './travel-blog.js?v=6.12.0';
import {residenceState} from './home-model.js?v=6.12.0';
export {ROUTES,levelFor,threshold};
export const CLASSES=[{id:'economy',name:'이코노미',level:1,start:9,end:25},{id:'business',name:'비즈니스',level:1,start:4,end:8},{id:'first',name:'퍼스트',level:1,start:1,end:3}];
export const TIMES=[{id:'day',name:'낮 비행',value:.08},{id:'evening',name:'노을 비행',value:.38},{id:'night',name:'밤 비행',value:.70}];
export {STYLES} from './wardrobe-model.js?v=6.12.0';
export const GEAR=[{id:'pillow',name:'구름 목베개',level:2,cost:160,description:'휴식 한 번에 편안함 +35 (기본 +25)'},{id:'camera',name:'작은 필름 카메라',level:3,cost:220,description:'비행마다 사진 5장 (기본 3장)'},{id:'journal',name:'자동 여행수첩',level:4,cost:280,description:'사진을 못 찍었다면 도착 풍경을 자동 수집 · 기념품 +1'},{id:'headphones',name:'음악 헤드폰',level:5,cost:320,description:'독서 한 번에 즐거움 +30 (기본 +20)'}];
export const MAINS=[{id:'rice',name:'따뜻한 덮밥',icon:'bento',tags:['warm','savory']},{id:'sandwich',name:'채소 샌드위치',icon:'bread',tags:['fresh','savory']},{id:'pancake',name:'꿀 팬케이크',icon:'cake',tags:['warm','sweet']},{id:'salad',name:'과일 샐러드',icon:'juice',tags:['fresh','sweet']}];
export const DRINKS=[{id:'tea',name:'따뜻한 차',icon:'tea',tags:['warm','light']},{id:'latte',name:'우유 라테',icon:'coffee',tags:['warm','rich']},{id:'juice',name:'오렌지 주스',icon:'juice',tags:['fresh','light']},{id:'cocoa',name:'초콜릿 우유',icon:'coffee',tags:['sweet','rich']}];
export const DESSERTS=[{id:'cake',name:'딸기 케이크',icon:'cake',tags:['sweet','rich']},{id:'bread',name:'버터 크루아상',icon:'bread',tags:['savory','rich']},{id:'fruit',name:'작은 과일 접시',icon:'juice',tags:['fresh','light']},{id:'cookie',name:'초콜릿 쿠키',icon:'cake',tags:['sweet','warm']}];
export const TAGS={warm:'따뜻하게',fresh:'산뜻하게',sweet:'달콤하게',savory:'든든하게',light:'가볍게',rich:'부드럽게'};
const n=v=>Number.isFinite(v)?Math.max(0,Math.floor(v)):0;
export function profile(raw,legacy){
 const p={version:2,name:'하늘 여행자',xp:0,coins:0,flights:0,avatar:7,style:'sage',gear:[],stamps:{},photos:[],souvenirs:{},history:[],claimed:[],route:'jeju',seat:'9A',cabin:'economy',departure:'day',duration:180,active:null,journey:null,journeys:0,stays:[],visitedRooms:[],journeyClaimed:[],lodging:'guesthouse',tripWish:'scenery',discoveries:{},animals:{},collection:{},equipped:{}};
 p.explore=wanderState(raw?.explore);p.play=playState(raw?.play);p.life=lifeState(raw?.life);p.travel=travelState(raw?.travel);p.moneyVersion=raw?.moneyVersion===1?1:0;p.travelPlans=Object.fromEntries(ROUTES.filter(r=>Array.isArray(raw?.travelPlans?.[r.id])).map(r=>[r.id,normalizeExperience({plan:raw.travelPlans[r.id]},r.id).plan]));
 p.looks={7:{style:'sage',hat:null,glasses:null}};p.friends=friendBookState(raw?.friends);p.residence=residenceState(raw?.residence);p.blog=blogState(raw?.blog);p.startGiftVersion=1;if(raw?.version===2&&raw.startGiftVersion!==1&&Number.isFinite(raw.blog?.wallet))p.blog.wallet=Math.min(999999,p.blog.wallet+850);p.audio={enabled:raw?.audio?.enabled!==false,volume:[.25,.5,.75].includes(raw?.audio?.volume)?raw.audio.volume:.5};
 if(!raw&&legacy){p.xp=n(legacy.xp);p.coins=n(legacy.coins);if(legacy.name&&legacy.name!=='하늘 바리스타')p.name=String(legacy.name).slice(0,18);return p;}
 if(!raw||raw.version!==2)return p;
 for(const k of ['xp','coins','flights'])p[k]=n(raw[k]);
 if(typeof raw.name==='string')p.name=raw.name.slice(0,18)||p.name;
 const level=levelFor(p.xp);
 p.avatar=Number.isInteger(raw.avatar)&&raw.avatar>=0&&raw.avatar<12&&(raw.avatar===7||raw.avatar<Math.min(12,level+2))?raw.avatar:7;
 p.style=STYLES.some(s=>s.id===raw.style&&s.level<=level)?raw.style:'sage';
 p.gear=GEAR.filter(g=>raw.gear?.includes?.(g.id)&&g.level<=level).map(g=>g.id);
 p.route=ROUTES.some(r=>r.id===raw.route)?raw.route:'jeju';
 p.cabin=CLASSES.some(c=>c.id===raw.cabin&&c.level<=level)?raw.cabin:'economy';
 p.seat=validSeat(raw.seat,p.cabin)?raw.seat:`${CLASSES.find(c=>c.id===p.cabin).start}A`;
 p.departure=TIMES.some(t=>t.id===raw.departure)?raw.departure:'day';p.duration=[90,180,360,900].includes(raw.duration)?raw.duration:180;
 for(const r of ROUTES){if(n(raw.stamps?.[r.id]))p.stamps[r.id]=n(raw.stamps[r.id]);if(n(raw.souvenirs?.[r.id]))p.souvenirs[r.id]=n(raw.souvenirs[r.id]);}
 p.photos=Array.isArray(raw.photos)?raw.photos.filter(x=>x&&ROUTES.some(r=>r.id===x.route)&&['낮','저녁','밤'].includes(x.phase)).slice(-300).map(x=>({route:x.route,phase:x.phase,duration:[90,180,360,900].includes(x.duration)?x.duration:180,time:Math.min(900,n(x.time)),departure:Number.isFinite(x.departure)?Math.max(0,Math.min(.9,x.departure)):.08,weather:['맑음','구름 많음','가벼운 비'].includes(x.weather)?x.weather:'맑음',date:n(x.date)})):[];
 p.history=Array.isArray(raw.history)?raw.history.slice(0,20).filter(x=>x&&ROUTES.some(r=>r.id===x.route)&&validSeat(x.seat,x.cabin)).map(x=>({route:x.route,seat:x.seat,cabin:x.cabin,date:n(x.date),goals:Math.min(3,n(x.goals))})):[];
 p.claimed=Array.isArray(raw.claimed)?raw.claimed.filter(v=>typeof v==='string').slice(-150):[];
 p.active=restoreFlight(raw.active,p);if(p.active&&p.claimed.includes(p.active.id))p.active=null;
 Object.assign(p,shoppingState(raw));
 p.journey=restoreJourney(raw.journey);p.journeys=n(raw.journeys);
 p.tripWish=['scenery','cozy','thrifty','gifts'].includes(raw.tripWish)?raw.tripWish:'scenery';
 p.lodging=['guesthouse','boutique','resort'].includes(raw.lodging)?raw.lodging:'guesthouse';
 p.journeyClaimed=Array.isArray(raw.journeyClaimed)?raw.journeyClaimed.filter(x=>typeof x==='string').slice(-150):[];
 p.stays=Array.isArray(raw.stays)?raw.stays.filter(x=>x&&ROUTES.some(r=>r.id===x.route)&&['guesthouse','boutique','resort'].includes(x.hotel)).slice(0,40).map(x=>({...x,experience:normalizeExperience(x.experience,x.route,x.wish),budget:n(x.budget),date:n(x.date),prepared:Math.min(2,n(x.prepared)),memories:Array.isArray(x.memories)?x.memories.filter(v=>['airport','hotel','road','city','gift'].includes(v)):[]})):[];
 p.visitedRooms=[...new Set([...(Array.isArray(raw.visitedRooms)?raw.visitedRooms:[]),...p.stays.map(s=>s.route+':'+s.hotel)].filter(key=>typeof key==='string'&&ROUTES.some(r=>r.id===key.split(':')[0])&&['guesthouse','boutique','resort'].includes(key.split(':')[1])&&key.split(':').length===2))];
 p.discoveries=discoveryState(raw.discoveries);p.animals=animalState(raw.animals);if(p.journey)p.journey.knownFriend=!!p.animals[p.journey.routeId+':animal'];
 p.travel.displays=p.travel.displays.map(id=>p.travel.photos.some(x=>x.id===id)||p.collection[id]?id:null);
 for(const stay of p.stays){for(const item of COLLECTION_ITEMS.filter(x=>p.collection[x.id]&&Object.values(stay.purchases||{}).includes(x.name))){p.travel.origins[item.id]||={route:item.region||stay.route,date:stay.date};}}
 wardrobeState(p,raw);
 if(p.journey&&(p.journey.completed||p.journeyClaimed.includes(p.journey.id)))p.journey=null;
 return p;
}
export function validSeat(seat,cabin){const m=/^(\d{1,2})([ABCD])$/.exec(seat||'');const c=CLASSES.find(c=>c.id===cabin);return !!(m&&c&&+m[1]>=c.start&&+m[1]<=c.end);}
export function routeOpen(p,id){return ROUTES.some(r=>r.id===id);}
export function wishes(route){const i=Math.max(0,ROUTES.findIndex(r=>r.id===route));return [['warm','sweet'],['fresh','light'],['savory','rich'],['sweet','light'],['fresh','savory']][i%5];}
export function mealScore(route,choices){const foods=[MAINS.find(x=>x.id===choices[0]),DRINKS.find(x=>x.id===choices[1]),DESSERTS.find(x=>x.id===choices[2])];if(!foods.some(Boolean))return 0;return wishes(route).filter(tag=>foods.some(x=>x?.tags.includes(tag))).length;}
export function newFlight(p,now=Date.now()){
 if(!routeOpen(p,p.route)||!validSeat(p.seat,p.cabin))return null;
 return {id:`${now}-${Math.random().toString(36).slice(2,8)}`,routeId:p.route,duration:p.duration,departure:TIMES.find(t=>t.id===p.departure).value,seat:p.seat,cabin:p.cabin,startedAt:now,elapsed:0,comfort:35,joy:35,meal:null,mealMatch:0,shots:0,photoGoal:false,activity:null,completed:false};
}
export function restoreFlight(raw,p){
 if(!raw||typeof raw.id!=='string'||!ROUTES.some(r=>r.id===raw.routeId)||![90,180,360,900].includes(raw.duration)||!validSeat(raw.seat,raw.cabin)||!Number.isFinite(raw.startedAt)||CLASSES.find(c=>c.id===raw.cabin).level>levelFor(p.xp))return null;
 return {...raw,experiences:restoreExperiences(raw.experiences,raw.cabin),elapsed:Math.min(raw.duration,n(raw.elapsed)),comfort:Math.min(100,n(raw.comfort)),joy:Math.min(100,n(raw.joy)),shots:Math.min(6,n(raw.shots)),mealMatch:Math.min(2,n(raw.mealMatch)),departure:Number.isFinite(raw.departure)?Math.max(0,Math.min(.9,raw.departure)):.08,activity:raw.activity&&['rest','read'].includes(raw.activity.kind)&&Number.isFinite(raw.activity.end)?{kind:raw.activity.kind,end:Math.max(0,Math.min(raw.duration+10,raw.activity.end))}:null,completed:false};
}
export function goals(f){return [f.photoGoal===true,f.mealMatch===2,f.comfort>=70&&f.joy>=60];}
export function filmLimit(p,f){return (p.gear.includes('camera')?5:3)+(f?.packedCamera?1:0);}
export function restFlight(p,f){
 if(!f||f.completed||f.activity||f.elapsed>=f.duration)return null;
 const skipped=Math.min(10,f.duration-f.elapsed);
 f.elapsed+=skipped;f.startedAt-=skipped*1000;
 f.comfort=Math.min(100,f.comfort+(p.gear.includes('pillow')?35:25));
 return {skipped};
}
export function takePhoto(p,f,atmosphere,now=Date.now()){
 if(f.completed||f.shots>=filmLimit(p,f))return null;
 f.shots++;const exists=p.photos.some(x=>x.route===f.routeId&&x.phase===atmosphere.phase);
 const photo={route:f.routeId,phase:atmosphere.phase,time:Math.floor(f.elapsed),duration:f.duration,departure:f.departure,weather:atmosphere.weather,date:now};
 if(!exists)p.photos.push(photo);
 // A scenic photo is the first personal goal. Different light earns new album entries.
 f.photoGoal=true;f.joy=Math.min(100,f.joy+10);return {photo,isNew:!exists};
}
export function finish(p,f,now=Date.now()){
 if(f.completed||p.claimed.includes(f.id)||f.elapsed<f.duration)return null;
 if(p.gear.includes('journal')&&!f.photoGoal)takePhoto(p,f,flightAtmosphere({route:{id:f.routeId,duration:f.duration,stage:0},time:f.elapsed,departure:f.departure}),now);
 const before=levelFor(p.xp),count=goals(f).filter(Boolean).length;
 const flightKey=f.routeId+':'+f.cabin+':'+(f.departure<.3?'day':f.departure<.65?'evening':'night'),repeat=p.moneyVersion===1&&p.travel.flightClaims.includes(flightKey);
 const xp=p.moneyVersion===1?0:repeat?30+count*10:90+count*50,coins=p.moneyVersion===1?0:repeat?15+count*5:60+count*30,souvenirs=1+(count===3?1:0)+(p.gear.includes('journal')?1:0);
 if(p.moneyVersion===1&&!repeat)p.travel.flightClaims.push(flightKey);
 p.xp+=xp;p.coins+=coins;p.flights++;p.stamps[f.routeId]=(p.stamps[f.routeId]||0)+1;p.souvenirs[f.routeId]=(p.souvenirs[f.routeId]||0)+souvenirs;
 p.claimed.push(f.id);p.claimed=p.claimed.slice(-150);f.completed=true;p.active=null;
 p.history.unshift({route:f.routeId,seat:f.seat,cabin:f.cabin,date:now,goals:count});p.history=p.history.slice(0,20);
 return {xp,coins,souvenirs,count,before,after:levelFor(p.xp)};
}
import {friendBookState} from './local-friends.js?v=6.12.0';

import {restoreExperiences} from './cabin-experiences.js?v=6.12.0';
