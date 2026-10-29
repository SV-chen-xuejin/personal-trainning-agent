let state={records:[],messages:[],profile:{}},filter='all',busy=false;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const labels={exercise:'运动',food:'饮食',state:'身体状态',weight:'体重'},icons={exercise:'↗',food:'◒',state:'♡',weight:'⌁'};
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
let toastTimer;function toast(text){$('#toast').textContent=text;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',3500);}
async function api(path,method='GET',data){const response=await fetch(path,{method,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});const value=await response.json();if(!response.ok)throw Error(value.error||'请求未完成');return value;}
function short(r){if(r.kind==='exercise')return `${r.value.activity}${r.value.minutes?` · ${r.value.minutes}分钟`:''}`;if(r.kind==='weight')return `${r.value.kg} kg`;return r.value.note;}
function dayCN(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
function render(){
  $('#mode').textContent=state.mode==='model'?'模型已配置':'基础规则';$('#assistant-caption').textContent=state.mode==='model'?'模型已配置 · 咨询时发送相关记录':'基础规则 · 记录与查询';
  $('#model-note').textContent=state.mode==='model'?'咨询时，会将档案、近期记录和相关对话发送到你配置的模型服务。模型不可用时回退到基础规则。':'当前使用基础规则，支持常见文字记录、查询及保守的状态反馈。尚未连接大模型，复杂表达可能无法识别；未识别的消息会明确提示。模型接口可在本地 .env 文件中配置。';
  $('#goal-text').textContent=state.profile.goal||'按自己的节奏，持续行动。';$('#record-count').textContent=state.records.length;
  const day=dayCN(),monday=new Date(day+'T12:00:00+08:00');monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
  const ex=state.records.filter(r=>r.kind==='exercise'&&r.day>=dayCN(monday)&&r.day<=day);
  $('#stat-count').textContent=ex.length;$('#stat-minutes').textContent=ex.reduce((s,r)=>s+(r.value.minutes||0),0);$('#stat-days').textContent=ex.length?`分布在 ${new Set(ex.map(r=>r.day)).size} 天，保持自己的节奏`:'从第一条记录开始';
  const weight=state.records.find(r=>r.kind==='weight'&&r.day<=day);$('#stat-weight').textContent=weight?weight.value.kg:'—';$('#weight-date').textContent=weight?`${weight.day} 的称重记录`:'可在聊天中随时记录';
  const messages=$('#messages');messages.replaceChildren();
  if(!state.messages.length){const welcome=el('div','message welcome');const b=el('div','bubble');b.append(el('div','welcome-title','你好，从今天的一件小事开始。'),el('div','', '告诉我你做了什么运动、吃了什么，或者聊聊今天的状态。\n想运动又拿不定主意时，也可以直接问我。'),el('small','', '试试：昨天跑步30分钟，晚饭吃了牛肉和米饭。'));welcome.append(b);messages.append(welcome);}
  for(const m of state.messages){const row=el('div','message '+m.role);row.append(el('div','message-label',m.role==='user'?'你':'运动助理'),el('div','bubble',m.text));messages.append(row);}
  if(busy){const row=el('div','message');row.append(el('div','bubble','正在整理你的记录与回复…'));messages.append(row);}
  messages.scrollTop=messages.scrollHeight;
  const recent=$('#recent');recent.replaceChildren();if(!state.records.length)recent.append(el('div','empty','还没有记录\n发一条消息，开始今天。'));
  for(const r of state.records.slice(0,3)){const row=el('div','recent-item'),content=el('div');content.append(el('strong','',short(r)),el('small','',r.day+(r.value.time?' '+r.value.time:'')+' · '+labels[r.kind]));row.append(el('span','record-icon',icons[r.kind]),content);recent.append(row);}
  renderRecords();
}
function renderRecords(){const list=$('#record-list');list.replaceChildren();const rows=state.records.filter(r=>filter==='all'||r.kind===filter);if(!rows.length){list.append(el('div','empty','这里还没有记录。去聊天中记下一次行动吧。'));return;}
  for(const r of rows){const row=el('div','record-row'),content=el('div','record-content'),actions=el('div','row-actions');content.append(el('h3','',short(r)),el('p','',`${r.day}${r.value.time?' '+r.value.time:''} · ${labels[r.kind]}${r.value.intensity?' · '+r.value.intensity:''}`),el('p','',`原始记录：${r.source}`));const edit=el('button','','修改'),remove=el('button','delete','删除');edit.onclick=()=>openEdit(r);remove.onclick=async()=>{if(!confirm('删除这条记录？'))return;try{await api('/api/records/'+r.id,'DELETE');await refresh();toast('记录已删除');}catch(e){toast(e.message);}};actions.append(edit,remove);row.append(el('span','record-icon',icons[r.kind]),content,actions);list.append(row);}
}
async function refresh(){state=await api('/api/state');render();}
function show(view){$$('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+view));$$('.nav').forEach(v=>v.classList.toggle('active',v.dataset.view===view));$('#page-label').textContent={chat:'助理对话',records:'我的记录',profile:'个人档案'}[view];if(view==='profile'){for(const [key,value]of Object.entries(state.profile)){const input=$('#profile-form').elements.namedItem(key);if(input)input.value=value;}}}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
$$('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;$$('.filter').forEach(x=>x.classList.toggle('active',x===b));renderRecords();}));
async function send(text){if(busy||!text.trim())return;busy=true;$('#send').disabled=true;$('#chat-input').value='';state.messages.push({role:'user',text});render();try{await api('/api/chat','POST',{text});}catch(e){toast(e.message);$('#chat-input').value=text;}finally{busy=false;$('#send').disabled=false;try{await refresh();}catch{toast('连接中断，请确认本地服务仍在运行。');}$('#chat-input').focus();}}
$('#chat-form').addEventListener('submit',e=>{e.preventDefault();send($('#chat-input').value);});$('#chat-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send(e.target.value);}});
$$('[data-prompt]').forEach(b=>b.addEventListener('click',()=>send(b.dataset.prompt)));$$('[data-fill]').forEach(b=>b.addEventListener('click',()=>{$('#chat-input').value=b.dataset.fill;$('#chat-input').focus();}));
$('#profile-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/profile','POST',Object.fromEntries(new FormData(e.target)));await refresh();toast('个人档案已保存');}catch(e){toast(e.message);}});
function field(label,name,type,value,required=true){const box=el('label','',label),input=el(type==='textarea'?'textarea':'input');input.name=name;if(type!=='textarea')input.type=type;input.value=value??'';input.required=required;box.append(input);return box;}
function openEdit(r){const form=$('#edit-form');form.elements.namedItem('id').value=r.id;form.elements.namedItem('day').value=r.day;const fields=$('#edit-fields');fields.replaceChildren(field('时间（选填，未知时留空）','time','time',r.value.time,false));if(r.kind==='exercise'){fields.append(field('运动项目','activity','text',r.value.activity),field('时长 / 分钟（可留空）','minutes','number',r.value.minutes,false));}else if(r.kind==='weight')fields.append(field('体重 / kg','kg','number',r.value.kg));else fields.append(field('内容','note','textarea',r.value.note));fields.querySelectorAll('input[type=number]').forEach(i=>i.step='0.1');$('#edit-dialog').showModal();}
$('#cancel-edit').onclick=()=>$('#edit-dialog').close();$('#edit-form').addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));try{await api('/api/records/'+data.id,'PATCH',data);$('#edit-dialog').close();await refresh();toast('记录已修改');}catch(error){toast(error.message);}});
$('#today').textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'}).format(new Date()).toUpperCase();
refresh().catch(()=>toast('无法连接本地服务，请确认服务已启动。'));
