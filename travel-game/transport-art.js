import {drawTransportSprite,warmTransportSprites,spriteImage} from './transport-sprites.js?v=6.11.1';
import {cityArtReady,drawCityVehicle,cityImage,cityArtSpec} from './city-art.js?v=6.11.1';
import {drawVehicleModel,vehicleSVG,vehicleDesign} from './vehicle-design.js?v=6.11.1';
import {imageReady} from './image-ready.js?v=6.11.1';
const native=id=>['subway','limousine','train'].includes(id),images=new Map();
const boxes={bus:[850,139,656,338],taxi:[1025,626,481,290]};
function legacy(){if(typeof Image==='undefined')return null;if(!images.has('outbound')){const im=new Image();im.src=new URL('./assets/vehicles-v4.png',import.meta.url).href;images.set('outbound',im);}return images.get('outbound');}
export function transportRegion(j){return j.stage==='packing'||j.stage==='to-airport'?'incheon':j.routeId;}
export function modelBox(id){return [0,['train','subway'].includes(id)?80:id==='limousine'?70:72,360,150];}
export function drawTransportVehicle(c,route,id,night=false){
 if(native(id))return drawTransportSprite(c,route,id,night)||drawVehicleModel(c,route,id,night,modelBox(id));
 if(route!=='incheon'){if(drawCityVehicle(c,route,id,night))return true;}
 else {const im=legacy(),box=boxes[id];if(im?.complete&&im.naturalWidth&&box){const width=id==='taxi'?148:228,height=width*box[3]/box[2];c.save();c.imageSmoothingEnabled=false;if(night)c.filter='brightness(.78)';c.drawImage(im,...box,(360-width)/2,218-height,width,height);c.restore();return true;}}
 return drawVehicleModel(c,route,id,night,modelBox(id));
}
export function warmTransport(route='incheon'){
 if(route==='incheon')return Promise.all([warmTransportSprites(),imageReady(legacy())]);
 return Promise.all([warmTransportSprites(),cityArtReady([route],['vehicle'])]);
}
function settled(route,id){if(native(id))return spriteImage(id)?.complete===true;const image=route==='incheon'?legacy():cityImage(cityArtSpec(route,'vehicle',id==='taxi'?2:1));return image?.complete===true;}
export function transportOptionArt(route,id){return `<span class="transport-picture" aria-hidden="true"><canvas width="360" height="210" data-transport-preview="${id}" data-region="${route}"></canvas></span>`;}
export function paintTransportPreviews(){document.querySelectorAll('[data-transport-preview]').forEach(canvas=>{if(canvas.dataset.painted==='true')return;const c=canvas.getContext('2d'),id=canvas.dataset.transportPreview,route=canvas.dataset.region;c.clearRect(0,0,360,210);c.save();c.translate(0,-20);drawTransportVehicle(c,route,id);c.restore();if(settled(route,id))canvas.dataset.painted='true';});}
export {vehicleSVG,vehicleDesign};
