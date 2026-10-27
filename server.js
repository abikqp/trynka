// Трынька: сервер столов (HTTP + WebSocket без внешних библиотек)
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const ANTE=10,MAXBET=160,SU=['♠','♥','♦','♣'],AV=['🙂','🧔','😎','🧑‍🚀','🦊','🐻','🎩','🤠'];
const P=new Map(),T=new Map();let nid=1;
const clean=s=>String(s||'').replace(/[<>&"'`\\]/g,'').trim().slice(0,16);
const DB=path.join(__dirname,'data.json');let store={};try{store=JSON.parse(fs.readFileSync(DB,'utf8'))}catch(e){}
let svT=0;const save=()=>{clearTimeout(svT);svT=setTimeout(()=>{try{fs.writeFileSync(DB,JSON.stringify(store))}catch(e){}},2000)};
const bal=pid=>{const b=store[pid]&&store[pid].b;return b>0?b:1000};
const setBal=(pid,v)=>{const o=store[pid]=store[pid]||{};o.b=Math.max(0,Math.floor(v));const st=o.st=o.st||{};if(o.b>(st.mx||0))st.mx=o.b;save()};
const stat=(pid,k,n=1)=>{const o=store[pid]=store[pid]||{},st=o.st=o.st||{};st[k]=(st[k]||0)+n;save()};
const statMax=(pid,k,v)=>{const o=store[pid]=store[pid]||{},st=o.st=o.st||{};if(v>(st[k]||0)){st[k]=v;save()}};
const bonusLeft=pid=>Math.max(0,((store[pid]&&store[pid].bn)||0)+86400000-Date.now());
const ICE=(()=>{const l=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}];
 if(process.env.TURN_URL)l.push({urls:process.env.TURN_URL.split(','),username:process.env.TURN_USER||'',credential:process.env.TURN_PASS||''});return l})();
const meMsg=p=>({t:'me',ice:ICE,bal:bal(p.pid),st:(store[p.pid]&&store[p.pid].st)||{},bonus:bonusLeft(p.pid),name:p.name,bk:mkBk(p.pid),ks:!!process.env.SECRET});
// ---- подписанная копия баланса и статистики (восстановление после сброса сервера) ----
const SECRET=process.env.SECRET||(console.log('ВНИМАНИЕ: переменная SECRET не задана, копии не переживут перезапуск'),crypto.randomBytes(32).toString('hex'));
const sig=(pid,d)=>crypto.createHmac('sha256',SECRET).update(pid+'|'+d).digest('hex');
const mkBk=pid=>{const o=store[pid]||{},d=JSON.stringify({b:bal(pid),st:o.st||{},bn:o.bn||0});return{d,s:sig(pid,d)}};
function restore(pid,bk){const o0=store[pid];if(o0&&(o0.b!=null||o0.st)||!bk||typeof bk.d!='string'||typeof bk.s!='string')return;
 const ok=sig(pid,bk.d);if(ok.length!=bk.s.length||!crypto.timingSafeEqual(Buffer.from(ok),Buffer.from(bk.s)))return;
 try{const d=JSON.parse(bk.d),o=store[pid]=store[pid]||{};if(d.b>=0&&d.b<1e9)o.b=Math.floor(d.b);o.st={};
  for(const k of ['g','w','sv','svw','big','mx','aaa','s666','sp','p21','a109'])if(d.st&&d.st[k]>0&&d.st[k]<1e9)o.st[k]=Math.floor(d.st[k]);if(d.st&&Math.abs(d.st.net)<1e9)o.st.net=Math.floor(d.st.net)||0;if(d.bn>0)o.bn=d.bn;save()}catch(e){}}

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
const lobbyList=()=>[...T.values()].map(t=>({id:t.id,name:t.name,n:t.ps.length,max:t.max,lock:!!t.pass,on:t.started,ante:t.ante}));
const pushLobby=()=>{const l={t:'lobby',tables:lobbyList()};P.forEach(p=>{if(!p.tid)send(p,l)})};
const seatOf=(t,pid)=>t.ps.findIndex(s=>s.pid==pid);
const alive=t=>t.ps.map((x,k)=>k).filter(k=>t.ps[k].in&&!t.ps[k].fold);
const cost=(t,s)=>s.blind?Math.ceil(t.bet/2):t.bet;
const pay=(t,s,a)=>{a=Math.min(a,s.chips);s.chips-=a;s.put+=a;s.cb=(s.cb||0)+a;t.bank+=a};
function view(t,pid){const n=t.ps.length,me=Math.max(0,seatOf(t,pid)),r=i=>(i-me+n)%n,ord=[...t.ps.keys()].sort((a,b)=>r(a)-r(b));
 const vis=[...new Set([...t.rev,...(t.priv||[]).filter(p=>p.includes(me)).flat()])];
 return{t:'table',ante:t.ante,cut:t.cut?t.cut.cards.map(x=>({n:x.name,c:x.c,w:t.cut.top.includes(x.pid)})):null,cutn:t.cut?t.cut.note:'',dk:t.dk&&t.ps[t.dk.i]?{who:t.ps[t.dk.i].name,you:t.ps[t.dk.i].pid==pid}:null,sw:t.swept||0,pile:t.bank-t.ps.reduce((a,x)=>a+(x.cb||0),0),id:t.id,name:t.name,max:t.max,host:t.host==pid,started:t.started,end:!!t.end,rid:t.rid,over:t.over,bank:t.bank,bet:t.bet,
  turn:r(t.turn),sv:svv(t,pid),dl:t.over||t.sv||t.pick||t.tie||t.sp?0:(t.dl||0),pk:pickvw(t,pid),now:Date.now(),msg:t.msg,old:t.old,rev:vis.map(r),
  ai:t.ai&&alive(t).length==2?{who:(t.ps.find(x=>x.pid==t.ai)||{}).name,you:pid!=t.ai&&!!t.ps[me]&&isAlive(t.ps[me])}:null,
  sp:t.sp?{from:(t.ps.find(x=>x.pid==t.sp.from)||{}).name,you:t.sp.to==pid}:null,ti:t.tie?{you:t.tie.pids.includes(pid),voted:!!t.tie.ch[pid]}:null,
  ps:ord.map(i=>{const s=t.ps[i],show=s.in&&(vis.includes(i)||t.over&&!s.fold);
   return{n:s.name,av:s.av,chips:s.chips,put:s.put,cb:s.cb||0,in:s.in,fold:s.fold,blind:s.blind,dark:!!s.dark,sid:s.sid,vc:!!s.vc,hand:(i==me||show)?s.hand:(s.in?[0,0,0]:[])}})}}
