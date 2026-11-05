import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceClient} from '../voice-client.mjs';
import {prompt} from '../dialogue.mjs';
test('voice process is reused and concurrent replies retain their IDs',async t=>{
 const client=new VoiceClient(process.execPath,['tests/fixtures/mock-voice.mjs'],{cwd:new URL('..',import.meta.url)});t.after(()=>client.stop());
 client.start();const child=client.child;
 const replies=await Promise.all([client.speak('first'),client.speak('second')]);
 assert.deepEqual(replies.map(b=>b.toString()),['first','second']);assert.equal(client.child,child);
 assert.equal((await client.speak('third')).toString(),'third');assert.equal(client.child,child);
});
test('voice stop rejects pending requests and releases the process',async()=>{
 const client=new VoiceClient(process.execPath,['tests/fixtures/mock-voice.mjs'],{cwd:new URL('..',import.meta.url)});
 const pending=client.speak('hello');client.stop();await assert.rejects(pending,/stopped/);assert.equal(client.child,null);
});
test('healthy habits are age-appropriate, inclusive and occasional',()=>{
 for(const text of ['ages 5-11','drinking water','getting enough sleep','washing hands','teamwork','fair play','seated movement','Do not turn every reply into a PE lesson'])assert.ok(prompt.includes(text));
});
