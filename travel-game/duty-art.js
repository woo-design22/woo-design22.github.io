import {drawAtlas} from './generated-art.js?v=6.11.1';
// Individually generated transparent product icons, shared across shop and collection.
export const DUTY_ART_IDS=['magnet-tower','magnet-paris','magnet-windmill','magnet-tram','magnet-panda','magnet-cactus','magnet-shell','magnet-snow','round-glasses','amber-glasses','sage-sunglasses','rose-glasses','milk-chocolate','dark-chocolate','berry-chocolate','city-chocolate','whisky','brandy','rum','gin','perfume','rabbit-keyring','silk-scarf','city-mug'];
export const AIRPORT_ART_IDS=['coffee-latte', 'coffee-matcha', 'coffee-cocoa', 'restaurant-udon', 'restaurant-sandwich', 'restaurant-bibimbap', 'postcard-plane', 'postcard-cloud', 'postcard-stamp', 'facility-coffee', 'facility-restaurant', 'facility-dutyfree', 'facility-postcard'];
export function dutyProductArt(id,size=72){if(!DUTY_ART_IDS.includes(id)&&!AIRPORT_ART_IDS.includes(id))return '';return `<img class="duty-product-icon" data-duty-art="${id}" src="./assets/duty-${id}-v6.2.png" width="${size}" height="${size}" alt="" decoding="async">`;}

export function dutyAsset(id){return DUTY_ART_IDS.includes(id)?{file:`duty-${id}-v6.2.png`,columns:1,rows:1,col:0,row:0,contain:true}:null;}
export function drawDutyProduct(c,id,box){return drawAtlas(c,dutyAsset(id),box);}