const push=t=>t.ps.forEach(s=>send(P.get(s.pid),view(t,s.pid)));
const TURN=20000;
const tick=t=>{clearTimeout(t.tm);t.dl=Date.now()+TURN;t.tm=setTimeout(()=>{const s=t.ps[t.turn];if(t.started&&!t.over&&!t.sv&&s)act(t,s,'fold')},TURN)};

function round(t){clearTimeout(t.tm);t.sv=null;t.sva=0;t.ps=t.ps.filter(s=>!s.gone);const ps=t.ps,n=ps.length;
 t.cut=null;ps.forEach(s=>{s.c0=s.chips;s.in=s.chips>=t.ante;s.fold=false;s.blind=true;s.hand=[];s.put=0;s.cb=0;s.dark=false});
 t.rev=[];t.priv=[];t.ai=t.sp=t.tie=null;t.rid++;t.old='';t.bank=0;const live=ps.filter(s=>s.in);
 if(live.length<2){t.over=true;t.end=true;t.msg=live.length?`${live[0].name} выиграл игру!`:'Игра окончена.';t.turn=0;return push(t)}
 const d=deck();live.forEach(s=>{s.hand=[d.pop(),d.pop(),d.pop()]});t.bet=t.ante;live.forEach(s=>pay(t,s,t.ante));ps.forEach(s=>s.cb=0);
 let k0=t.lastWin?ps.findIndex(s=>s.pid==t.lastWin&&s.in):-1;if(k0<0){k0=(t.first+1)%n;while(!ps[k0].in)k0=(k0+1)%n}t.first=k0;t.turn=k0;
 t.over=false;t.msg='Ставки сделаны, карты розданы.';afterDeal(t);pushLobby()}
const pickvw=(t,pid)=>t.pick&&t.ps[t.pick.i]?{who:t.ps[t.pick.i].name,you:t.ps[t.pick.i].pid==pid,kind:kind(t.ps[t.pick.i].hand)}:null;
// возврат непокрытой ставки: игрок не может выиграть больше, чем вложил соперник
function refundExcess(t){const a=t.ps.filter(s=>(s.put||0)>0).sort((x,y)=>y.put-x.put);if(a.length<2||a[0].put<=a[1].put)return'';
 const s=a[0],r=s.put-a[1].put;s.chips+=r;s.put=a[1].put;s.cb=Math.max(0,(s.cb||0)-r);t.bank-=r;return` ${s.name} получает назад ${r}: ставка не покрыта.`}
