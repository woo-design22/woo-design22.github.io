import {airportRegion} from './airport-context.js?v=6.11.0';
import {aerialPictures,aerialReady} from './aerial-atlas.js?v=6.11.0';
export function observatoryContext(j,view){const region=airportRegion(j);return region?{region,local:region!=='incheon',view:region==='incheon'?'terminal':view==='terminal'?'terminal':'regional',night:j.departure==='night'}:null;}
export function localObservatoryReady(region){return aerialReady([region]);}
export function drawLocalObservatory(canvas,region,night=false,t=0){
 const a=aerialPictures(region),image=night?a.night:a.day;if(!image?.complete||!image.naturalWidth)return false;const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,sw=image.naturalWidth/(a.single?1:2),sh=image.naturalHeight/(a.single?1:3),sx=a.single?0:(a.cell%2)*sw,sy=a.single?0:Math.floor(a.cell/2)*sh;
 c.save();c.imageSmoothingEnabled=false;c.fillStyle='#f1ead6';c.fillRect(0,0,w,h);c.beginPath();c.rect(12,12,w-24,h-38);c.clip();const drift=Math.sin(t*.055)*sw*.012;c.drawImage(image,sx+sw*.025+drift,sy+sh*.025,sw*.95,sh*.95,12,12,w-24,h-38);c.restore();c.fillStyle='#b7c6ad';c.fillRect(10,h-29,w-20,5);c.fillStyle='#d5dfc9';c.fillRect(10,h-24,w-20,12);return true;
}
