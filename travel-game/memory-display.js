import {drawSnapshot} from './life-art.js?v=6.12.0';
import {drawAtlas,discoveryAsset} from './generated-art.js?v=6.12.0';
import {drawItemArt} from './item-art.js?v=6.12.0';
import {memoryOrigin,earnedDecor} from './travel-connections.js?v=6.12.0';
import {drawDutyProduct} from './duty-art.js?v=6.12.0';
const rect=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
export function memoryHotspots(p){const count={photo:0,magnet:0,souvenir:0};return (p.travel?.displays||[]).filter(Boolean).map(id=>{const o=memoryOrigin(p,id),i=count[o.kind]++,box=o.kind==='photo'?[9,38+i*28,43,27]:o.kind==='magnet'?[10+i*14,126,13,16]:[291+i*15,95,14,22];return {id,kind:o.kind,box};});}
export function drawMemoryDisplay(c,p){
 c.imageSmoothingEnabled=false;
 const spots=memoryHotspots(p),has=k=>spots.some(x=>x.kind===k),rewards=earnedDecor(p);
 if(has('magnet')){rect(c,7,118,48,32,'#81957c');rect(c,9,120,44,28,'#cdd7bd');rect(c,12,122,38,1,'#f2f2d8');}
 if(has('souvenir')){rect(c,284,116,63,5,'#8d7758');rect(c,288,121,4,9,'#a18b65');rect(c,338,121,4,9,'#a18b65');}
 for(const {id,kind,box} of spots){const [x,y,w,h]=box,photo=p.travel?.photos?.find(x=>x.id===id);if(kind==='photo'){rect(c,x,y,w,h,rewards.some(x=>x.id==='city-page')?'#c3a16c':'#977b5e');rect(c,x+2,y+2,w-4,h-4,'#faf5e5');if(photo.capture)drawSnapshot(c,photo,[x+4,y+4,w-8,h-8]);else drawAtlas(c,{...discoveryAsset(photo.place),cover:true},[x+4,y+4,w-8,h-8]);}else if(kind==='magnet'){rect(c,x-1,y-1,w+2,h+2,'#697d68');if(!drawDutyProduct(c,id,[x,y,w,h])){const origin=memoryOrigin(p,id);drawAtlas(c,{...discoveryAsset((origin.route==='incheon'?'jeju':origin.route)+':place-0'),cover:true},[x,y,w,h]);rect(c,x+2,y+h-3,w-4,2,'#f4d08d');}}else drawItemArt(c,id,box);}
 if(Object.values(p.life?.cities||{}).some(x=>x.recipe)){rect(c,79,155,25,17,'#73896f');rect(c,81,153,10,16,'#f4e9cb');rect(c,92,153,10,16,'#ede2bf');rect(c,91,153,1,17,'#aa9774');for(let i=0;i<3;i++){rect(c,83,157+i*3,6,1,'#9ca984');rect(c,94,157+i*3,6,1,'#9ca984');}}
 if(rewards.some(x=>x.id==='sea-gallery')){rect(c,285,133,21,4,'#b9a07c');for(let i=0;i<5;i++)rect(c,289+i*3,128-Math.abs(2-i),3,7,'#efe0bb');}
 if(rewards.some(x=>x.id==='connected-friend')){for(const x of [300,319]){rect(c,x,68,11,11,'#e9dfc1');rect(c,x+10,71,4,5,'#b2a17d');rect(c,x-2,79,17,2,'#c4ac82');}rect(c,294,82,45,4,'#8d7758');rect(c,300,86,3,7,'#a88d67');rect(c,330,86,3,7,'#a88d67');}
}
