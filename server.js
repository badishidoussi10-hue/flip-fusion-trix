'use strict';
// Flip Fusion relay — Node.js 18+, zero external dependencies.
// Host remains the game authority; relay manages seats, resume tokens and events.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PORT = Number(process.env.PORT || 8787);
const rooms = new Map();
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SEAT_NAMES=['Host','Nova','Milo','Luna','Kira','Axel','Zara','Neo'];
const now = () => Date.now();
const token = () => crypto.randomBytes(24).toString('hex');
function makeCode(){ let c; do {c=Array.from(crypto.randomBytes(8), b=>ALPHABET[b%ALPHABET.length]).join('')}while(rooms.has(c));return c;}
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});res.end(JSON.stringify(body));}
function roster(room){return room.seats.map((s,i)=>s?{name:s.name,connected:!!s.online,bot:!s.online,reserved:true,slot:i}:{name:SEAT_NAMES[i]||'IA '+(i+1),connected:false,bot:true,reserved:false,slot:i});}
function emit(seat,event){if(!seat?.streams)return;const data='data: '+JSON.stringify(event)+'\n\n';for(const stream of [...seat.streams]){try{stream.write(data)}catch{seat.streams.delete(stream)}}}
function broadcast(room,event,skip=-1){room.seats.forEach((s,i)=>{if(i!==skip)emit(s,event)});}
function announceRoster(room){broadcast(room,{type:'roster',roster:roster(room),mode:room.mode,settings:room.settings,code:room.code});}
function auth(code, key){const room=rooms.get(String(code||'').toUpperCase());if(!room)return null;const slot=room.seats.findIndex(s=>s?.token===key);if(slot<0)return null;room.access=now();return {room,seat:room.seats[slot],slot};}
function payload(req,limit=180000){return new Promise((resolve,reject)=>{let data='';req.on('data',chunk=>{data+=chunk;if(data.length>limit){reject(Error('Requête trop grande'));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(data||'{}'))}catch{reject(Error('JSON invalide'))}});req.on('error',reject)})}
function goodName(n){return String(n||'Joueur').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,18)||'Joueur'}
function connected(room){return room.seats.filter(s=>s?.online).length}
async function route(req,res){
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});res.end();return}
 const url = new URL(req.url,'http://localhost');
 if(req.method==='GET'){
   const htmlRoutes={
     '/':'index.html', '/index.html':'index.html',
     '/flip':'flip-fusion.html', '/flip-fusion.html':'flip-fusion.html',
     '/trix':'trix.html', '/trix.html':'trix.html'
   };
   const file=htmlRoutes[url.pathname];
   if(file){fs.readFile(path.join(__dirname,file),(err,bytes)=>{
     if(err){json(res,500,{error:'Game page not found',file});return}
     res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
     res.end(bytes);
   });return}
   if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return}
 }
 if(req.method==='GET'&&url.pathname==='/api/health'){
   json(res,200,{ok:true,version:13,suite:'Flip Fusion + TRIX',games:['flip-fusion','trix'],rooms:rooms.size});return
 }
 if(req.method==='GET'&&url.pathname==='/api/events'){
   const authd=auth(url.searchParams.get('code'),url.searchParams.get('token'));if(!authd){json(res,403,{error:'Session non reconnue'});return}
   const {room,seat,slot}=authd;res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','Access-Control-Allow-Origin':'*','X-Accel-Buffering':'no'});
   res.write(': connected\n\n');seat.streams.add(res);seat.online=true;seat.offlineAt=null;seat.lastSeen=now();
   emit(seat,{type:'resume',slot,code:room.code,mode:room.mode,settings:room.settings,roster:roster(room),state:room.snapshot,roundSummary:room.summary,chat:room.chat,pendingPrompt:seat.pendingPrompt||null,active:room.started});announceRoster(room);
   req.on('close',()=>{seat.streams.delete(res);if(!seat.streams.size){seat.lastSeen=now();seat.offlineAt=now()}});
   return;
 }
 if(req.method!=='POST'||!url.pathname.startsWith('/api/')){json(res,404,{error:'Introuvable'});return}
 let data;try{data=await payload(req)}catch(e){json(res,400,{error:e.message});return}
 if(url.pathname==='/api/create'){
   const code=makeCode(),key=token();let setting=data.settings||{};
   const mode=['fusion','classic','revenge'].includes(data.mode)?data.mode:'fusion';
   const settings={speed:['instant','rapide','normale','lente'].includes(setting.speed)?setting.speed:'rapide',difficulty:['facile','moyen','difficile'].includes(setting.difficulty)?setting.difficulty:'moyen',target:[100,200,300,500].includes(Number(setting.target))?Number(setting.target):200,players:Number.isInteger(Number(setting.players))&&Number(setting.players)>=2&&Number(setting.players)<=8?Number(setting.players):4};
   const host={name:goodName(data.nickname),token:key,online:true,lastSeen:now(),streams:new Set()};
   const room={code,mode,settings,seats:Array.from({length:settings.players},(_,i)=>i===0?host:null),started:false,snapshot:null,summary:null,chat:[],chatSeq:0,kickedTokens:new Set(),access:now()};rooms.set(code,room);
   json(res,200,{code,token:key,slot:0,mode,settings,roster:roster(room)});return;
 }
 if(url.pathname==='/api/join'){
   const code=String(data.code||'').toUpperCase(),room=rooms.get(code);if(!room){json(res,404,{error:'Salle introuvable. Vérifie le code.'});return}
   const prior=room.seats.findIndex(s=>s?.token===data.token && typeof data.token==='string' && data.token.length>20);
   if(prior>=0){
     const seat=room.seats[prior], wasOffline=!seat.online||!!seat.offlineAt;
     const newKey=token();
     for(const stream of [...seat.streams]){try{stream.write('data: '+JSON.stringify({type:'sessionReplaced'})+'\n\n');stream.end()}catch{}}
     seat.streams.clear();seat.token=newKey;seat.online=true;seat.lastSeen=now();seat.offlineAt=null;
     json(res,200,{code,token:newKey,slot:prior,mode:room.mode,settings:room.settings,roster:roster(room),state:room.snapshot,active:room.started,reclaimed:wasOffline});
     announceRoster(room);return;
   }
   if(typeof data.token==='string' && room.kickedTokens.has(data.token)){json(res,403,{error:'You were removed from this room by the host.'});return}
   if(room.started){json(res,409,{error:'Partie déjà commencée : reconnexion réservée aux participants.'});return}
   const free=room.seats.findIndex((s,i)=>i>0&&!s);if(free<0){json(res,409,{error:'Salle complète ('+room.settings.players+' joueurs).'});return}
   const key=token();room.seats[free]={name:goodName(data.nickname),token:key,online:true,lastSeen:now(),streams:new Set()};room.access=now();
   json(res,200,{code,token:key,slot:free,mode:room.mode,settings:room.settings,roster:roster(room),state:room.snapshot});announceRoster(room);return;
 }
 const found=auth(data.code,data.token);if(!found){json(res,403,{error:'Session expirée ou code invalide.'});return}
 const {room,seat,slot}=found;seat.lastSeen=now();seat.offlineAt=null;
 if(url.pathname==='/api/heartbeat'){if(!seat.online){seat.online=true;announceRoster(room)}json(res,200,{ok:true});return}
 if(url.pathname==='/api/kick'){
   if(slot!==0){json(res,403,{error:'Only the room host can remove players.'});return}
   const target=Number(data.targetSlot);
   if(!Number.isInteger(target)||target<=0||target>=room.seats.length||!room.seats[target]){json(res,400,{error:'Select a connected guest to remove.'});return}
   const expelled=room.seats[target];
   room.kickedTokens.add(expelled.token);
   const label=expelled.name;
   emit(expelled,{type:'kicked',message:'The host removed you from this room.'});
   for(const stream of [...expelled.streams]){try{stream.end()}catch{}}
   expelled.streams.clear();
   room.seats[target]=null; // Keeps this position as a bot during an active match.
   broadcast(room,{type:'playerRemoved',slot:target,name:label});
   announceRoster(room);json(res,200,{ok:true,slot:target,name:label});return;
 }
 if(url.pathname==='/api/leave'){
   if(slot===0){broadcast(room,{type:'closed',message:'L’hôte a fermé la salle.'});rooms.delete(room.code)}
   else{room.seats[slot]=null;broadcast(room,{type:'left',slot});announceRoster(room)}
   json(res,200,{ok:true});return;
 }
 if(url.pathname==='/api/chat-history'){
   const since=Number(data.since)||0;
   const messages=room.chat.filter(item=>item.id>since);
   json(res,200,{ok:true,messages,last:room.chatSeq||0});return;
 }
 if(url.pathname==='/api/send'){
   const event=data.data;
   if(event && event.type==='chat'){
     const message=String(event.text||'').trim().slice(0,240);
     if(!message){json(res,400,{error:'Empty chat message'});return}
     const nonce=String(event.nonce||'').trim().slice(0,72);
     // Retrying a message never duplicates it on the table.
     const existing=nonce&&room.chat.find(x=>x.fromSlot===slot&&x.nonce===nonce);
     if(existing){json(res,200,{ok:true,message:existing,duplicate:true});return}
     if((seat.lastChat||0)+480>now()){json(res,429,{error:'Slow down'});return}
     seat.lastChat=now();
     const item={type:'chat',id:++room.chatSeq,nonce,fromSlot:slot,name:seat.name,text:message,time:now()};
     room.chat.push(item);if(room.chat.length>60)room.chat.shift();broadcast(room,item);
     json(res,200,{ok:true,message:item});return;
   }
   if(event && event.type==='voice'){
     const target=Number(data.targetSlot);
     if(!Number.isInteger(target)||target===slot||target<0||target>=room.seats.length||!room.seats[target]?.online){json(res,400,{error:'Voice recipient unavailable'});return}
     const signal=event.signal;
     if(!signal||!['ready','off','offer','answer','ice'].includes(signal.kind)||JSON.stringify(signal).length>13000){json(res,400,{error:'Invalid voice signal'});return}
     emit(room.seats[target],{type:'voice',fromSlot:slot,signal});json(res,200,{ok:true});return;
   }
if(!event||typeof event!=='object'||typeof event.type!=='string'){json(res,400,{error:'Message invalide'});return}
   if(slot===0){
     if(!['sync','roundSummary','prompt'].includes(event.type)){json(res,400,{error:'Action hôte non autorisée'});return}
     if(event.type==='sync'){
       if(!event.state||!['play','roundEnd','over'].includes(event.state.phase)){json(res,400,{error:'État invalide'});return}
       room.snapshot=event.state;room.started=true;room.summary=null;
     }
     if(event.type==='roundSummary')room.summary=event.html;
     if(event.type==='prompt'){
       const target=Number(data.targetSlot);if(!Number.isInteger(target)||target<1||target>=room.seats.length||!room.seats[target]){json(res,400,{error:'Cible absente'});return}
       room.seats[target].pendingPrompt=event;emit(room.seats[target],{type:'message',fromSlot:0,payload:event});
     }else broadcast(room,{type:'message',fromSlot:0,payload:event},0);
   }else{
     if(!['turn','choice'].includes(event.type)){json(res,403,{error:'Action invitée interdite'});return}
     const snap=room.snapshot;
     if(event.type==='turn'&&(!snap||snap.waitingFor!==slot||snap.turnToken!==event.token)){json(res,409,{error:'Tour non actif'});return}
     if(event.type==='choice')seat.pendingPrompt=null;emit(room.seats[0],{type:'message',fromSlot:slot,payload:event});
   }
   json(res,200,{ok:true});return;
 }
 json(res,404,{error:'Route introuvable'});
}
const server=http.createServer((req,res)=>route(req,res).catch(e=>{console.error(e);if(!res.headersSent)json(res,500,{error:'Server error'});else try{res.end()}catch{}}));
server.listen(PORT,'0.0.0.0',()=>console.log('FLIP FUSION + TRIX available on http://localhost:'+PORT));
setInterval(()=>{
 for(const [code,room] of rooms){
  if(now()-room.access>3*60*60*1000){broadcast(room,{type:'closed',message:'Salle expirée.'});rooms.delete(code);continue}
  let changed=false;
  room.seats.forEach((seat,i)=>{if(!seat||!seat.online)return;
   const offline=(seat.streams.size===0&&seat.offlineAt&&now()-seat.offlineAt>25000)||(now()-seat.lastSeen>55000);
   if(offline){seat.online=false;seat.pendingPrompt=null;changed=true;broadcast(room,{type:'left',slot:i});}
  });if(changed)announceRoster(room);
 }
},5000).unref();
