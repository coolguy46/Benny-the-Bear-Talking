import {setTimeout as delay} from 'node:timers/promises';
const retryStatuses=[500,502,503,504],categories=['HARM_CATEGORY_HARASSMENT','HARM_CATEGORY_HATE_SPEECH','HARM_CATEGORY_SEXUALLY_EXPLICIT','HARM_CATEGORY_DANGEROUS_CONTENT'];
const descriptions={400:'Check the key and model name.',401:'API key rejected.',403:'API access denied. Check the key and project permissions.',404:'Model not available. Change the model name.',429:'Quota or rate limit reached.',500:'Google had a temporary problem after automatic retries. Please try again shortly.',502:'Google is temporarily unavailable after automatic retries. Please try again shortly.',503:'Google is temporarily busy after automatic retries. Please try again shortly.',504:'Google did not respond after automatic retries. Please try again shortly.'};
function payload(messages){return {systemInstruction:{parts:[{text:messages[0].content}]},contents:messages.slice(1).map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{temperature:0.6,maxOutputTokens:350,thinkingConfig:{thinkingBudget:0}},safetySettings:categories.map(category=>({category,threshold:'BLOCK_LOW_AND_ABOVE'}))};}
function base(message){return message.startsWith('Gemini')||message.startsWith('Add a Gemini')?message:null;}
export function geminiError(e){return e.name==='TimeoutError'?'Gemini timed out. Please retry.':base(e.message)||'Gemini connection failed. Please retry.';}
async function connect({key,model,messages,fetchImpl=fetch,sleepImpl=delay,url}){
 if(!key)throw Error('Add a Gemini API key in Gemini settings.');
 if(!/^[a-zA-Z0-9._-]+$/.test(model))throw Error('Invalid Gemini model name.');
 const deadline=Date.now()+45000;
 let response;
 for(let attempt=0;attempt<3;attempt++){
  try{response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(payload(messages)),signal:AbortSignal.timeout(Math.max(1,deadline-Date.now()))});}
  catch(e){
  if(attempt===2||Date.now()>=deadline||e.name==='TimeoutError'||!(e instanceof TypeError))throw e;
  await sleepImpl(Math.min(1000*2**attempt+Math.floor(Math.random()*250),Math.max(0,deadline-Date.now())));continue;
  }
  if(!retryStatuses.includes(response.status)||attempt===2)break;
  await response.body?.cancel();
  const remaining=deadline-Date.now();if(remaining<=0)throw new DOMException('Gemini timed out','TimeoutError');
  const retryAfter=response.headers?.get?.('retry-after');
  const seconds=Number(retryAfter);
  const serverDelay=retryAfter?(Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(retryAfter)-Date.now())):0;
  const wait=Math.max(1000*2**attempt+Math.floor(Math.random()*250),Number.isFinite(serverDelay)?serverDelay:0);
  if(wait>=remaining)break;
  await sleepImpl(wait);
 }
 // Do not surface provider error bodies: they can contain request details.
 if(!response.ok)throw Error(`Gemini ${response.status}: ${descriptions[response.status]||'Service unavailable. Try again later.'}`);
 return response;
}
export async function geminiReply({key,model,messages,fetchImpl=fetch,sleepImpl=delay}){
 const response=await connect({key,model,messages,fetchImpl,sleepImpl,url:`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`});
 const data=await response.json(),candidate=data.candidates?.[0];
 if(data.promptFeedback?.blockReason||candidate?.finishReason!=='STOP'||candidate?.safetyRatings?.some(r=>r.blocked))throw Error('Gemini blocked or did not complete the reply.');
 const text=candidate.content?.parts?.filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('').trim();
 if(!text)throw Error('Gemini returned no text.');return text;
}
export async function* geminiStream({key,model,messages,fetchImpl=fetch,sleepImpl=delay}){
 const response=await connect({key,model,messages,fetchImpl,sleepImpl,url:`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`});
 const reader=response.body.getReader(),decoder=new TextDecoder();
 let buffer='',finish=null,emitted=false;
 for(;;){
  const {done,value}=await reader.read();
  if(done)break;
  buffer+=decoder.decode(value,{stream:true});
  for(;;){
  const i=buffer.indexOf('\n');
  if(i<0)break;
  const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);
  if(!line.startsWith('data:'))continue;
  let data;try{data=JSON.parse(line.slice(5));}catch{continue;}
  if(data.promptFeedback?.blockReason)throw Error('Gemini blocked or did not complete the reply.');
  const candidate=data.candidates?.[0];
  if(candidate?.finishReason)finish=candidate.finishReason;
  for(const part of candidate?.content?.parts||[])if(!part.thought&&typeof part.text==='string'&&part.text){emitted=true;yield part.text;}
  }
 }
 if(!emitted)throw Error(finish&&finish!=='STOP'?'Gemini blocked or did not complete the reply.':'Gemini returned no text.');
}