function finish(t,ws,hn){clearTimeout(t.tm);clearTimeout(t.tt);t.dl=0;t.ai=t.sp=t.tie=null;const rn=refundExcess(t);
 const ck=(t.cook||[]).map(pid=>t.ps.find(x=>x.pid==pid)).filter(x=>x&&!ws.includes(x)&&!x.gone);
 if(ck.length){const part=[...ws,...ck];part.forEach(x=>{const i=t.ps.indexOf(x);if(!t.rev.includes(i))t.rev.push(i)});t.cook=[];t.split=[];
  t.sv={ph:'vote',from:ws[0].pid,yes:new Set(),tm:null,auto:1,part:part.map(x=>x.pid),pre:`${ws[0].name} побеждает, но ${ck.map(x=>x.name).join(' и ')} варит. Свара! `};return startJoin(t)}
 t.lastWin=ws[0].pid;const sp=(t.split||[]).map(pid=>t.ps.find(x=>x.pid==pid)).filter(x=>x&&!ws.includes(x)),al=[...ws,...sp],sh=Math.floor(t.bank/al.length);
 al.forEach((s,k)=>s.chips+=sh+(k==0?t.bank-sh*al.length:0));
 t.ps.forEach(s=>{if(s.in)stat(s.pid,'g')});ws.forEach(s=>{stat(s.pid,'w');statMax(s.pid,'big',t.bank);if(t.sva)stat(s.pid,'svw')});t.sva=0;
 t.ps.forEach(s=>{if(s.c0!=null){stat(s.pid,'net',s.chips-s.c0);s.c0=null}});t.over=true;t.overAt=Date.now();
 t.msg=sp.length?`${ws[0].name} побеждает${hn?` (${hn})`:''}, банк ${t.bank} делят: ${al.map(s=>s.name).join(' и ')}.`:ws.length>1?(hn=='split'?`Договорились делить банк ${t.bank}: ${ws.map(s=>s.name).join(' и ')}.`:`Ничья: банк ${t.bank} делят ${ws.map(s=>s.name).join(' и ')}.`):`${ws[0].name} забирает банк ${t.bank}${hn?` (${hn})`:''}.`;t.msg+=rn;
 t.bank=0;t.ps.forEach(s=>{s.put=0;s.cb=0;setBal(s.pid,s.chips)});push(t);t.ps.forEach(s=>send(P.get(s.pid),meMsg(s)))}
function showdown(t,ids){const m=Math.max(...ids.map(i=>score(t.ps[i].hand)));const w=ids.filter(i=>score(t.ps[i].hand)==m).map(i=>t.ps[i]);finish(t,w,nm(w[0].hand))}
function act(t,s,a,amt){if(t.over||t.sv||t.pick||t.dk||t.cut||t.tie||t.sp||t.ps[t.turn]!==s)return;if(t.ai&&(a=='call'||a=='raise'))return;const i=t.turn;t.old=t.msg;
 if(a=='call'){const c=cost(t,s);pay(t,s,c);t.msg=`${s.name} ставит ${c}`}
 else if(a=='raise'){const cap=s.blind?s.chips*2:s.chips;let n=Math.min(Math.floor(+amt)||0,cap);if(n<=t.bet||(n<t.bet+t.ante&&n<cap))return;t.bet=n;const c=cost(t,s);pay(t,s,c);t.msg=`${s.name} повышает до ${t.bet}`;if(s.chips==0&&alive(t).length==2){t.ai=s.pid;t.msg=`${s.name} ставит всё: ${t.bet}!`}}
 else if(a=='fold'){s.fold=true;t.msg=`${s.name} пасует`}
 else if(a=='show'){const l=alive(t);if(l.length<2)return;const q=l[(l.indexOf(i)+l.length-1)%l.length],o=t.ps[q];if(o.blind&&!t.ai)return;
  pay(t,s,cost(t,s));s.blind=false;(t.priv=t.priv||[]).push([i,q]);const sa=scp(s),sb=scp(o);
  if(sa==sb){clearTimeout(t.tm);t.dl=0;
   if(alive(t).length==2){t.tie={pids:[s.pid,o.pid],ch:{}};t.tt=setTimeout(()=>tieResolve(t),15000);t.msg=`${s.name} вскрывает: ${o.name}. Ничья! Выбор: делить банк или свара`;return push(t)}
   t.msg=`${s.name} вскрывает: ${o.name}. Ничья, свара!`;t.sv={ph:'vote',from:s.pid,yes:new Set(),tm:null,auto:1};return startJoin(t)}
  const lose=sa>sb?o:s;lose.fold=true;
  t.msg=`${s.name} вскрывает: ${o.name}, ${lose.name} выбывает.`}
 else return;
 if(a=='call')t.circ.add(i);else if(a=='raise')t.circ=new Set([i]);
 const l=alive(t);if(l.length==1)return finish(t,[t.ps[l[0]]],t.rev.includes(l[0])?nm(t.ps[l[0]].hand):'');
 if(l.every(k=>t.circ.has(k))){t.ps.forEach(x=>x.cb=0);t.circ=new Set();t.swept=(t.swept||0)+1}
 do{t.turn=(t.turn+1)%t.ps.length}while(!(t.ps[t.turn].in&&!t.ps[t.turn].fold));
 if(t.ps[t.turn].skip){t.ps[t.turn].skip=false;do{t.turn=(t.turn+1)%t.ps.length}while(!(t.ps[t.turn].in&&!t.ps[t.turn].fold))}
 tick(t);push(t)}

