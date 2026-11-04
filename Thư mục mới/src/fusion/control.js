'use strict';
const $=id=>document.getElementById(id);
const api=window.fusion;
let selectedPlan=0;
const safeText=(el,text)=>{el.textContent=String(text||'');};
function msg(text,error=false){$('message').className=error?'result error':'result';safeText($('message'),text);}
async function run(action,data={},failAlert=true){
  try{const result=await api.request(action,data);if(!result.ok && failAlert)msg(result.error||'Không thực hiện được.',true);return result;}
  catch(e){msg(e.message,true);return {ok:false,error:e.message};}
}
function button(text,onClick,klass='secondary'){
  const b=document.createElement('button');b.textContent=text;b.className=klass;
  b.addEventListener('click',onClick);return b;
}
async function status(){
  const s=await run('status',{},false);
  if(s.ok){$('hotword').checked=!!s.hotword; $('autoTTS').checked=!!s.tts_auto; safeText($('voiceMsg'),s.voice?.available?
    'Giọng Việt Piper đã sẵn sàng.':'Piper chưa có mô hình giọng Việt. Mic Whisper vẫn sử dụng được.');}
  const media=await api.media();
  $('perch').checked=media.perchEnabled!==false;
  $('demoMusic').checked=!!media.demo;
  safeText($('musicInfo'),media.available?
    `${media.playing?'Đang phát':'Đã tạm dừng'}: ${media.title||'Không có tên bài'} ${media.artist||''}`:
    'Chưa có SoraMedia.exe: các nút nhạc vẫn dùng phím Windows; không có metadata tự động.');
}
async function models(){
  const r=await run('models',{},false);
  $('models').replaceChildren();
  if(!r.ok || !r.models.length){$('models').add(new Option('Chưa tìm thấy Ollama',''));return;}
  for(const n of r.models){const opt=new Option(n,n);$('models').add(opt);}
  $('models').value=r.selected;
}
$('switchModel').onclick=async()=>{
  const r=await run('model_select',{name:$('models').value});
  if(r.ok)msg(`Đã chọn ${r.selected}. Các lượt chat tiếp theo dùng mô hình này.`);
};
$('record').onclick=async()=>{
  const r=await run('voice_start');if(r.ok)msg('Đang ghi âm trên máy. Nhấn Kết thúc khi nói xong.');
};
$('stop').onclick=async()=>{
  msg('Đang nhận dạng giọng nói tiếng Việt...');
  const r=await run('voice_end');if(r.ok){$('recognized').value=r.text||'';msg(r.text?'Nhận dạng hoàn tất.':'Không nghe rõ lời nói.');}
};
$('sendVoice').onclick=async()=>{
  const t=$('recognized').value.trim();if(!t)return msg('Chưa có nội dung.',true);
  const r=await api.chat(t);msg(r.ok?'Đã chuyển lời nói sang DIALOG.':r.error,!r.ok);
};
$('speak').onclick=async()=>{
  const r=await run('speak',{text:$('recognized').value});if(r.ok)msg('Đã yêu cầu phát giọng tiếng Việt.');
};
$('hotword').onchange=async(e)=>{
  const r=await run(e.target.checked?'hotword_on':'hotword_off');
  if(!r.ok)e.target.checked=!e.target.checked;
  else msg(e.target.checked?'Đang nghe từ khóa “Hey Sora” (tự nguyện).':'Đã tắt microphone nền.');
};
$('autoTTS').onchange=async e=>{const r=await run(e.target.checked?'tts_auto_on':'tts_auto_off');if(!r.ok)e.target.checked=!e.target.checked;};
$('perch').onchange=async e=>api.perch(e.target.checked);
$('demoMusic').onchange=async e=>api.musicDemo(e.target.checked);
$('mini').onclick=async()=>api.mini();
$('playpause').onclick=async()=>api.mediaKey('playpause');
$('next').onclick=async()=>api.mediaKey('next');
$('find').onclick=async()=>{
  const r=await run('file_find',{query:$('fileQuery').value});const box=$('files');box.replaceChildren();
  if(!r.ok)return;
  if(!r.files.length){box.textContent='Không tìm thấy tên file tương ứng.';return;}
  for(const file of r.files){const line=document.createElement('div');line.className='file';
    const name=document.createElement('div');name.textContent=file;line.append(name,
      button('Hiện trong Explorer',async()=>{const r=await api.locate(file);if(!r.ok)msg(r.error||'Không mở được',true);}));box.append(line);}
  if(r.limited)msg('Danh sách đã được giới hạn theo thời gian/số lượng.');
};
function parseSteps(text){return text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,20).map(text=>{
  if(/^tìm\s*:/i.test(text))return {kind:'find',target:text.replace(/^tìm\s*:/i,'').trim()};
  if(/^xác minh\s*:/i.test(text))return {kind:'verify',target:text.replace(/^xác minh\s*:/i,'').trim()};
  return {kind:'manual',target:text};
});}
$('aiPlan').onclick=async()=>{
  const title=$('planTitle').value.trim();if(!title)return msg('Nhập mục tiêu trước.',true);
  const r=await api.chat('/muctieu '+title);msg(r.ok?'Đã gửi yêu cầu lập kế hoạch tới Agent Core trong DIALOG.':r.error,!r.ok);
};
$('createPlan').onclick=async()=>{
  const r=await run('plan_create',{title:$('planTitle').value,steps:parseSteps($('planSteps').value)});
  if(r.ok){selectedPlan=r.plan_id;await plans();msg(`Đã tạo kế hoạch #${r.plan_id}. Duyệt trước khi xác nhận từng bước.`);}
};
$('refreshPlans').onclick=plans;
$('cancelPlan').onclick=async()=>{
  const r=await run('cancel',{id:selectedPlan||null});if(r.ok){msg('Đã gửi yêu cầu dừng.');await plans();}
};
document.addEventListener('keydown',async e=>{
  if(e.key==='Escape'){$('cancelPlan').click();}
});
async function plans(){
  const r=await run('plans',{},false);const list=$('plans');list.replaceChildren();
  if(!r.ok)return;
  for(const p of r.plans){
    const container=document.createElement('div');container.className='item';
    const label=document.createElement('div');label.textContent=`#${p.id} ${p.title} — ${p.status} (${p.done}/${p.total})`;
    container.append(label,button('Chi tiết',()=>planDetail(p.id)));
    list.append(container);
  }
  if(selectedPlan)await planDetail(selectedPlan);
}
async function planDetail(id){
  selectedPlan=id;const r=await run('plan',{id});if(!r.ok)return;
  const holder=document.createElement('section');holder.id='fusion-detail';
  document.getElementById('fusion-detail')?.remove();
  const heading=document.createElement('h2');heading.textContent=`Kế hoạch #${id}: ${r.title}`;holder.append(heading);
  if(r.status==='draft')holder.append(button('Duyệt kế hoạch',async()=>{
    if(!confirm('Đồng ý theo dõi và tự mình xác minh từng bước?'))return;
    const a=await run('plan_approve',{id});if(a.ok)planDetail(id);
  }));
  for(const s of r.steps){
    const line=document.createElement('div');line.className='step'+(s.status==='done'?' done':'');
    const label=document.createElement('div');label.textContent=`${s.seq}. ${s.target} [${s.status}]`;line.append(label);
    if(s.status==='done'){const proof=document.createElement('small');proof.textContent=s.result;line.append(proof);}
    else if(r.status==='active'){
      if(s.kind==='find')line.append(button('Tìm tên file',async()=>{
        const found=await run('file_find',{query:s.target});
        if(found.ok)msg(found.files.length?found.files.join('\n'):'Không tìm thấy file; chưa hoàn thành bước.');
      }));
      const proof=document.createElement('input');proof.placeholder='Ghi bằng chứng/kết quả cậu đã tự kiểm tra';
      line.append(proof,button('Xác minh hoàn tất',async()=>{
        if(!confirm('Xác nhận bước này đã hoàn thành dựa trên bằng chứng đã nhập?'))return;
        const answer=await run('step_finish',{id,step:s.id,evidence:proof.value});if(answer.ok)planDetail(id);
      }));
    }
    holder.append(line);
  }
  holder.append(button('Báo cáo',async()=>{
    const r=await run('plan_report',{id});if(r.ok)msg(JSON.stringify(r,null,2));
  }));
  $('plans').after(holder);
}
status();models();plans();setInterval(status,8000);
