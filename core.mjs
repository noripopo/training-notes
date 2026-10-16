export const PREFIX='training-notes-v1:';
const range=(a,b,d)=>Array.from({length:Math.round((b-a)/d)+1},(_,i)=>Math.round((a+i*d)*10)/10);
export const catalog={
 smith:{name:'インクラインスミスベンチプレス',parts:['胸'],weights:range(10,150,2.5),help:'バー分10kg込み（記録用設定）'},
 fly:{name:'マシンペックフライ',parts:['胸'],weights:range(4.5,135,4.5),help:'MATRIX G7-S22 ／ 基本重量＋微調整'},
 bench:{name:'ベンチプレス',parts:['胸'],weights:range(20,150,2.5),help:'バー込みの総重量'},
 dip:{name:'加重ディップス',parts:['胸','三頭筋'],weights:range(0,60,10),help:'追加重量のみ ／ 0kgは自重'},
 ez:{name:'シーテッドEZバーフレンチプレス',parts:['三頭筋'],weights:range(10,60,2.5),help:'バー分10kg込み（仮設定）'}
};
export const weights=catalog.smith.weights;
export const fineWeights=[0,1.1,2.3,3.4];
const uuid=()=>crypto.randomUUID();
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
export const totalWeight=r=>r.weight===null?null:Math.round((r.weight+(r.fine??0))*10)/10;
export const performed=e=>e.sets.filter(r=>r.done&&!r.cancelled);
export function normalize(s){if(s.version===2)return structuredClone(s);const exercises={smith:{note:s.note,sets:s.sets.map(r=>({...r,fine:0}))}};for(const k of ['fly','bench','dip'])exercises[k]={note:'',sets:[{id:`${s.id}:${k}:initial`,weight:null,reps:null,fine:0,up:false,done:false,cancelled:false}]};return {version:2,id:s.id,revision:s.revision,startedAt:s.startedAt,endedAt:s.endedAt,parts:['胸'],exercises};}
export function valid(s){
 if(!s||typeof s.id!=='string'||!s.id||!Number.isInteger(s.revision)||s.revision<0||!iso(s.startedAt)||!(s.endedAt===null||iso(s.endedAt)))return false;
 if(s.version===1)return typeof s.note==='string'&&validSets(s.sets,'smith',true);
 if(s.version!==2||!Array.isArray(s.parts)||!s.parts.length||new Set(s.parts).size!==s.parts.length||!s.parts.every(x=>['胸','三頭筋'].includes(x))||!s.exercises||typeof s.exercises!=='object')return false;
 const keys=Object.keys(s.exercises),expected=Object.keys(catalog).filter(k=>catalog[k].parts.some(p=>s.parts.includes(p)));
 return keys.length===expected.length&&keys.every(k=>expected.includes(k)&&typeof s.exercises[k]?.note==='string'&&(s.exercises[k].feedback===undefined||typeof s.exercises[k].feedback==='string')&&validSets(s.exercises[k].sets,k));
}
function validSets(rows,k,legacy=false){return Array.isArray(rows)&&rows.length>0&&new Set(rows.map(r=>r?.id)).size===rows.length&&rows.every(r=>r&&typeof r.id==='string'&&(r.weight===null||catalog[k].weights.includes(r.weight))&&(r.reps===null||Number.isInteger(r.reps)&&r.reps>=1&&r.reps<=20)&&typeof r.up==='boolean'&&typeof r.done==='boolean'&&typeof r.cancelled==='boolean'&&(legacy||fineWeights.includes(r.fine)&& (k==='fly'||r.fine===0))&&(!r.done||r.weight!==null&&r.reps!==null));}
export function newSet(previous){return {id:uuid(),weight:previous?.weight??null,reps:previous?.reps??null,fine:previous?.fine??0,up:false,done:false,cancelled:false};}
export function previousSets(sessions,key,exclude){const s=sessions.filter(s=>s.id!==exclude&&s.endedAt&&s.exercises[key]&&performed(s.exercises[key]).length).sort((a,b)=>b.endedAt.localeCompare(a.endedAt))[0];return s?performed(s.exercises[key]):[];}
export function createSession(parts=['胸'],sessions=[]){
 const exercises={};for(const [k,c]of Object.entries(catalog))if(c.parts.some(p=>parts.includes(p)))exercises[k]={note:'',sets:[newSet(previousSets(sessions,k)[0])]};
 return {version:2,id:uuid(),revision:0,startedAt:new Date().toISOString(),endedAt:null,parts:[...parts],exercises};
}
export function readAll(storage){const out=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(!k?.startsWith(PREFIX))continue;const raw=JSON.parse(storage.getItem(k));const batch=raw.batch??[raw];if(!Array.isArray(batch))throw new Error('保存データが不正です。');for(const e of batch){if(!valid(e.snapshot)||!iso(e.savedAt)||typeof e.reason!=='string')throw new Error('保存データを読み取れません。上書きせず停止しました。');out.push(e);}}return out;}
export function latest(entries){const map=new Map();for(const e of entries){const s=e.snapshot,old=map.get(s.id);if(!old||s.revision>old.revision)map.set(s.id,normalize(s));}return [...map.values()].sort((a,b)=>b.startedAt.localeCompare(a.startedAt));}
export function append(storage,snapshot,reason){if(!valid(snapshot))throw new Error('記録の内容が不正です。');const old=latest(readAll(storage)).find(s=>s.id===snapshot.id);if(old&&snapshot.revision!==old.revision+1)throw new Error('別の画面で変更されました。開き直してください。');if(!old&&snapshot.revision!==0)throw new Error('元の記録が見つかりません。');const entry={savedAt:new Date().toISOString(),reason,snapshot:structuredClone(snapshot)};storage.setItem(PREFIX+uuid(),JSON.stringify(entry));return entry;}
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function restore(storage,data,allowCopies=false){
 if(data?.format!=='training-notes-backup'||data.version!==1||!Array.isArray(data.entries)||data.entries.length>100000)throw new Error('対応していないバックアップです。');
 const local=readAll(storage),index=new Map();
 for(const e of [...local,...data.entries]){if(!valid(e?.snapshot)||!iso(e.savedAt)||typeof e.reason!=='string')throw new Error('バックアップ内に不正な記録があります。');}
 const imported=new Set(local.filter(e=>typeof e.sourceFingerprint==='string').map(e=>e.sourceFingerprint));
 const conflicts=new Set();for(const e of local)index.set(e.snapshot.id+':'+e.snapshot.revision,canonical(e.snapshot));
 const incoming=new Map();for(const e of data.entries){const key=e.snapshot.id+':'+e.snapshot.revision,hash=canonical(e.snapshot);if(incoming.has(key)&&incoming.get(key)!==hash)throw new Error('ファイル内に矛盾した履歴があります。');incoming.set(key,hash);if(!imported.has(hash)&&index.has(key)&&index.get(key)!==hash)conflicts.add(e.snapshot.id);}
 if(conflicts.size&&!allowCopies)return {conflicts:conflicts.size,added:0};
 const remap=new Map([...conflicts].map(id=>[id,uuid()]));const seen=new Set(local.map(e=>canonical(e.snapshot)));const batch=[];
 for(const e of data.entries){const hash=canonical(e.snapshot);if(imported.has(hash)||!remap.has(e.snapshot.id)&&seen.has(hash))continue;seen.add(hash);const copy=structuredClone(e);if(remap.has(copy.snapshot.id)){copy.sourceFingerprint=hash;copy.snapshot.id=remap.get(copy.snapshot.id);}batch.push(copy);}
 if(batch.length)storage.setItem(PREFIX+uuid(),JSON.stringify({batch}));return {conflicts:conflicts.size,added:batch.length};
}
