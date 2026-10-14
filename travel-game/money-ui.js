export const MONEY_ICON='./assets/travel-money-v6.7.png';
export function moneyIcon(size=22){return `<img class="money-icon" src="${MONEY_ICON}" width="${size}" height="${size}" alt="" aria-hidden="true">`;}
export function moneyHTML(amount,unit=''){return `<span class="money-amount">${moneyIcon()}<span>${Number(amount).toLocaleString('ko-KR')}${unit?' '+unit:''}</span></span>`;}
// Only currency-labelled amounts are decorated; levels, time and collection counts stay plain.
export function moneyRanges(text){const found=[];const re=/(?:[+−–-]?\d[\d,]*\s*(?:여행머니|머니|경비|코인|원))|(?:(?:남은 머니|남은 경비|보유 여행머니|숙박비|광고 수입|광고수입|여행머니|경비|선지급 정산|블로그 지갑에서|블로그 지갑)\s*[:：]?\s*)([+−–-]?\d[\d,]*)/g;let m;while((m=re.exec(text))){const start=m[1]?m.index+m[0].lastIndexOf(m[1]):m.index;found.push({start,end:m.index+m[0].length});}return found;}
export function decorateMoney(root=document.body){
 const nodes=[],walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 while(walk.nextNode()){const node=walk.currentNode;if(node.parentElement?.closest('.money-amount,script,style,svg,textarea,input,option'))continue;const ranges=moneyRanges(node.textContent);if(ranges.length)nodes.push({node,ranges});}
 for(const {node,ranges} of nodes){const f=document.createDocumentFragment(),s=node.textContent;let from=0;for(const r of ranges){f.append(document.createTextNode(s.slice(from,r.start)));const span=document.createElement('span');span.className='money-amount';span.innerHTML=moneyIcon();const text=document.createElement('span');text.textContent=s.slice(r.start,r.end);span.append(text);f.append(span);from=r.end;}f.append(document.createTextNode(s.slice(from)));node.replaceWith(f);}
 root.querySelectorAll?.('.blog-stats > div:nth-child(-n+2) strong').forEach(el=>{if(!el.querySelector('.money-icon'))el.innerHTML=moneyHTML(Number(el.textContent.replace(/[^\d]/g,'')));});
}
export function installMoneyUI(){decorateMoney();let queued=false;new MutationObserver(records=>{if(queued||!records.some(r=>{const el=r.target.nodeType===3?r.target.parentElement:r.target;return !el?.closest?.('.money-amount');}))return;queued=true;queueMicrotask(()=>{queued=false;decorateMoney();});}).observe(document.body,{childList:true,characterData:true,subtree:true});}
