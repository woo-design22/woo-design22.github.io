// Recipes and tray matching are shared by the UI and deterministic game checks.
export const INGREDIENTS=[
 ['beans','원두','coffee'],['milk','우유','coffee'],['matcha','말차','tea'],['water','물','juice'],
 ['dough','반죽','bread'],['berry','딸기','cake'],['butter','버터','bread'],['orange','오렌지','juice'],
 ['sugar','설탕','cake'],['cocoa','초코','coffee'],['greens','채소','tea'],['rice','밥','bread'],
 ['fish','참치','tea'],['lemon','레몬','juice'],['peach','복숭아','juice'],['honey','꿀','cake'],['cheese','치즈','cake']
].map(([id,name,icon])=>({id,name,icon}));
export const RECIPES={
 coffee:['beans','milk'],tea:['matcha','water'],cake:['dough','berry','milk'],bread:['dough','butter'],juice:['orange','water'],
 scone:['dough','butter','milk'],pudding:['milk','sugar'],donut:['dough','cocoa'],sandwich:['dough','greens','cheese'],waffle:['dough','honey'],
 pancake:['dough','berry','honey'],cookie:['dough','butter','sugar'],salad:['greens','orange'],onigiri:['rice','fish'],bento:['rice','fish','greens'],
 sushi:['rice','fish','lemon'],icecream:['milk','sugar','honey'],pretzel:['dough','water'],pizza:['dough','cheese'],chocolate:['cocoa','sugar'],
 peach:['peach','water'],lemon:['lemon','water','matcha'],strawberry:['berry','milk'],milk:['milk','honey']
};
const signature=a=>[...a].sort().join('|');
export function combineIngredients(bowl,menu){return menu.find(id=>signature(RECIPES[id]||[])===signature(bowl))||null;}
export function allocateTray(tray,order){const available=[...tray],indexes=[];for(const id of order){const at=available.indexOf(id);if(at<0)return null;indexes.push(at);available[at]=null;}return indexes;}
export function removeOrder(tray,order){const indexes=allocateTray(tray,order);if(!indexes)return null;return tray.filter((_,i)=>!indexes.includes(i));}
export function kitchenIngredients(menu){const needed=new Set(menu.flatMap(id=>RECIPES[id]||[]));return INGREDIENTS.filter(i=>needed.has(i.id));}
