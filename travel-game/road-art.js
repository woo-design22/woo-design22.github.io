import {drawAirportRailVehicle,drawRailBackground} from './rail-art.js?v=6.6.0';
import {aerialPictures} from './aerial-atlas.js?v=6.6.0';
import {drawCityVehicle,cityArtSource} from './city-art.js?v=6.6.0';
const art={};
for(const id of ['day','night','vehicles'])if(typeof Image!=='undefined'){art[id]=new Image();art[id].src=new URL(id==='vehicles'?'./assets/vehicles-v4.png':`./assets/road-${id}-v4.png`,import.meta.url).href;}
const vehicleBoxes={bus:[850,139,656,338],limousine:[27,556,944,365],taxi:[1025,626,481,290]};
export function roadTheme(route,outgoing){if(outgoing)return 0;if(['hawaii','jeju','dps','dad','syd','akl','moon','sin'].includes(route))return 1;if(['hel','kef','stars'].includes(route))return 5;if(['zrh','yvr','mex','taipei'].includes(route))return 3;if(route==='dxb')return 4;return 2;}
export function drawRoad(c,j,t){
 const rail=['train','subway'].includes(j.ride?.id);
 if(j.stage==='to-hotel'&&!rail){const slot=j.ride?.id==='taxi'?2:['train','subway'].includes(j.ride?.id)?0:1;if(!cityArtSource(j.routeId,'vehicle',slot)){c.fillStyle='#e4e7dd';c.fillRect(0,0,360,240);return true;}}
 const day=art.day,vehicle=art.vehicles;if(!rail&&(!day?.complete||!day.naturalWidth||!vehicle?.complete||!vehicle.naturalWidth)){c.fillStyle='#e4e7dd';c.fillRect(0,0,360,240);return true;}
 const night=j.departure==='night',dusk=j.departure==='sunset'||j.departure==='evening',painting=night&&art.night?.complete&&art.night.naturalWidth?art.night:day;
 const cell=roadTheme(j.routeId,j.stage==='to-airport'),pw=(painting?.naturalWidth||0)/2,ph=(painting?.naturalHeight||0)/3;
 const progress=j.ride?Math.max(0,Math.min(1,(Date.now()-j.ride.from)/(j.ride.until-j.ride.from))):(t%90)/90;
 // Only crop across the same cell. There is no wrap seam during a six-second ride.
 c.fillStyle=night?'#3d5b65':'#bfd6cc';c.fillRect(0,0,360,240);
 if(painting?.complete&&painting.naturalWidth)c.drawImage(painting,(cell%2)*pw+pw*(.08+progress*.18),Math.floor(cell/2)*ph,pw*.7,ph,0,0,360,240);
 if(j.stage==='to-hotel'){const a=aerialPictures(j.routeId),bg=night?a.night:a.day;if(bg?.complete&&bg.naturalWidth){const sw=bg.naturalWidth/(a.single?1:2),sh=bg.naturalHeight/(a.single?1:3);c.drawImage(bg,(a.cell%2)*sw+sw*(.04+progress*.1),Math.floor(a.cell/2)*sh+sh*.35,sw*.84,sh*.60,0,0,360,188);c.fillStyle=night?'#4e5955':'#abb5a3';c.fillRect(0,188,360,52);c.fillStyle='#e2dfca';for(let k=0;k<8;k++)c.fillRect((k*58-progress*80+420)%420-30,226,30,2);}}
 if(dusk){c.save();c.fillStyle='#bd8b731f';c.fillRect(0,0,360,240);c.restore();}
 const id=j.ride?.id||'bus',box=vehicleBoxes[id]||vehicleBoxes.bus,width=id==='taxi'?133:228,height=width*box[3]/box[2];
 if(rail){drawRailBackground(c,id,t,night);if(j.stage==='to-hotel')drawCityVehicle(c,j.routeId,id,night);else drawAirportRailVehicle(c,id,night);return true;}
 const original=j.stage==='to-hotel'&&drawCityVehicle(c,j.routeId,id,night);
 if(!original&&j.stage!=='to-hotel'){c.save();if(night)c.filter='brightness(.78)';c.drawImage(vehicle,...box,Math.round(180-width/2),Math.round(215-height),width,Math.round(height));c.restore();}
 return true;
}
