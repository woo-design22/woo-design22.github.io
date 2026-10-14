import {memoryOptions,normalizeExperience,CITY_EPISODES,automaticHighlights} from './travel-experience.js?v=6.7.0';
import {ROUTES} from './model.js?v=6.7.0';
import {CITY_DISCOVERIES,DISCOVERY_ITEMS} from './city-discoveries.js?v=6.7.0';
import {COLLECTION_ITEMS,shopItem} from './shopping.js?v=6.7.0';
import {cityGuide} from './city-guide.js?v=6.7.0';
const cap=n=>Number.isFinite(n)?Math.max(0,Math.min(999999,Math.floor(n))):0;
const knownRoute=id=>ROUTES.some(r=>r.id===id);
export const STARTER_FUNDS=1000;
const MIN_TRIP_FUNDS=150;
export function blogState(raw,now=Date.now()){
 if(!raw)return {wallet:STARTER_FUNDS,earned:0,advance:0,posts:[],published:[],lastSettlement:now};
 const posts=Array.isArray(raw.posts)?raw.posts.filter(x=>x&&typeof x.id==='string'&&knownRoute(x.route)&&Number.isFinite(x.date)).slice(0,200).map(x=>({id:x.id.slice(0,120),highlights:(Array.isArray(x.highlights)?x.highlights:[]).filter(v=>typeof v==='string').slice(0,3),experience:x.experience?normalizeExperience(x.experience,x.route):null,route:x.route,date:capDate(x.date),income:cap(x.income),repayment:Math.min(cap(x.income),cap(x.repayment)),paid:Math.max(0,cap(x.income)-cap(x.repayment)),views:cap(x.views),likes:cap(x.likes),items:[...new Set((Array.isArray(x.items)?x.items:[]).filter(id=>DISCOVERY_ITEMS.some(i=>i.id===id&&id.startsWith(x.route+':'))))],gifts:[...new Set((Array.isArray(x.gifts)?x.gifts:[]).filter(id=>COLLECTION_ITEMS.some(i=>i.id===id)))],animal:x.animal===true,bond:x.bond===true&&x.animal===true,photos:Math.min(6,cap(x.photos)),firstCity:x.firstCity===true,friend:x.route==='mex'&&x.friend==='seorira'?'seorira':null,friendTopics:x.route==='mex'&&x.friend==='seorira'&&Array.isArray(x.friendTopics)?[...new Set(x.friendTopics.filter(id=>['work','restaurant','walk'].includes(id)))]:[]})):[];
 return {wallet:cap(raw.wallet),earned:cap(raw.earned),advance:cap(raw.advance),posts,published:[...new Set([...(Array.isArray(raw.published)?raw.published:[]).filter(id=>typeof id==='string'&&id.length<=120),...posts.map(x=>x.id)])].slice(-1000),lastSettlement:Number.isFinite(raw.lastSettlement)?Math.max(0,raw.lastSettlement):now};
}
function capDate(n){return Number.isFinite(n)?Math.max(0,Math.floor(n)):0;}
export function tripFunds(p){return Math.min(300,Math.max(MIN_TRIP_FUNDS,p.blog?.wallet??STARTER_FUNDS));}
export function fundJourney(p,j){
 p.blog||=blogState();if(!j||j.funded)return false;
 const funds=j.fundTotal||150,advance=Math.max(0,funds-p.blog.wallet);
 p.blog.advance=cap(p.blog.advance+advance);p.blog.wallet=Math.max(0,p.blog.wallet-funds);j.adAdvance=advance;j.funded=true;return true;
}
export function returnTripFunds(p,j){
 if(!j?.funded||j.fundsReturned)return 0;p.blog||=blogState();
 const amount=cap(j.budget);p.blog.wallet=cap(p.blog.wallet+amount);j.fundsReturned=true;return amount;
}
export function publishTrip(p,record,now=Date.now()){
 p.blog||=blogState(null,now);
 if(!record||!knownRoute(record.route)||!p.stays?.some(s=>s.id===record.id)||p.blog.published.includes(record.id))return null;
 const city=CITY_DISCOVERIES[record.route],items=[...new Set((record.discovered||[]).filter(id=>[...city.foods,...city.places].some(i=>i.id===id)))];
 const gifts=[...new Set(Object.values(record.purchases||{}).map(name=>COLLECTION_ITEMS.find(i=>i.name===name)?.id).filter(Boolean))];
 const firstCity=!p.blog.posts.some(post=>post.route===record.route);
 const photos=Math.min(6,p.photos.filter(photo=>photo.route===record.route&&photo.date>=(record.startedAt||record.date-3600000)&&photo.date<=record.date).length);
 const animal=record.animalMet===true,bond=animal&&record.animalFed===true;
 const variety=new Set(items.map(id=>DISCOVERY_ITEMS.find(i=>i.id===id)?.kind)).size+(gifts.length?1:0)+(animal?1:0);
 const friendEvent=friendEventState(record.friendEvent,record.route),friend=friendEvent?.met?'seorira':null;
 let income=150+items.length*18+gifts.length*12+photos*8+(animal?35:0)+(bond?20:0)+variety*8+(firstCity&&record.route!=='jeju'?35:0)+(friend?30+friendEvent.topics.length*5:0);
 const experience=record.experience?normalizeExperience(record.experience,record.route,record.wish):null;let highlights=[];if(experience&&p.moneyVersion===1){const options=memoryOptions(record,p);highlights=experience.highlights.filter(id=>options.some(x=>x.id===id));if(!highlights.length)highlights=automaticHighlights(options);const kinds=new Set(highlights.map(id=>options.find(x=>x.id===id).kind));const oldItems=new Set(p.blog.posts.filter(x=>x.route===record.route).flatMap(x=>x.items));const newItems=items.filter(id=>!oldItems.has(id)).length;income=140+(firstCity?35:0)+Math.min(3,kinds.size)*12+Math.min(5,newItems)*6+(experience.choice!==null?20:0)+(experience.followed?15:0)+(animal?15:0)+(bond?10:0)+(friend?20:0);}
 const views=income*9+items.length*37+(animal?210:0);
 const post={highlights,experience,id:record.id,route:record.route,date:now,income,views,likes:Math.floor(views*.06),items,gifts,photos,animal,bond,firstCity,friend,friendTopics:friend?friendEvent.topics:[]};
 const repayment=Math.min(p.blog.advance||0,income);p.blog.advance-=repayment;post.repayment=repayment;post.paid=income-repayment;
 p.blog.wallet=cap(p.blog.wallet+post.paid);p.blog.earned=cap(p.blog.earned+income);p.blog.posts=[post,...p.blog.posts].slice(0,200);p.blog.published=[...p.blog.published,record.id].slice(-1000);return post;
}
// A little ongoing readership, capped at eight hours, paid once per interval.
export function settleBlog(p,now=Date.now()){
 p.blog||=blogState(null,now);const b=p.blog;if(now<b.lastSettlement)return 0;
 const hours=Math.floor(Math.min(8*3600000,now-b.lastSettlement)/3600000);
 if(!hours)return 0;b.lastSettlement=now;
 const amount=hours*Math.min(20,b.posts.length);b.wallet=cap(b.wallet+amount);b.earned=cap(b.earned+amount);return amount;
}
export function postStory(post){
 const city=CITY_DISCOVERIES[post.route],guide=cityGuide(post.route),route=ROUTES.find(r=>r.id===post.route);
 const selected=new Set(post.highlights||[]),recorded=selected.size?post.items.filter(id=>selected.has('visit:'+id)):post.items;const foods=recorded.map(id=>DISCOVERY_ITEMS.find(i=>i.id===id)).filter(i=>i&&i.kind!=='place').map(i=>i.name),places=recorded.map(id=>DISCOVERY_ITEMS.find(i=>i.id===id)).filter(i=>i?.kind==='place').map(i=>i.name);
 const options=memoryOptions({route:post.route,discovered:post.items,animalMet:post.animal,experience:post.experience,purchases:Object.fromEntries(post.gifts.map(id=>[id,shopItem(id).name]))},{travel:{photos:[]}});
 const lines=[`${route.name}에서 작은 하루를 보냈어요. ${guide.note}`];
 if(post.experience?.choice!==null&&post.experience&&(!selected.size||selected.has('story:'+post.route))){const ep=CITY_EPISODES[post.route];lines.push(ep.choices[post.experience.choice]+'의 기억을 남겼어요.');if(post.experience.followed)lines.push(ep.follow);}
 if(selected.size)lines.push('오늘 골라 남긴 기억: '+[...selected].map(id=>options.find(x=>x.id===id)?.label||(id.startsWith('photo:')?'현지에서 찍은 사진':'여행의 작은 순간')).join(' · '));
 if(foods.length)lines.push(`${foods.join(' · ')}의 맛을 여행수첩에 담았어요.`);
 if(places.length)lines.push(`${places.join(' · ')}에서 잠깐 멈춰 풍경을 바라봤어요.`);
 if(post.animal&&(!selected.size||selected.has('animal:'+post.route)))lines.push(`${city.animal.name}도 만났어요.${post.bond?' 챙겨 온 간식을 나누며 조금 가까워졌어요.':''}`);
 if(post.route==='mex'&&post.friend==='seorira'){lines.push('멕시코에서 일하는 한국인 친구 서리라를 만났어요.');if(post.friendTopics?.includes('restaurant'))lines.push('서리라의 남편이 운영하는 한식당에서 따뜻한 집밥을 함께 먹었어요.');if(post.friendTopics?.includes('work'))lines.push('퇴근 후 카페에서 멕시코 직장 생활 이야기를 들었어요.');if(post.friendTopics?.includes('walk'))lines.push('서리라와 동네 골목을 걸으며 다음 만남을 약속했어요.');}
 const shownGifts=selected.size?post.gifts.filter(id=>selected.has('gift:'+id)):post.gifts;if(shownGifts.length)lines.push(`집에 가져갈 작은 선물도 골랐어요. ${shownGifts.map(id=>shopItem(id).name).join(' · ')}.`);
 if(post.photos)lines.push(`창밖 사진 ${post.photos}장도 함께 남겼어요.`);
 return {title:`${route.name}, ${post.animal?'작은 친구를 만난 날':foods.length?'맛있는 기억 한 줌':'잠시 쉬어 간 하루'}`,lines};
}
import {friendEventState} from './local-friends.js?v=6.7.0';
