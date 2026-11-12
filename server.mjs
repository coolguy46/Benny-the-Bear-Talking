import http from 'node:http';
import dns from 'node:dns';
// This network has no working IPv6 route; prefer IPv4 so Gemini requests do not time out.
dns.setDefaultResultOrder('ipv4first');
import {VoiceClient} from './voice-client.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {geminiStream,geminiError} from './gemini.mjs';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {greeting, prompt} from './dialogue.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const port=Number(process.env.PORT||8787), token=randomBytes(24).toString('hex');
const python=process.env.BENNY_PYTHON||(process.platform==='win32'?'python':'python3');
const voiceClient=new VoiceClient(python,[root+'voice.py','serve'],{cwd:root,env:{...process.env,PYTHONUTF8:'1'}});
if(process.env.BENNY_PIPER_MODEL)voiceClient.start();
const sttClient=new VoiceClient(python,[root+'voice.py','listen-serve'],{cwd:root,env:{...process.env,PYTHONUTF8:'1'}});
if(process.env.BENNY_VOSK_MODEL)sttClient.start();
const settingsPath=process.env.BENNY_SETTINGS_FILE||root+'.benny-settings.json';
let saved={};try{saved=JSON.parse(await readFile(settingsPath,'utf8'));}catch(e){if(e.code!=='ENOENT')console.error('Could not read Benny settings. Using environment settings.');}
let geminiKey=process.env.GEMINI_API_KEY||saved.geminiKey||'';
let geminiModel=process.env.GEMINI_MODEL||saved.geminiModel||'gemini-3.1-flash-lite';
function publicSettings(){return {geminiConfigured:!!geminiKey,geminiModel};}

