import {musicTheme} from './music-themes.js?v=6.10.1';
// Credited CC0 compositions with a soft city crossfade.
export class TravelSound {
 constructor(){this.enabled=false;this.context=null;this.master=null;this.volume=.5;this.theme='home';this.playing=null;this.loading=null;this.buffers=new Map();this.encoded=new Map();this.revision=0;this.status='off';this.lastFeedback=-Infinity;}
 preloadTheme(id){const theme=musicTheme(id);if(!this.encoded.has(theme.id)){const request=fetch(new URL(theme.file,import.meta.url)).then(r=>{if(!r.ok)throw new Error('music '+r.status);return r.arrayBuffer();});this.encoded.set(theme.id,request);request.catch(()=>this.encoded.delete(theme.id));}return this.encoded.get(theme.id);}
 async enable(value){
  this.enabled=value;
  if(!value){this.status='off';this.revision++;this.loading=null;if(this.context)await this.context.suspend();return;}
  try{
   if(!this.context){this.context=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'playback'});this.master=this.context.createGain();this.master.gain.setValueAtTime(0,this.context.currentTime);this.master.gain.linearRampToValueAtTime(this.volume*.7,this.context.currentTime+.45);this.sceneGain=this.context.createGain();this.sceneGain.gain.value=1;this.sceneGain.connect(this.master);const soft=this.context.createBiquadFilter();soft.type='lowpass';soft.frequency.value=6500;soft.Q.value=.3;this.master.connect(soft);soft.connect(this.context.destination);}
   await this.context.resume();this.status=this.playing?'playing':'loading';await this.changeTheme(this.theme);
  }catch(error){this.enabled=false;this.status='unavailable';console.warn('배경 음악을 시작하지 못했습니다.',error.message);}
 }
 setVolume(value){this.volume=Math.max(0,Math.min(.75,value));if(this.master)this.master.gain.setTargetAtTime(this.volume*.7,this.context.currentTime,.3);}
 async resume(){if(this.enabled&&this.context?.state==='suspended'){await this.context.resume();if(!this.playing)await this.changeTheme(this.theme);}}
 suspend(){this.context?.suspend();}
 async changeTheme(id){
  const theme=musicTheme(id);this.theme=theme.id;
  if(!this.enabled||!this.context||this.playing?.id===theme.id||this.loading===theme.id)return;
  const revision=++this.revision;this.loading=theme.id;this.status='loading';
  try{
   let buffer=this.buffers.get(theme.id);
   if(!buffer){const encoded=await this.preloadTheme(theme.id);buffer=await this.context.decodeAudioData(encoded.slice(0));this.buffers.set(theme.id,buffer);if(this.buffers.size>4)this.buffers.delete(this.buffers.keys().next().value);if(this.encoded.size>4)this.encoded.delete(this.encoded.keys().next().value);}
   if(revision!==this.revision||!this.enabled)return;
   const c=this.context,now=c.currentTime+.12,source=c.createBufferSource(),gain=c.createGain();source.buffer=buffer;source.loop=true;source.connect(gain);gain.connect(this.sceneGain||this.master);gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(1,now+1.8);source.start(now);
   const old=this.playing;if(old){old.gain.gain.cancelScheduledValues(now);old.gain.gain.setValueAtTime(old.gain.gain.value,now);old.gain.gain.linearRampToValueAtTime(0,now+1.8);old.source.stop(now+1.9);old.source.onended=()=>{old.source.disconnect();old.gain.disconnect();};}
   this.playing={id:theme.id,source,gain};this.status='playing';
  }catch(error){if(revision===this.revision){this.status='unavailable';console.warn('배경 음악을 읽지 못했습니다.',error.message);}}
  finally{if(revision===this.revision)this.loading=null;}
 }
 tone(frequency=600,duration=.16,volume=.038,delay=0){
  const c=this.context;if(!this.enabled||!c||c.state!=='running')return;
  const now=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(Math.max(180,Math.min(880,frequency)),now);
  g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(volume,now+.006);g.gain.exponentialRampToValueAtTime(.0001,now+duration);o.connect(g);g.connect(this.master);o.start(now);o.stop(now+duration+.02);o.onended=()=>{o.disconnect();g.disconnect();};
 }
 feedback(kind='tap'){
  const c=this.context;if(!this.enabled||!c||c.state!=='running')return false;
  if(c.currentTime-this.lastFeedback<.045)return false;this.lastFeedback=c.currentTime;
  const phrases={tap:[[330,.075,.07,0],[660,.055,.012,.008]],select:[[392,.11,.055,0],[523.25,.12,.035,.045]],back:[[440,.08,.04,0],[330,.10,.035,.045]],confirm:[[523.25,.13,.05,0],[659.25,.15,.04,.07]],reward:[[523.25,.16,.045,0],[659.25,.18,.035,.08],[783.99,.22,.03,.16]],notice:[[440,.10,.035,0],[392,.13,.03,.06]]};
  for(const note of phrases[kind]||phrases.tap)this.tone(...note);return true;
 }
 ambience(ts){const c=this.context;if(!this.enabled||!c||c.state!=='running'||ts-(this.lastAmbience||0)<900)return;this.lastAmbience=ts;const walk=this.world==='walk',room=this.world==='room',cycle=(ts/1000)%85,level=room?.45:walk?(cycle>60?.12:.58):1;this.sceneGain?.gain.setTargetAtTime(level,c.currentTime,2.5);if(!this.wind&&c.createBuffer){const buffer=c.createBuffer(1,c.sampleRate*3,c.sampleRate),data=buffer.getChannelData(0);let value=0;for(let i=0;i<data.length;i++){value=(value+(Math.random()*2-1)*.018)*.985;data[i]=value;}const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=800;filter.Q.value=.2;gain.gain.value=0;source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start();this.wind={source,gain};}this.wind?.gain.gain.setTargetAtTime(walk?.065:0,c.currentTime,2);}
 step(world='home',id='home'){this.world=world;const next=musicTheme(id).id;if(this.theme!==next||this.enabled&&this.status==='off')this.changeTheme(next);}
}
