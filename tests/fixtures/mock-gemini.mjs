const actualFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(!String(url).startsWith('https://generativelanguage.googleapis.com/'))return actualFetch(url,options);
 const body=JSON.parse(options.body),text=body.contents.at(-1).parts[0].text;
 if(text==='simulate quota')return new Response('{}',{status:429});
 if(text==='simulate blocked')return Response.json({promptFeedback:{blockReason:'SAFETY'}});
 if(!body.systemInstruction.parts[0].text.includes('PERSONALITY:'))throw Error('Missing original prompt');
 return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Bear-y awesome! What do you enjoy about '+text+'?'}]}}]});
};
