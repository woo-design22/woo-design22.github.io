import {newDay} from './travel-experience.js?v=6.7.0';
import {resetWalk} from './city-streets.js?v=6.7.0';
export const CONVENIENCE_ITEMS=[
 {id:'water',name:'생수',cost:2,comfort:6,joy:2,art:'convenience-water'},
 {id:'snack',name:'작은 간식',cost:3,comfort:4,joy:8,art:'meal-cookie'},
 {id:'animal-treat',name:'동물 간식',cost:4,comfort:0,joy:3,art:'convenience-animal-treat'}
];
export function extendStay(j,cost){
 if(!j||j.stage!=='hotel'||!j.checkedIn||j.completed)return {ok:false,message:'객실에 체크인한 뒤 더 묵을 수 있어요.'};
 if((j.nights||1)>=30)return {ok:false,message:'이번 숙소에서는 30박까지 머무를 수 있어요.'};
 if(!Number.isFinite(cost)||cost<1||j.budget<cost)return {ok:false,message:'하루 더 묵을 경비가 부족해요.'};
 newDay(j);resetWalk(j);j.budget-=cost;j.nights=(j.nights||1)+1;j.hotelTask='sleep';j.hotelLocation='room';j.departure='day';j.visitedToday=[];j.convenienceToday=[];j.comfort=Math.min(100,j.comfort+25);j.joy=Math.min(100,j.joy+8);
 return {ok:true,message:'푹 자고 일어났어요. 여행 '+j.nights+'일째, 새로운 하루예요.'};
}
export function conveniencePurchase(j,id,weight=0){
 const item=CONVENIENCE_ITEMS.find(x=>x.id===id);
 if(!item||!j||j.stage!=='hotel'||!j.checkedIn||j.completed)return {ok:false,message:'숙소에 도착하면 편의점에 들를 수 있어요.'};
 if(j.convenienceToday?.includes(id))return {ok:false,message:'오늘은 이미 샀어요. 내일 다시 들러요.'};
 if(j.budget<item.cost)return {ok:false,message:'남은 경비가 부족해요.'};
 if(id==='animal-treat'&&j.bag.includes(id))return {ok:false,message:'동물 간식은 이미 챙겼어요.'};
 if(id==='animal-treat'&&weight+1>(j.capacity||7))return {ok:false,message:'가방에 여유가 없어요.'};
 j.budget-=item.cost;j.comfort=Math.min(100,j.comfort+item.comfort);j.joy=Math.min(100,j.joy+item.joy);j.convenienceToday=[...(j.convenienceToday||[]),id];if(id==='animal-treat')j.bag.push(id);
 return {ok:true,item,message:item.name+' 구매 완료.'};
}
