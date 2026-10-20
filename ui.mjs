import {dateKey,sessionNames,exerciseKeys,historyGroups,recentDays,calendarParts} from './history.mjs?v=20261020-back';
import {SHORTCUT_NAME,SETTINGS_KEY,enqueue,pending,shortcutURL} from './delivery.mjs?v=20261020-back';
import {PREFIX,catalog,bodyParts,fineOptions,rowReady,newSet,createSession,readAll,latest,append,previousSets,performed,totalWeight,restore,setSessionDeleted} from './core.mjs?v=20261020-back';
const app=document.querySelector('#app'),error=document.querySelector('#error');
let entries=[],sessions=[],active=null,exercise='smith',failed=false,choosingParts=false,viewGroupId=null,editing=false,calendarOpen=false,selectedDate=dateKey(new Date());
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>new Date(s).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
const count=s=>Object.values(s.exercises).reduce((n,e)=>n+performed(e).length,0);
function stop(e){failed=true;error.hidden=false;error.textContent=`保存・読み込みを停止しました。${e.message} この画面の入力は残しています。開き直す前に内容を控えてください。`;app.querySelectorAll('button,select,textarea,input').forEach(x=>x.disabled=true);}
function reload(){entries=readAll(localStorage);sessions=latest(entries);}
function save(next,reason){try{entries.push(append(localStorage,next,reason));sessions=latest(entries);active=next;return true;}catch(e){stop(e);return false;}}
function change(fn,reason,render=true){if(failed||!active||active.endedAt&&!editing)return;const next=structuredClone(active);next.revision++;fn(next);if(save(next,reason)){if(render)draw();else document.querySelector('#save-status').textContent='保存済み';}}
function opts(values,value,plus=false,decimals){const old=value!==null&&!values.includes(value)?`<option value="${value}" selected>${value}（旧設定）</option>`:'';return '<option value="">—</option>'+old+values.map(x=>`<option value="${x}" ${x===value?'selected':''}>${plus?(x===0?'自重':`＋${x}`):decimals===undefined?x:x.toFixed(decimals)}</option>`).join('');}
function setDescription(r,i,key){return `${i+1}：${totalWeight(r)??'未選択'}kg × ${r.reps??'未選択'}回 ${r.up?'アップ':''} ${r.cancelled?'取り消し':r.done?'実施済み':'未実施'}${r.grip?' ／ '+esc(catalog[key]?.grips?.[r.grip]??r.grip):''}${r.negativeReps!==undefined?' ／ ネガティブ'+r.negativeReps+'回':''}${key==='tBarRow'?' ／ '+(r.weightBasis?'バー10kg込み':'旧記録・重量方式未確認'):''}`;}
function groupButton(g){return `<button class="history-item" data-group="${g.id}">${esc(date(g.startedAt).split(' ')[0])} ／ トレーニング1回<small>${esc(g.keys.map(k=>catalog[k].name).join('・')||'実施済みの種目なし')}</small><small>${g.keys.length}種目 ／ 実施済み ${g.count}セット</small></button>`;}
function weightText(key,row){const weight=totalWeight(row);if(weight===null)return '—';if(key==='dip'||catalog[key].addedWeight)return weight===0?'自重':`＋${weight}kg`;return `${catalog[key].decimals?weight.toFixed(1):weight}kg`;}
function exerciseCard(key,e,other=false){
 const rows=e.sets.map((r,i)=>({r,i})).filter(({r})=>other?!r.done||r.cancelled:r.done&&!r.cancelled);
 return `<section class="history-card"><h2>${catalog[key].name}</h2><p class="sub">${esc(catalog[key].help)}</p>${rows.length?`<table class="record-table"><thead><tr><th>セット</th><th>重量</th><th>回数</th></tr></thead><tbody>${rows.map(({r,i})=>`<tr><td>${i+1}${r.up?'<small class="warmup-badge">アップ</small>':''}</td><td>${weightText(key,r)}</td><td>${r.reps??'—'}回${key==='pullUp'?`<small>ネガティブ ${r.negativeReps===undefined?'未記録':r.negativeReps+'回'}</small>`:''}${key==='tBarRow'?`<small>${r.weightBasis?'バー10kg込み':'旧記録・重量方式未確認'}</small>`:''}${other?`<small>${r.cancelled?'取消':'未実施'}</small>`:''}${r.grip?`<small>${esc(catalog[key].grips?.[r.grip]??r.grip)}</small>`:''}</td></tr>`).join('')}</tbody></table>`:''}${e.note?`<h3>種目メモ</h3><p class="history-note">${esc(e.note)}</p>`:''}${e.feedback?`<details><summary>ツールの修正要望</summary><p class="history-note">${esc(e.feedback)}</p></details>`:''}</section>`;
}
function historyView(g){
 const completed=g.sessions.flatMap(s=>Object.entries(s.exercises).filter(([,e])=>performed(e).length).map(([k,e])=>exerciseCard(k,e)));
 const other=g.sessions.flatMap(s=>Object.entries(s.exercises).filter(([,e])=>e.sets.some(r=>!r.done||r.cancelled)).map(([k,e])=>exerciseCard(k,{...e,note:performed(e).length?'':e.note,feedback:performed(e).length?'':e.feedback},true)));
 return `<button id="home">‹ 記録一覧へ</button><h2>${g.date.replaceAll('-','/')} ／ トレーニング1回</h2><p class="sub">${g.keys.length}種目 ／ 実施済み ${g.count}セット</p><p class="view-notice">閲覧中・数値は変更されません</p>${completed.join('')||'<p>実施済みのセットはありません。</p>'}${other.length?`<details><summary>未実施・取り消しのセット</summary>${other.join('')}</details>`:''}<button class="wide" id="edit-history">編集する</button><details><summary>iCloudへの受け渡し</summary>${g.sessions.map((s,i)=>`<button class="wide" data-resend-session="${s.id}">${g.sessions.length>1?esc(sessionNames(s)): 'この記録'}をiCloudへ渡す</button>`).join('')}</details>`;
}
function calendarView(){
 const days=recentDays(),groups=historyGroups(sessions,entries),recent=groups.filter(g=>days.includes(g.date)&&g.count>0),trainingDays=new Set(recent.map(g=>g.date));
 const selectedGroups=groups.filter(g=>g.date===selectedDate&&g.count>0);
 const offset=(new Date(days[0]+'T12:00:00+09:00').getUTCDay()+6)%7;
 return `<details id="recent-calendar" ${calendarOpen?'open':''}><summary>直近2週間のカレンダー</summary><p class="sub">${days[0].replaceAll('-','/')}〜${days.at(-1).replaceAll('-','/')}<br>トレーニング ${trainingDays.size}日・${recent.length}回</p><div class="calendar-grid">${['月','火','水','木','金','土','日'].map(d=>`<span class="weekday">${d}</span>`).join('')}${'<span></span>'.repeat(offset)}${days.map(day=>{const parts=calendarParts(groups,day);return `<button data-calendar-date="${day}" aria-label="${day}${parts.length?' '+parts.join('・'):''}" aria-pressed="${selectedDate===day}"><span>${Number(day.slice(-2))}</span>${parts.map(part=>`<small>${esc(part)}</small>`).join('')}</button>`;}).join('')}</div><h3>${selectedDate.replaceAll('-','/')}</h3>${selectedGroups.map(groupButton).join('')}${!selectedGroups.length?'<p class="sub">この日の記録はありません。</p>':''}</details>`;
}
app.addEventListener('toggle',e=>{if(e.target.id==='recent-calendar')calendarOpen=e.target.open;},true);
function draw(){
 if(!active&&viewGroupId){const group=historyGroups(sessions,entries).find(g=>g.id===viewGroupId);if(group){app.innerHTML=historyView(group);return;}viewGroupId=null;}

 if(!active&&choosingParts){app.innerHTML=`<button id="cancel-start">‹ 戻る</button><h2>今日鍛える部位</h2><div class="parts">${bodyParts.map(p=>`<label><input type="checkbox" value="${p}" ${p==='胸'?'checked':''}>${p}</label>`).join('')}</div><button class="wide primary" id="confirm-start">この部位で始める</button>`;return;}
 if(!active){const visible=sessions.filter(s=>!s.deletedAt),deleted=sessions.filter(s=>s.deletedAt);app.innerHTML=`<button class="wide primary" id="start">開始する</button>${visible.some(s=>!s.endedAt)?'<h2>途中の記録</h2><p class="sub">長押しで削除できます（あとで元に戻せます）</p>':''}${visible.filter(s=>!s.endedAt).map(s=>sessionButton(s,'続きを記録する')).join('')}<h2>過去の記録</h2>${historyGroups(sessions,entries).map(groupButton).join('')||'<p class="sub">終了した記録はまだありません</p>'}${calendarView()}${deleted.length?`<details id="deleted-records"><summary>削除した記録（${deleted.length}件）</summary><p class="sub">元のデータは残っています。戻すと続きを記録できます。</p>${deleted.map(s=>`<div class="deleted-item"><p>${esc(date(s.startedAt))}<br>${esc(sessionNames(s))} ／ 実施済み ${count(s)}セット</p><button data-restore-session="${s.id}">元に戻す</button></div>`).join('')}</details>`:''}`;return;}
 if(!active.exercises[exercise])exercise=Object.keys(active.exercises)[0];
 const e=active.exercises[exercise],c=catalog[exercise];
 const sourcePicker=editing&&viewGroupId?`<p class="edit-notice">編集中・変更は自動保存されます</p><label for="edit-source">編集する種目の記録</label><select id="edit-source">${historyGroups(sessions,entries).find(g=>g.id===viewGroupId)?.sessions.map(v=>`<option value="${v.id}" ${v.id===active.id?'selected':''}>${esc(sessionNames(v))}</option>`).join('')??''}</select>`:'';
 app.innerHTML=`<button id="home">‹ 記録一覧へ</button>${sourcePicker}<p class="sub">${esc(date(active.startedAt))} ／ ${active.endedAt?'終了済み・編集中':'記録中'}<br>${esc(sessionNames(active))} ／ 実施済み ${count(active)}セット</p><label for="exercise">種目</label><select id="exercise">${Object.keys(active.exercises).map(k=>`<option value="${k}" ${k===exercise?'selected':''}>${catalog[k].name}</option>`).join('')}</select><p class="sub">${c.help}</p><div class="labels"><span>組</span><span>${['fly','rearDelt'].includes(exercise)?'基本kg':'kg'}</span><span>rep</span><span>アップ</span><span>実施</span></div>${e.sets.map((r,i)=>r.cancelled?`<p class="cancelled">${i+1}：取り消し済み（履歴に保持）</p>`:`<div class="row" data-id="${r.id}"><span class="number">${i+1}</span><select data-field="weight" aria-label="${i+1}セット目の重量">${opts(c.weights,r.weight,exercise==='dip'||c.addedWeight,c.decimals)}</select><select data-field="reps" aria-label="${i+1}セット目の回数">${opts(Array.from({length:exercise==='pullUp'?21:20},(_,n)=>n+(exercise==='pullUp'?0:1)),r.reps)}</select><button class="up" data-action="up" aria-pressed="${r.up}" aria-label="${i+1}セット目アップ">アップ</button><button class="done" data-action="done" aria-pressed="${r.done}" aria-label="${i+1}セット目の実施を確定" ${!rowReady(r,exercise)?'disabled':''}>${r.done?'済':'✓'}</button>${c.grips?`<div class="grip-row"><label>グリップ<select data-field="grip" aria-label="${i+1}セット目のグリップ">${r.grip===undefined&&['pullUp','tBarRow'].includes(exercise)?'<option value="" selected>未選択（過去の記録）</option>':''}${Object.entries(c.grips).map(([key,name])=>`<option value="${key}" ${key===(r.grip??(['pullUp','tBarRow'].includes(exercise)?'':c.defaultGrip))?'selected':''}>${name}</option>`).join('')}</select></label></div>`:''}${exercise==='pullUp'?`<div class="fine"><label>ネガティブ <select data-field="negativeReps" aria-label="${i+1}セット目のネガティブ回数">${r.negativeReps===undefined?'<option value="" selected>未記録</option>':''}${Array.from({length:11},(_,n)=>`<option value="${n}" ${r.negativeReps===n?'selected':''}>${n}</option>`).join('')}</select> 回</label></div>`:''}${exercise==='tBarRow'&&!r.weightBasis?'<p class="grip-row sub">旧記録：重量方式は未確認。重量を選び直すとバー10kg込みになります。</p>':''}${fineOptions(exercise).length>1?`<div class="fine"><label>微調整 ＋ <select data-field="fine" aria-label="${i+1}セット目の微調整">${fineOptions(exercise).map(x=>`<option value="${x}" ${x===r.fine?'selected':''}>${x}</option>`).join('')}</select> kg</label><output>合計 ${totalWeight(r)??'—'}kg</output></div>`:''}<button class="cancel" data-action="cancel">このセットを取り消す</button></div>`).join('')}<button class="wide" id="add">＋ セットを追加</button><div class="memo"><label for="note">種目メモ</label><textarea id="note" placeholder="例：2セット目、最後の2回きつい。">${esc(e.note)}</textarea></div><details class="feedback-box"><summary>ツールの修正要望</summary><label for="feedback">使いにくいところ・直してほしいところ</label><textarea id="feedback" placeholder="例：重量の選択をもっと簡単にしたい">${esc(e.feedback??'')}</textarea></details><p class="save" id="save-status" aria-live="polite">保存済み</p>${active.endedAt?'<button class="wide primary" id="finish-edit">編集を終える</button><button class="wide" id="resend">この記録をiCloudへ渡す</button>':'<button class="wide primary" id="next">次の種目を選ぶ</button><button class="wide" id="finish">今日のトレーニングを終了</button>'}<details><summary>修正履歴</summary>${entries.filter(v=>v.snapshot.id===active.id).slice().reverse().map(v=>{const s=v.snapshot,records=s.version===1?{smith:{sets:s.sets,note:s.note}}:s.exercises;return `<details><summary>${esc(date(v.savedAt))} ${esc(v.reason)}</summary>${Object.entries(records).map(([k,x])=>`<p>${catalog[k].name}<br>${x.sets.map((r,i)=>setDescription(r,i,k)).join('<br>')}</p><p>メモ：${esc(x.note)}</p><p>修正要望：${esc(x.feedback??'')}</p>`).join('')}</details>`;}).join('')}</details>`;
}
function renderTop(){draw();window.scrollTo(0,0);}
function sessionButton(s,title){return `<button class="history-item" data-open="${s.id}" ${!s.endedAt?'data-resumable="true"':''}>${title||esc(date(s.startedAt))}<small>${title?esc(date(s.startedAt))+' ／ ':''}${esc(sessionNames(s))} ／ 実施済み ${count(s)}セット</small></button>`;}
const deleteDialog=document.querySelector('#delete-session-dialog');
let pendingDeleteId=null,press=null,suppressedId=null;
function cancelPress(){if(press)clearTimeout(press.timer);press=null;}
function requestSessionDelete(id){
 const session=sessions.find(s=>s.id===id);if(failed||active||!session||session.endedAt||session.deletedAt)return;
 suppressedId=id;
 pendingDeleteId=id;document.querySelector('#delete-session-info').textContent=`${date(session.startedAt)} ／ ${session.parts.join('・')} ／ 実施済み ${count(session)}セット`;
 deleteDialog.showModal();
}
app.addEventListener('pointerdown',e=>{
 const button=e.target.closest('button[data-resumable]');if(!button||failed||e.button!==0)return;
 suppressedId=null;cancelPress();press={x:e.clientX,y:e.clientY,pointerId:e.pointerId,timer:setTimeout(()=>{const id=button.dataset.open;cancelPress();requestSessionDelete(id);},650)};
});
app.addEventListener('pointermove',e=>{if(press&&e.pointerId===press.pointerId&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>10)cancelPress();});
for(const type of ['pointerup','pointercancel','pointerleave'])app.addEventListener(type,cancelPress);
window.addEventListener('blur',cancelPress);window.addEventListener('scroll',cancelPress,true);
app.addEventListener('click',e=>{const button=e.target.closest('[data-resumable]');if(button&&button.dataset.open===suppressedId){e.preventDefault();e.stopImmediatePropagation();suppressedId=null;}},true);
app.addEventListener('contextmenu',e=>{const button=e.target.closest('[data-resumable]');if(button){e.preventDefault();cancelPress();if(!deleteDialog.open)requestSessionDelete(button.dataset.open);}});
app.addEventListener('keydown',e=>{const button=e.target.closest('[data-resumable]');if(button&&e.key==='Delete'){e.preventDefault();requestSessionDelete(button.dataset.open);}});
document.querySelector('#cancel-session-delete').onclick=()=>deleteDialog.close();
deleteDialog.addEventListener('close',()=>{pendingDeleteId=null;suppressedId=null;});
document.querySelector('#confirm-session-delete').onclick=()=>{
 const session=sessions.find(s=>s.id===pendingDeleteId);deleteDialog.close();if(!session||failed)return;
 try{if(save(setSessionDeleted(session,true),'記録を削除（復元可能）')){active=null;draw();notify('一覧から削除しました。「削除した記録」から元に戻せます。');}}catch(e){stop(e);}
};
app.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||failed)return;
 if(b.dataset.restoreSession){const session=sessions.find(s=>s.id===b.dataset.restoreSession);if(session?.deletedAt&&save(setSessionDeleted(session,false),'記録を元に戻す')){active=null;draw();notify('記録を元に戻しました。続きを記録できます。');}return;}
 if(b.dataset.group){viewGroupId=b.dataset.group;active=null;editing=false;renderTop();return;}
 if(b.dataset.calendarDate){selectedDate=b.dataset.calendarDate;calendarOpen=true;draw();return;}
 if(b.dataset.resendSession){queueDelivery(sessions.find(s=>s.id===b.dataset.resendSession),true,true);return;}
 if(b.id==='edit-history'){const group=historyGroups(sessions,entries).find(g=>g.id===viewGroupId);if(group){editing=true;active=structuredClone(group.sessions[0]);exercise=exerciseKeys(active)[0]??Object.keys(active.exercises)[0];renderTop();}return;}
 if(b.id==='finish-edit'){active=null;editing=false;renderTop();return;}
 if(b.dataset.open){const session=sessions.find(s=>s.id===b.dataset.open&&!s.deletedAt);if(!session)return;if(session.endedAt){viewGroupId=historyGroups(sessions,entries).find(g=>g.sessions.some(v=>v.id===session.id))?.id;active=null;editing=false;}else{active=structuredClone(session);viewGroupId=null;editing=false;}renderTop();return;}
 if(b.id==='home'){active=null;viewGroupId=null;editing=false;renderTop();return;}
 if(b.id==='start'){viewGroupId=null;editing=false;choosingParts=true;draw();return;}
 if(b.id==='cancel-start'){choosingParts=false;draw();return;}
 if(b.id==='confirm-start'){const parts=[...app.querySelectorAll('.parts input:checked')].map(x=>x.value);if(!parts.length){alert('部位を1つ以上選んでください。');return;}if(save(createSession(parts,sessions),'開始')){choosingParts=false;renderTop();}return;}
 if(b.id==='add'){change(s=>{const x=s.exercises[exercise];const previous=previousSets(sessions,exercise,s.id)[x.sets.length];const row=newSet(previous);if(exercise==='tBarRow'&&previous&&!previous.weightBasis)row.weight=null;if(exercise==='pullUp')row.negativeReps=0;if(exercise==='tBarRow')row.weightBasis='bar10Included';if(catalog[exercise].grips)row.grip=x.sets.filter(r=>!r.cancelled).at(-1)?.grip??catalog[exercise].defaultGrip;x.sets.push(row);},'セット追加');return;}
 if(b.id==='next'){const picker=document.querySelector('#exercise');picker.focus();picker.scrollIntoView({block:'center',behavior:'smooth'});try{picker.showPicker?.();}catch{}return;}
 if(b.id==='finish'){if(!confirm('トレーニングを終了しますか？ ✓を付けたセットだけ実績に含めます。'))return;const next=structuredClone(active);next.revision++;next.endedAt=new Date().toISOString();if(save(next,'終了')){viewGroupId=historyGroups(sessions,entries).find(g=>g.sessions.some(v=>v.id===next.id))?.id;active=null;editing=false;draw();queueDelivery(next,true);}return;}
 if(b.id==='resend'){queueDelivery(active,true,true);return;}
 const row=b.closest('[data-id]');if(!row)return;const r=active.exercises[exercise].sets.find(r=>r.id===row.dataset.id);
 if(b.dataset.action==='cancel'&&r.done&&!confirm('実施済みのセットを取り消しますか？ 元の内容は履歴に残ります。'))return;
 change(s=>{const item=s.exercises[exercise].sets.find(x=>x.id===r.id);if(b.dataset.action==='cancel')item.cancelled=true;else item[b.dataset.action]=!item[b.dataset.action];},b.dataset.action==='cancel'?'セット取り消し':b.dataset.action==='up'?'アップ変更':'実施状態変更');
});
app.addEventListener('change',e=>{if(e.target.id==='edit-source'&&editing){active=structuredClone(sessions.find(s=>s.id===e.target.value));exercise=exerciseKeys(active)[0]??Object.keys(active.exercises)[0];draw();return;}if(e.target.id==='exercise'){exercise=e.target.value;draw();return;}if(!e.target.dataset.field)return;const id=e.target.closest('[data-id]').dataset.id;change(s=>{const r=s.exercises[exercise].sets.find(r=>r.id===id);if(e.target.dataset.field==='negativeReps'&&e.target.value===''){delete r.negativeReps;return;}r[e.target.dataset.field]=e.target.dataset.field==='grip'?e.target.value:e.target.value===''?null:Number(e.target.value);if(exercise==='tBarRow'&&e.target.dataset.field==='weight'&&r.weight!==null)r.weightBasis='bar10Included';if(!rowReady(r,exercise))r.done=false;},'数値変更');});
app.addEventListener('input',e=>{if(e.target.id==='note')change(s=>s.exercises[exercise].note=e.target.value,'メモ変更',false);if(e.target.id==='feedback')change(s=>s.exercises[exercise].feedback=e.target.value,'修正要望変更',false);});
window.addEventListener('storage',e=>{if(e.key===null||e.key?.startsWith(PREFIX))stop(new Error('別のタブで保存領域が変更されました。開き直してください。'));});
// 入力自体は逐次保存。日本語変換中に画面全体を描き直さない。
function notify(text){const el=document.querySelector('#backup-status');el.textContent=text;}
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function backup(){download({format:'training-notes-backup',version:1,exportedAt:new Date().toISOString(),entries:readAll(localStorage)},`training-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);}
 document.querySelector('#backup').onclick=()=>{try{backup();notify('バックアップを書き出しました。保存先を確認してください。');}catch(e){stop(e);}};
 document.querySelector('#import').onchange=async e=>{const file=e.target.files[0];if(!file||failed)return;try{
 if(file.size>20000000)throw new Error('ファイルが大きすぎます（上限20MB）。');const data=JSON.parse(await file.text());
 if(!confirm('バックアップを読み込みます。現在の記録は残し、同じ内容は重複追加しません。よろしいですか？'))return;
 let result=restore(localStorage,data);if(result.conflicts){if(!confirm(`${result.conflicts}件の記録で現在の内容と食い違いがあります。現在の記録はそのまま残し、バックアップ側を別の記録として追加しますか？`))return;result=restore(localStorage,data,true);}
 reload();active=null;draw();notify(`${result.added}件の履歴を復元しました。${result.added===0?'追加する記録はありません。':''}`);
 }catch(err){notify(`復元できませんでした：${err.message} 既存の記録は置き換えていません。`);}finally{e.target.value='';}};
function queueDelivery(session,launch=false,manual=false){
 try{
  const item=enqueue(localStorage,session);
  const enabled=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}').enabled===true;
  if(launch&&(enabled||manual)){
   const url=shortcutURL(item.envelope);
   notify('iPhone内に保存済み。ショートカットへ受け渡します。iCloudへの保存結果はショートカット側で確認してください。');
   window.location.href=url;
  }else notify('iPhone内に保存済み。iCloud受け渡し待ちです。ショートカット設定後に再送できます。');
  deliveryStatus();
 }catch(e){notify(`トレーニング記録は端末内に保存済み。受け渡しは完了していません：${e.message}`);}
}
function deliveryStatus(){const n=pending(localStorage).length;document.querySelector('#delivery-status').textContent=n?`端末内に受け渡し控え ${n}件。iCloudへの保存完了はこの画面では確認できません。`:'';}
const syncToggle=document.querySelector('#auto-delivery');
try{syncToggle.checked=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}').enabled===true;}catch{}
syncToggle.onchange=()=>{try{localStorage.setItem(SETTINGS_KEY,JSON.stringify({enabled:syncToggle.checked}));notify(syncToggle.checked?`終了時に「${SHORTCUT_NAME}」を起動します。初回の実機テストが必要です。`:'終了時のショートカット起動をOFFにしました。');}catch(e){syncToggle.checked=false;notify(`設定を保存できません：${e.message}`);}};
try{reload();draw();deliveryStatus();}catch(e){stop(e);}