// ---- свара ----
const isAlive=s=>s.in&&!s.fold;
const canJoin=(t,s)=>t.sv&&t.sv.ph=='join'&&(t.sv.part?!t.sv.part.includes(s.pid):!isAlive(s))&&!s.gone&&s.chips>=t.sv.half&&!t.sv.joined.has(s.pid);
function svv(t,pid){const v=t.sv,s=t.ps[seatOf(t,pid)];if(!v||!s)return null;let you='watch';
 if(s.pid==v.from)you='prop';else if(v.joined&&v.joined.has(s.pid))you='joined';else if(isAlive(s)&&v.ph=='vote')you=v.yes.has(s.pid)?'voted':'vote';else if(canJoin(t,s))you='join';
 return{ph:v.ph,from:(t.ps.find(x=>x.pid==v.from)||{}).name,half:v.half||Math.ceil(t.bank/Math.max(1,alive(t).length)),yes:v.yes.size,need:alive(t).length,you,bank:t.bank}}
function cancelSv(t,msg){if(!t.sv)return;clearTimeout(t.sv.tm);t.sv=null;t.svCool=Date.now()+15000;t.msg=msg;tick(t);push(t)}
function startJoin(t){const v=t.sv;clearTimeout(v.tm);refundExcess(t);v.ph='join';v.half=Math.ceil(t.bank/Math.max(1,v.part?v.part.length:alive(t).length));v.joined=new Set();
 if(!t.ps.some(s=>canJoin(t,s)))return dealSvara(t);t.msg=(v.pre||(v.auto?'Ничья, свара! ':'Все согласны на свару. '))+'Желающие могут войти за '+v.half;v.tm=setTimeout(()=>dealSvara(t),15000);push(t)}
function dealSvara(t){const v=t.sv;if(!v)return;clearTimeout(v.tm);const part=new Set([...(v.part||alive(t).map(i=>t.ps[i].pid)),...v.joined]);part.forEach(pid=>stat(pid,'sv'));t.sva=1;
 const d=deck(),ps=t.ps,n=ps.length;ps.forEach(s=>{const k=part.has(s.pid);s.in=k;s.fold=false;s.blind=true;s.put=0;s.cb=0;s.hand=k?[d.pop(),d.pop(),d.pop()]:[]});
 t.sv=null;t.ai=t.sp=t.tie=null;t.bet=t.ante;t.rev=[];t.priv=[];t.rid++;t.old='';t.first=(t.first+1)%n;while(!ps[t.first].in)t.first=(t.first+1)%n;t.turn=t.first;
 t.msg=`Свара! В банке ${t.bank}. Новая раздача.`;t.pick=null;afterDeal(t)}

