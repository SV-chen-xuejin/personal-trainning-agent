import http from 'node:http';
import {mkdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createStore,Assistant,isQuestion} from './core.mjs';
import {verifySignature,parseMessage,replyXML} from './wechat.mjs';
const root=dirname(fileURLToPath(import.meta.url));const dataDir=process.env.FITNESS_DATA_DIR||join(root,'data');mkdirSync(dataDir,{recursive:true});
const store=createStore(join(dataDir,'fitness.sqlite'));
const ai=process.env.AI_BASE_URL&&process.env.AI_API_KEY&&process.env.AI_MODEL?{url:process.env.AI_BASE_URL,key:process.env.AI_API_KEY,model:process.env.AI_MODEL}:null;
if(ai&&!/^https:\/\//.test(ai.url)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(ai.url))throw Error('远程模型地址必须使用HTTPS');
const assistant=new Assistant(store,{ai}),user='local',pending=new Set(),modelJobs=new Map();
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
async function body(req){let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>32000)throw Error('消息过长');}return data;}
function wantsModel(t){const risk=[store.profile(user).limitations||'',...store.records(user).filter(r=>r.kind==='state').slice(0,3).map(r=>r.value.note)].join(' ');if(/疼|痛|伤|胸闷|头晕|呼吸困难/.test(risk))return false;return ai&&isQuestion(t)&&!/查看|回顾|周报|总结|做了什么|吃了什么|怎么样|疼|胸闷|头晕|呼吸困难|改成|删除/.test(t);}
async function modelResponse(id,text){try{return await assistant.modelAdvice(id,text);}catch{return null;}}
async function callback(req,res,url){
  if(!verifySignature(url,process.env.WECHAT_TOKEN))return json(res,403,{error:'签名无效或时间戳过期'});
  if(url.searchParams.get('encrypt_type')==='aes')return json(res,400,{error:'当前只支持明文回调模式'});
  if(req.method==='GET'){const echo=url.searchParams.get('echostr')||'';res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(echo.slice(0,1000));}
  if(req.method!=='POST')return json(res,405,{error:'method not allowed'});
  const msg=parseMessage(await body(req));
  const allow=(process.env.WECHAT_ALLOWED_OPENIDS||'').split(',').map(s=>s.trim()).filter(Boolean);
  // No wildcard: private records must never be accessible by another follower.
  if(!allow.includes(msg.FromUserName)){res.writeHead(200,{'Content-Type':'application/xml; charset=utf-8'});return res.end(replyXML(msg,'此助理仅向已配置的个人账号开放。请在本地配置你的 OpenID 后使用。'));}
  if(msg.MsgType!=='text'){res.writeHead(200,{'Content-Type':'application/xml; charset=utf-8'});return res.end(replyXML(msg,'当前版本支持文字记录和咨询。请用文字发送。'));}
  if(!msg.MsgId)throw Error('文本消息缺少MsgId');
  const receipt=`${msg.ToUserName}:${msg.FromUserName}:${msg.MsgId}`;
  const cached=store.receipt(receipt);if(cached){res.writeHead(200,{'Content-Type':'application/xml; charset=utf-8'});return res.end(cached);}
  // One owner, one personal dataset shared with the local preview.
  let reply;
  if(msg.Content.trim()==='结果')reply=store.receipt('last-model-result')||'还没有待查看的模型回复。';
  else {
    reply=assistant.handle(user,msg.Content);
    store.remember(receipt,replyXML(msg,reply));
    if(wantsModel(msg.Content)){
      if(modelJobs.has(user))reply+='\n上一条咨询仍在处理中，请稍后发送“结果”。';
      else {
        store.remember('last-model-result','正在整理建议，稍后发送“结果”查看。');
        const job=modelResponse(user,msg.Content).then(result=>{store.remember('last-model-result',result||'模型暂时不可用，请参考基础规则回复。');return result;}).finally(()=>modelJobs.delete(user));modelJobs.set(user,job);
        const fast=await Promise.race([job,new Promise(resolve=>{const t=setTimeout(()=>resolve(null),1800);t.unref();})]);
        reply=fast||`${reply}\n\n模型建议正在整理，请稍后发送“结果”查看。`;
      }
    }
  }
  const xml=replyXML(msg,reply);store.remember(receipt,xml);res.writeHead(200,{'Content-Type':'application/xml; charset=utf-8'});res.end(xml);
}
async function route(req,res){
  const url=new URL(req.url,'http://localhost');
  try{
    if(url.pathname==='/wechat')return await callback(req,res,url);
    const remote=req.socket.remoteAddress;
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))return json(res,403,{error:'管理界面仅允许本机访问'});
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'拒绝跨站请求'});
    if(req.method==='GET'&&url.pathname==='/api/state')return json(res,200,{profile:store.profile(user),records:store.records(user),messages:store.history(user),mode:ai?'model':'rules',wechat:process.env.WECHAT_PORT?'configured':'pending'});
    if(req.method==='GET'&&url.pathname==='/api/export'){
      res.setHeader('Content-Disposition','attachment; filename=fitness-records.json');return json(res,200,{exportedAt:new Date().toISOString(),profile:store.profile(user),records:store.records(user),messages:store.history(user)});
    }
    if(req.method==='POST'&&url.pathname==='/api/chat'){
      if(pending.has(user))return json(res,409,{error:'上一条消息还在处理，请稍候。'});
      const value=JSON.parse(await body(req));if(typeof value.text!=='string')throw Error('消息格式错误');
      pending.add(user);try{let reply=assistant.handle(user,value.text);if(wantsModel(value.text))reply=await modelResponse(user,value.text)||reply+'\n模型暂时不可用，本次使用基础规则反馈。';return json(res,200,{reply});}finally{pending.delete(user);}
    }
    if(req.method==='POST'&&url.pathname==='/api/profile')return json(res,200,store.setProfile(user,JSON.parse(await body(req))));
    if(req.method==='DELETE'&&/^\/api\/records\/[\w-]+$/.test(url.pathname)){
      const changed=store.remove(user,url.pathname.split('/').pop());return json(res,changed?200:404,{ok:!!changed});
    }
    if(req.method==='PATCH'&&/^\/api\/records\/[\w-]+$/.test(url.pathname)){
      const r=store.records(user).find(r=>r.id===url.pathname.split('/').pop());if(!r)return json(res,404,{error:'记录不存在'});
      const v=JSON.parse(await body(req));if(typeof v.day!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(v.day)||new Date(v.day+'T00:00:00Z').toISOString().slice(0,10)!==v.day)throw Error('日期格式错误');
      const value={...r.value};if(v.time!==undefined){if(v.time!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time))throw Error('时间无效');if(v.time)value.time=v.time;else delete value.time;}
      if(r.kind==='exercise'){
        if(typeof v.activity!=='string'||!v.activity.trim()||v.activity.length>100)throw Error('请填写运动项目');value.activity=v.activity.trim();
        value.minutes=v.minutes===''||v.minutes===null?null:Number(v.minutes);if(value.minutes!==null&&(!Number.isFinite(value.minutes)||value.minutes<=0||value.minutes>1440))throw Error('时长无效');
      }else if(r.kind==='weight'){value.kg=Number(v.kg);if(!Number.isFinite(value.kg)||value.kg<20||value.kg>400)throw Error('体重无效');}
      else {if(typeof v.note!=='string'||!v.note.trim()||v.note.length>4000)throw Error('记录内容无效');value.note=v.note;}
      store.update(user,r.id,value,v.day);return json(res,200,{ok:true});
    }
    const staticFiles={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
    if(req.method==='GET'&&staticFiles[url.pathname]){
      const [file,type]=staticFiles[url.pathname];res.writeHead(200,{'Content-Type':type+'; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'"});return res.end(readFileSync(join(root,'public',file)));
    }
    json(res,404,{error:'not found'});
  }catch(e){if(!res.headersSent)json(res,400,{error:e.message.includes('JSON')?'请求格式错误':e.message});else res.end();}
}
export {route,store};
if(process.env.FITNESS_TEST!=='1'){
const server=http.createServer(route),port=Number(process.env.PORT)||8787;
server.listen(port,'127.0.0.1',()=>console.log(`Fitness Assistant: http://127.0.0.1:${port} (${ai?'model':'offline rules'})`));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
let wxServer;
if(process.env.WECHAT_PORT){
  if(!process.env.WECHAT_TOKEN||!process.env.WECHAT_ALLOWED_OPENIDS)throw Error('启用公众号监听前必须配置TOKEN及个人OPENID白名单');
  wxServer=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname!=='/wechat')return json(res,404,{error:'not found'});callback(req,res,url).catch(e=>{if(!res.headersSent)json(res,400,{error:e.message});});});wxServer.listen(Number(process.env.WECHAT_PORT),'0.0.0.0');
}
function shutdown(){server.close();wxServer?.close();store.close();process.exit(0);}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);

}
