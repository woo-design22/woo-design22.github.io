import {shopItem} from './shopping.js?v=6.6.0';
export const ROOM_SPOTS=[
 {id:'desk',name:'창가 책상',icon:'coffee',capacity:4,hint:'여권·휴대폰·카메라·충전기'},
 {id:'bed',name:'포근한 침대',icon:'rest',capacity:3,hint:'잠옷·책·스카프'},
 {id:'shelf',name:'작은 선반',icon:'book',capacity:5,hint:'책·안경·여권·여행 선물'},
 {id:'hanger',name:'옷걸이',icon:'bow',capacity:3,hint:'코트·잠옷·스카프·가방'},
 {id:'entry',name:'문 옆 자리',icon:'suitcase',capacity:3,hint:'샌들·우산·가방·캐리어'}
];
const packed={passport:['desk','shelf'],phone:['desk'],charger:['desk'],camera:['desk','shelf'],book:['desk','bed','shelf'],pajamas:['bed','hanger'],coat:['hanger'],scarf:['bed','hanger'],umbrella:['entry'],sandals:['entry'],sunglasses:['desk','shelf'],snack:['desk','shelf'],'animal-treat':['desk','shelf']};
export function roomItems(j){return [...new Set([...(j.bag||[]),...(j.purchases||[])])].filter(id=>packed[id]||shopItem(id));}
export function suitableSpots(id){
 if(packed[id])return packed[id];const item=shopItem(id);if(!item)return [];
 if(item.category==='case')return ['entry'];if(item.category==='bag')return ['hanger','entry'];
 if(item.category==='glasses')return ['desk','shelf'];return ['shelf','desk'];
}
export function roomProgress(j){const ids=roomItems(j),layout=j.roomLayout||{},placed=ids.filter(id=>suitableSpots(id).includes(layout[id])).length;return {placed,target:Math.min(3,ids.length),total:ids.length,complete:placed>=Math.min(3,ids.length)&&ids.length>0};}
export function placeInRoom(j,id,spot){
 if(j.stage!=='hotel'||!j.checkedIn||j.completed)return {ok:false,message:'객실에 도착하면 짐을 풀 수 있어요.'};
 if(!roomItems(j).includes(id))return {ok:false,message:'이번 여행에 챙긴 물건을 골라주세요.'};
 if(!suitableSpots(id).includes(spot))return {ok:false,message:'여기보다 어울리는 자리가 있어요. 자리 설명을 살펴봐요.'};
 const place=ROOM_SPOTS.find(x=>x.id===spot),layout=j.roomLayout||{};
 if(Object.entries(layout).filter(([key,value])=>key!==id&&value===spot).length>=place.capacity)return {ok:false,message:'이 자리는 가득 찼어요. 다른 자리를 골라봐요.'};
 j.roomLayout={...layout,[id]:spot};return {ok:true,message:'물건을 제자리에 놓았어요.'};
}
export function restoreRoomLayout(j){
 const layout={};for(const [id,spot] of Object.entries(j.roomLayout||{})){
  const place=ROOM_SPOTS.find(x=>x.id===spot);if(!place||!roomItems(j).includes(id)||!suitableSpots(id).includes(spot)||Object.values(layout).filter(x=>x===spot).length>=place.capacity)continue;layout[id]=spot;
 }return layout;
}
