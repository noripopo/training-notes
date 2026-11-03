import {PREFIX,readAll} from './core.mjs?v=20261104-half-deadlift';
import {DELIVERY_PREFIX,SETTINGS_KEY} from './delivery.mjs?v=20261104-half-deadlift';

export const DB_NAME='training-notes-durable-v1';
const relevant=k=>k?.startsWith(PREFIX)||k?.startsWith(DELIVERY_PREFIX)||k===SETTINGS_KEY;
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const complete=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('保存を取り消しました。'));tx.onerror=()=>{};});
const asStorage=m=>({get length(){return m.size;},key:i=>[...m.keys()][i],getItem:k=>m.get(k)??null});

// 同期の画面処理用キャッシュと、非同期の永続化を分ける。
// flush()の完了前は保存済みと表示しない。失敗した入力も退避用に保持する。
export function bufferedStorage(initial,write,{onError=()=>{},onChange=()=>{}}={}){
 const cache=new Map(initial),keys=[...cache.keys()];let tail=Promise.resolve(),failure=null,pending=0;
 return {...asStorage(cache),get length(){return cache.size;},
  key:i=>keys[i]??null,
  get pending(){return pending;},get failure(){return failure;},
  setItem(key,value){
   if(failure)throw failure;
   value=String(value);if(cache.get(key)===value)return;
   if(key.startsWith(PREFIX)&&cache.has(key))throw new Error('既存の履歴は上書きできません。');
   if(!cache.has(key))keys.push(key);cache.set(key,value);pending++;onChange();
   tail=tail.then(()=>{if(failure)throw failure;return write(key,value);}).catch(e=>{if(!failure){failure=e;onError(e);}throw e;}).finally(()=>{pending--;onChange();});
   tail.catch(()=>{});
  },
  flush(){return tail;}
 };
}

async function readDatabase(db){
 const tx=db.transaction(['records','legacy','meta'],'readonly'),done=complete(tx);
 const records=tx.objectStore('records'),legacy=tx.objectStore('legacy');
 const [keys,values,oldKeys,oldValues,generation]=await Promise.all([request(records.getAllKeys()),request(records.getAll()),request(legacy.getAllKeys()),request(legacy.getAll()),request(tx.objectStore('meta').get('generation'))]);
 await done;return {records:new Map(keys.map((k,i)=>[k,values[i]])),legacy:new Map(oldKeys.map((k,i)=>[k,oldValues[i]])),generation:generation??0};
}

export async function openStorage(legacyStorage,{indexedDB=globalThis.indexedDB,name=DB_NAME,onError=()=>{},onChange=()=>{},onExternal=()=>{}}={}){
 if(!indexedDB)throw new Error('大容量保存を利用できません。元データは変更していません。');
 const old=new Map();for(let i=0;i<legacyStorage.length;i++){const k=legacyStorage.key(i);if(relevant(k))old.set(k,legacyStorage.getItem(k));}
 readAll(asStorage(old));
 const opening=indexedDB.open(name,1);
 opening.onupgradeneeded=()=>{for(const store of ['records','legacy','meta'])opening.result.createObjectStore(store);};
 opening.onblocked=()=>onError(new Error('古い画面を閉じてから開き直してください。移行を待っています。'));
 const db=await request(opening);db.onversionchange=()=>{db.close();onExternal();};
 try{
  let state=await readDatabase(db);const additions=[];
  for(const [k,v]of old){if(state.legacy.has(k)){if(k!==SETTINGS_KEY&&state.legacy.get(k)!==v)throw new Error('旧保存領域の内容に食い違いがあります。上書きせず停止しました。');}else additions.push([k,v]);}
  readAll(asStorage(state.records));
  if(additions.length){
   const tx=db.transaction(['records','legacy','meta'],'readwrite'),done=complete(tx);let conflict=null;
   const meta=tx.objectStore('meta');const check=meta.get('generation');
   check.onsuccess=()=>{
    if((check.result??0)!==state.generation){conflict=new Error('別の画面で保存先が変わりました。開き直してください。');tx.abort();return;}
    for(const [k,v]of additions){
     if(state.records.has(k)&&k!==SETTINGS_KEY&&state.records.get(k)!==v){conflict=new Error('移行先と元データが一致しません。上書きしません。');tx.abort();return;}
     if(!state.records.has(k))tx.objectStore('records').add(v,k);
     tx.objectStore('legacy').add(v,k);
    }
    meta.put(state.generation+1,'generation');
   };
   try{await done;}catch(e){throw conflict??e;}
   state=await readDatabase(db);
  }
  // 元領域を読み直し、移行の間に変更がないこととコピーの一致を照合する。
  let count=0;for(let i=0;i<legacyStorage.length;i++){const k=legacyStorage.key(i);if(!relevant(k))continue;count++;if(old.get(k)!==legacyStorage.getItem(k))throw new Error('移行中に元の記録が変更されました。開き直してください。');}
  if(count!==old.size)throw new Error('移行中に元の記録が追加されました。開き直してください。');
  for(const [k,v]of old)if(state.legacy.get(k)!==v)throw new Error('コピーの照合に失敗しました。元データは残しています。');
  readAll(asStorage(state.records));let generation=state.generation;
  const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(name):null;
  channel?.addEventListener('message',onExternal);
  const adapter=bufferedStorage(state.records,(key,value)=>new Promise((resolve,reject)=>{
   const tx=db.transaction(['records','meta'],'readwrite');let conflict=null;
   tx.oncomplete=()=>{generation++;channel?.postMessage({changed:true});resolve();};
   tx.onabort=()=>reject(conflict??tx.error??new Error('保存に失敗しました。'));
   tx.onerror=()=>{};const meta=tx.objectStore('meta'),check=meta.get('generation');
   check.onsuccess=()=>{
    if((check.result??0)!==generation){conflict=new Error('別の画面で記録が変更されました。未保存分をバックアップし、開き直してください。');tx.abort();return;}
    const records=tx.objectStore('records');
    if(key.startsWith(PREFIX)||key.startsWith(DELIVERY_PREFIX))records.add(value,key);else records.put(value,key);
    meta.put(generation+1,'generation');
   };
  }),{onError,onChange});
  return Object.assign(adapter,{backend:'IndexedDB',migratedKeys:old.size,close(){channel?.close();db.close();}});
 }catch(e){db.close();throw e;}
}

export function capacityWarning({usage,quota}={}){
 if(!Number.isFinite(usage)||!Number.isFinite(quota)||quota<=0)return {level:'unknown',text:'空き容量は取得できません。定期的にバックアップしてください。'};
 const ratio=usage/quota,remaining=quota-usage;
 if(ratio>=.9||remaining<20*1024*1024)return {level:'critical',text:'保存領域の空きが少なくなっています。今すぐバックアップを書き出してください。'};
 if(ratio>=.8||remaining<100*1024*1024)return {level:'warning',text:'保存領域の残りが少なくなってきました。バックアップを確認してください。'};
 return {level:'ok',text:'容量は推定値です。端末の空き容量によって変わります。'};
}
