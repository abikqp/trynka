// Трынька: сервер столов (HTTP + WebSocket без внешних библиотек)
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const ANTE=10,MAXBET=160,SU=['♠','♥','♦','♣'],AV=['🙂','🧔','😎','🧑‍🚀','🦊','🐻','🎩','🤠'];
const P=new Map(),T=new Map();let nid=1;
const clean=s=>String(s||'').replace(/[<>&"'`\\]/g,'').trim().slice(0,16);
const DB=path.join(__dirname,'data.json');let store={};try{store=JSON.parse(fs.readFileSync(DB,'utf8'))}catch(e){}
let svT=0;const save=()=>{clearTimeout(svT);svT=setTimeout(()=>{try{fs.writeFileSync(DB,JSON.stringify(store))}catch(e){}},2000)};
const bal=pid=>{const b=store[pid]&&store[pid].b;return b>=ANTE?b:1000};
const setBal=(pid,v)=>{(store[pid]=store[pid]||{}).b=Math.max(0,Math.floor(v));save()};
const AVS=new Map(),h12=pid=>crypto.createHash('sha1').update(pid).digest('hex').slice(0,12);
const okUrl=u=>{try{const x=new URL(u);return x.protocol=='https:'&&(x.hostname=='t.me'||x.hostname.endsWith('.telesco.pe')||x.hostname.endsWith('.telegram.org'))}catch(e){return false}};
const avOf=p=>p.ai?`/av/${h12(p.pid)}?v=${p.ai}`:(p.au||p.ae||'');
const cl2=s=>String(s||'').replace(/[<>&"'`\\]/g,'').trim().slice(0,200);
function setAv(p,a){if(!a||typeof a!='object')return;
 if(typeof a.img=='string'&&/^data:image\/jpeg;base64,/.test(a.img)&&a.img.length<70000){if(AVS.size>400)AVS.delete(AVS.keys().next().value);AVS.set(h12(p.pid),Buffer.from(a.img.split(',')[1],'base64'));p.ai=(p.ai||0)+1;p.au='';p.ae=''}
 else if(typeof a.url=='string'&&okUrl(a.url)){p.ai=0;p.au=a.url;p.ae=''}
 else if(typeof a.e=='string'&&a.e){p.ai=0;p.au='';p.ae=clean(a.e)}
 const t=T.get(p.tid);if(t){const s=t.ps[seatOf(t,p.pid)];if(s){s.av=avOf(p)||s.av;push(t)}}}
const score=h=>{const r=h.map(c=>c.r);if(r.every(x=>x==6))return 36;if(r.every(x=>x==11))return 33;
 return Math.max(...SU.map(s=>h.filter(c=>c.s==s).reduce((a,c)=>a+c.r,0)))};
const nm=h=>{const s=score(h);return s==36?'три шестёрки':s==33?'три туза':s+' очк.'};
function deck(){const d=[];for(const s of SU)for(const r of [6,7,8,9,10,11])d.push({r,s});
 for(let i=d.length-1;i>0;i--){const j=crypto.randomInt(i+1);[d[i],d[j]]=[d[j],d[i]]}return d}

// ---- WebSocket (минимальная реализация) ----
function frame(str){const b=Buffer.from(str),n=b.length;let h;
 if(n<126)h=Buffer.from([0x81,n]);else if(n<65536){h=Buffer.alloc(4);h[0]=0x81;h[1]=126;h.writeUInt16BE(n,2)}
 else{h=Buffer.alloc(10);h[0]=0x81;h[1]=127;h.writeBigUInt64BE(BigInt(n),2)}return Buffer.concat([h,b])}
function onData(c,d){c.buf=Buffer.concat([c.buf,d]);
 for(;;){const b=c.buf;if(b.length<2)return;const op=b[0]&15,mk=b[1]&128;let len=b[1]&127,o=2;
  if(len==126){if(b.length<4)return;len=b.readUInt16BE(2);o=4}else if(len==127){if(b.length<10)return;len=Number(b.readBigUInt64BE(2));o=10}
  if(len>65536){c.sock.destroy();return}const end=o+(mk?4:0)+len;if(b.length<end)return;
  let p=b.subarray(o+(mk?4:0),end);if(mk){const k=b.subarray(o,o+4);p=Buffer.from(p.map((x,i)=>x^k[i&3]))}
  c.buf=b.subarray(end);
  if(op==8){c.sock.end();return}if(op==9)c.sock.write(Buffer.concat([Buffer.from([0x8a,p.length]),p]));else if(op==1)handle(c,p.toString())}}
const polls=new Map();
const out=(c,s)=>{if(c.poll){c.q.push(s);flush(c)}else c.sock.write(frame(s))};
const kill=c=>{try{if(c.poll){polls.delete(c.cid);if(c.res)c.res.end('[]')}else c.sock.destroy()}catch(e){}};
const send=(p,o)=>{if(p&&p.c)try{out(p.c,JSON.stringify(o))}catch(e){}};
// ---- запасной канал: HTTP long-poll (если WebSocket не проходит) ----
const jh={'Content-Type':'application/json','Cache-Control':'no-store'};
function flush(c){if(c.res&&c.q.length){clearTimeout(c.rt);const r=c.res;c.res=null;const a=c.q;c.q=[];r.writeHead(200,jh);r.end('['+a.join(',')+']')}}
function getPoll(cid){let c=polls.get(cid);if(!c){c={poll:true,cid,q:['{"t":"hello?"}'],res:null,p:null,last:0};polls.set(cid,c)}c.last=Date.now();return c}
function api(q,r){const u=new URL(q.url,'http://x'),cid=(u.searchParams.get('cid')||'').slice(0,80);if(cid.length<8){r.writeHead(400);return r.end()}
 const c=getPoll(cid);
 if(u.pathname=='/api/poll'){if(c.res){clearTimeout(c.rt);c.res.writeHead(200,jh);c.res.end('[]')}
  c.res=r;c.rt=setTimeout(()=>{if(c.res===r){c.res=null;r.writeHead(200,jh);r.end('[]')}},25000);
  r.on('close',()=>{if(c.res===r){c.res=null;clearTimeout(c.rt)}});flush(c)}
 else if(u.pathname=='/api/send'&&q.method=='POST'){let b='';q.on('data',d=>{b+=d;if(b.length>65536)q.destroy()});q.on('end',()=>{handle(c,b);r.writeHead(200,jh);r.end('{}')})}
 else{r.writeHead(404);r.end()}}
setInterval(()=>polls.forEach(c=>{if(Date.now()-c.last>60000){polls.delete(c.cid);drop(c)}}),10000);

// ---- столы ----
const lobbyList=()=>[...T.values()].map(t=>({id:t.id,name:t.name,n:t.ps.length,max:t.max,lock:!!t.pass,on:t.started}));
const pushLobby=()=>{const l={t:'lobby',tables:lobbyList()};P.forEach(p=>{if(!p.tid)send(p,l)})};
const seatOf=(t,pid)=>t.ps.findIndex(s=>s.pid==pid);
const alive=t=>t.ps.map((x,k)=>k).filter(k=>t.ps[k].in&&!t.ps[k].fold);
const cost=(t,s)=>s.blind?Math.ceil(t.bet/2):t.bet;
const pay=(t,s,a)=>{a=Math.min(a,s.chips);s.chips-=a;s.put+=a;t.bank+=a};
function view(t,pid){const n=t.ps.length,me=Math.max(0,seatOf(t,pid)),r=i=>(i-me+n)%n,ord=[...t.ps.keys()].sort((a,b)=>r(a)-r(b));
 return{t:'table',id:t.id,name:t.name,max:t.max,host:t.host==pid,started:t.started,end:!!t.end,rid:t.rid,over:t.over,bank:t.bank,bet:t.bet,
  turn:r(t.turn),sv:svv(t,pid),dl:t.over||t.sv?0:(t.dl||0),now:Date.now(),msg:t.msg,old:t.old,rev:t.rev.map(r),
  ps:ord.map(i=>{const s=t.ps[i],show=s.in&&(t.rev.includes(i)||t.over&&!s.fold);
   return{n:s.name,av:s.av,chips:s.chips,put:s.put,in:s.in,fold:s.fold,blind:s.blind,hand:i==me||show?s.hand:(s.in?[0,0,0]:[])}})}}
const push=t=>t.ps.forEach(s=>send(P.get(s.pid),view(t,s.pid)));
const TURN=20000;
const tick=t=>{clearTimeout(t.tm);t.dl=Date.now()+TURN;t.tm=setTimeout(()=>{const s=t.ps[t.turn];if(t.started&&!t.over&&!t.sv&&s)act(t,s,'fold')},TURN)};

function round(t){clearTimeout(t.tm);t.sv=null;t.ps=t.ps.filter(s=>!s.gone);const ps=t.ps,n=ps.length;
 ps.forEach(s=>{s.in=s.chips>=ANTE;s.fold=false;s.blind=true;s.hand=[];s.put=0});
 t.rev=[];t.rid++;t.old='';t.bank=0;const live=ps.filter(s=>s.in);
 if(live.length<2){t.over=true;t.end=true;t.msg=live.length?`${live[0].name} выиграл игру!`:'Игра окончена.';t.turn=0;return push(t)}
 const d=deck();live.forEach(s=>{s.hand=[d.pop(),d.pop(),d.pop()]});t.bet=ANTE;live.forEach(s=>pay(t,s,ANTE));
 t.first=(t.first+1)%n;while(!ps[t.first].in)t.first=(t.first+1)%n;t.turn=t.first;
 t.over=false;t.msg='Ставки сделаны, карты розданы.';tick(t);push(t);pushLobby()}
function finish(t,ws,hn){clearTimeout(t.tm);t.dl=0;const sh=Math.floor(t.bank/ws.length);
 ws.forEach((s,k)=>s.chips+=sh+(k==0?t.bank-sh*ws.length:0));t.over=true;t.overAt=Date.now();
 t.msg=ws.length>1?`Ничья (${hn}): банк ${t.bank} делят ${ws.map(s=>s.name).join(' и ')}.`:`${ws[0].name} забирает банк ${t.bank}${hn?` (${hn})`:''}.`;
 t.bank=0;t.ps.forEach(s=>{s.put=0;setBal(s.pid,s.chips)});push(t)}
function showdown(t,ids){const m=Math.max(...ids.map(i=>score(t.ps[i].hand)));const w=ids.filter(i=>score(t.ps[i].hand)==m).map(i=>t.ps[i]);finish(t,w,nm(w[0].hand))}
function act(t,s,a,amt){if(t.over||t.sv||t.ps[t.turn]!==s)return;const i=t.turn;t.old=t.msg;
 if(a=='call'){const c=cost(t,s);pay(t,s,c);t.msg=`${s.name} ставит ${c}`}
 else if(a=='raise'){const cap=s.blind?s.chips*2:s.chips;let n=Math.min(Math.floor(+amt)||0,cap);if(n<=t.bet||(n<t.bet+ANTE&&n<cap))return;t.bet=n;const c=cost(t,s);pay(t,s,c);t.msg=`${s.name} повышает до ${t.bet}`}
 else if(a=='fold'){s.fold=true;t.msg=`${s.name} пасует`}
 else if(a=='show'){const l=alive(t);if(l.length<2)return;const q=l[(l.indexOf(i)+l.length-1)%l.length],o=t.ps[q];if(o.blind)return;
  pay(t,s,cost(t,s));s.blind=false;t.rev.push(i,q);const lose=score(s.hand)>score(o.hand)?o:s;lose.fold=true;
  t.msg=`${s.name} вскрывает: ${o.name}. ${nm(s.hand)} против ${nm(o.hand)}, ${lose.name} выбывает.`}
 else return;
 const l=alive(t);if(l.length==1)return finish(t,[t.ps[l[0]]],t.rev.includes(l[0])?nm(t.ps[l[0]].hand):'');
 do{t.turn=(t.turn+1)%t.ps.length}while(!(t.ps[t.turn].in&&!t.ps[t.turn].fold));tick(t);push(t)}

// ---- свара ----
const isAlive=s=>s.in&&!s.fold;
const canJoin=(t,s)=>t.sv&&t.sv.ph=='join'&&!isAlive(s)&&!s.gone&&s.chips>=t.sv.half&&!t.sv.joined.has(s.pid);
function svv(t,pid){const v=t.sv,s=t.ps[seatOf(t,pid)];if(!v||!s)return null;let you='watch';
 if(s.pid==v.from)you='prop';else if(v.joined&&v.joined.has(s.pid))you='joined';else if(isAlive(s)&&v.ph=='vote')you=v.yes.has(s.pid)?'voted':'vote';else if(canJoin(t,s))you='join';
 return{ph:v.ph,from:(t.ps.find(x=>x.pid==v.from)||{}).name,half:v.half||Math.ceil(t.bank/Math.max(1,alive(t).length)),yes:v.yes.size,need:alive(t).length,you,bank:t.bank}}
function cancelSv(t,msg){if(!t.sv)return;clearTimeout(t.sv.tm);t.sv=null;t.svCool=Date.now()+15000;t.msg=msg;tick(t);push(t)}
function startJoin(t){const v=t.sv;clearTimeout(v.tm);v.ph='join';v.half=Math.ceil(t.bank/Math.max(1,alive(t).length));v.joined=new Set();
 if(!t.ps.some(s=>canJoin(t,s)))return dealSvara(t);t.msg='Все согласны на свару. Желающие могут войти за '+v.half;v.tm=setTimeout(()=>dealSvara(t),12000);push(t)}
function dealSvara(t){const v=t.sv;if(!v)return;clearTimeout(v.tm);const part=new Set([...alive(t).map(i=>t.ps[i].pid),...v.joined]);
 const d=deck(),ps=t.ps,n=ps.length;ps.forEach(s=>{const k=part.has(s.pid);s.in=k;s.fold=false;s.blind=true;s.put=0;s.hand=k?[d.pop(),d.pop(),d.pop()]:[]});
 t.sv=null;t.bet=ANTE;t.rev=[];t.rid++;t.old='';t.first=(t.first+1)%n;while(!ps[t.first].in)t.first=(t.first+1)%n;t.turn=t.first;
 t.msg=`Свара! В банке ${t.bank}. Новая раздача.`;tick(t);push(t)}
function sit(t,p){t.ps.push({pid:p.pid,name:p.name,chips:bal(p.pid),in:false,fold:false,blind:true,hand:[],put:0,av:avOf(p)||AV[t.ps.length%8]});p.tid=t.id}
function leave(t,p){if(t.sv)cancelSv(t,'Свара отменена');const i=seatOf(t,p.pid);p.tid=null;if(i<0)return;const s=t.ps[i],mid=t.started&&!t.over;setBal(s.pid,s.chips);
 if(mid){s.gone=1;if(s.in&&!s.fold){if(t.ps[t.turn]===s)act(t,s,'fold');else{s.fold=true;const l=alive(t);if(l.length==1)finish(t,[t.ps[l[0]]],'');else push(t)}}}
 else t.ps.splice(i,1);
 const rest=t.ps.filter(x=>!x.gone);
 if(!rest.length){clearTimeout(t.tm);T.delete(t.id)}else{if(!rest.some(x=>x.pid==t.host))t.host=rest[0].pid;push(t)}
 send(p,{t:'lobby',tables:lobbyList()});pushLobby()}

function handle(c,raw){let m;try{m=JSON.parse(raw)}catch(e){return}
 if(m.t=='hello'){console.log('hello');const pid=String(m.pid||'');if(pid.length<8||pid.length>60)return;let p=P.get(pid);if(!p){p={pid,name:'',tid:null};P.set(pid,p)}
  if(p.c&&p.c!==c)kill(p.c);p.c=c;c.p=p;p.name=clean(m.name)||p.name||'Игрок';if(!store[pid]&&+m.bal>=ANTE&&+m.bal<1e9)setBal(pid,+m.bal);if(m.av)setAv(p,m.av);
  const t=T.get(p.tid);if(t&&seatOf(t,pid)>=0)push(t);else{p.tid=null;send(p,{t:'lobby',tables:lobbyList()})}return}
 const p=c.p;if(!p)return;const t=T.get(p.tid);
 if(m.t=='av')return setAv(p,m.av);
 if(m.t=='create'&&!p.tid){if(T.size>200)return send(p,{t:'err',m:'Слишком много столов'});p.name=clean(m.nm)||p.name;
  const nt={id:String(nid++),name:clean(m.name)||'Стол',pass:String(m.pass||'').slice(0,16),max:Math.min(8,Math.max(2,+m.max|0||4)),ps:[],started:false,
   bet:ANTE,bank:0,turn:0,first:-1,over:true,rev:[],msg:'',old:'',rid:0,host:p.pid};
  T.set(nt.id,nt);sit(nt,p);push(nt);pushLobby();return}
 if(m.t=='join'&&!p.tid){const jt=T.get(String(m.id));if(!jt)return send(p,{t:'err',m:'Стол не найден'});
  if(jt.pass&&jt.pass!==String(m.pass||''))return send(p,{t:'err',m:'Неверный пароль'});
  if(jt.ps.filter(s=>!s.gone).length>=jt.max)return send(p,{t:'err',m:'Стол заполнен'});
  p.name=clean(m.nm)||p.name;sit(jt,p);push(jt);send(p,{t:'chats',list:jt.chat||[]});pushLobby();return}
 if(!t)return;
 if(m.t=='leave')return leave(t,p);
 if(m.t=='start'){if(!t.started&&t.host!==p.pid)return;if(t.started&&!t.end)return;
  if(t.ps.filter(s=>!s.gone).length<2)return send(p,{t:'err',m:'Нужно минимум 2 игрока'});
  if(t.end)t.ps.forEach(s=>{if(s.chips<ANTE)s.chips=1000;setBal(s.pid,s.chips)});t.started=true;t.end=false;t.first=-1;return round(t)}
 if(m.t=='next'){if(t.started&&t.over&&!t.end&&Date.now()-t.overAt>2000)round(t);return}
 if(m.t=='look'){const s=t.ps[seatOf(t,p.pid)];if(s&&s.in&&!s.fold&&!t.over&&s.blind){s.blind=false;push(t)}return}
 if(m.t=='svara'){const s=t.ps[seatOf(t,p.pid)];if(!s||!t.started||t.over||t.sv||!isAlive(s)||alive(t).length<2)return;
  if(Date.now()<(t.svCool||0))return send(p,{t:'err',m:'Подождите немного перед новой сварой'});
  clearTimeout(t.tm);t.dl=0;t.sv={ph:'vote',from:p.pid,yes:new Set([p.pid]),tm:setTimeout(()=>t.sv&&t.sv.ph=='vote'&&cancelSv(t,'Свара не состоялась: нет ответа'),20000)};
  t.msg=`${s.name} предлагает свару`;push(t);return}
 if(m.t=='svar'){const v=t.sv,s=t.ps[seatOf(t,p.pid)];if(!v||v.ph!='vote'||!s||!isAlive(s))return;
  if(!m.ok)return cancelSv(t,s.pid==v.from?'Свара отменена':`${s.name} против свары`);
  v.yes.add(s.pid);if(alive(t).every(i=>v.yes.has(t.ps[i].pid)))startJoin(t);else push(t);return}
 if(m.t=='sjoin'){const v=t.sv,s=t.ps[seatOf(t,p.pid)];if(!s||!canJoin(t,s))return;pay(t,s,v.half);v.joined.add(s.pid);
  t.msg=`${s.name} входит в свару за ${v.half}`;push(t);if(!t.ps.some(x=>canJoin(t,x)))dealSvara(t);return}
 if(m.t=='chat'){const tx=cl2(m.text);if(!tx||Date.now()-(p.lc||0)<500)return;p.lc=Date.now();t.chat=t.chat||[];t.chat.push({n:p.name,tx});if(t.chat.length>40)t.chat.shift();
  t.ps.forEach(s=>send(P.get(s.pid),{t:'chat',n:p.name,tx}));return}
 if(m.t=='act')act(t,t.ps[seatOf(t,p.pid)],String(m.a),m.amt)}
function drop(c){const p=c.p;if(!p||p.c!==c)return;p.c=null;
 setTimeout(()=>{if(!p.c){const t=T.get(p.tid);if(t)leave(t,p);P.delete(p.pid)}},45000)}

const page=path.join(__dirname,'index.html');
const srv=http.createServer((q,r)=>{if(q.url.startsWith('/api/'))return api(q,r);
 if(q.url.startsWith('/av/')){const b=AVS.get(q.url.slice(4).split('?')[0]);if(!b){r.writeHead(404);return r.end()}r.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=86400'});return r.end(b)}if(q.url=='/'||q.url.startsWith('/?')||q.url=='/index.html'){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});r.end(fs.readFileSync(page))}
 else if(q.url=='/health')r.end('ok');else{r.writeHead(404);r.end('not found')}});
srv.on('upgrade',(q,sock)=>{console.log('ws upgrade',q.url);if(q.url!='/ws'||!q.headers['sec-websocket-key'])return sock.destroy();
 const a=crypto.createHash('sha1').update(q.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
 sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+a+'\r\n\r\n');
 const c={sock,buf:Buffer.alloc(0),p:null};sock.on('data',d=>onData(c,d));sock.on('close',()=>drop(c));sock.on('error',()=>{})});
srv.listen(process.env.PORT||3000,()=>console.log('Трынька: порт',process.env.PORT||3000));