const sessions=new Map();
function session(id){if(typeof id!=='string'||! /^[a-f0-9-]{36}$/.test(id))throw Error('Invalid session'); if(!sessions.has(id)){if(sessions.size>=20)throw Error('Too many sessions. Restart Benny.');sessions.set(id,{history:[],spoken:new Map(),busy:false,updated:Date.now()});} const s=sessions.get(id);s.updated=Date.now();return s;}
const cleanup=setInterval(()=>{for(const [id,s] of sessions)if(Date.now()-s.updated>30*60*1000)sessions.delete(id);},60000);cleanup.unref();
function issue(s,text,kind){const id=randomBytes(12).toString('hex');s.spoken.set(id,text);if(s.spoken.size>10)s.spoken.delete(s.spoken.keys().next().value);return {id,text,kind};}
async function body(req){let chunks=[],size=0;for await(const b of req){size+=b.length;if(size>2e6)throw Error('Request too large');chunks.push(b);}return Buffer.concat(chunks);}
function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function takeSentence(buffer,final){
 if(final){const t=buffer.trim();return t?{text:t,len:buffer.length}:null;}
 const m=buffer.match(/^[\s\S]*?[.!?]+['")\]]*\s/);
 return m?{text:m[0].trim(),len:m[0].length}:null;
}
export const server=http.createServer(async(req,res)=>{try{
 const host=req.headers.host;if(host!==`127.0.0.1:${port}`&&host!==`localhost:${port}`)return json(res,{error:'Local access only'},403);
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 const path=new URL(req.url,`http://${host}`).pathname;
 if(req.method==='GET'&&['/','/app.js','/style.css'].includes(path)){const name=path==='/'?'index.html':path.slice(1);let data=await readFile(root+'public/'+name);if(path==='/')data=Buffer.from(data.toString().replace('__TOKEN__',token));res.setHeader('Content-Type',path==='/'?'text/html; charset=utf-8':path.endsWith('.js')?'text/javascript':'text/css');return res.end(data);}
 if(req.method!=='POST'||req.headers['x-benny-token']!==token)return json(res,{error:'Unauthorized'},403);
 const raw=await body(req);const b=JSON.parse(raw.toString());
  if(path==='/api/status')return json(res,{greeting,provider:'gemini',...publicSettings(),voice:process.env.BENNY_PIPER_MODEL?'piper':'browser',mic:!!process.env.BENNY_VOSK_MODEL});
 if(path==='/api/settings'){
 if(typeof b.key!=='string'||b.key.length>500||/[\r\n]/.test(b.key))throw Error('Invalid API key');
 if(typeof b.model!=='string'||! /^[a-zA-Z0-9._-]{1,100}$/.test(b.model))throw Error('Invalid Gemini model name');
 const nextKey=b.removeKey?'':b.key.trim()||geminiKey;
 try{await writeFile(settingsPath,JSON.stringify({geminiKey:nextKey,geminiModel:b.model},null,2),{mode:0o600});}catch{throw Error('Could not save local settings. Check folder permissions.');}
 geminiKey=nextKey;geminiModel=b.model;return json(res,publicSettings());
 }
 const s=session(b.session);
 if(path==='/api/reset'){s.history=[{role:'assistant',content:greeting}];s.spoken.clear();return json(res,issue(s,greeting,'greeting'));}
  if(path==='/api/tts'){const text=s.spoken.get(b.id);if(!text)throw Error('Reply expired');if(!process.env.BENNY_PIPER_MODEL)throw Error('Piper is not configured');const wav=await voiceClient.speak(text);res.setHeader('Content-Type','audio/wav');return res.end(wav);}
 if(path==='/api/transcribe'){if(!process.env.BENNY_VOSK_MODEL)throw Error('Set up Vosk first (README)');if(typeof b.audio!=='string'||b.audio.length>1800000)throw Error('Recording too long');return json(res,{text:(await sttClient.request({audio:b.audio})).text});}
 if(path==='/api/chat'){
 if(s.busy)return json(res,{error:'Benny is already thinking'},409);
 if(typeof b.text!=='string'||!b.text.trim()||b.text.length>500)throw Error('Use 1-500 characters');
 const text=b.text.trim();
 if(!s.history.length)s.history.push({role:'assistant',content:greeting});
 const messages=[{role:'system',content:prompt},...s.history.slice(-10),{role:'user',content:text}];
 s.busy=true;
 const stream=geminiStream({key:geminiKey,model:geminiModel,messages});
 let probe;
 try{probe=await stream.next();}catch(e){s.busy=false;return json(res,{error:geminiError(e)},502);}
 try{
  if(probe.done)return json(res,{error:'Gemini returned no text.'},502);
  res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store'});
  const write=o=>res.write(JSON.stringify(o)+'\n');
  const parts=[];let buffer='';let failure=null;
  const emit=t=>{parts.push(t);write(issue(s,t,'gemini'));};
  const drain=final=>{for(;;){const part=takeSentence(buffer,final);if(!part)break;buffer=buffer.slice(part.len);emit(part.text);}};
  buffer+=probe.value;drain(false);
  try{for(let step=await stream.next();!step.done;step=await stream.next()){buffer+=step.value;drain(false);}drain(true);}
  catch(e){failure=e;}
  if(!parts.length)return res.end(JSON.stringify({error:failure?geminiError(failure):'Gemini returned no text.'})+'\n');
  const reply=parts.join(' ');
  s.history.push({role:'user',content:text},{role:'assistant',content:reply});s.history=s.history.slice(-10);
  write({text:reply,kind:'gemini',done:true});
  if(failure)write({error:geminiError(failure),done:true});
  return res.end();
 }finally{s.busy=false;}
 }
 return json(res,{error:'Not found'},404);
 }catch(e){json(res,{error:e.message||'Request failed'},400);}});
server.listen(port,'127.0.0.1',()=>console.log(`Benny is ready: http://127.0.0.1:${port}\nKeep this window open. Ctrl+C stops Benny. No transcripts are saved.`));
function shutdown(){voiceClient.stop();sttClient.stop();server.close();process.exit(0);}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);

