const $=id=>document.getElementById(id);
const token=document.querySelector('meta[name=benny-token]').content;
const session=crypto.randomUUID();
let config, busy=false, muted=false, epoch=0, player=null, audioURL=null, recording=null;
let localVoices=[];
async function api(path,data={}){const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Benny-Token':token},body:JSON.stringify({session,...data})});const type=r.headers.get('content-type');if(type?.startsWith('audio/')){if(!r.ok)throw Error('Voice unavailable');return r.blob();}const b=await r.json();if(!r.ok)throw Error(b.error);return b;}
function sayBubble(text,who='benny'){const el=document.createElement('div');el.className='bubble '+who;const label=document.createElement('span');label.className='speaker';label.textContent=who==='benny'?'BENNY':'YOU';el.append(label,document.createTextNode(text));$('conversation').append(el);while($('conversation').children.length>20)$('conversation').firstChild.remove();scrollEnd();return el;}
function state(text,talking=false){$('state').textContent=text;$('bear').classList.toggle('speaking',talking);}
function haltAudio(){if('speechSynthesis'in window)speechSynthesis.cancel();if(player){player.pause();player.src='';player=null;}if(audioURL){URL.revokeObjectURL(audioURL);audioURL=null;}state(muted?'Benny is muted':'Ready for a bear-y good chat');}
function controls(){for(const id of ['send','message'])$(id).disabled=busy||muted;$('reset').disabled=busy;$('record').disabled=busy||muted||!config?.mic;document.querySelectorAll('[data-topic]').forEach(b=>b.disabled=busy||muted);}
async function chatSend(text,onItem){
 const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Benny-Token':token},body:JSON.stringify({session,text})});
 if(!r.ok||!(r.headers.get('content-type')||'').includes('ndjson'))throw Error(((await r.json().catch(()=>({}))).error)||'Request failed');
 const reader=r.body.getReader(),decoder=new TextDecoder();
 let buffer='',error=null;
 for(;;){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
 for(;;){const i=buffer.indexOf('\n');if(i<0)break;const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);if(!line)continue;let data=null;try{data=JSON.parse(line);}catch(e){continue;}if(data.error)error=data.error;else if(data.id)onItem(data);}}
 return error;
}
function scrollEnd(){$('conversation').scrollTop=$('conversation').scrollHeight;}
function playBlob(blob,stamp,reveal){return new Promise((resolve,reject)=>{audioURL=URL.createObjectURL(blob);player=new Audio(audioURL);player.onplaying=()=>{if(stamp===epoch&&!muted){reveal();state('Benny is speaking',true);}};player.onended=resolve;player.onerror=()=>reject(new Error('Audio playback failed. Check your speaker.'));player.play().catch(reject);});}
async function playReply(items,stamp){
 let bubble=null;
 const reveal=item=>{if(bubble)bubble.appendChild(document.createTextNode(' '+item.text));else bubble=sayBubble(item.text,'benny');scrollEnd();};
  if(config.voice==='piper'&&speakable()){
  const blobs=new Map(items.map(it=>[it.id,api('tts',{id:it.id}).catch(e=>e)]));
  for(const item of items){
   if(stamp!==epoch)return;
   try{const blob=await blobs.get(item.id);if(stamp!==epoch||muted)return;if(blob instanceof Error)throw blob;await playBlob(blob,stamp,()=>reveal(item));}
   catch(e){reveal(item);$('notice').textContent=e.message;}
  }
   }else if(config.voice!=='piper'){if(!localVoices.length){for(const item of items)reveal(item);$('notice').textContent='No installed offline English voice was found. Replies are available as text. Install a system voice or configure Piper.';return;}for(const item of items){if(stamp!==epoch)return;const u=new SpeechSynthesisUtterance(item.text);u.voice=localVoices.find(v=>v.voiceURI===$('voices').value)||localVoices[0];u.rate=.92;u.pitch=1.08;u.onstart=()=>{if(stamp===epoch){reveal(item);state('Benny is speaking',true);}};u.onerror=()=>{};speechSynthesis.speak(u);}}
 else for(const item of items)reveal(item);
 if(stamp===epoch&&!muted)state('Ready for a bear-y good chat');
}
function speakable(){return !muted&&$('autovoice').checked;}
async function send(text){if(busy||muted||!text.trim())return;epoch++;haltAudio();busy=true;controls();sayBubble(text,'child');$('message').value='';$('notice').textContent='';state('Benny is thinking…');const stamp=epoch,items=[];try{const error=await chatSend(text,o=>items.push(o));if(stamp!==epoch)return;if(!items.length&&error)throw Error(error);state('Getting Benny ready to speak…');await playReply(items,stamp);if(error)$('notice').textContent=error;}catch(e){if(stamp===epoch){$('notice').textContent=e.message;$('message').value=text;state('Let’s try again');}}finally{busy=false;controls();if(!muted)$('message').focus();}}
$('form').onsubmit=e=>{e.preventDefault();send($('message').value);};document.querySelectorAll('[data-topic]').forEach(b=>b.onclick=()=>send(b.dataset.topic));
$('stop').onclick=()=>{muted=true;epoch++;haltAudio();if(recording)finishRecording(false);$('resume').hidden=false;controls();};
$('resume').onclick=()=>{muted=false;$('resume').hidden=true;state('Ready for a bear-y good chat');controls();};
$('autovoice').onchange=()=>{if(!$('autovoice').checked){epoch++;haltAudio();}};
$('reset').onclick=async()=>{epoch++;haltAudio();if(recording)await finishRecording(false);$('conversation').replaceChildren();$('notice').textContent='';try{const reply=await api('reset');sayBubble(reply.text);state(muted?'Benny is muted':'Ready for a bear-y good chat');}catch(e){$('notice').textContent=e.message;}};
function voices(){localVoices=typeof speechSynthesis==='undefined'?[]:speechSynthesis.getVoices().filter(v=>v.localService&&v.lang.startsWith('en'));$('voices').replaceChildren();if(config?.voice==='piper'){$('voices').add(new Option('Piper · offline',''));$('voices').disabled=true;return;}for(const v of localVoices)$('voices').add(new Option(v.name,v.voiceURI));if(!localVoices.length)$('voices').add(new Option('No offline voice installed',''));}
if('speechSynthesis'in window)speechSynthesis.onvoiceschanged=voices;
// Capture PCM locally; never use browser SpeechRecognition (which may send audio to cloud services).
$('record').onclick=async()=>{if(recording)return finishRecording(true);if(busy||muted)return;epoch++;haltAudio();const stamp=epoch;try{const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});if(stamp!==epoch||muted){stream.getTracks().forEach(t=>t.stop());return;}const ctx=new AudioContext();await ctx.resume();const source=ctx.createMediaStreamSource(stream);const proc=ctx.createScriptProcessor(4096,1,1);const silent=ctx.createGain();silent.gain.value=0;recording={stream,ctx,source,proc,silent,chunks:[],samples:0};proc.onaudioprocess=e=>{if(!recording)return;const chunk=new Float32Array(e.inputBuffer.getChannelData(0));recording.chunks.push(chunk);recording.samples+=chunk.length;};source.connect(proc);proc.connect(silent);silent.connect(ctx.destination);recording.timer=setTimeout(()=>finishRecording(true),15000);$('record').textContent='■ Finish recording';state('Listening… click Finish when done');}catch(e){$('notice').textContent='Microphone unavailable: '+e.message;}};
async function finishRecording(submit){const r=recording;if(!r)return;recording=null;clearTimeout(r.timer);r.proc.onaudioprocess=null;r.source.disconnect();r.proc.disconnect();r.silent.disconnect();r.stream.getTracks().forEach(t=>t.stop());await r.ctx.close();$('record').textContent='● Record a question';if(!submit||muted)return;busy=true;controls();state('Listening to your question…');const stamp=epoch;try{const blob=encodeWav(r.chunks,r.samples,r.ctx.sampleRate);let binary='';const bytes=new Uint8Array(blob);for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const result=await api('transcribe',{audio:btoa(binary)});if(stamp!==epoch||muted)return;$('message').value=result.text;state('Check your question, then press Send');$('notice').textContent=result.text?'Check the recognized words before sending.':'No words heard. Try a quieter spot or type your question.';}catch(e){if(stamp===epoch){$('notice').textContent=e.message;state('Microphone needs setup');}}finally{busy=false;controls();}}
function encodeWav(chunks,length,rate){const input=new Float32Array(length);let offset=0;for(const c of chunks){input.set(c,offset);offset+=c.length;}const count=Math.floor(length*16000/rate),output=new Float32Array(count);for(let j=0;j<count;j++){const a=Math.floor(j*rate/16000),b=Math.min(length,Math.floor((j+1)*rate/16000));let sum=0;for(let k=a;k<b;k++)sum+=input[k];output[j]=sum/Math.max(1,b-a);}chunks=[output];length=count;rate=16000;const buffer=new ArrayBuffer(44+length*2),v=new DataView(buffer);const str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};str(0,'RIFF');v.setUint32(4,36+length*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,length*2,true);let i=44;for(const c of chunks)for(const s of c){const x=Math.max(-1,Math.min(1,s));v.setInt16(i,x<0?x*32768:x*32767,true);i+=2;}return buffer;}
window.addEventListener('beforeunload',()=>{if(recording)recording.stream.getTracks().forEach(t=>t.stop());haltAudio();});
(async()=>{try{config=await api('status');showGeminiSettings();voices();await api('reset');sayBubble(config.greeting);$('notice').textContent=config.mic?'Offline microphone ready. Record, check the words, then Send.':'Keyboard ready. Optional offline microphone setup is in README.';controls();}catch(e){$('notice').textContent=e.message;}})();


function showGeminiSettings(){ $('gemini-model').value=config.geminiModel; $('gemini-status').textContent=config.geminiConfigured?'Key saved on this device.':'No Gemini key saved.'; }
$('gemini-form').onsubmit=async e=>{e.preventDefault();const key=$('gemini-key').value;$('gemini-key').value='';try{Object.assign(config,await api('settings',{key,model:$('gemini-model').value}));showGeminiSettings();$('gemini-status').textContent+=' Gemini is the only conversation provider.';}catch(err){$('gemini-status').textContent=err.message;}};
$('remove-key').onclick=async()=>{try{Object.assign(config,await api('settings',{key:'',model:$('gemini-model').value,removeKey:true}));$('gemini-key').value='';showGeminiSettings();}catch(err){$('gemini-status').textContent=err.message;}};
