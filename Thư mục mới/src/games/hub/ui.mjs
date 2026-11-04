import {GAME_NAMES,HUB_IDS,restoreGame,chooseConnectFour,chooseGomoku,chooseReversi,chooseBattleship} from './engines.mjs';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{/* storage may be unavailable */}};
const pick=(a)=>a[Math.floor(Math.random()*a.length)];
const safe=(s,n=180)=>String(s??'').slice(0,n);
const make=(tag,cls='',text='')=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const SCORE_KEY='sora.games.hub.scores.v1';
const BOARD_KEY='sora.games.hub.boards.v1';
const PREF_KEY='sora.games.hub.preferences.v1';
const OBS_KEY='sora.games.hub.observations.v1';
const HUMAN='X',AI='O';

export class GameHubUI {
  constructor({board,status,scores,counter,say,remember,expand,style,isActive,onMood}){
    this.el=board;this.status=status;this.scoresEl=scores;this.counter=counter;
    this.say=say;this.remember=remember;this.expand=expand;
    this.style=style;this.isActive=isActive;this.onMood=onMood||(()=>{});
    this.boards=read(BOARD_KEY,{});this.stats=read(SCORE_KEY,{});this.preferences=read(PREF_KEY,{});
    this.observations=read(OBS_KEY,{});
    this.games=Object.fromEntries(HUB_IDS.map(id=>[id,restoreGame(id,this.boards[id]||null)]));
    this.gameId='connect4';this.timer=null;this.epoch=0;this.busy=false;
    this.mood='curious';this.confidence=.50;
    this.lastLine='';this.lastUserMove=null;
    this.ended=Object.fromEntries(HUB_IDS.map(id=>[id,Boolean(this.games[id].winner)]));
    this.el.addEventListener('click',ev=>this.handleClick(ev));
    this.el.addEventListener('submit',ev=>this.handleSubmit(ev));
    this.render();
  }
  get game(){return this.games[this.gameId];}
  get statsNow(){return this.stats[this.gameId]||{anh:0,em:0,hoa:0,played:0};}
  getContext(){
    const g=this.game,id=this.gameId;
    const common={game:GAME_NAMES[id],gameType:id,style:this.style(),mood:this.mood,turn:g.turn||'',winner:g.winner||'',
      played:this.statsNow.played||0,score:{line:this.statsNow.anh||0,sora:this.statsNow.em||0,draw:this.statsNow.hoa||0},
      favoriteGames:this.favorites(),recentStyle:this.strategySummary()};
    if(['connect4','gomoku','reversi'].includes(id))return {...common,size:id==='connect4'?'7×6':id==='gomoku'?'13×13':'8×8',
      board:g.board.map(x=>x||'-'),legal:id==='connect4'?g.valid():id==='reversi'?g.valid():g.candidates(1).slice(0,60)};
    if(id==='battleship')return {...common,shotsLine:g.playerShots.map((v,i)=>v?(g.sora.cells[i]?'hit':'miss'):'unknown'),
      shotsSora:g.soraShots.map((v,i)=>v?(g.player.cells[i]?'hit':'miss'):'unknown'),progress:g.progress()};
    if(id==='word')return {...common,topic:g.target.topic,guesses:g.guesses.slice(),hintsUsed:g.hints,letters:g.target.word.replace(/\s/g,'').length,
      note:'Đáp án bí mật không được đưa vào hội thoại trước khi ván kết thúc.',
      ...(g.winner?{answer:g.target.word}:{})};
    return {...common,title:g.case.title,story:g.case.intro,clues:g.case.clues.slice(0,g.revealed),suspects:g.case.suspects,
      ...(g.winner?{culprit:g.case.suspects[g.case.culprit],logic:g.case.logic}:{})};
  }
  favorites(){
    const chess=read('sora.chess.score.v1',{}),tic=read('sora.tictactoe.score.v1',{});
    const played=(s)=>(s?.played??((s?.anh||0)+(s?.em||0)+(s?.hoa||0)));
    return [{id:'chess',total:played(chess)},{id:'tictactoe',total:played(tic)},
      ...HUB_IDS.map(id=>({id,total:played(this.stats[id])}))]
      .filter(x=>x.total>0).sort((a,b)=>b.total-a.total).slice(0,3)
      .map(x=>`${GAME_NAMES[x.id]} (${x.total} ván)`);
  }
  observe(move){
    if(!move)return;
    const list=this.observations[this.gameId]||[];
    list.push({player:move.player,index:move.index??-1,column:move.column??-1,
      flipped:move.flipped??0,hit:!!move.hit,sunk:!!move.sunk});
    this.observations[this.gameId]=list.slice(-100);
    save(OBS_KEY,this.observations);
  }
  strategySummary(){
    const id=this.gameId,history=this.observations[id]||[];
    const userMoves=history.filter(m=>m.player==='X');
    if(!userMoves.length)return 'Chưa quan sát đủ nước đi';
    if(id==='connect4'){
      const counts=Array(7).fill(0);userMoves.forEach(m=>{if(m.column>=0&&m.column<7)counts[m.column]++;});
      return `Line thường chọn cột ${counts.indexOf(Math.max(...counts))+1}`;
    }
    if(id==='gomoku')return `Line có ${userMoves.length} nước X, ${userMoves.filter(m=>m.index>=52&&m.index<117).length} nước ở vùng giữa`;
    if(id==='reversi')return `Line lật trung bình ${(userMoves.reduce((n,m)=>n+m.flipped,0)/userMoves.length).toFixed(1)} quân/nước`;
    if(id==='battleship')return `Line bắn trúng ${userMoves.filter(m=>m.hit).length}/${userMoves.length} tọa độ`;
    if(id==='word')return `Line đã thử ${this.game.guesses.length} từ`;
    return `Line đã thu thập ${this.game.revealed} manh mối`;
  }
  persist(){this.boards[this.gameId]=this.game.snapshot();save(BOARD_KEY,this.boards);}
  setStyle(value){this.preferences.style=value;save(PREF_KEY,this.preferences);this.render();}
  pause(){if(this.timer)clearTimeout(this.timer);this.timer=null;this.epoch++;this.busy=false;}
  deactivate(){this.pause();}
  activate(gameId){
    if(!HUB_IDS.includes(gameId))return false;
    if(this.gameId!==gameId)this.pause();
    this.gameId=gameId;this.render();this.scheduleAI();return true;
  }
  statusLine(){
    const g=this.game;
    if(g.winner)return g.winner===HUMAN?'Line THẮNG!':g.winner===AI?'Sora THẮNG!':'HÒA RỒI!';
    if(this.gameId==='detective')return 'CÙNG SORA ĐIỀU TRA';
    if(this.gameId==='word')return 'ĐẾN LƯỢT Line ĐOÁN';
    return this.busy||g.turn==='O'?'Sora ĐANG NGHĨ…':'ĐẾN LƯỢT Line';
  }
  render(){
    if(!this.isActive())return;
    const g=this.game,kind=this.gameId;
    this.el.className='hub-board hub-'+kind;
    this.el.setAttribute('aria-label',GAME_NAMES[kind]);
    this.el.replaceChildren();
    if(kind==='connect4')this.drawConnect4();
    else if(kind==='gomoku')this.drawGrid(13,g.board,'gomoku');
    else if(kind==='reversi')this.drawGrid(8,g.board,'reversi',new Set(g.valid('X')));
    else if(kind==='battleship')this.drawBattleship();
    else if(kind==='word')this.drawWord();
    else if(kind==='detective')this.drawDetective();
    this.status.querySelector('b').textContent=this.statusLine();
    this.status.querySelector('small').textContent=g.winner?'':kind==='word'?'(6 lần đoán)':kind==='detective'?'(Hợp tác)':g.turn==='X'?'(Line)':'(Sora)';
    this.status.style.borderLeftColor=g.winner==='O'?'#ff285e':'#24f5a0';
    const n=g.moves??g.guesses?.length??g.revealed??0;
    this.counter.textContent=`LƯỢT ${String(n+1).padStart(2,'0')}`;
    const s=this.statsNow;
    this.scoresEl.textContent=`Line ${s.anh||0} thắng · Sora ${s.em||0} thắng · ${s.hoa||0} hòa`;
  }
  cell(index,value,kind,disabled=false){
    const button=make('button','hub-cell hub-cell--'+kind+(value==='X'?' is-line':value==='O'?' is-sora':''),value||'');
    button.type='button';button.dataset.index=String(index);button.disabled=disabled;
    button.setAttribute('aria-label',`Ô ${index+1}: ${value||'trống'}`);
    return button;
  }
  drawConnect4(){
    const g=this.game,frame=make('div','hub-grid hub-grid--connect4');frame.style.setProperty('--cols','7');
    for(let x=0;x<7;x++){
      const head=make('button','hub-column','▼');head.type='button';head.dataset.column=x;
      head.disabled=Boolean(g.winner||g.turn!=='X'||this.busy||!g.valid().includes(x));
      head.setAttribute('aria-label',`Thả quân vào cột ${x+1}`);
      frame.append(head);
    }
    for(let i=0;i<42;i++){
      const value=g.board[i];const b=this.cell(i,value,'connect4',Boolean(g.winner||g.turn!=='X'||this.busy));
      b.dataset.column=i%7;b.textContent=value==='X'?'●':value==='O'?'●':'○';
      frame.append(b);
    }
    this.el.append(frame);
  }
  drawGrid(size,board,kind,valid=new Set()){
    const frame=make('div','hub-grid hub-grid--'+kind);frame.style.setProperty('--cols',String(size));
    for(let i=0;i<board.length;i++){
      const value=board[i],b=this.cell(i,value,kind,Boolean(value||this.game.winner||this.game.turn!=='X'||this.busy||(kind==='reversi'&&!valid.has(i))));
      if(kind==='reversi'){b.textContent=value?'●':valid.has(i)?'·':'';if(valid.has(i)&&!value)b.classList.add('is-legal');}
      else b.textContent=value==='X'?'✕':value==='O'?'◯':'';
      frame.append(b);
    }
    this.el.append(frame);
  }
  drawBattleship(){
    const g=this.game,frame=make('div','hub-fleets');
    const grid=(title,cells,shots,enemy)=>{
      const section=make('section','hub-fleet');section.append(make('h3','',title));
      const board=make('div','hub-grid hub-grid--fleet');board.style.setProperty('--cols','10');
      for(let i=0;i<100;i++){
        const hit=shots[i],ship=Boolean(cells[i]);
        const label=hit?(ship?'✕':'•'):(enemy?'':ship?'■':'');
        const btn=this.cell(i,label,'fleet',!enemy||hit||g.winner||g.turn!=='X'||this.busy);
        if(enemy)btn.dataset.attack=i;
        btn.classList.toggle('is-hit',Boolean(hit&&ship));
        btn.classList.toggle('is-miss',Boolean(hit&&!ship));
        btn.classList.toggle('is-ship',Boolean(!enemy&&ship));
        board.append(btn);
      }
      section.append(board);return section;
    };
    frame.append(grid('RADAR · TÀU SORA',g.sora.cells,g.playerShots,true),grid('HẠM ĐỘI LINE',g.player.cells,g.soraShots,false));
    this.el.append(frame);
    const p=g.progress();this.el.append(make('p','hub-tip',`Đã bắn trúng: Line ${p.line}/17 · Sora ${p.sora}/17`));
  }
  drawWord(){
    const g=this.game,info=make('section','hub-story');
    info.append(make('p','hub-eyebrow','MẬT MÃ · '+g.target.topic));
    info.append(make('h2','hub-heading','EM ĐANG GIỮ MỘT TỪ BÍ MẬT'));
    info.append(make('p','hub-description',`Độ dài: ${g.target.word.replace(/\s/g,'').length} chữ cái · ${g.target.word.split(' ').length} tiếng · Anh có 6 lần đoán.`));
    const list=make('div','hub-guesses');
    for(let i=0;i<6;i++)list.append(make('div','hub-guess '+(g.guesses[i]?'has-guess':''),g.guesses[i]||`Lượt ${i+1}`));
    info.append(list);
    if(g.hints){const hints=[g.target.hint,`Chữ đầu: ${g.target.word[0].toUpperCase()}; ${g.target.word.split(' ').length} tiếng.`,
      `Chữ cuối: ${g.target.word.replace(/\s/g,'').at(-1).toUpperCase()}`];
      const p=make('div','hub-clue');p.textContent=hints.slice(0,g.hints).join(' • ');info.append(p);
    }
    if(g.winner){info.append(make('p','hub-answer',`Đáp án: ${g.target.word.toUpperCase()}`));}
    else {
      const form=make('form','hub-answer-form');form.dataset.action='guess';
      const input=make('input');input.type='text';input.name='guess';input.autocomplete='off';input.maxLength=60;
      input.placeholder='Đoán từ ở đây…';input.setAttribute('aria-label','Nhập từ muốn đoán');
      const submit=make('button','','ĐOÁN');submit.type='submit';
      form.append(input,submit);info.append(form);
      const hint=make('button','hub-secondary','GỢI Ý');hint.type='button';hint.dataset.action='hint';hint.disabled=g.hints>=3;
      info.append(hint);
    }
    this.el.append(info);
  }
  drawDetective(){
    const g=this.game,c=g.case,info=make('section','hub-story hub-story--detective');
    info.append(make('p','hub-eyebrow','HỒ SƠ #'+(g.caseIndex+1)+' · PHÁ ÁN CÙNG SORA'));
    info.append(make('h2','hub-heading',c.title));
    info.append(make('p','hub-description',c.intro));
    const clues=make('div','hub-clue-list');
    if(!g.revealed)clues.append(make('p','hub-muted','Bắt đầu bằng cách tìm manh mối đầu tiên.'));
    c.clues.slice(0,g.revealed).forEach((clue,i)=>clues.append(make('p','hub-clue',`BẰNG CHỨNG ${i+1} · ${clue}`)));
    info.append(clues);
    const controls=make('div','hub-accuse');
    if(!g.winner){
      const next=make('button','hub-secondary',g.revealed===c.clues.length?'ĐÃ TÌM ĐỦ MANH MỐI':'TÌM MANH MỐI');
      next.dataset.action='clue';next.disabled=g.revealed===c.clues.length;controls.append(next);
      c.suspects.forEach((name,i)=>{
        const b=make('button','hub-suspect',name);b.dataset.accuse=i;b.disabled=g.revealed<2;
        b.title=g.revealed<2?'Cần ít nhất 2 manh mối':'Đưa ra kết luận';controls.append(b);
      });
    }else{
      info.append(make('p','hub-answer',`Kết luận: ${c.suspects[c.culprit]}. ${c.logic}`));
    }
    info.append(controls);this.el.append(info);
  }
  handleClick(event){
    if(!this.isActive()||this.game.winner||this.busy)return;
    const btn=event.target.closest('button');if(!btn)return;
    const id=this.gameId,g=this.game;
    if(id==='connect4'){
      const col=Number(btn.dataset.column);if(!Number.isInteger(col))return;
      this.moveGrid(col);return;
    }
    if(id==='gomoku'||id==='reversi'){
      if(btn.dataset.index===undefined)return;
      this.moveGrid(Number(btn.dataset.index));return;
    }
    if(id==='battleship'&&btn.dataset.attack!==undefined){
      const move=g.attack(Number(btn.dataset.attack));if(move)this.afterMove(move);
    }else if(id==='word'&&btn.dataset.action==='hint'){
      const text=g.hint();if(text){this.persist();this.render();this.speakEvent(`Em hé lộ thêm một chút: ${text}`,'curious');}
    }else if(id==='detective'){
      if(btn.dataset.action==='clue'){
        const clue=g.nextClue();if(clue){this.persist();this.render();this.speakEvent(`Manh mối mới: ${clue} Anh thấy điểm nào đáng ngờ nhất?`,'curious');}
      }else if(btn.dataset.accuse!==undefined){
        const result=g.accuse(Number(btn.dataset.accuse));if(!result)return;
        this.persist();this.recordFinish(result.correct?'Anh đã phá án đúng!':'Lần này nhận định chưa chính xác.');
        this.render();this.speakEvent(result.correct?`Giỏi thật, anh đã phá án được rồi! ${result.logic}`:`Chưa đúng rồi anh. Đáp án là ${result.culprit}. ${result.logic}`,
          result.correct?'happy':'surprised');
      }
    }
  }
  handleSubmit(event){
    if(!this.isActive()||this.gameId!=='word'||event.target.dataset.action!=='guess')return;
    event.preventDefault();
    const input=event.target.elements.guess,value=input?.value.trim();
    const result=this.game.guess(value);if(!result)return;
    this.persist();if(result.winner){this.recordFinish(`Đoán từ: ${this.game.target.word}`);}
    this.render();
    const phrase=result.correct?`Anh đoán đúng từ “${this.game.target.word}” rồi! Em công nhận anh giỏi thật.`:
      result.winner?`Hết lượt rồi! Từ bí mật là “${this.game.target.word}”. Em thắng ván này nhé.`:
      pick([`Chưa đúng rồi anh. Còn ${6-result.guesses} lượt, thử nghĩ rộng hơn xem?`,
        `Gần đây có gì khiến anh liên tưởng đến chủ đề ${this.game.target.topic} không nhỉ?`]);
    this.speakEvent(phrase,result.correct?'surprised':result.winner?'playful':'curious');
  }
  moveGrid(index){
    const result=this.game.play(index);if(result)this.afterMove(result);
  }
  afterMove(move){
    this.observe(move);this.lastUserMove=move;this.persist();this.render();
    if(this.game.winner){this.recordFinish(this.summary());this.speakEvent(this.finalLine(),this.game.winner==='X'?'surprised':'happy');return;}
    if(move.player==='X'){
      this.speakEvent(this.playerLine(move),'curious');this.scheduleAI();
    }else{
      this.speakEvent(this.aiLine(move),'playful');
      // The local rule engine always moves first. Ollama only improves dialogue.
      if(this.game.moves%5===0)this.expand?.(this.lastLine,`Đang chơi ${GAME_NAMES[this.gameId]}; ${this.summary()}`,true,this.gameId);
    }
  }
  playerLine(move){
    const id=this.gameId;
    if(id==='connect4')return `Anh thả quân vào cột ${move.column+1}. Em nhìn ra một vài đường nối rồi đấy.`;
    if(id==='gomoku')return `Anh đặt X ở hàng ${Math.floor(move.index/13)+1}, cột ${move.index%13+1}. Để em tính nước chặn.`;
    if(id==='reversi')return `Anh lật được ${move.flipped} quân. Ván này chưa dễ đâu nhé.`;
    if(id==='battleship')return move.hit?(move.sunk?'Trúng rồi… Anh vừa đánh chìm một tàu của em!':'Trúng tàu của em rồi! Để xem anh tìm được phần còn lại không.'):
      'Tọa độ ấy chỉ có mặt nước thôi anh. Đến lượt em!';
    return 'Em đang nghĩ cách đáp trả đây.';
  }
  aiLine(move){
    if(this.gameId==='connect4')return `Em chọn cột ${move.column+1}. Anh định nối bốn quân theo đường nào nào?`;
    if(this.gameId==='gomoku')return `Em đã đặt O ở hàng ${Math.floor(move.index/13)+1}, cột ${move.index%13+1}. Anh thử phá thế của em xem.`;
    if(this.gameId==='reversi')return `Em vừa lật ${move.flipped} quân sang màu của mình. Đến lượt anh!`;
    if(this.gameId==='battleship')return move.hit?(move.sunk?'Em đã đánh chìm một tàu rồi nhé!':'Trúng tàu của anh rồi! Em sẽ theo dấu.'):
      'Em bắn trượt mất rồi. Anh cứ cười đi, em vẫn đang tính tiếp đây.';
    return 'Em đã đi rồi nhé!';
  }
  summary(){const g=this.game;
    if(this.gameId==='battleship')return `Bắn Tàu: Line trúng ${g.progress().line}/17 ô tàu, Sora trúng ${g.progress().sora}/17.`;
    if(this.gameId==='word')return `Chủ đề ${g.target.topic}, ${g.guesses.length} lượt đoán.`;
    if(this.gameId==='detective')return `${g.case.title}, tìm ${g.revealed} manh mối.`;
    return `${GAME_NAMES[this.gameId]}: ${g.moves||0} nước, ${g.winner?('kết quả '+g.winner):'đang chơi'}.`;
  }
  finalLine(){
    const winner=this.game.winner;
    if(winner==='X')return pick(['Anh thắng rồi! Em đòi một ván phục thù nhé.','Ơ, anh phá được kế hoạch của em rồi. Lần sau em sẽ cẩn thận hơn!']);
    if(winner==='O')return pick(['Em thắng rồi nha! Anh muốn làm một ván nữa không?','Lần này em chiếm ưu thế rồi. Đừng vội bỏ cuộc nhé anh.']);
    return 'Hòa rồi! Ván này cả hai đều chơi rất kiên trì.';
  }
  speakEvent(text,mood){
    const line=safe(text,450);
    if(line===this.lastLine&&this.lastLine)this.lastLine='';
    this.lastLine=line;this.mood=mood==='surprised'?'surprised':mood==='happy'?'happy':mood==='curious'?'curious':'playful';
    this.onMood(this.mood,this.gameId,line);
    this.say('em',line);
  }
  recordFinish(detail){
    const id=this.gameId,g=this.game;
    if(this.ended[id]||!g.winner)return;
    this.ended[id]=true;this.pause();
    const score=this.statsNow;const saved={anh:score.anh||0,em:score.em||0,hoa:score.hoa||0,played:score.played||0};
    const winner=g.winner==='X'?'anh':g.winner==='O'?'em':'hoa';saved[winner]++;saved.played++;
    this.stats[id]=saved;save(SCORE_KEY,this.stats);
    this.preferences[id]=(this.preferences[id]||0)+1;save(PREF_KEY,this.preferences);
    this.remember(`${id}_result`,`${GAME_NAMES[id]}: ${detail}; ${g.winner==='X'?'Line thắng':g.winner==='O'?'Sora thắng':'hòa'}; ${this.summary()}; ${this.strategySummary()}`, 
      g.winner==='X'?'X':g.winner==='O'?'O':'draw');
  }
  scheduleAI(){
    const g=this.game;
    if(!this.isActive()||this.timer||!['connect4','gomoku','reversi','battleship'].includes(this.gameId)||g.turn!=='O'||g.winner)return;
    this.busy=true;this.render();
    const id=this.gameId,epoch=this.epoch;
    this.timer=setTimeout(()=>{
      this.timer=null;
      if(epoch!==this.epoch||!this.isActive()||this.gameId!==id||this.game.winner||this.game.turn!=='O')return;
      try {
        const gentle=this.style()==='gentle',serious=this.style()==='serious';
        let index=null;
        if(id==='connect4')index=chooseConnectFour(g,{gentle,depth:serious?5:4});
        if(id==='gomoku')index=chooseGomoku(g,{gentle});
        if(id==='reversi')index=chooseReversi(g,{gentle,depth:serious?4:3});
        if(id==='battleship')index=chooseBattleship(g,{gentle});
        this.busy=false;
        const move=id==='battleship'?g.attack(index):g.play(index);
        if(move)this.afterMove(move);else this.render();
        // Reversi might automatically skip Line's turn when there are no legal moves.
        if(id==='reversi'&&!g.winner&&g.turn==='O')this.scheduleAI();
      }catch(error){
        this.busy=false;this.render();console.error('[SORA Game Hub] AI',error);
        this.speakEvent('Em vừa gặp lỗi khi tính nước đi. Anh thử Ván mới nhé.','surprised');
      }
    },380+Math.floor(Math.random()*240));
  }
  newGame(){
    this.pause();this.games[this.gameId]=restoreGame(this.gameId,null);
    this.observations[this.gameId]=[];save(OBS_KEY,this.observations);
    this.ended[this.gameId]=false;this.persist();this.render();
    return pick([`Ván ${GAME_NAMES[this.gameId]} mới sẵn sàng rồi! Anh đi trước nhé.`,
      `Đổi ván nhé anh. Lần này xem ai có chiến thuật hay hơn nào!`]);
  }
  hint(){
    const id=this.gameId,g=this.game;
    if(id==='detective'){
      const clue=g.nextClue();if(!clue)return 'Mình đã có toàn bộ manh mối rồi anh. Hãy chọn nghi phạm.';
      this.persist();this.render();return `Em tìm được manh mối: ${clue}`;
    }
    if(id==='word'){
      const clue=g.hint();this.persist();this.render();return clue?`Gợi ý đây: ${clue}`:'Em đã cho hết gợi ý rồi!';
    }
    if(id==='connect4')return 'Hãy để ý những đường ba quân và cột giữa. Nếu em có ba quân nối tiếp, anh nên chặn ngay.';
    if(id==='gomoku')return 'Anh nên tạo hai mối đe dọa cùng lúc, và nhớ chặn bốn quân liên tiếp của em.';
    if(id==='reversi')return 'Các góc bàn cờ rất quan trọng. Lật nhiều quân ngay lúc này chưa chắc là thắng cuối ván.';
    if(id==='battleship')return 'Sau khi bắn trúng, hãy thử các ô kề cạnh; đừng lặp lại tọa độ đã bắn.';
    return 'Em đang quan sát bàn chơi.';
  }
}
