'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {spawn}=require('node:child_process');
const WebSocket=require('ws');
const core=require('../../game-core.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=5000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await sleep(20);}throw Error('조건 대기 시간 초과');}

test('인수인계: 보안·실제 온라인 경기·복귀·정리', {timeout:70000}, async t=>{
  let log='',err='';
  const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:'0',HOST:'127.0.0.1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>err+=b);
  const clients=[];
  t.after(()=>{for(const c of clients)if(c.ws.readyState<2)c.ws.close(1000);child.kill();});
  await until(()=>/localhost:(\d+)/.test(log));
  const port=+log.match(/localhost:(\d+)/)[1];const base='http://127.0.0.1:'+port;
  const request=(target,method='GET')=>new Promise((resolve,reject)=>{const q=http.request(base+target,{method},r=>{let body='';r.on('data',b=>body+=b);r.on('end',()=>resolve({status:r.statusCode,body}));});q.on('error',reject);q.end();});
  async function connect(nick,token='',version=core.PROTOCOL_VERSION,delay=0){
    const c={ws:new WebSocket(base.replace('http','ws')),messages:[],snap:null,close:null};clients.push(c);
    c.send=m=>{if(c.ws.readyState===1)c.ws.send(JSON.stringify(m));};
    c.ws.on('open',()=>c.send({t:'hello',nick,token,v:version}));
    c.ws.on('message',(data,binary)=>{if(binary){c.snap=core.decodeSnapshot(new Uint8Array(data));return;}const m=JSON.parse(data);c.messages.push(m);if(m.t==='ping')setTimeout(()=>c.send({t:'pong',id:m.id}),delay);if(m.t==='welcome')c.welcome=m;if(m.t==='joined')c.roomId=m.id;if(m.t==='room')c.room=m.state;});
    c.ws.on('close',code=>c.close=code);c.ws.on('error',()=>{});
    await until(()=>c.welcome||c.close);return c;
  }
  await t.test('비공개 파일·경로 우회 차단, 잘못된 URL에도 서버 유지',async()=>{
    const dummy=path.resolve(__dirname,'../registry-test.txt');fs.writeFileSync(dummy,'dummy-not-a-secret');
    try{for(const p of ['/server/registry-test.txt','/server/registry.txt','/server/server.js','/server/package.json','/CLAUDE.md','/server%2fregistry-test.txt','/%2e%2e%5cserver%5cregistry-test.txt'])assert.equal((await request(p)).status,404,p);}finally{fs.unlinkSync(dummy);}
    assert.equal((await request('/%')).status,400);
    assert.equal((await request('/')).status,200);
    assert.equal((await request('/chars/captain.png')).status,200);
    assert.equal((await request('/','HEAD')).body,'');
    assert.equal((await request('/','POST')).status,405);
  });
  await t.test('버전 및 지연 게이트',async()=>{
    const old=await connect('구버전','',-1);assert.equal(old.close,4002);
    const slow=await connect('느린접속','',core.PROTOCOL_VERSION,210);assert.equal(slow.close,4001);
  });
  const [a,b]=await Promise.all([connect('동일이름'),connect('동일이름')]);
  await t.test('반 번호·구장 선택·정원·준비·방장 검사',async()=>{
    assert.notEqual(a.welcome.id,b.welcome.id);
    a.send({t:'room.create',name:'인수인계',teamSize:1,halfSec:60,pass:'test',field:'world',classA:3,classB:7});
    await until(()=>a.roomId);b.send({t:'room.join',id:a.roomId,pass:'wrong'});await until(()=>b.messages.some(m=>m.t==='error'&&m.msg.includes('비밀번호')));
    b.send({t:'room.join',id:a.roomId,pass:'test'});await until(()=>b.roomId===a.roomId);
    a.send({t:'start'});await until(()=>a.messages.some(m=>m.t==='error'&&m.msg.includes('준비')));
    b.send({t:'start'});await until(()=>b.messages.some(m=>m.t==='error'&&m.msg.includes('방장')));
    a.send({t:'ready',on:true});b.send({t:'ready',on:true});await until(()=>a.room.members.every(m=>m.ready));a.send({t:'start'});
    await until(()=>a.room.phase==='playing'&&b.messages.some(m=>m.t==='match.start'));
    assert.deepEqual(a.room.classes,[3,7]);
    await until(()=>a.snap&&a.snap.players.length===2);
    assert.equal(a.snap.field,core.fieldOf('world').id);
  });
  let resumed;
  await t.test('비정상 종료 후 같은 팀·선수·방장으로 복귀',async()=>{
    const me=a.room.members.find(m=>m.id===a.welcome.id);const id=a.roomId;
    a.ws.terminate();await until(()=>b.room.members.some(m=>m.id===me.id&&m.disconnected));
    const stranger=await connect('새참가');stranger.send({t:'room.join',id,pass:'test'});await until(()=>stranger.messages.some(m=>m.t==='error'&&m.msg.includes('가득')));stranger.ws.close(1000);
    resumed=await connect('동일이름',a.welcome.slotToken);await until(()=>resumed.messages.some(m=>m.t==='match.start'));
    assert.equal(resumed.welcome.resumed,true);assert.equal(resumed.welcome.id,me.id);assert.equal(resumed.roomId,id);
    const after=resumed.room.members.find(m=>m.id===me.id);assert.equal(after.slot,me.slot);assert.equal(after.team,me.team);assert.equal(after.host,true);assert.notEqual(resumed.welcome.slotToken,a.welcome.slotToken);
  });
  await t.test('정상 퇴장 선수 삭제·방장 승계·빈자리에 중도 참가',async()=>{
    const oldSlot=resumed.room.members.find(m=>m.id===resumed.welcome.id).slot;const id=resumed.roomId;
    resumed.send({t:'room.leave'});await until(()=>b.room.members.length===1);await until(()=>b.snap.players.length===1);
    assert.equal(b.room.members[0].host,true);assert(!b.snap.players.some(p=>p.slot===oldSlot));
    const c=await connect('중도참가');c.send({t:'room.join',id,pass:'test'});await until(()=>c.messages.some(m=>m.t==='match.start'&&m.late));
    await until(()=>c.snap&&c.snap.players.length===2);assert.equal(c.room.members.find(m=>m.id===c.welcome.id).slot,oldSlot);
    c.ws.close(1000);await until(()=>b.room.members.length===1);
  });
  await t.test('15초 보존 만료 후 자리 해제·토큰 무효화',async()=>{
    const token=b.welcome.slotToken;b.ws.terminate();await until(()=>b.close!==null);
    await sleep(15300);const expired=await connect('만료검사',token);assert.equal(expired.welcome.resumed,false);expired.ws.close(1000);
  });
  resumed.ws.close(1000);
  await until(()=>clients.every(c=>c.ws.readyState===3));
  const stats=JSON.parse((await request('/stats')).body);assert.equal(stats.connections,0);assert.equal(stats.reserved,0);assert.equal(err,'',err);
});