// ---- три десятки / три семёрки: открыть карты и выбрать (делить банк или варить) ----
const isSpecial=h=>h.length==3&&h.every(c=>c.r==h[0].r)&&(h[0].r==10||h[0].r==7);
const kind=h=>h[0].r==10?'три десятки':'три семёрки';
function afterDeal(t){t.split=[];t.cook=[];t.circ=new Set();t.dk=null;t.ps.forEach(s=>{s.dark=false;s.skip=false});t.ps.forEach(s=>{if(s.in&&s.hand.length){const r=s.hand.map(c=>c.r);if(r.every(x=>x==11))stat(s.pid,'aaa');else if(r.every(x=>x==6))stat(s.pid,'s666');else if(isSpecial(s.hand))stat(s.pid,'sp');if(score(s.hand)==21)stat(s.pid,'p21');if(is109(s.hand))stat(s.pid,'a109')}});t.pq=t.ps.map((s,i)=>i).filter(i=>t.ps[i].in&&isSpecial(t.ps[i].hand));nextPick(t)}
function nextPick(t){clearTimeout(t.pt);if(!t.pq.length){t.pick=null;return darkAsk(t)}
 const i=t.pq[0],s=t.ps[i];t.pick={i};if(!t.rev.includes(i))t.rev.push(i);s.blind=false;clearTimeout(t.tm);
 t.msg=`${s.name}: ${kind(s.hand)}! Выбирает: делить банк или варить`;t.pt=setTimeout(()=>choose(t,s,'split'),20000);push(t)}
function choose(t,s,c){if(!t.pick||t.ps[t.pick.i]!==s)return;clearTimeout(t.pt);t.pq.shift();
 if(c=='cook'){t.cook.push(s.pid);t.msg=`${s.name} варит: свара начнётся, когда определится победитель`;return nextPick(t)}
 t.split.push(s.pid);t.msg=`${s.name} делит банк с победителем`;nextPick(t)}


// ---- жеребьёвка первой карты, игра не глядя (+1 очко) ----
const scp=s=>score(s.hand)+(s.dark?1:0);
function startCut(t){clearTimeout(t.ct);t.lastWin=null;t.over=true;t.bank=0;cutRound(t,t.ps.filter(s=>!s.gone))}
// жеребьёвка: у кого старше карта, тот ходит первым; при равных старших картах тянут ещё раз только они
function cutRound(t,ps){if(ps.length<2){t.cut=null;if(ps[0])t.lastWin=ps[0].pid;return round(t)}
 const d=deck(),cards=ps.map(s=>({pid:s.pid,name:s.name,c:d.pop()})),mx=Math.max(...cards.map(x=>x.c.r)),top=cards.filter(x=>x.c.r==mx);
 t.cut={cards,top:top.map(x=>x.pid),note:top.length==1?'Старшая карта ходит первой':'Одинаковые старшие карты: '+top.map(x=>x.name).join(' и ')+' тянут ещё раз'};
 if(top.length==1){t.lastWin=top[0].pid;t.msg=`${top[0].name} вытянул старшую карту и ходит первым`}else t.msg=`Ничья по старшей карте: ${top.map(x=>x.name).join(' и ')} тянут ещё раз`;
 push(t);t.ct=setTimeout(()=>{if(top.length==1){t.cut=null;round(t)}else cutRound(t,top.map(x=>t.ps.find(s=>s.pid==x.pid)).filter(x=>x&&!x.gone))},top.length==1?4500:3500)}
function darkAsk(t){clearTimeout(t.dt);const ps=t.ps;let k=t.turn;do{k=(k+1)%ps.length}while(!ps[k].in&&k!=t.turn);
 if(t.sva||k==t.turn||!ps[k].in){t.dk=null;tick(t);return push(t)}
 t.dk={i:k};clearTimeout(t.tm);t.dl=0;t.msg=`${ps[k].name} решает: играть в тёмную?`;t.dt=setTimeout(()=>darkPick(t,ps[k],false),20000);push(t)}
function darkPick(t,s,yes){if(!t.dk||t.ps[t.dk.i]!==s)return;clearTimeout(t.dt);t.dk=null;
 if(yes){s.dark=true;const c=cost(t,s);pay(t,s,c);t.circ.add(t.ps.indexOf(s));s.skip=true;t.msg=`${s.name} играет в тёмную: +1 очко, ставка ${c}, пропускает ход`}else t.msg=`${s.name} не темнит`;tick(t);push(t)}

