import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {greeting,prompt} from '../dialogue.mjs';
test('original Benny personality and exact greeting are retained',()=>{
 assert.equal(greeting,"Hiya, buddy! I'm Benny the Bear! What's your favorite thing to do for fun?");
 for(const heading of ['PERSONALITY:','CONVERSATION:','TOPICS:','HEALTH:','SAFETY:'])assert.ok(prompt.includes(heading));
 assert.ok(prompt.includes('Above all, be brief, safe, curious, and fun!'));
});
test('Gemini is the only conversation path, errors never become canned responses',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'benny-only-'));
 const child=spawn(process.execPath,['--import','./tests/fixtures/mock-gemini.mjs','server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'18787',GEMINI_API_KEY:'fake-test-key',BENNY_SETTINGS_FILE:join(dir,'settings.json')}});
 t.after(async()=>{child.kill();await new Promise(r=>child.once('close',r));await rm(dir,{recursive:true,force:true});});
 await new Promise((r,j)=>{child.once('error',j);child.stdout.once('data',r);});
 const base='http://127.0.0.1:18787';const html=await(await fetch(base)).text();const token=html.match(/name="benny-token" content="([a-f0-9]+)"/)[1];
 assert.ok(!html.includes('value="approved"'));assert.ok(!html.includes('id="review"'));
 const session=crypto.randomUUID();const post=(route,b={},auth=true)=>fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{'X-Benny-Token':token}:{})},body:JSON.stringify({session,...b})});
 const chat=async(text,mode)=>{
 const r=await post('chat',{text,mode});
 if(!(r.headers.get('content-type')||'').includes('ndjson'))return {status:r.status,text:'',kind:null,...await r.json()};
 const out={status:r.status,text:'',kind:null,error:null};
 for(const line of (await r.text()).split('\n')){if(!line.trim())continue;const o=JSON.parse(line);if(o.error)out.error=o.error;else if(o.id)out.text=out.text?out.text+' '+o.text:o.text;if(o.kind)out.kind=o.kind;}
 return out;
 };
 assert.equal((await post('chat',{text:'Hi'},false)).status,403);
 assert.equal((await(await post('status')).json()).provider,'gemini');
 for(const mode of [undefined,'approved','ai','gemini']){const reply=await chat('soccer',mode);assert.equal(reply.kind,'gemini');assert.equal(reply.text,'Bear-y awesome! What do you enjoy about soccer?');}
 for(const text of ['simulate quota','simulate blocked']){const r=await chat(text);assert.equal(r.status,502);assert.ok(r.error);assert.equal(r.text,'');assert.ok(!('kind'in r)||r.kind===null);}
 assert.equal((await post('chat',{text:'x'.repeat(501)})).status,400);
 const reply=await(await post('reset')).json();assert.equal(reply.text,greeting);
 await post('settings',{key:'',model:'gemini-2.5-flash',removeKey:true});const missing=await chat('hi');assert.equal(missing.status,502);assert.match(missing.error,/Add a Gemini/);
 assert.equal((await post('approve',{id:'anything'})).status,404);
});
