let state={records:[],messages:[],profile:{}},filter='all',busy=false;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const labels={exercise:'�˶�',food:'��ʳ',state:'����״̬',weight:'����'},icons={exercise:'�J',food:'?',state:'?',weight:'?'};
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
let toastTimer;function toast(text){$('#toast').textContent=text;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',3500);}
async function api(path,method='GET',data){const response=await fetch(path,{method,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});const value=await response.json();if(!response.ok)throw Error(value.error||'����δ���');return value;}
function short(r){if(r.kind==='exercise')return `${r.value.activity}${r.value.minutes?` �� ${r.value.minutes}����`:''}`;if(r.kind==='weight')return `${r.value.kg} kg`;return r.value.note;}
function dayCN(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
function render(){
  $('#mode').textContent=state.mode==='model'?'ģ��������':'��������';$('#assistant-caption').textContent=state.mode==='model'?'ģ�������� �� ��ѯʱ������ؼ�¼':'�������� �� ��¼���ѯ';
  $('#model-note').textContent=state.mode==='model'?'��ѯʱ���Ὣ���������ڼ�¼����ضԻ����͵������õ�ģ�ͷ���ģ�Ͳ�����ʱ���˵���������':'��ǰʹ�û�������֧�ֳ������ּ�¼����ѯ�����ص�״̬��������δ���Ӵ�ģ�ͣ����ӱ�������޷�ʶ��δʶ�����Ϣ����ȷ��ʾ��ģ�ͽӿڿ��ڱ��� .env �ļ������á�';
  $('#goal-text').textContent=state.profile.goal||'���Լ��Ľ��࣬�����ж���';$('#record-count').textContent=state.records.length;
  const day=dayCN(),monday=new Date(day+'T12:00:00+08:00');monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
  const ex=state.records.filter(r=>r.kind==='exercise'&&r.day>=dayCN(monday)&&r.day<=day);
  $('#stat-count').textContent=ex.length;$('#stat-minutes').textContent=ex.reduce((s,r)=>s+(r.value.minutes||0),0);$('#stat-days').textContent=ex.length?`�ֲ��� ${new Set(ex.map(r=>r.day)).size} �죬�����Լ��Ľ���`:'�ӵ�һ����¼��ʼ';
  const weight=state.records.find(r=>r.kind==='weight'&&r.day<=day);$('#stat-weight').textContent=weight?weight.value.kg:'��';$('#weight-date').textContent=weight?`${weight.day} �ĳ��ؼ�¼`:'������������ʱ��¼';
  const messages=$('#messages');messages.replaceChildren();
  if(!state.messages.length){const welcome=el('div','message welcome');const b=el('div','bubble');b.append(el('div','welcome-title','��ã��ӽ����һ��С�¿�ʼ��'),el('div','', '������������ʲô�˶�������ʲô���������Ľ����״̬��\n���˶����ò�������ʱ��Ҳ����ֱ�����ҡ�'),el('small','', '���ԣ������ܲ�30���ӣ���������ţ����׷���'));welcome.append(b);messages.append(welcome);}
  for(const m of state.messages){const row=el('div','message '+m.role);row.append(el('div','message-label',m.role==='user'?'��':'�˶�����'),el('div','bubble',m.text));messages.append(row);}
  if(busy){const row=el('div','message');row.append(el('div','bubble','����������ļ�¼��ظ���'));messages.append(row);}
  messages.scrollTop=messages.scrollHeight;
  const recent=$('#recent');recent.replaceChildren();if(!state.records.length)recent.append(el('div','empty','��û�м�¼\n��һ����Ϣ����ʼ���졣'));
  for(const r of state.records.slice(0,3)){const row=el('div','recent-item'),content=el('div');content.append(el('strong','',short(r)),el('small','',r.day+(r.value.time?' '+r.value.time:'')+' �� '+labels[r.kind]));row.append(el('span','record-icon',icons[r.kind]),content);recent.append(row);}
  renderRecords();
}
function renderRecords(){const list=$('#record-list');list.replaceChildren();const rows=state.records.filter(r=>filter==='all'||r.kind===filter);if(!rows.length){list.append(el('div','empty','���ﻹû�м�¼��ȥ�����м���һ���ж��ɡ�'));return;}
  for(const r of rows){const row=el('div','record-row'),content=el('div','record-content'),actions=el('div','row-actions');content.append(el('h3','',short(r)),el('p','',`${r.day}${r.value.time?' '+r.value.time:''} �� ${labels[r.kind]}${r.value.intensity?' �� '+r.value.intensity:''}`),el('p','',`ԭʼ��¼��${r.source}`));const edit=el('button','','�޸�'),remove=el('button','delete','ɾ��');edit.onclick=()=>openEdit(r);remove.onclick=async()=>{if(!confirm('ɾ��������¼��'))return;try{await api('/api/records/'+r.id,'DELETE');await refresh();toast('��¼��ɾ��');}catch(e){toast(e.message);}};actions.append(edit,remove);row.append(el('span','record-icon',icons[r.kind]),content,actions);list.append(row);}
}
async function refresh(){state=await api('/api/state');render();}
function show(view){$$('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+view));$$('.nav').forEach(v=>v.classList.toggle('active',v.dataset.view===view));$('#page-label').textContent={chat:'�����Ի�',records:'�ҵļ�¼',profile:'���˵���'}[view];if(view==='profile'){for(const [key,value]of Object.entries(state.profile)){const input=$('#profile-form').elements.namedItem(key);if(input)input.value=value;}}}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
$$('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;$$('.filter').forEach(x=>x.classList.toggle('active',x===b));renderRecords();}));
async function send(text){if(busy||!text.trim())return;busy=true;$('#send').disabled=true;$('#chat-input').value='';state.messages.push({role:'user',text});render();try{await api('/api/chat','POST',{text});}catch(e){toast(e.message);$('#chat-input').value=text;}finally{busy=false;$('#send').disabled=false;try{await refresh();}catch{toast('�����жϣ���ȷ�ϱ��ط����������С�');}$('#chat-input').focus();}}
$('#chat-form').addEventListener('submit',e=>{e.preventDefault();send($('#chat-input').value);});$('#chat-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send(e.target.value);}});
$$('[data-prompt]').forEach(b=>b.addEventListener('click',()=>send(b.dataset.prompt)));$$('[data-fill]').forEach(b=>b.addEventListener('click',()=>{$('#chat-input').value=b.dataset.fill;$('#chat-input').focus();}));
$('#profile-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/profile','POST',Object.fromEntries(new FormData(e.target)));await refresh();toast('���˵����ѱ���');}catch(e){toast(e.message);}});
function field(label,name,type,value,required=true){const box=el('label','',label),input=el(type==='textarea'?'textarea':'input');input.name=name;if(type!=='textarea')input.type=type;input.value=value??'';input.required=required;box.append(input);return box;}
function openEdit(r){const form=$('#edit-form');form.elements.namedItem('id').value=r.id;form.elements.namedItem('day').value=r.day;const fields=$('#edit-fields');fields.replaceChildren(field('ʱ�䣨ѡ�δ֪ʱ���գ�','time','time',r.value.time,false));if(r.kind==='exercise'){fields.append(field('�˶���Ŀ','activity','text',r.value.activity),field('ʱ�� / ���ӣ������գ�','minutes','number',r.value.minutes,false));}else if(r.kind==='weight')fields.append(field('���� / kg','kg','number',r.value.kg));else fields.append(field('����','note','textarea',r.value.note));fields.querySelectorAll('input[type=number]').forEach(i=>i.step='0.1');$('#edit-dialog').showModal();}
$('#cancel-edit').onclick=()=>$('#edit-dialog').close();$('#edit-form').addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));try{await api('/api/records/'+data.id,'PATCH',data);$('#edit-dialog').close();await refresh();toast('��¼���޸�');}catch(error){toast(error.message);}});
$('#today').textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'}).format(new Date()).toUpperCase();
refresh().catch(()=>toast('�޷����ӱ��ط�����ȷ�Ϸ�����������'));