// ---- рейтинг, ничья, ставка всё ----
const is109=h=>h.every(c=>c.s==h[0].s)&&h.map(c=>c.r).sort((a,b)=>a-b).join()=='9,10,11';
const topAll=()=>Object.entries(store).filter(([k,o])=>o.st&&(o.st.g||0)>0).map(([k,o])=>({pid:k,n:o.nm||'Игрок',net:o.st.net||0,w:o.st.w||0,g:o.st.g||0})).sort((a,b)=>b.net-a.net);
function tieResolve(t){const ti=t.tie;if(!ti)return;clearTimeout(t.tt);t.tie=null;const a=t.ps.find(x=>x.pid==ti.pids[0]),b=t.ps.find(x=>x.pid==ti.pids[1]);if(!a||!b)return;
 if(Object.values(ti.ch).includes('svara')){t.msg='Ничья: выбрана свара';t.sv={ph:'vote',from:a.pid,yes:new Set(),tm:null,auto:1,part:ti.pids};return startJoin(t)}
 finish(t,[a,b],'')}
function spr(t,ok){const sp=t.sp;if(!sp)return;clearTimeout(sp.tm);t.sp=null;
 if(ok)return finish(t,alive(t).map(i=>t.ps[i]),'split');
 const q=t.ps.find(x=>x.pid==sp.to);t.msg=`${q?q.name:'Соперник'} против дележа`;tick(t);push(t)}
function sit(t,p){t.ps.push({sid:crypto.randomBytes(4).toString('hex'),vc:false,pid:p.pid,name:p.name,chips:bal(p.pid),in:false,fold:false,blind:true,hand:[],put:0,av:avOf(p)||AV[t.ps.length%8]});p.tid=t.id}
function leave(t,p){if(t.sv)cancelSv(t,'Свара отменена');if(t.tie&&t.tie.pids.includes(p.pid))tieResolve(t);if(t.sp&&(t.sp.to==p.pid||t.sp.from==p.pid))spr(t,false);const i=seatOf(t,p.pid);p.tid=null;if(i<0)return;const s=t.ps[i],mid=t.started&&!t.over;if(s.c0!=null){stat(s.pid,'net',s.chips-s.c0);s.c0=null}setBal(s.pid,s.chips);if(t.pick&&t.ps[t.pick.i]===s)choose(t,s,'split');if(t.dk&&t.ps[t.dk.i]===s)darkPick(t,s,false);
 if(mid){s.gone=1;if(s.in&&!s.fold){if(t.ps[t.turn]===s)act(t,s,'fold');else{s.fold=true;const l=alive(t);if(l.length==1)finish(t,[t.ps[l[0]]],'');else push(t)}}}
 else t.ps.splice(i,1);
 const rest=t.ps.filter(x=>!x.gone);
 if(!rest.length){clearTimeout(t.tm);T.delete(t.id)}else{if(!rest.some(x=>x.pid==t.host))t.host=rest[0].pid;push(t)}
 send(p,{t:'lobby',tables:lobbyList()});send(p,meMsg(p));pushLobby()}

