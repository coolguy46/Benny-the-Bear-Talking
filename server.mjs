import http from 'node:http';
import {VoiceClient} from './voice-client.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {geminiReply} from './gemini.mjs';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {greeting, prompt} from './dialogue.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const port=Number(process.env.PORT||8787), token=randomBytes(24).toString('hex');
const python=process.env.BENNY_PYTHON||(process.platform==='win32'?'python':'python3');
const voiceClient=new VoiceClient(python,[root+'voice.py','serve'],{cwd:root,env:{...process.env,PYTHONUTF8:'1'}});
if(process.env.BENNY_PIPER_MODEL)voiceClient.start();
const settingsPath=process.env.BENNY_SETTINGS_FILE||root+'.benny-settings.json';
let saved={};try{saved=JSON.parse(await readFile(settingsPath,'utf8'));}catch(e){if(e.code!=='ENOENT')console.error('Could not read Benny settings. Using environment settings.');}
let geminiKey=process.env.GEMINI_API_KEY||saved.geminiKey||'';
let geminiModel=process.env.GEMINI_MODEL||saved.geminiModel||'gemini-3.5-flash';
function publicSettings(){return {geminiConfigured:!!geminiKey,geminiModel};}

const sessions=new Map(); const children=new Set();
function session(id){if(typeof id!=='string'||! /^[a-f0-9-]{36}$/.test(id))throw Error('Invalid session'); if(!sessions.has(id)){if(sessions.size>=20)throw Error('Too many sessions. Restart Benny.');sessions.set(id,{history:[],spoken:new Map(),busy:false,updated:Date.now()});} const s=sessions.get(id);s.updated=Date.now();return s;}
const cleanup=setInterval(()=>{for(const [id,s] of sessions)if(Date.now()-s.updated>30*60*1000)sessions.delete(id);},60000);cleanup.unref();
function issue(s,text,kind){const id=randomBytes(12).toString('hex');s.spoken.set(id,text);if(s.spoken.size>10)s.spoken.delete(s.spoken.keys().next().value);return {id,text,kind};}
function worker(mode,data){return new Promise((resolve,reject)=>{const child=spawn(python,[root+'voice.py',mode],{cwd:root,env:process.env,stdio:['pipe','pipe','pipe']});children.add(child);let out=[],size=0,settled=false;const finish=(err,result)=>{if(settled)return;settled=true;clearTimeout(timer);children.delete(child);err?reject(err):resolve(result);};const timer=setTimeout(()=>{child.kill();finish(Error('Voice task timed out.'));},60000);child.stdout.on('data',b=>{size+=b.length;if(size>12e6){child.kill();finish(Error('Voice result too large.'));}else out.push(b);});child.stderr.resume();child.on('error',()=>finish(Error('Python voice tools are not installed. See README.')));child.on('close',code=>finish(code?Error('Voice tools unavailable. Check Python, packages and model paths in README.'):null,Buffer.concat(out)));child.stdin.on('error',()=>{});child.stdin.end(data);});}
async function body(req){let chunks=[],size=0;for await(const b of req){size+=b.length;if(size>2e6)throw Error('Request too large');chunks.push(b);}return Buffer.concat(chunks);}
function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
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
 if(path==='/api/transcribe'){if(!process.env.BENNY_VOSK_MODEL)throw Error('Set up Vosk first (README)');if(typeof b.audio!=='string'||b.audio.length>1800000)throw Error('Recording too long');return json(res,JSON.parse((await worker('listen',Buffer.from(b.audio,'base64'))).toString()));}
 if(path==='/api/chat'){
 if(s.busy)return json(res,{error:'Benny is already thinking'},409);
 if(typeof b.text!=='string'||!b.text.trim()||b.text.length>500)throw Error('Use 1-500 characters');
 const text=b.text.trim();
 s.busy=true;try{
 if(!s.history.length)s.history.push({role:'assistant',content:greeting});
 const messages=[{role:'system',content:prompt},...s.history.slice(-10),{role:'user',content:text}];
 const reply=await geminiReply({key:geminiKey,model:geminiModel,messages});
 s.history.push({role:'user',content:text},{role:'assistant',content:reply});s.history=s.history.slice(-10);
 return json(res,issue(s,reply,'gemini'));
 }catch(e){const message=e.name==='TimeoutError'?'Gemini timed out. Please retry.':e.message.startsWith('Gemini')||e.message.startsWith('Add a Gemini')?e.message:'Gemini connection failed. Please retry.';return json(res,{error:message},502);}finally{s.busy=false;}

 }
 return json(res,{error:'Not found'},404);
 }catch(e){json(res,{error:e.message||'Request failed'},400);}});
server.listen(port,'127.0.0.1',()=>console.log(`Benny is ready: http://127.0.0.1:${port}\nKeep this window open. Ctrl+C stops Benny. No transcripts are saved.`));
function shutdown(){voiceClient.stop();for(const c of children)c.kill();server.close();process.exit(0);}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);

