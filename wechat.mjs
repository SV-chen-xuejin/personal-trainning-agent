import { createHash, timingSafeEqual } from 'node:crypto';
export function signature(token,timestamp,nonce){return createHash('sha1').update([token,timestamp,nonce].sort().join('')).digest('hex');}
export function verifySignature(url,token,now=Date.now()){
  const stamp=url.searchParams.get('timestamp')||'',nonce=url.searchParams.get('nonce')||'',sig=url.searchParams.get('signature')||'';
  if(!token||!/^\d+$/.test(stamp)||Math.abs(now/1000-Number(stamp))>300||!nonce||nonce.length>256||!/^[a-f0-9]{40}$/.test(sig))return false;
  return timingSafeEqual(Buffer.from(signature(token,stamp,nonce)),Buffer.from(sig));
}
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export function parseMessage(xml){
  if(/<!DOCTYPE|<!ENTITY|<Encrypt\b/i.test(xml))throw Error('仅支持明文模式，暂不支持加密回调。');
  if(!/^\s*<xml>[\s\S]*<\/xml>\s*$/.test(xml))throw Error('XML 格式错误');
  const result={};for(const key of ['ToUserName','FromUserName','CreateTime','MsgType','Content','MsgId','Event']){
    const found=[...xml.matchAll(new RegExp(`<${key}>([\\s\\S]*?)<\\/${key}>`,'g'))];if(found.length>1)throw Error('重复 XML 字段');
    let v=found[0]?.[1]||'';if(v.startsWith('<![CDATA[')&&v.endsWith(']]>'))v=v.slice(9,-3);else {if(v.includes('<'))throw Error('非法 XML 字段');v=v.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}result[key]=v;
  }
  if(!result.FromUserName||!result.ToUserName||!result.MsgType)throw Error('消息缺少必要字段');return result;
}
export function replyXML(message,text){return `<xml><ToUserName>${escape(message.FromUserName)}</ToUserName><FromUserName>${escape(message.ToUserName)}</FromUserName><CreateTime>${Math.floor(Date.now()/1000)}</CreateTime><MsgType>text</MsgType><Content>${escape(text)}</Content></xml>`;}
