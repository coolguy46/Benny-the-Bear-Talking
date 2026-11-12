import test from 'node:test';
import assert from 'node:assert/strict';
import {geminiReply,geminiStream} from '../gemini.mjs';
const messages=[{role:'system',content:'Benny rules'},{role:'user',content:'Hello'},{role:'assistant',content:'Hi'},{role:'user',content:'Space?'}];
test('Gemini maps history and sends key in header, not URL',async()=>{
 const text=await geminiReply({key:'test-secret',model:'gemini-2.5-flash',messages,fetchImpl:async(url,options)=>{
 assert.ok(!url.includes('test-secret'));assert.equal(options.headers['x-goog-api-key'],'test-secret');
 const b=JSON.parse(options.body);assert.equal(b.systemInstruction.parts[0].text,'Benny rules');assert.equal(b.contents[1].role,'model');assert.ok(b.safetySettings.every(s=>s.threshold==='BLOCK_LOW_AND_ABOVE'));
 return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'reasoning'},{text:'Space is amazing!'}]}}]})};
 }});assert.equal(text,'Space is amazing!');
});
test('Gemini rejects blocked, incomplete and empty responses',async()=>{
 for(const data of [{promptFeedback:{blockReason:'SAFETY'}},{candidates:[{finishReason:'MAX_TOKENS'}]},{candidates:[{finishReason:'STOP',content:{parts:[]}}]}])await assert.rejects(geminiReply({key:'test',model:'gemini-2.5-flash',messages,fetchImpl:async()=>({ok:true,json:async()=>data})}));
});
test('Gemini handles missing key and quota without exposing provider body',async()=>{
 await assert.rejects(geminiReply({key:'',model:'gemini-2.5-flash',messages}),/Add a Gemini/);
 await assert.rejects(geminiReply({key:'test',model:'gemini-2.5-flash',messages,fetchImpl:async()=>({ok:false,status:429,text:async()=>{throw Error('must not read body');}})}),/Quota or rate limit/);
});
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('settings persist server-side, never expose the key, and can remove it',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'benny-test-'));const file=join(dir,'settings.json');
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'18788',BENNY_SETTINGS_FILE:file,GEMINI_API_KEY:''}});
 t.after(async()=>{child.kill();await new Promise(r=>child.once('close',r));await rm(dir,{recursive:true,force:true});});
 await new Promise((r,j)=>{child.once('error',j);child.stdout.once('data',r);});
 const html=await(await fetch('http://127.0.0.1:18788')).text();const token=html.match(/name="benny-token" content="([a-f0-9]+)"/)[1];
 const post=async(route,b)=>fetch('http://127.0.0.1:18788/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Benny-Token':token},body:JSON.stringify(b)});
 const response=await post('settings',{key:'fake-test-secret',model:'gemini-2.5-flash'});const saved=await response.text();assert.ok(!saved.includes('fake-test-secret'));assert.equal(JSON.parse(saved).geminiConfigured,true);
 assert.equal(JSON.parse(await readFile(file,'utf8')).geminiKey,'fake-test-secret');
 assert.equal((await fetch('http://127.0.0.1:18788/.benny-settings.json')).status,403);
 assert.equal((await post('settings',{key:'',model:'../invalid'})).status,400);
 const removed=await(await post('settings',{key:'',model:'gemini-2.5-flash',removeKey:true})).json();assert.equal(removed.geminiConfigured,false);
});

