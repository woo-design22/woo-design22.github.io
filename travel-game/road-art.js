import {localFlavor} from './local-flavors.js?v=6.5.0';
import {aerialPictures} from './aerial-atlas.js?v=6.5.0';
import {drawCityVehicle,cityArtSource} from './city-art.js?v=6.5.0';
const art={};
for(const id of ['day','night','vehicles'])if(typeof Image!=='undefined'){art[id]=new Image();art[id].src=new URL(id==='vehicles'?'./assets/vehicles-v4.png':`./assets/road-${id}-v4.png`,import.meta.url).href;}
const vehicleBoxes={train:[34,142,773,331],subway:[34,142,773,331],bus:[850,139,656,338],limousine:[27,556,944,365],taxi:[1025,626,481,290]};
export function roadTheme(route,outgoing){if(outgoing)return 0;if(['hawaii','jeju','dps','dad','syd','akl','moon','sin'].includes(route))return 1;if(['hel','kef','stars'].includes(route))return 5;if(['zrh','yvr','mex','taipei'].includes(route))return 3;if(route==='dxb')return 4;return 2;}
export function drawRoad(c,j,t){
 if(j.stage==='to-hotel'){const slot=j.ride?.id==='taxi'?2:['train','subway'].includes(j.ride?.id)?0:1;if(!cityArtSource(j.routeId,'vehicle',slot)){c.fillStyle='#e4e7dd';c.fillRect(0,0,360,240);return true;}}
 const day=art.day,vehicle=art.vehicles;if(!day?.complete||!day.naturalWidth||!vehicle?.complete||!vehicle.naturalWidth){c.fillStyle='#e4e7dd';c.fillRect(0,0,360,240);return true;}
 const night=j.departure==='night',dusk=j.departure==='sunset'||j.departure==='evening',painting=night&&art.night?.complete&&art.night.naturalWidth?art.night:day;
 const cell=roadTheme(j.routeId,j.stage==='to-airport'),pw=painting.naturalWidth/2,ph=painting.naturalHeight/3;
 const progress=j.ride?Math.max(0,Math.min(1,(Date.now()-j.ride.from)/(j.ride.until-j.ride.from))):(t%90)/90;
 // Only crop across the same cell. There is no wrap seam during a six-second ride.
 c.drawImage(painting,(cell%2)*pw+pw*(.08+progress*.18),Math.floor(cell/2)*ph,pw*.7,ph,0,0,360,240);
 if(j.stage==='to-hotel'){const a=aerialPictures(j.routeId),bg=night?a.night:a.day;if(bg?.complete&&bg.naturalWidth){const sw=bg.naturalWidth/(a.single?1:2),sh=bg.naturalHeight/(a.single?1:3);c.drawImage(bg,(a.cell%2)*sw+sw*(.04+progress*.1),Math.floor(a.cell/2)*sh+sh*.35,sw*.84,sh*.60,0,0,360,188);c.fillStyle=night?'#4e5955':'#abb5a3';c.fillRect(0,188,360,52);c.fillStyle='#e2dfca';for(let k=0;k<8;k++)c.fillRect((k*58-progress*80+420)%420-30,226,30,2);}}
 if(dusk){c.save();c.fillStyle='#bd8b731f';c.fillRect(0,0,360,240);c.restore();}
 const id=j.ride?.id||'bus',box=vehicleBoxes[id]||vehicleBoxes.bus,width=id==='taxi'?133:228,height=width*box[3]/box[2];
 if(['train','subway'].includes(id)){
  if(id==='subway'){c.fillStyle='#68776e';c.fillRect(0,0,360,240);c.fillStyle='#8d998a';c.fillRect(0,38,360,128);for(let n=0;n<8;n++){const x=(n*70-t*35+700)%560-100;c.fillStyle='#64796f';c.fillRect(x,18,9,180);c.fillStyle='#e6e5cd';c.fillRect(x+12,31,35,4);}c.fillStyle='#465b53';c.fillRect(0,166,360,74);}
  else {c.fillStyle=night?'#56645e':'#8e9987';c.fillRect(0,188,360,52);}
  c.fillStyle='#6c776b';for(let n=0;n<20;n++)c.fillRect((n*24-t*28+800)%480-70,213,8,24);c.fillStyle='#bdc5b5';c.fillRect(0,217,360,3);c.fillRect(0,231,360,3);
 }
 const original=j.stage==='to-hotel'&&drawCityVehicle(c,j.routeId,id,night);
 if(!original&&j.stage!=='to-hotel'){c.save();if(night)c.filter='brightness(.78)';c.drawImage(vehicle,...box,Math.round(180-width/2),Math.round(215-height),width,Math.round(height));c.restore();}
 if(['train','subway'].includes(id)){c.fillStyle=night?'#74868a':'#9ca7a4';c.fillRect(0,218,360,2);c.fillRect(0,227,360,2);}
 return true;
}
