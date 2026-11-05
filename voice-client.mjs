import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
export class VoiceClient {
 constructor(command,args,options={}){this.command=command;this.args=args;this.options=options;this.pending=new Map();this.next=0;this.child=null;}
 start(){if(this.child)return;const child=spawn(this.command,this.args,{...this.options,stdio:['pipe','pipe','pipe']});this.child=child;child.stderr.resume();
 const lines=createInterface({input:child.stdout});lines.on('line',line=>{let data;try{data=JSON.parse(line);}catch{return;}const p=this.pending.get(data.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(data.id);data.error?p.reject(Error('Voice synthesis failed.')):p.resolve(Buffer.from(data.audio,'base64'));});
 const fail=()=>{if(this.child!==child)return;this.child=null;lines.close();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Voice worker unavailable.'));}this.pending.clear();};child.on('error',fail);child.on('close',fail);child.stdin.on('error',fail);
 }
 speak(text){this.start();return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>{this.stop();},60000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,text})+'\n');});}
 stop(){const child=this.child;this.child=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Voice worker stopped.'));}this.pending.clear();child?.kill();}
}