function handle(c,raw){let m;try{m=JSON.parse(raw)}catch(e){return}
 if(m.t=='hello'){console.log('hello');const pid=String(m.pid||'');if(pid.length<8||pid.length>60)return;let p=P.get(pid);if(!p){p={pid,name:'',tid:null};P.set(pid,p)}
  if(p.c&&p.c!==c)kill(p.c);p.c=c;c.p=p;p.name=clean(m.name)||p.name||'Игрок';if(m.av)setAv(p,m.av);restore(pid,m.bk);(store[pid]=store[pid]||{}).nm=p.name;
  send(p,meMsg(p));const t=T.get(p.tid);if(t&&seatOf(t,pid)>=0)push(t);else{p.tid=null;send(p,{t:'lobby',tables:lobbyList()})}return}
 const p=c.p;if(!p)return;const t=T.get(p.tid);
 if(m.t=='av')return setAv(p,m.av);
 if(m.t=='vc'){const s=t&&t.ps[seatOf(t,p.pid)];if(s){s.vc=!!m.on;push(t)}return}
 if(m.t=='rtc'){const me=t&&t.ps[seatOf(t,p.pid)],to=t&&t.ps.find(x=>x.sid==m.to&&x.vc);
  if(me&&me.vc&&to&&JSON.stringify(m.d||'').length<9000)send(P.get(to.pid),{t:'rtc',from:me.sid,d:m.d});return}
 if(m.t=='me')return send(p,meMsg(p));
 if(m.t=='name'){p.name=clean(m.name)||p.name;const s=t&&t.ps[seatOf(t,p.pid)];if(s){s.name=p.name;push(t)}return send(p,meMsg(p))}
 if(m.t=='bonus'){if(!p.tid&&bonusLeft(p.pid)==0){setBal(p.pid,bal(p.pid)+500);store[p.pid].bn=Date.now();save()}return send(p,meMsg(p))}
 if(m.t=='create'&&!p.tid){if(T.size>200)return send(p,{t:'err',m:'Слишком много столов'});p.name=clean(m.nm)||p.name;
  const an=[1,5,10,20,50,100,200,500].includes(+m.ante)?+m.ante:ANTE;
  const nt={ante:an,id:String(nid++),name:clean(m.name)||'Стол',pass:String(m.pass||'').slice(0,16),max:Math.min(8,Math.max(2,+m.max|0||4)),ps:[],started:false,
   bet:an,bank:0,turn:0,first:-1,over:true,rev:[],msg:'',old:'',rid:0,host:p.pid};
  T.set(nt.id,nt);sit(nt,p);push(nt);pushLobby();return}
 if(m.t=='join'&&!p.tid){const jt=T.get(String(m.id));if(!jt)return send(p,{t:'err',m:'Стол не найден'});
  if(jt.pass&&jt.pass!==String(m.pass||''))return send(p,{t:'err',m:'Неверный пароль'});
  if(jt.ps.filter(s=>!s.gone).length>=jt.max)return send(p,{t:'err',m:'Стол заполнен'});
  p.name=clean(m.nm)||p.name;sit(jt,p);push(jt);send(p,{t:'chats',list:jt.chat||[]});pushLobby();return}
 if(!t)return;
 if(m.t=='leave')return leave(t,p);
 if(m.t=='start'){if(!t.started&&t.host!==p.pid)return;if(t.started&&!t.end)return;
  if(t.ps.filter(s=>!s.gone).length<2)return send(p,{t:'err',m:'Нужно минимум 2 игрока'});
  if(t.end)t.ps.forEach(s=>{if(s.chips<t.ante)s.chips=1000;setBal(s.pid,s.chips)});t.started=true;t.end=false;t.first=-1;t.lastWin=null;return startCut(t)}
 if(m.t=='next'){if(t.started&&t.over&&!t.end&&!t.cut&&Date.now()-t.overAt>2000)round(t);return}
 if(m.t=='dark'){const s=t.ps[seatOf(t,p.pid)];if(s)darkPick(t,s,!!m.ok);return}
 if(m.t=='look'){const s=t.ps[seatOf(t,p.pid)];if(s&&s.in&&!s.fold&&!t.over&&s.blind){s.blind=false;push(t)}return}
 if(m.t=='svara'){const s=t.ps[seatOf(t,p.pid)];if(!s||!t.started||t.over||t.sv||t.pick||t.dk||t.tie||t.sp||!isAlive(s)||alive(t).length!=2||t.ps[t.turn]!==s)return;
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
 if(m.t=='top'){const all=topAll(),ix=all.findIndex(x=>x.pid==p.pid);return send(p,{t:'top',list:all.slice(0,20).map(x=>({n:x.n,net:x.net,w:x.w,g:x.g,me:x.pid==p.pid})),rank:ix<0?0:ix+1})}
 if(m.t=='split'){const s=t.ps[seatOf(t,p.pid)];if(!t.ai||t.sp||t.sv||t.tie||t.over||!s||!isAlive(s)||t.ai==p.pid||alive(t).length!=2)return;
  clearTimeout(t.tm);t.dl=0;t.sp={from:p.pid,to:t.ai,tm:setTimeout(()=>spr(t,false),15000)};t.msg=`${s.name} предлагает делить банк`;return push(t)}
 if(m.t=='spr'){if(t.sp&&t.sp.to==p.pid)spr(t,!!m.ok);return}
 if(m.t=='tie'){if(!t.tie||!t.tie.pids.includes(p.pid))return;t.tie.ch[p.pid]=m.c=='svara'?'svara':'split';if(Object.keys(t.tie.ch).length==2)tieResolve(t);else push(t);return}
 if(m.t=='pick'){const s=t.ps[seatOf(t,p.pid)];if(s)choose(t,s,m.c=='cook'?'cook':'split');return}
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
