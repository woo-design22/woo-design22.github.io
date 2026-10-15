import {shopItem} from './shopping.js?v=6.10.0';
export const TRAVEL_WISHES=[
 {id:'scenery',name:'풍경을 남기는 여행',icon:'camera',description:'공항 전망 · 창가 사진 · 명소 산책',goals:['공항 전망대에서 엽서 남기기','비행 중 사진 한 장 찍기','도시 산책에서 명소 둘러보기']},
 {id:'cozy',name:'푹 쉬는 여행',icon:'rest',description:'잠옷 · 편안한 비행 · 포근한 방',goals:['집에서 잠옷 챙기기','비행 편안함 80 채우기','숙소에서 포근하게 쉬기']},
 {id:'thrifty',name:'가볍게 다녀오는 여행',icon:'coin',description:'필요한 짐 · 경비 40 · 숙소 도착',goals:['여행지에 맞는 준비물 두 가지','숙소에서 경비 40 이상 남기기','객실에서 오늘의 여행 마치기']},
 {id:'gifts',name:'선물을 담는 여행',icon:'gift',description:'두 물건 · 다른 종류 · 숙소에서 쉬기',goals:['면세점에서 물건 두 개 고르기','서로 다른 종류 두 가지 고르기','선물을 챙겨 숙소에서 쉬기']}
];
export function wishProgress(j,flight){
 const wish=TRAVEL_WISHES.find(w=>w.id===j?.wish);if(!wish)return null;const f=flight||j.flightMoments||{};let done;
 if(wish.id==='scenery')done=[j.memories?.includes('airport')===true,f.photoGoal===true,(j.discovered||[]).some(id=>id.includes(':place-'))||Object.keys(j.roomLayout||{}).length>=Math.min(3,(j.bag?.length||0)+(j.purchases?.length||0))&&Object.keys(j.roomLayout||{}).length>0];
 if(wish.id==='cozy')done=[j.bag?.includes('pajamas')===true,f.comfort>=80,['sleep','unpack'].includes(j.hotelTask)];
 if(wish.id==='thrifty')done=[j.preparedCount===2,j.stage==='hotel'&&j.checkedIn&&j.budget>=40,!!j.hotelTask];
 if(wish.id==='gifts')done=[(j.purchases?.length||0)>=2,new Set((j.purchases||[]).map(id=>shopItem(id)?.category).filter(Boolean)).size>=2,j.checkedIn===true&&!!j.hotelTask&&!!j.purchases?.length||(j.purchases||[]).some(id=>j.roomLayout?.[id])];
 const count=done.filter(Boolean).length;return {wish,done,count,complete:count===3,xp:count*10+(count===3?20:0),coins:count*5+(count===3?10:0)};
}
