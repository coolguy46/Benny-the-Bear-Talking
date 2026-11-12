const actualFetch=globalThis.fetch;
const sse=(obj)=>'\ndata: '+JSON.stringify(obj)+'\n\n';
function streamResponse(events){
 return new Response(new ReadableStream({start(controller){
 const encoder=new TextEncoder();
 for(const event of events)controller.enqueue(encoder.encode(sse(event)));
 controller.close();}}),{headers:{'content-type':'text/event-stream'}});
}
globalThis.fetch=async(url,options)=>{
 if(!String(url).startsWith('https://generativelanguage.googleapis.com/'))return actualFetch(url,options);
 const body=JSON.parse(options.body),text=body.contents.at(-1).parts[0].text;
 if(String(url).includes(':streamGenerateContent')){
 if(text==='simulate quota')return new Response('{}',{status:429});
 if(text==='simulate blocked')return streamResponse([{promptFeedback:{blockReason:'SAFETY'}}]);
 if(!body.systemInstruction.parts[0].text.includes('PERSONALITY:'))throw Error('Missing original prompt');
 return streamResponse([{candidates:[{content:{parts:[{text:'Bear-y awesome!'}]}}]},{candidates:[{finishReason:'STOP',content:{parts:[{text:' What do you enjoy about '+text+'?'}]}}]}]);
 }
 if(text==='simulate quota')return new Response('{}',{status:429});
 if(text==='simulate blocked')return Response.json({promptFeedback:{blockReason:'SAFETY'}});
 if(!body.systemInstruction.parts[0].text.includes('PERSONALITY:'))throw Error('Missing original prompt');
 return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Bear-y awesome! What do you enjoy about '+text+'?'}]}}]});
};
