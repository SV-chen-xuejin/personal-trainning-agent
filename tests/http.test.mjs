import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,rmdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {signature} from '../wechat.mjs';
const dir=mkdtempSync(join(tmpdir(),'fitness-test-'));
process.env.AI_BASE_URL='http://127.0.0.1:9999/v1';process.env.AI_API_KEY='test-only';process.env.AI_MODEL='test-model';
process.env.FITNESS_TEST='1';process.env.FITNESS_DATA_DIR=dir;process.env.WECHAT_TOKEN='unit-test-token';process.env.WECHAT_ALLOWED_OPENIDS='owner';
const {route,store}=await import('../server.mjs');
async function request(path,method='GET',data,headers={}){
  const req={url:path,method,headers:{host:'127.0.0.1:8787',...headers},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){if(data)yield Buffer.from(typeof data==='string'?data:JSON.stringify(data));}};
  let status=200,out='',responseHeaders={};const res={headersSent:false,setHeader(k,v){responseHeaders[k]=v;},writeHead(code,values){status=code;Object.assign(responseHeaders,values);this.headersSent=true;},end(value=''){out+=value;}};
  await route(req,res);return {status,text:out,headers:responseHeaders,json:()=>JSON.parse(out)};
}
const stamp=String(Math.floor(Date.now()/1000));const signed='/wechat?'+new URLSearchParams({timestamp:stamp,nonce:'abc',signature:signature('unit-test-token',stamp,'abc')});
const message=(id,from='owner')=>`<xml><ToUserName>account</ToUserName><FromUserName>${from}</FromUserName><MsgType>text</MsgType><MsgId>${id}</MsgId><Content><![CDATA[�����ܲ�30����]]></Content></xml>`;
test('�ӿ��������̣����졢��ѯ���༭��������ɾ��',async()=>{
  let r=await request('/api/state');assert.equal(r.json().records.length,0);
  r=await request('/api/chat','POST',{text:'����18:30 ��Ӿ40����'});assert.match(r.json().reply,/�Ѽ�¼/);
  r=await request('/api/state');const row=r.json().records[0];assert.equal(row.value.time,'18:30');assert.equal(row.value.minutes,40);
  r=await request('/api/records/'+row.id,'PATCH',{day:'2026-10-27',time:'19:00',minutes:25,activity:'��Ӿ'});assert.equal(r.status,200);
  r=await request('/api/export');assert.equal(r.json().records[0].value.minutes,25);assert.match(r.headers['Content-Disposition'],/attachment/);
  r=await request('/api/records/'+row.id,'PATCH',{day:'2026-02-30',minutes:20,activity:'��Ӿ'});assert.equal(r.status,400);
  r=await request('/api/records/'+row.id,'DELETE');assert.equal(r.status,200);assert.equal(store.records('local').length,0);
});
test('��վ���󱻾ܾ���������֤�벻���ڵ�·��',async()=>{
  assert.equal((await request('/api/chat','POST',{text:'�����ܲ�30����'},{origin:'https://untrusted.example'})).status,403);
  assert.equal((await request('/api/chat','POST',{text:''})).status,400);
  assert.equal((await request('/api/profile','POST',{height:999})).status,400);
  assert.equal((await request('/api/unknown')).status,404);
  assert.equal((await request('/','GET')).status,200);
});
test('΢��У�����֡���Ϣ����ȥ�غ͸��˰�����',async()=>{
  assert.equal((await request('/wechat?signature=bad')).status,403);
  let r=await request(signed+'&echostr=hello');assert.equal(r.text,'hello');
  r=await request(signed,'POST',message('1'));assert.equal(r.status,200);assert.match(r.text,/�Ѽ�¼/);const count=store.records('local').length;
  const duplicate=await request(signed,'POST',message('1'));assert.equal(duplicate.text,r.text);assert.equal(store.records('local').length,count);
  r=await request(signed,'POST',message('2','other-person'));assert.match(r.text,/����������/);assert.equal(store.records('local').length,count);
  r=await request(signed+'&encrypt_type=aes','POST','x');assert.equal(r.status,400);
});
test('���ݿ�رպ����´��Կɶ�ȡ��¼',async()=>{
  const {createStore}=await import('../core.mjs');const path=join(dir,'persistence.sqlite');let second=createStore(path);second.add('person','exercise','2026-10-27',{activity:'��Ӿ',minutes:30},'test');second.close();second=createStore(path);assert.equal(second.records('person')[0].value.minutes,30);second.close();
});
test('ģ����ѯ��ȡ��ʷ��ģ��ʧ����ȷ���ˣ��������˶���¼',async()=>{
  const original=global.fetch;let seen;const before=store.records('local').length;
  try{
    global.fetch=async(url,options)=>{seen=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'ģ�Ͳ��Իظ�����Ͻ��ڼ�¼�����˶���'}}]})};};
    let r=await request('/api/chat','POST',{text:'�����ʺ�ȥ��Ӿ��'});assert.match(r.json().reply,/ģ�Ͳ��Իظ�/);assert.equal(seen.model,'test-model');assert.match(seen.messages[1].content,/�ܲ�/);assert.equal(store.records('local').length,before);
    global.fetch=async()=>{throw Error('offline');};r=await request('/api/chat','POST',{text:'�����ʺ���Ӿ��'});assert.match(r.json().reply,/ģ����ʱ������/);
  }finally{global.fetch=original;}
});
test.after(()=>{store.close();for(const name of ['fitness.sqlite','fitness.sqlite-wal','fitness.sqlite-shm','persistence.sqlite','persistence.sqlite-wal','persistence.sqlite-shm']){const path=join(dir,name);if(existsSync(path))rmSync(path);}rmdirSync(dir);});
