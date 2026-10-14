const ids=['rice','sandwich','pancake','salad','tea','latte','juice','cocoa','cake','bread','fruit','cookie'];
export const MEAL_PICTURES=Object.fromEntries(ids.map(id=>['meal-'+id,'meal-'+id+'-v6.4.png']));
export function mealArt(id,size=48){const file=MEAL_PICTURES[id];return file?`<img class="item-art meal-picture" data-item-art="${id}" src="${new URL('./assets/'+file,import.meta.url).href}" width="${size}" height="${size}" alt="" aria-hidden="true" decoding="async">`:null;}
const pictures=new Map();
export function drawMealArt(c,id,box){
 const file=MEAL_PICTURES[id];if(!file||typeof Image==='undefined')return false;
 let image=pictures.get(file);if(!image){image=new Image();image.src=new URL('./assets/'+file,import.meta.url).href;pictures.set(file,image);}
 if(!image.complete||!image.naturalWidth)return false;
 const [x,y,w,h]=box,scale=Math.min(w/image.naturalWidth,h/image.naturalHeight),dw=image.naturalWidth*scale,dh=image.naturalHeight*scale;
 c.save();c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh);c.restore();return true;
}
