import {createInterface} from 'node:readline';
const lines=createInterface({input:process.stdin});
for await(const line of lines){const {id,text}=JSON.parse(line);console.log(JSON.stringify({id,audio:Buffer.from(text).toString('base64')}));}
