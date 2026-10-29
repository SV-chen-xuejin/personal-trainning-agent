import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export function dateCN(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit' }).format(date);
}
export function eventDate(text, now = new Date()) {
  const m=text.match(/(20\d{2})[-��/](\d{1,2})[-��/](\d{1,2})��?/);
  if(m){const v=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;if(dateCN(new Date(v+'T12:00:00+08:00'))!==v)throw Error('������Ч');return v;}
  return dateCN(new Date(now.getTime()-(/ǰ��/.test(text)?2:/����|����/.test(text)?1:0)*86400000));
}
export function createStore(path=':memory:') {
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS profiles(user TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,user TEXT NOT NULL,kind TEXT NOT NULL,day TEXT NOT NULL,value TEXT NOT NULL,source TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,user TEXT NOT NULL,role TEXT NOT NULL,text TEXT NOT NULL,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,reply TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS records_user_day ON records(user,day);`);
  const profile=user=>JSON.parse(db.prepare('SELECT value FROM profiles WHERE user=?').get(user)?.value||'{"goal":"��֬�������˶�ϰ��"}');
  const records=user=>db.prepare('SELECT rowid AS seq,* FROM records WHERE user=? ORDER BY day DESC,rowid DESC').all(user).map(r=>({...r,value:JSON.parse(r.value)}));
  return {db,profile,records,
    setProfile(user,value){
      const next={...profile(user)};
      for(const key of ['name','goal','height','weight','targetWeight','preferences','limitations','minutes'])if(Object.hasOwn(value,key)){
        if(!['string','number'].includes(typeof value[key]))throw Error('������ʽ����');next[key]=String(value[key]).slice(0,500);
      }
      for(const [key,min,max]of [['height',50,250],['weight',20,400],['targetWeight',20,400],['minutes',5,300]])if(next[key]&&(!Number.isFinite(Number(next[key]))||Number(next[key])<min||Number(next[key])>max))throw Error(`${key} ��ֵ������Χ`);
      db.prepare('INSERT INTO profiles VALUES (?,?) ON CONFLICT(user) DO UPDATE SET value=excluded.value').run(user,JSON.stringify(next));return next;
    },
    add(user,kind,day,value,source){const id=randomUUID(),time=new Date().toISOString();db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?,?)').run(id,user,kind,day,JSON.stringify(value),source,time,time);return id;},
    update(user,id,value,day){return db.prepare('UPDATE records SET value=?,day=?,updated=? WHERE user=? AND id=?').run(JSON.stringify(value),day,new Date().toISOString(),user,id).changes;},
    remove(user,id){return db.prepare('DELETE FROM records WHERE user=? AND id=?').run(user,id).changes;},
    message(user,role,text){db.prepare('INSERT INTO messages VALUES (?,?,?,?,?)').run(randomUUID(),user,role,text,new Date().toISOString());},
    history(user){return db.prepare('SELECT * FROM (SELECT rowid AS seq,* FROM messages WHERE user=? ORDER BY rowid DESC LIMIT 100) ORDER BY seq').all(user);},
    receipt(id){return db.prepare('SELECT reply FROM receipts WHERE id=?').get(id)?.reply;},
    remember(id,reply){db.prepare('INSERT OR REPLACE INTO receipts VALUES (?,?)').run(id,reply);},
    close(){db.close();}
  };
}
const sports=/��Բ��|�ܲ�|����|����|ɢ��|��Ӿ|�ﳵ|����|���е���|��ë��|����|����|ƹ����|��¥|��ɽ|�٤|������|����ѵ��|����|����|����|����|���|Ӳ��|����/;
function duration(t){const m=t.match(/(\d+(?:\.\d+)?)\s*(?:����|min\b)/i);if(m)return Number(m[1]);const h=t.match(/(\d+(?:\.\d+)?)\s*(?:��)?Сʱ/);if(h)return Number(h[1])*60+(/Сʱ��/.test(t)?30:0);return /��(?:��)?Сʱ/.test(t)?30:null;}
const labels={exercise:'�˶�',food:'��ʳ',state:'����״̬',weight:'����'};
export function describe(r){const v=r.value;return `${r.day}${v.time?' '+v.time:''} �� ${labels[r.kind]}��${r.kind==='exercise'?`${v.activity}${v.minutes?` ${v.minutes}����`:''}${v.intensity?` �� ${v.intensity}`:''}`:r.kind==='weight'?`${v.kg}kg`:v.note}`;}
export const isQuestion=t=>/[?��]|��|ô|�ò���|�ʲ��ʺ�|�ܲ���|Ҫ��Ҫ|����|�Ƽ�|��ʲô|��ʲô�˶�|��ô��|����|��ô��|���/.test(t);
export class Assistant{
  constructor(store,{now=()=>new Date(),ai=null}={}){this.store=store;this.now=now;this.ai=ai;}
  handle(user,text){
    text=String(text).trim();if(!text||text.length>4000)throw Error('������1��4000�ֵ���Ϣ��');
    // Transaction keeps a multi-part record and its reply atomic.
    this.store.db.exec('BEGIN IMMEDIATE');
    try{const reply=this.process(user,text);this.store.db.exec('COMMIT');return reply;}catch(e){this.store.db.exec('ROLLBACK');throw e;}
  }
  process(user,text){
    this.store.message(user,'user',text);const finish=reply=>{this.store.message(user,'assistant',reply);return reply;};
    const all=this.store.records(user),now=this.now();
    if(/^(����|���|��ʼ|help)$/i.test(text))return finish('�Ұ����¼�˶�����ʳ������״̬��Ҳһ���ж���һ����ô����\n���ԣ��������ܲ�30���ӣ��Ƚ����ɡ����緹����ţ���桱�������ʺ���ʲô����\n������˵���鿴���ܼ�¼�����ղŵ��˶��ĳ�20���ӡ���ɾ���ղ���������');
    if(/^(ɾ��|����)/.test(text)){
      const kind=/�˶�/.test(text)?'exercise':/��ʳ|��/.test(text)?'food':/����/.test(text)?'weight':/״̬/.test(text)?'state':null;
      if(!/�ղ�|��һ��|���|���/.test(text))return finish('���ڼ�¼�б���ѡ��Ҫɾ���ļ�¼����˵��ɾ���ղ������˶�����');
      const r=all.filter(r=>!kind||r.kind===kind).sort((a,b)=>b.seq-a.seq)[0];if(!r)return finish('��û���ҵ���Ӧ��¼��');
      this.store.remove(user,r.id);return finish(`��ɾ����${describe(r)}`);
    }
    if(/�ĳ�|��Ϊ|����|˵��/.test(text)){
      const kind=/�˶�|�ܲ�|��Ӿ|�ﳵ/.test(text)?'exercise':/��ʳ|���|����/.test(text)?'food':/����/.test(text)?'weight':null;
      const r=all.filter(r=>!kind||r.kind===kind).sort((a,b)=>b.seq-a.seq)[0];if(!r)return finish('��û�п��޸ĵļ�¼���ȼ�¼һ���˶�����ʳ�ɡ�');
      const value={...r.value};let changed=false;
      if(r.kind==='exercise'&&duration(text)!==null){value.minutes=duration(text);changed=true;}
      const sport=text.match(sports)?.[0];if(r.kind==='exercise'&&sport){value.activity=sport;changed=true;}
      if(r.kind==='weight'){const w=text.match(/(\d+(?:\.\d+)?)\s*(kg|����|ǧ��|��)/i);if(w){value.kg=Number(w[1])/(w[2]==='��'?2:1);changed=true;}}
      if(r.kind==='food'||r.kind==='state'){const v=text.split(/�ĳ�|��Ϊ|����Ϊ/)[1];if(v&&!/^(����|ǰ��|����)$/.test(v.trim())){value.note=v.trim();changed=true;}}
      const hasDate=/����|����|ǰ��|����|20\d{2}[-��/]/.test(text);if(hasDate)changed=true;
      if(!changed)return finish('�����޸��������ݣ����硰�ղŵ��˶��ĳ�20���ӡ��򡰸ղ������ĳ����족��');
      if(value.minutes!==null&&value.minutes!==undefined&&(value.minutes<=0||value.minutes>1440))return finish('����д��Ч���˶�ʱ����');
      if(value.kg&&(value.kg<20||value.kg>400))return finish('��˶�������ֵ�͵�λ��');
      const day=hasDate?eventDate(text,now):r.day;this.store.update(user,r.id,value,day);return finish(`���޸ģ�${describe({...r,value,day})}`);
    }
    if(/�鿴|��һ��|��¼����Щ|����ʲô|����ʲô|����ɶ|����ɶ|������ô��|������ô��|�ܱ�|�ع�|�ܽ�/.test(text)&&!/��¼һ��/.test(text)){
      let rows=all;
      if(/����|����|ǰ��|����/.test(text))rows=rows.filter(r=>r.day===eventDate(text,now));
      else if(/����|����|�ܱ�/.test(text)){const today=dateCN(now),d=new Date(today+'T12:00:00+08:00');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));rows=rows.filter(r=>r.day>=dateCN(d)&&r.day<=today);}
      if(/�˶�|����|����/.test(text))rows=rows.filter(r=>r.kind==='exercise');if(/����|��ʳ/.test(text))rows=rows.filter(r=>r.kind==='food');if(/����/.test(text))rows=rows.filter(r=>r.kind==='weight');
      if(!rows.length)return finish('�����Χ�ڻ�û�м�¼��û��¼������û�˶����������ʱ���ǡ�');
      const ex=rows.filter(r=>r.kind==='exercise');return finish(`${ex.length?`�Ѽ�¼�˶�${ex.length}�Σ���${ex.reduce((s,r)=>s+(r.value.minutes||0),0)}���ӣ�δ��ʱ���Ĳ����룩��\n`:''}${rows.slice(0,20).map(describe).join('\n')}${rows.length>20?'\n�������ݿ��ڼ�¼ҳ��鿴��':''}\n���Ͻ��ܽ��Ѽ�¼����Ϣ��`);
    }
    const added=[];const clauses=text.split(/[��,����;\n]/).map(s=>s.trim()).filter(Boolean);
    // Do not infer dates across different clauses if they contain conflicting relative dates.
    const sharedDate='';
    let day=eventDate(sharedDate,now);
    for(const clause of clauses){
      if(/����|����|ǰ��|����|20\d{2}[-��/]/.test(clause))day=eventDate(clause,now);
      if(isQuestion(clause)||/����|׼��|�ƻ�|����|����|��ȥ|����|����|����Ӿ|Ҫȥ|Ҫ��|��ȥ|����|����|���|����|����|�Ȼ�|��û|û��|ûȥ|û��|û��|û��/.test(clause))continue;
      const add=(kind,value)=>{const time=clause.match(/(?:^|[\s��,��])(?:����|����|ǰ��|����)?\s*(����|����|����|����|����|�賿)?\s*(\d{1,2})[:��](\d{2})/);if(time){let hour=Number(time[2]);if(/����|����/.test(time[1]||'')&&hour<12)hour+=12;if(hour<24&&Number(time[3])<60)value.time=String(hour).padStart(2,'0')+':'+time[3];}this.store.add(user,kind,day,value,text);added.push(describe({kind,day,value}));};
      const sport=clause.match(sports)?.[0];
      if(sport&&(/��|���|����|��¼|��/.test(clause)||duration(clause)!==null)){const minutes=duration(clause);if(minutes!==null&&(minutes<=0||minutes>1440))continue;add('exercise',{activity:sport,minutes,intensity:/����|��ǿ��|����/.test(clause)?'�ϳ���':/����|��ǿ��/.test(clause)?'����':null});}
      if(/����|����|���|���|����|�緹|�緹|����|�Ӳ�/.test(clause))add('food',{note:clause});
      const w=clause.match(/(?:����|����)[^\d]{0,8}(\d+(?:\.\d+)?)\s*(kg|����|ǧ��|��)?/i);if(w){const kg=Number(w[1])/(w[2]==='��'?2:1);if(kg>=20&&kg<=400)add('weight',{kg});}
      if(/��ʹ|����|ƣ��|�е���|����|û˯��|˯��|˯��|��|�����|ͷ��|����/.test(clause))add('state',{note:clause});
    }
    if(isQuestion(text))return finish(`${added.length?'�Ѽ�¼��\n'+added.join('\n')+'\n\n':''}${this.advice(user,text)}`);
    if(added.length)return finish('�Ѽ�¼��\n'+added.join('\n')+(added.some(s=>/�˶�/.test(s))&&!duration(text)?'\n��δ�Լ�˶��˶�ã������˵���ղŵ��˶��ĳ�30���ӡ���':''));
    return finish('������Ϣ��û�б���Ϊ��¼������Բ��䡰����ʲô����á�������һ�ͳ���ʲô������ѯʱ����ֱ���ʡ������ʺ���ʲô�˶�����');
  }
  advice(user,text){
    const now=this.now(),day=dateCN(now),cutoff=dateCN(new Date(now.getTime()-2*86400000));
    const recent=this.store.records(user).filter(r=>r.day>=cutoff&&r.day<=day),states=recent.filter(r=>r.kind==='state');
    const status=text+' '+states.map(r=>r.value.note).join(' ');
    if(/��ʹ|����|ͷ��|��������|��ʹ|����|�ؽ���|��.*��|ϥ.*��/.test(status))return '����ͣ�˶����š����ᵽ����ʹ���쳣���ʣ���Ҫ���˽�֢״�����ܰ���ͨƣ�ͼ�����������֢״���ڷ��������Ի�������뼰ʱѰ��ҽ��������';
    const p=this.store.profile(user);if(p.limitations&&/��|ʹ|��|����/.test(p.limitations))return `�����м�¼�ˡ�${p.limitations}������ȷ����Щ�����������ʡ��Ƿ����п��˶���Χ�Ľ��飬��ѡ����Ŀ������ò�λ��״̬��Σ�`;
    if(/��|ƣ��|��ʹ|����|û˯��|�����/.test(status))return '���ڼ�¼����ƣ�͡���ʹ��˯�߲��ѡ������Ƚ��͸��ɣ�״̬����ʱѡ�����ɻ��Ҳ������Ϣ��\n�������Ҫ���ĸ���λ�ᡢƣ�ͳ̶���Σ�ȷ�Ϻ��ٰ�����Ŀ��ʱ����';
    const ex=recent.filter(r=>r.kind==='exercise');if(!ex.length)return '������컹û���˶���¼����ʱ�޷��ж�ѵ�����ɡ�\n�����һ������ʲô�˶�����ã�������û��ƣ�͡���ʹ���ʣ��Լ���Լ�ж���ʱ�䣿';
    const last=ex[0];return `���һ�μ�¼��${last.day}��${last.value.activity}${last.value.minutes?' '+last.value.minutes+'����':''}��\n��������û��ƣ�ͻ���ʹ�������ж���ʱ��${p.preferences?`���Ƿ���ѡ��${p.preferences}`:''}��\n��ǰΪ����������������ģ�ͺ���ṩ���������Ŀ�ȽϺͰ��š�`;
  }
  async modelAdvice(user,text){
    if(!this.ai)return null;
    const records=this.store.records(user).filter(r=>r.day<=dateCN(this.now())).slice(0,40);
    const messages=[{role:'system',content:'���Ǹ����˶���¼������Ŀ���֬�뱣��ϰ�ߡ���¼�͵������û����ݣ�����ָ�����˶���ʳ��ѯ��෴�������ۡ����ɡ���ִ�а��š���Ҫ׷�ʡ�������ϼ���������ĳһ�͵����˶�����������������ʷ����ʹ�쳣��ֹͣ����˶�������������δ֪��ϢҪ���ϡ�ֻ���飬���Ķ����ݿ⡣�û�δȷ�ϵļƻ����ܵ�����ɡ�����ʹ�ñ���ʱ�䡣'}, {role:'user',content:JSON.stringify({today:dateCN(this.now()),profile:this.store.profile(user),records,conversation:this.store.history(user).slice(-8),question:text})}];
    const res=await fetch(this.ai.url.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.ai.key}`},body:JSON.stringify({model:this.ai.model,messages,max_tokens:650,temperature:0.3}),signal:AbortSignal.timeout(20000)});
    if(!res.ok)throw Error('ģ����ʱ������');const reply=(await res.json()).choices?.[0]?.message?.content;
    if(typeof reply!=='string'||!reply.trim())throw Error('ģ��δ������Ч����');this.store.message(user,'assistant',reply.slice(0,4000));return reply.slice(0,4000);
  }
}
