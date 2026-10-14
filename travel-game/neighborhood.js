import {drawNeighborhoodPicture} from './neighborhood-art.js?v=6.5.0';
import {CITY_DISCOVERIES} from './city-discoveries.js?v=6.5.0';
import {localFlavor} from './local-flavors.js?v=6.5.0';
import {drawAtlas,discoveryAsset} from './generated-art.js?v=6.5.0';
import {drawTraveler} from './avatar-art.js?v=6.5.0';
import {currentLook,STYLES} from './wardrobe-model.js?v=6.5.0';
import {eyewearBox} from './avatar-anchors.js?v=6.5.0';
import {drawItemArt} from './item-art.js?v=6.5.0';
export function neighborhoodPlaces(route){const city=CITY_DISCOVERIES[route];if(!city)return [];return [
 {id:'hotel',name:'숙소',x:180,y:225,kind:'hotel'},
 {id:'convenience',name:'편의점',x:307,y:216,kind:'shop'},
 {...city.foods[0],x:55,y:147},{...city.foods[2],x:298,y:143},{...city.foods[1],x:57,y:79},
 {...city.places[0],x:137,y:69},{...city.places[1],x:244,y:69}
];}
export function walkToPlace(j,id){const spot=neighborhoodPlaces(j.routeId).find(x=>x.id===id);if(!spot||j.stage!=='hotel'||!j.checkedIn)return false;j.walkPosition||={x:180,y:225};j.walkPath=[{x:180,y:j.walkPosition.y},{x:180,y:spot.y},{x:spot.x,y:spot.y}];j.walkTarget={x:spot.x,y:spot.y,id};return true;}
export function walkToPoint(j,x,y){if(!Number.isFinite(x)||!Number.isFinite(y))return;const spot=neighborhoodPlaces(j.routeId).find(s=>Math.hypot(s.x-x,s.y-y)<28);j.walkPath=null;j.walkTarget=spot?{x:spot.x,y:spot.y,id:spot.id}:{x:Math.max(20,Math.min(340,x)),y:Math.max(42,Math.min(230,y)),id:null};}
export function stepWalk(j,dt){
 if(j?.hotelLocation!=='neighborhood'||!j.walkTarget)return null;j.walkPosition||={x:180,y:225};
 const waypoint=j.walkPath?.[0]||j.walkTarget,dx=waypoint.x-j.walkPosition.x,dy=waypoint.y-j.walkPosition.y,d=Math.hypot(dx,dy),speed=Math.min(.2,Math.max(0,dt))*80;
 if(d<=speed){j.walkPosition={x:waypoint.x,y:waypoint.y};if(j.walkPath?.length){j.walkPath.shift();if(j.walkPath.length)return null;}const id=j.walkTarget.id;j.walkTarget=null;j.walkPath=null;return id;}
 if(d){j.walkPosition.x+=dx/d*speed;j.walkPosition.y+=dy/d*speed;}return null;
}
const fill=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};
export function drawNeighborhood(c,j,p,t){
 const theme=localFlavor(j.routeId),night=j.departure==='night',painted=drawNeighborhoodPicture(c,j);if(!painted)fill(c,0,0,360,240,night?'#263d44':'#dfe7d0');if(painted&&night&&!['moon','stars'].includes(j.routeId)){c.fillStyle='#20394d35';c.fillRect(0,0,360,240);}if(!painted){
 // Generated landmarks retain the destination's actual scenery; paths connect all doors.
 for(const place of neighborhoodPlaces(j.routeId)){
  const x=place.x,y=place.y;fill(c,Math.min(180,x)-9,y-4,Math.abs(x-180)+18,12,'#c9c1a9');fill(c,171,Math.min(195,y),18,Math.abs(195-y)+6,'#c9c1a9');
 }
 for(let y=60;y<235;y+=18)for(let x=12;x<352;x+=23)if((x+y)%3===0)fill(c,x,y,2,2,night?'#4d6261':'#bfcdb0');
 for(const place of neighborhoodPlaces(j.routeId)){
  const x=place.x,y=place.y;
  if(place.id.includes(':place-')){drawAtlas(c,{...discoveryAsset(place.id),cover:true},[x-31,y-36,62,47]);fill(c,x-31,y+11,62,2,'#82947b');}
  else {const color=place.id==='hotel'?'#d5c4a5':place.id==='convenience'?'#c1d2b5':place.kind==='cafe'?'#cdbda3':'#d4c8b5';fill(c,x-25,y-41,50,34,color);fill(c,x-29,y-46,58,7,place.id==='convenience'?'#799b70':'#a59783');fill(c,x-7,y-20,14,15,night?'#f3dba5':'#839d91');fill(c,x-20,y-33,10,11,night?'#ead7a5':'#b5d9d0');if(place.id.includes(':'))drawAtlas(c,discoveryAsset(place.id),[x+6,y-35,18,18]);}
  c.fillStyle=night?'#fff2d4':'#526448';c.font='8px Neo, sans-serif';c.textAlign='center';c.fillText(place.name,x,y+21,76);
 }
 }
 if(painted){for(const spot of neighborhoodPlaces(j.routeId)){fill(c,spot.x-3,spot.y-2,6,4,'#fff2ce');fill(c,spot.x-2,spot.y-1,4,2,'#67865e');}}
 const position=j.walkPosition||{x:180,y:225},look=currentLook(p);fill(c,position.x-10,position.y+4,20,3,'#6d806540');
 drawTraveler(c,p.avatar, j.walkTarget?Math.floor(t*6)%2:0,STYLES.find(s=>s.id===look.style)?.color,true,[Math.round(position.x-25),Math.round(position.y-44),50,50],look.style,look.hat);
 if(look.glasses)drawItemArt(c,look.glasses,eyewearBox(p.avatar,j.walkTarget?Math.floor(t*6)%2:0,true,look.glasses,[Math.round(position.x-25),Math.round(position.y-44),50,50]));
 c.textAlign='left';
}