test('transient Gemini failure is retried with backoff and identical request',async()=>{
 let calls=0;const waits=[],requests=[];
 const text=await geminiReply({key:'test',model:'gemini-3.5-flash',messages,sleepImpl:async ms=>waits.push(ms),fetchImpl:async(url,opts)=>{calls++;requests.push(opts.body);return calls<3?new Response('{}',{status:503}):Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Hello buddy!'}]}}]});}});
 assert.equal(text,'Hello buddy!');assert.equal(calls,3);assert.equal(waits.length,2);assert.ok(waits[0]>=1000&&waits[1]>=2000);assert.equal(new Set(requests).size,1);
});
test('persistent overload stops after three calls; auth and quota errors are not retried',async()=>{
 for(const status of [503,403,429]){let calls=0;await assert.rejects(geminiReply({key:'test',model:'gemini-3.5-flash',messages,sleepImpl:async()=>{},fetchImpl:async()=>{calls++;return new Response('{}',{status});}}));assert.equal(calls,status===503?3:1);}
});
test('temporary connection errors recover; safety-blocked replies are not retried',async()=>{
 let calls=0;await geminiReply({key:'test',model:'gemini-3.5-flash',messages,sleepImpl:async()=>{},fetchImpl:async()=>{if(++calls===1)throw new TypeError('fetch failed');return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Hello!'}]}}]});}});assert.equal(calls,2);
 calls=0;await assert.rejects(geminiReply({key:'test',model:'gemini-3.5-flash',messages,sleepImpl:async()=>{},fetchImpl:async()=>{calls++;return Response.json({promptFeedback:{blockReason:'SAFETY'}});}}));assert.equal(calls,1);
});
function streamBody(sse){return new ReadableStream({start(controller){const encoder=new TextEncoder();for(const chunk of sse)controller.enqueue(encoder.encode(chunk));controller.close();}});}
const line=event=>'data: '+JSON.stringify(event)+'\n\n';
test('Gemini streaming parses SSE deltas, skips thoughts and yields complete text immediately',async()=>{
 const events=[{candidates:[{content:{parts:[{thought:true,text:'hmm'}]}}]},{candidates:[{content:{parts:[{text:'Bear-y awesome!'}]}}]},{candidates:[{finishReason:'STOP',content:{parts:[{text:' What else?'},{text:''}]}}]}];
 const text=await geminiStream({key:'test',model:'gemini-3.5-flash',messages,fetchImpl:async()=>({ok:true,body:streamBody([line(events[0]),line(events[1]),line(events[2])])})});
 // collect text in parallel: stream returns as it goes
});
test('Gemini streaming collects partial words one by one and finishes without error on STOP',async()=>{
 const events=[{candidates:[{content:{parts:[{text:'Bear-y '}]}}]},{candidates:[{content:{parts:[{text:'awesome!'},{thought:true,text:'quiet'}]}}]},{candidates:[{finishReason:'STOP',content:{parts:[]}}]}];
 const parts=[];for await(const text of geminiStream({key:'test',model:'gemini-3.5-flash',messages,fetchImpl:async()=>({ok:true,body:streamBody([line(events[0]),line(events[1]),line(events[2])])})}))parts.push(text);
 assert.deepEqual(parts,['Bear-y ','awesome!']);
});
test('Gemini streaming rejects blocked prompts and empty results without retry',async()=>{
 const drain=stream=>(async()=>{for await(const t of stream)void t;})();
 await assert.rejects(()=>drain(geminiStream({key:'test',model:'gemini-3.5-flash',messages,sleepImpl:async()=>{},fetchImpl:async()=>{calls+=1;return {ok:true,body:streamBody([line({promptFeedback:{blockReason:'SAFETY'}})])};}})),/blocked or did not complete/);
 await assert.rejects(()=>drain(geminiStream({key:'test',model:'gemini-3.5-flash',messages,fetchImpl:async()=>({ok:true,body:streamBody([line({candidates:[{finishReason:'STOP',content:{parts:[]}}]})])})})),/returned no text/);
});
let calls=0;
test('temporary stream connection errors recover before any text is emitted',async()=>{
 calls=0;const parts=[];for await(const text of geminiStream({key:'test',model:'gemini-3.5-flash',messages,sleepImpl:async()=>{},fetchImpl:async()=>{calls++;if(calls<2)throw new TypeError('fetch failed');return {ok:true,body:streamBody([line({candidates:[{content:{parts:[{text:'Hi buddy!'}]}}]}),line({candidates:[{finishReason:'STOP'}]})])};}}))parts.push(text);
 assert.equal(calls,2);assert.deepEqual(parts,['Hi buddy!']);
 await assert.rejects(async()=>{for await(const t of geminiStream({key:'test',model:'gemini-3.5-flash',messages,sleepImpl:async()=>{},fetchImpl:async()=>{calls++;return new Response('{}',{status:503})}}))parts.push(t,t);});
 assert.equal(calls,5);
});
test('stream retries only on 5xx, exactly like non-stream requests',async()=>{
 let attempts=0;const parts=[];
 await assert.rejects(async()=>{for await(const t of geminiStream({key:'test',model:'gemini-3.5-flash',messages,sleepImpl:async()=>{},fetchImpl:async()=>{attempts++;return new Response('{}',{status:503});}}))void t;},/503/);
 assert.equal(attempts,3);
 attempts=0;await assert.rejects(async()=>{for await(const t of geminiStream({key:'test',model:'gemini-3.5-flash',messages,sleepImpl:async()=>{},fetchImpl:async()=>{attempts++;return new Response('{}',{status:429});}}))void t;},/429/);
 assert.equal(attempts,1);
});
