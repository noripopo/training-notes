import {valid} from './core.mjs?v=20261022-shoulder';

export const SHORTCUT_NAME='Training iCloud Bridge';
export const DELIVERY_PREFIX='training-delivery-v1:';
export const SETTINGS_KEY='training-delivery-settings-v1';
// 安全確認用の試作上限。iOSの動作保証値ではない。
export const MAX_URL_LENGTH=48000;

export function makeDelivery(session,now=new Date().toISOString()){
 if(!valid(session)||!session.endedAt)throw new Error('終了済みの記録だけを受け渡せます。');
 const record=structuredClone(session);
 const backup={format:'training-notes-backup',version:1,exportedAt:now,entries:[{savedAt:now,reason:'終了後の受け渡し',snapshot:record}]};
 return {fileName:`training-${encodeURIComponent(session.id)}-r${session.revision}-${now.replace(/[:.]/g,'-')}.json`,content:JSON.stringify(backup)};
}
export function shortcutURL(envelope){
 const url=`shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(JSON.stringify(envelope))}`;
 if(url.length>MAX_URL_LENGTH)throw new Error('記録が大きいため、ショートカットへの受け渡しを止めました。バックアップ書き出しを使ってください。');
 return url;
}
export function enqueue(storage,session){
 const data={version:1,id:crypto.randomUUID(),sessionId:session.id,revision:session.revision,status:'pending',envelope:makeDelivery(session)};
 storage.setItem(DELIVERY_PREFIX+data.id,JSON.stringify(data));return data;
}
export function pending(storage){const out=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(DELIVERY_PREFIX))out.push(JSON.parse(storage.getItem(key)));}return out;}
