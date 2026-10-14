export const SEORIRA={id:'seorira',name:'서리라',route:'mex',nationality:'대한민국',job:'멕시코에서 일하는 직장인',family:'결혼한 한국인 친구 · 남편은 현지 한식당 운영'};
export const FRIEND_TOPICS=[
 {id:'work',label:'멕시코 직장 생활 이야기',memory:'퇴근 후 카페에서 나눈 이야기',lines:['한국에서 멕시코로 취업해서 왔어. 처음엔 출근길부터 낯설었는데, 이제는 단골 카페도 생겼어.','여기서 일하면서 지내다 보니 이 도시가 조금씩 내 동네가 되더라. 오늘은 퇴근하고 너를 만나니까 더 반갑네.']},
 {id:'restaurant',label:'남편의 한식당에 들르기',memory:'서리라 부부의 한식당에서 먹은 집밥',lines:['남편은 여기서 한식당을 하고 있어. 멕시코를 여행하다가 한식이 생각나면 같이 들르자.','따뜻한 밥과 반찬을 놓으니 익숙한 냄새가 나네. 낯선 도시에서 먹는 한 끼가 꼭 집에 온 것 같지?']},
 {id:'walk',label:'서리라와 동네 산책',memory:'친구와 함께 걸은 멕시코의 골목',lines:['이 길은 내가 자주 걷는 골목이야. 유명한 곳을 보는 것도 좋지만, 그냥 동네를 걸을 때 보이는 것들도 좋더라.','여행은 잘 도착하는 것만큼 누굴 만났는지도 오래 남는 것 같아. 다음에 멕시코에 오면 또 연락해!']}
];
const topicIds=new Set(FRIEND_TOPICS.map(t=>t.id));
export function friendEventState(raw,route){
 if(route!=='mex')return null;
 return {invited:raw?.invited===true,met:raw?.met===true,topics:raw?.met===true&&Array.isArray(raw.topics)?[...new Set(raw.topics.filter(id=>topicIds.has(id)))]:[]};
}
export function friendBookState(raw){
 const r=raw?.seorira;if(!r||!Number.isFinite(r.date))return {};
 return {seorira:{date:Math.max(0,r.date),count:Math.max(1,Math.min(999,Math.floor(r.count)||1)),topics:Array.isArray(r.topics)?[...new Set(r.topics.filter(id=>topicIds.has(id)))]:[]}};
}
export const friendEventAvailable=j=>!!j&&j.routeId==='mex'&&j.stage==='hotel'&&j.checkedIn===true&&!j.completed;
export function inviteLocalFriend(j){if(!friendEventAvailable(j))return false;j.friendEvent=friendEventState(j.friendEvent,j.routeId);if(j.friendEvent.invited)return false;j.friendEvent.invited=true;return true;}
export function visitLocalFriend(p,j,action='greet',now=Date.now()){
 if(!friendEventAvailable(j)||action!=='greet'&&!topicIds.has(action))return {ok:false,message:'멕시코 숙소에 체크인하면 서리라를 만날 수 있어요.'};
 const event=j.friendEvent=friendEventState(j.friendEvent,j.routeId);event.invited=true;
 if(action!=='greet'&&!event.met)return {ok:false,message:'먼저 서리라와 반갑게 인사해요.'};
 if(action==='greet'&&event.met||event.topics.includes(action))return {ok:false,message:'이번 여행에서는 이미 나눈 기억이에요.'};
 p.friends=friendBookState(p.friends);const old=p.friends.seorira||{count:0,topics:[]};
 const first=action==='greet',isNew=first?!old.count:!old.topics.includes(action),xp=first?20:isNew?10:0,coins=first?10:0;
 if(first)event.met=true;else event.topics.push(action);
 p.friends.seorira={date:now,count:old.count+(first?1:0),topics:[...new Set([...old.topics,...event.topics])]};
 p.xp+=xp;p.coins+=coins;j.joy=Math.min(100,j.joy+(first?8:5));
 return {ok:true,first,isNew,xp,coins,topic:FRIEND_TOPICS.find(t=>t.id===action)||null,message:first?'서리라와의 만남을 여행수첩에 담았어요.':FRIEND_TOPICS.find(t=>t.id===action).memory+' · 수첩에 남겼어요.'};
}
// Original vector pixel portrait: an adult office worker with a handbag.
export function friendPortrait(){return `<svg class="local-friend-portrait" viewBox="0 0 96 112" role="img" aria-label="직장인 서리라의 도트 캐릭터" shape-rendering="crispEdges"><rect x="4" y="4" width="88" height="104" fill="#eee5cf"/><path d="M8 72V40h8V24h8V16h48v8h8v16h8v32" fill="#d7d8b6"/><rect x="17" y="84" width="64" height="8" fill="#cbb899"/><rect x="31" y="12" width="35" height="41" fill="#584337"/><rect x="64" y="28" width="11" height="37" fill="#584337"/><rect x="29" y="29" width="7" height="14" fill="#f0bea0"/><rect x="35" y="23" width="26" height="30" fill="#f4caaa"/><rect x="32" y="18" width="31" height="12" fill="#584337"/><rect x="36" y="29" width="6" height="4" fill="#584337"/><rect x="40" y="36" width="3" height="4" fill="#493830"/><rect x="54" y="36" width="3" height="4" fill="#493830"/><rect x="36" y="42" width="6" height="3" fill="#da9e87"/><rect x="56" y="42" width="6" height="3" fill="#da9e87"/><rect x="47" y="46" width="6" height="2" fill="#9f6857"/><rect x="43" y="51" width="13" height="7" fill="#efbea0"/><path d="M35 57h27v6h5v24H29V64h6Z" fill="#758b72"/><path d="M42 57h16l-8 12Z" fill="#fcf6e5"/><rect x="49" y="70" width="2" height="12" fill="#d8c494"/><rect x="27" y="75" width="7" height="11" fill="#edbf9f"/><rect x="64" y="73" width="7" height="11" fill="#edbf9f"/><rect x="40" y="87" width="8" height="17" fill="#4d5e61"/><rect x="53" y="87" width="8" height="17" fill="#4d5e61"/><rect x="37" y="103" width="12" height="5" fill="#584337"/><rect x="52" y="103" width="12" height="5" fill="#584337"/><rect x="68" y="85" width="14" height="16" fill="#aa7951"/><path d="M70 85v-5h9v5" fill="none" stroke="#765c43" stroke-width="2"/><rect x="28" y="80" width="3" height="2" fill="#cfb969"/></svg>`;}
export function friendNotebookHTML(record){const r=friendBookState({seorira:record}).seorira;return `<section class="local-friend-memory"><h3>멕시코의 친구 · 서리라</h3><div class="local-friend-profile">${friendPortrait()}<p>한국인 여성 · 멕시코 취업<br>직장인 · 기혼<br>남편은 멕시코에서 한식당을 운영해요.</p></div>${r?`<p>만남 ${r.count}회</p><div class="diary-lines">${FRIEND_TOPICS.filter(t=>r.topics.includes(t.id)).map(t=>`<span>✓ ${t.memory}</span>`).join('')}</div>`:'<p class="note">멕시코 숙소에 체크인하면 연락이 와요.</p>'}</section>`;}
