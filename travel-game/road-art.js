import {drawRailBackground} from './rail-art.js?v=6.12.0';
import {aerialPictures} from './aerial-atlas.js?v=6.12.0';
import {drawTransportVehicle,transportRegion,warmTransport} from './transport-art.js?v=6.12.0';
import {imageReady} from './image-ready.js?v=6.12.0';
const art={};
function roadImage(id){if(typeof Image==='undefined')return null;if(!art[id]){const image=new Image();image.src=new URL(`./assets/road-${id}-v4.png`,import.meta.url).href;art[id]=image;}return art[id];}
export function warmRoad(j){const region=transportRegion(j),night=j.departure==='night',tasks=[imageReady(roadImage(night?'night':'day')),warmTransport(region)];if(region!=='incheon'){const sky=aerialPictures(region);tasks.push(imageReady(night?sky.night:sky.day));}return Promise.all(tasks);}
export function roadTheme(route,outgoing){if(outgoing)return 0;if(['hawaii','jeju','dps','dad','syd','akl','moon','sin'].includes(route))return 1;if(['hel','kef','stars'].includes(route))return 5;if(['zrh','yvr','mex','taipei'].includes(route))return 3;if(route==='dxb')return 4;return 2;}
function immediateBackground(c,j,t,night){c.fillStyle=night?'#3d5b65':'#bfd6cc';c.fillRect(0,0,360,240);c.fillStyle=night?'#536e6c':'#9fb6a6';for(let k=0;k<9;k++){const x=((k*53-t*8)%440+440)%440-45;c.fillRect(x,88+(k%3)*11,31,100);c.fillStyle=night?'#bead7e':'#cedaca';for(let n=0;n<3;n++)c.fillRect(x+5,102+(k%3)*11+n*14,5,7);c.fillStyle=night?'#536e6c':'#9fb6a6';}c.fillStyle=night?'#53625b':'#acb7a1';c.fillRect(0,184,360,56);c.fillStyle='#e2dfca';for(let k=0;k<8;k++)c.fillRect(((k*58-t*20)%440+440)%440-40,228,30,2);}
export function drawRoad(c,j,t){
 const id=j.ride?.id||'bus',rail=['train','subway'].includes(id),night=j.departure==='night',dusk=['sunset','evening'].includes(j.departure),region=transportRegion(j),painting=roadImage(night?'night':'day');
 immediateBackground(c,j,t,night);
 const progress=j.ride?Math.max(0,Math.min(1,(Date.now()-j.ride.from)/(j.ride.until-j.ride.from))):(t%90)/90;
 if(painting?.complete&&painting.naturalWidth){const cell=roadTheme(j.routeId,region==='incheon'),pw=painting.naturalWidth/2,ph=painting.naturalHeight/3;c.drawImage(painting,(cell%2)*pw+pw*(.08+progress*.18),Math.floor(cell/2)*ph,pw*.7,ph,0,0,360,240);}
 if(region!=='incheon'){const a=aerialPictures(j.routeId),bg=night?a.night:a.day;if(bg?.complete&&bg.naturalWidth){const sw=bg.naturalWidth/(a.single?1:2),sh=bg.naturalHeight/(a.single?1:3);c.drawImage(bg,(a.cell%2)*sw+sw*(.04+progress*.1),Math.floor(a.cell/2)*sh+sh*.35,sw*.84,sh*.60,0,0,360,188);c.fillStyle=night?'#4e5955':'#abb5a3';c.fillRect(0,188,360,52);c.fillStyle='#e2dfca';for(let k=0;k<8;k++)c.fillRect((k*58-progress*80+420)%420-30,226,30,2);}}
 if(dusk){c.save();c.fillStyle='#bd8b731f';c.fillRect(0,0,360,240);c.restore();}
 if(rail)drawRailBackground(c,id,t,night);
 drawTransportVehicle(c,region,id,night);
 return true;
}
