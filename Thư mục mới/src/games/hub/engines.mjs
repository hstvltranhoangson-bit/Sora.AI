// Mini-game engines without Electron, DOM, network or Ollama dependencies.
// 'X' is Line, 'O' is Sora for grid games; rules are independent of AI/dialog.
const randomPick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];
export const GAME_NAMES = Object.freeze({
  chess:'Cờ vua', tictactoe:'Tic Tac Toe', connect4:'Cờ Nối 4',
  gomoku:'Cờ Caro', word:'Đoán Từ Bí Mật', reversi:'Cờ Lật',
  battleship:'Bắn Tàu', detective:'Thám Tử',
});
export const HUB_IDS = Object.freeze(['connect4','gomoku','word','reversi','battleship','detective']);
export const ALL_IDS = Object.freeze(['chess','tictactoe',...HUB_IDS]);
const within = (v, low, high) => Number.isInteger(v) && v >= low && v < high;
const serial = (data) => JSON.parse(JSON.stringify(data));
const directions = [[1,0],[0,1],[1,1],[1,-1]];

export class ConnectFour {
  constructor(data = null) {
    this.cols = 7; this.rows = 6;
    this.board = Array(42).fill(''); this.turn='X'; this.winner=''; this.moves=0;
    if (data && Array.isArray(data.board) && data.board.length === 42 && data.board.every(v=>['','X','O'].includes(v))) {
      this.board = data.board.slice(); this.turn = data.turn === 'O' ? 'O' : 'X';
      this.moves = this.board.filter(Boolean).length;
      this.winner = this.findWinner() || (this.moves === 42 ? 'draw' : '');
    }
  }
  snapshot() { return {board:this.board.slice(),turn:this.turn}; }
  valid() { return Array.from({length:7},(_,x)=>x).filter(x=>!this.board[x]); }
  findWinner() {
    for(let y=0;y<6;y++)for(let x=0;x<7;x++){
      const color=this.board[y*7+x]; if(!color)continue;
      for(const [dx,dy] of directions) {
        const ex=x+dx*3, ey=y+dy*3;
        if(ex<0||ex>=7||ey<0||ey>=6)continue;
        if([1,2,3].every(k=>this.board[(y+dy*k)*7+x+dx*k]===color)) return color;
      }
    }
    return '';
  }
  play(column) {
    if(this.winner||!this.valid().includes(column))return null;
    let row=5; while(row>=0&&this.board[row*7+column])row--;
    const player=this.turn, index=row*7+column;
    this.board[index]=player; this.moves++;
    this.winner=this.findWinner()||(this.moves===42?'draw':'');
    if(!this.winner)this.turn=player==='X'?'O':'X';
    return {index,column,row,player,winner:this.winner};
  }
}
function c4Eval(board) {
  let score=0;
  for(let y=0;y<6;y++)for(let x=0;x<7;x++){
    if(board[y*7+x]) score += (board[y*7+x]==='O'?1:-1)*(3-Math.abs(3-x))*3;
    for(const [dx,dy] of directions){
      if(x+dx*3<0||x+dx*3>=7||y+dy*3<0||y+dy*3>=6)continue;
      let a=0,b=0;
      for(let k=0;k<4;k++){const v=board[(y+dy*k)*7+x+dx*k];a+=v==='O';b+=v==='X';}
      if(!b)score += [0,1,10,80,100000][a];
      if(!a)score -= [0,1,10,95,100000][b];
    }
  }
  return score;
}
export function chooseConnectFour(game, {gentle=false, depth=4, rng=Math.random}={}) {
  const valid=game.valid(); if(!valid.length)return null;
  const ordered=[3,2,4,1,5,0,6];
  const explore=(g,d,alpha,beta)=>{
    if(g.winner||d===0) return g.winner==='O'?1e7+d:g.winner==='X'?-1e7-d:g.winner==='draw'?0:c4Eval(g.board);
    const maximize=g.turn==='O'; let best=maximize?-Infinity:Infinity;
    for(const col of ordered) {
      if(!g.valid().includes(col))continue;
      const copy=new ConnectFour(g.snapshot());copy.play(col);
      const value=explore(copy,d-1,alpha,beta);
      best=maximize?Math.max(best,value):Math.min(best,value);
      if(maximize)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);
      if(beta<=alpha)break;
    }
    return best;
  };
  const ranked=valid.map(col=>{const copy=new ConnectFour(game.snapshot());copy.play(col);
    return {col,score:explore(copy,Math.max(1,Math.min(6,depth))-1,-Infinity,Infinity)};
  }).sort((a,b)=>b.score-a.score);
  if(gentle && ranked.length>1 && rng()<.58) return randomPick(ranked.slice(0,Math.min(4,ranked.length)).map(x=>x.col),rng);
  return ranked[0].col;
}

export class Gomoku {
  constructor(data=null){
    this.size=13;this.board=Array(169).fill('');this.turn='X';this.winner='';this.moves=0;
    if(data&&Array.isArray(data.board)&&data.board.length===169&&data.board.every(v=>['','X','O'].includes(v))){
      this.board=data.board.slice();this.turn=data.turn==='O'?'O':'X';this.moves=this.board.filter(Boolean).length;
      this.winner=this.detectWinner()||(this.moves===169?'draw':'');
    }
  }
  snapshot(){return {board:this.board.slice(),turn:this.turn};}
  detectWinner(){
    for(let y=0;y<13;y++)for(let x=0;x<13;x++){
      const p=this.board[y*13+x];if(!p)continue;
      for(const [dx,dy] of directions)if(x+dx*4>=0&&x+dx*4<13&&y+dy*4>=0&&y+dy*4<13&&
        [1,2,3,4].every(k=>this.board[(y+dy*k)*13+x+dx*k]===p))return p;
    }return '';
  }
  play(index){
    if(this.winner||!within(index,0,169)||this.board[index])return null;
    const player=this.turn;this.board[index]=player;this.moves++;
    this.winner=this.detectWinner()||(this.moves===169?'draw':'');
    if(!this.winner)this.turn=player==='X'?'O':'X';
    return {index,player,winner:this.winner};
  }
  candidates(radius=2){
    if(!this.moves)return [84];
    const found=new Set();
    for(let i=0;i<169;i++)if(this.board[i]){
      const y=Math.floor(i/13),x=i%13;
      for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
        const nx=x+dx,ny=y+dy;if(nx>=0&&nx<13&&ny>=0&&ny<13&&!this.board[ny*13+nx])found.add(ny*13+nx);
      }
    }
    return Array.from(found);
  }
}
function gomoEval(board, player){
  let total=0;
  const weight=[0,1,9,70,1800,300000];
  for(let y=0;y<13;y++)for(let x=0;x<13;x++)for(const [dx,dy] of directions){
    if(x+dx*4<0||x+dx*4>=13||y+dy*4<0||y+dy*4>=13)continue;
    let own=0,enemy=0;
    for(let k=0;k<5;k++){const v=board[(y+dy*k)*13+x+dx*k];own+=v===player;enemy+=v&&v!==player;}
    if(!enemy)total+=weight[own];if(!own)total-=weight[enemy]*1.09;
  }
  return total;
}
export function chooseGomoku(g,{gentle=false,rng=Math.random}={}){
  let moves=g.candidates();if(!moves.length)return null;
  // First find immediate mates for both players; never miss an obvious four-in-a-row.
  for(const player of ['O','X'])for(const index of moves){
    const board=g.board.slice();board[index]=player;
    const test=new Gomoku({board,turn:'X'});if(test.winner===player)return index;
  }
  const scored=moves.map(index=>{
    const board=g.board.slice();board[index]='O';
    const attack=gomoEval(board,'O');
    const protect=g.board.slice();protect[index]='X';
    const defense=gomoEval(protect,'X');
    const bias=3-(Math.abs(index%13-6)+Math.abs(Math.floor(index/13)-6))*.16;
    return {index,score:attack+defense*.9+bias};
  }).sort((a,b)=>b.score-a.score);
  if(gentle&&scored.length>1&&rng()<.65)return randomPick(scored.slice(0,Math.min(8,scored.length)).map(s=>s.index),rng);
  return scored[0].index;
}

const REVERSE_DIR=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
export class Reversi {
  constructor(data=null){
    this.board=Array(64).fill('');this.board[27]='O';this.board[28]='X';this.board[35]='X';this.board[36]='O';
    this.turn='X';this.winner='';this.moves=0;
    if(data&&Array.isArray(data.board)&&data.board.length===64&&data.board.every(v=>['','X','O'].includes(v))){
      this.board=data.board.slice();this.turn=data.turn==='O'?'O':'X';this.moves=Math.max(0,Number(data.moves)||0);
      this.normalizeTurn();
    }
  }
  snapshot(){return {board:this.board.slice(),turn:this.turn,moves:this.moves};}
  flips(index,player=this.turn){
    if(!within(index,0,64)||this.board[index])return [];
    const row=index>>3,col=index&7,enemy=player==='X'?'O':'X',all=[];
    for(const [dy,dx] of REVERSE_DIR){
      let y=row+dy,x=col+dx,run=[];
      while(y>=0&&y<8&&x>=0&&x<8&&this.board[y*8+x]===enemy){run.push(y*8+x);y+=dy;x+=dx;}
      if(run.length&&y>=0&&y<8&&x>=0&&x<8&&this.board[y*8+x]===player)all.push(...run);
    }
    return all;
  }
  valid(player=this.turn){const out=[];for(let i=0;i<64;i++)if(this.flips(i,player).length)out.push(i);return out;}
  normalizeTurn(){
    if(this.valid(this.turn).length)return;
    const alt=this.turn==='X'?'O':'X';
    if(this.valid(alt).length){this.turn=alt;return;}
    const x=this.board.filter(v=>v==='X').length,o=this.board.filter(v=>v==='O').length;
    this.winner=x===o?'draw':x>o?'X':'O';
  }
  play(index){
    if(this.winner)return null;
    const flips=this.flips(index);if(!flips.length)return null;
    const player=this.turn;this.board[index]=player;for(const j of flips)this.board[j]=player;
    this.moves++;this.turn=player==='X'?'O':'X';this.normalizeTurn();
    return {index,player,flipped:flips.length,winner:this.winner};
  }
}
const revWeights=[90,-25,12,8,8,12,-25,90,-25,-35,-6,-6,-6,-6,-35,-25,12,-6,3,2,2,3,-6,12,8,-6,2,1,1,2,-6,8,8,-6,2,1,1,2,-6,8,12,-6,3,2,2,3,-6,12,-25,-35,-6,-6,-6,-6,-35,-25,90,-25,12,8,8,12,-25,90];
function revEval(g){
  if(g.winner)return g.winner==='O'?100000:g.winner==='X'?-100000:0;
  let score=0;for(let i=0;i<64;i++)score+=revWeights[i]*(g.board[i]==='O'?1:g.board[i]==='X'?-1:0);
  score+=4*(g.valid('O').length-g.valid('X').length);
  return score;
}
export function chooseReversi(g,{gentle=false,depth=3,rng=Math.random}={}){
  const moves=g.valid('O');if(!moves.length)return null;
  function tree(s,d,alpha,beta){
    if(!d||s.winner)return revEval(s);
    const choices=s.valid(),max=s.turn==='O';let best=max?-Infinity:Infinity;
    if(!choices.length)return revEval(s);
    for(const m of choices){const child=new Reversi(s.snapshot());child.play(m);
      const value=tree(child,d-1,alpha,beta);best=max?Math.max(best,value):Math.min(best,value);
      if(max)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);if(beta<=alpha)break;
    }return best;
  }
  const ranked=moves.map(m=>{const child=new Reversi(g.snapshot());child.play(m);
    return {m,score:tree(child,Math.max(1,Math.min(depth,4))-1,-Infinity,Infinity)};
  }).sort((a,b)=>b.score-a.score);
  if(gentle&&ranked.length>1&&rng()<.62)return randomPick(ranked.slice(0,3).map(v=>v.m),rng);
  return ranked[0].m;
}

const FLEET=[5,4,3,3,2];
export function makeFleet(rng=Math.random){
  const cells=Array(100).fill(0),ships=[];
  for(const length of FLEET){
    const options=[];
    for(let y=0;y<10;y++)for(let x=0;x<10;x++)for(const direction of [0,1]){
      if(direction===0&&x+length>10||direction===1&&y+length>10)continue;
      const indexes=Array.from({length},(_,k)=>(y+(direction?k:0))*10+x+(direction?0:k));
      if(indexes.every(i=>!cells[i]))options.push(indexes);
    }
    if(!options.length)throw Error('Could not place fleet');
    const indexes=randomPick(options,rng),shipId=ships.length+1;
    indexes.forEach(i=>cells[i]=shipId);ships.push(indexes);
  }
  return {cells,ships};
}
export class Battleship {
  constructor(data=null, rng=Math.random){
    this.player=makeFleet(rng);this.sora=makeFleet(rng);
    this.playerShots=Array(100).fill(false);this.soraShots=Array(100).fill(false);
    this.turn='X';this.winner='';this.moves=0;
    if(data&&[data.player?.cells,data.sora?.cells].every(a=>Array.isArray(a)&&a.length===100&&a.every(v=>within(v,0,6)))&&
      [data.playerShots,data.soraShots].every(a=>Array.isArray(a)&&a.length===100&&a.every(v=>typeof v==='boolean'))){
      this.player={cells:data.player.cells.slice(),ships:FLEET.map((_,k)=>data.player.cells.flatMap((v,i)=>v===k+1?[i]:[]))};
      this.sora={cells:data.sora.cells.slice(),ships:FLEET.map((_,k)=>data.sora.cells.flatMap((v,i)=>v===k+1?[i]:[]))};
      this.playerShots=data.playerShots.slice();this.soraShots=data.soraShots.slice();
      this.turn=data.turn==='O'?'O':'X';this.moves=Math.max(0,Number(data.moves)||0);
      this.winner=this.findWinner();
    }
  }
  snapshot(){return {player:{cells:this.player.cells.slice()},sora:{cells:this.sora.cells.slice()},
    playerShots:this.playerShots.slice(),soraShots:this.soraShots.slice(),turn:this.turn,moves:this.moves};}
  findWinner(){
    if(this.sora.cells.every((v,i)=>!v||this.playerShots[i]))return 'X';
    if(this.player.cells.every((v,i)=>!v||this.soraShots[i]))return 'O';
    return '';
  }
  attack(index){
    if(this.winner||!within(index,0,100))return null;
    const player=this.turn,seen=player==='X'?this.playerShots:this.soraShots;
    if(seen[index])return null;
    seen[index]=true;this.moves++;
    const fleet=player==='X'?this.sora:this.player,shipId=fleet.cells[index];
    const sunk=shipId>0&&fleet.ships[shipId-1].every(i=>seen[i]);
    this.winner=this.findWinner();if(!this.winner)this.turn=player==='X'?'O':'X';
    return {index,player,hit:shipId>0,sunk,winner:this.winner};
  }
  progress(){
    const hits=(cells,shots)=>cells.reduce((n,v,i)=>n+Number(Boolean(v&&shots[i])),0);
    return {line:hits(this.sora.cells,this.playerShots),sora:hits(this.player.cells,this.soraShots)};
  }
}
export function chooseBattleship(g,{gentle=false,rng=Math.random}={}){
  const possibilities=[];
  for(let i=0;i<100;i++)if(!g.soraShots[i])possibilities.push(i);
  if(!possibilities.length)return null;
  const hits=[];
  for(let i=0;i<100;i++)if(g.soraShots[i]&&g.player.cells[i]){
    const ship=g.player.cells[i];
    // Only target using public knowledge: when already hit, look at adjacent cells.
    // Do not inspect unshot cells in the probability calculation.
    if(!g.player.ships[ship-1].every(j=>g.soraShots[j]))hits.push(i);
  }
  const near=new Set();for(const i of hits){
    const y=i/10|0,x=i%10;
    for(const [dy,dx] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const ny=y+dy,nx=x+dx;if(ny>=0&&ny<10&&nx>=0&&nx<10&&!g.soraShots[ny*10+nx])near.add(ny*10+nx);
    }
  }
  if(near.size&&!gentle)return randomPick(Array.from(near),rng);
  if(gentle)return randomPick(possibilities,rng);
  const parity=possibilities.filter(i=>(Math.floor(i/10)+i%10)%2===0);
  return randomPick(parity.length?parity:possibilities,rng);
}

export const WORDS = Object.freeze([
  {word:'cầu vồng',topic:'Thiên nhiên',hint:'Xuất hiện khi ánh sáng đi qua những giọt nước'},
  {word:'máy tính',topic:'Công nghệ',hint:'Dùng để lập trình, học tập và chơi game'},
  {word:'trăng rằm',topic:'Thiên nhiên',hint:'Bầu trời sáng vào giữa tháng âm lịch'},
  {word:'ánh sao',topic:'Vũ trụ',hint:'Những chấm sáng xa xôi trên trời đêm'},
  {word:'bàn phím',topic:'Công nghệ',hint:'Nơi bàn tay gõ chữ vào máy'},
  {word:'đại dương',topic:'Địa lý',hint:'Một vùng nước mặn mênh mông'},
  {word:'hoa anh đào',topic:'Thực vật',hint:'Loài hoa nổi tiếng nở rộ ở Nhật Bản'},
  {word:'lập trình',topic:'Công nghệ',hint:'Viết mã để tạo phần mềm'},
  {word:'thư viện',topic:'Học tập',hint:'Nơi có những kệ sách để mượn đọc'},
  {word:'thám tử',topic:'Nghề nghiệp',hint:'Người chuyên truy tìm manh mối vụ án'},
  {word:'mật mã',topic:'Công nghệ',hint:'Dùng để che giấu hoặc xác thực thông tin'},
  {word:'cánh diều',topic:'Tuổi thơ',hint:'Bay trên trời khi có gió và dây'},
  {word:'mèo con',topic:'Động vật',hint:'Thích đuổi bóng len và kêu meo meo'},
  {word:'sao băng',topic:'Vũ trụ',hint:'Vệt sáng vụt qua bầu trời đêm'},
  {word:'bão tuyết',topic:'Thời tiết',hint:'Gió mạnh và rất nhiều bông trắng lạnh'},
  {word:'trà sữa',topic:'Ẩm thực',hint:'Thức uống có thể kèm trân châu'},
  {word:'âm nhạc',topic:'Nghệ thuật',hint:'Giai điệu từ nhạc cụ hoặc giọng hát'},
  {word:'hải đăng',topic:'Địa lý',hint:'Ngọn tháp chiếu sáng dẫn tàu thuyền'},
  {word:'núi lửa',topic:'Địa lý',hint:'Có thể phun dung nham khi hoạt động'},
  {word:'hoa hướng dương',topic:'Thực vật',hint:'Bông hoa vàng thường hướng về ánh sáng'},
  {word:'ngân hà',topic:'Vũ trụ',hint:'Thiên hà chứa Hệ Mặt Trời'},
  {word:'sấm chớp',topic:'Thời tiết',hint:'Âm thanh và ánh sáng khi trời giông'},
  {word:'robot',topic:'Công nghệ',hint:'Máy có khả năng thực hiện hành động tự động'},
  {word:'trái tim',topic:'Cơ thể',hint:'Cơ quan bơm máu và là biểu tượng yêu thương'},
  {word:'bình minh',topic:'Thiên nhiên',hint:'Khoảnh khắc mặt trời mới mọc'},
]);
export const normalizeWord=(s)=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
export class WordDuel {
  constructor(data=null,rng=Math.random){
    this.target=randomPick(WORDS,rng);this.guesses=[];this.winner='';this.hints=0;
    if(data&&WORDS.some(w=>w.word===data.target)&&Array.isArray(data.guesses)){
      this.target=WORDS.find(w=>w.word===data.target);
      this.guesses=data.guesses.filter(x=>typeof x==='string').slice(0,6);
      this.hints=within(data.hints,0,4)?data.hints:0;
      this.winner=this.guesses.some(v=>normalizeWord(v)===normalizeWord(this.target.word))?'X':this.guesses.length>=6?'O':'';
    }
  }
  snapshot(){return {target:this.target.word,guesses:this.guesses.slice(),hints:this.hints};}
  guess(value){
    if(this.winner)return null;
    const cleaned=String(value||'').trim().slice(0,60);
    if(!cleaned)return null;
    this.guesses.push(cleaned);
    const correct=normalizeWord(cleaned)===normalizeWord(this.target.word);
    if(correct)this.winner='X';else if(this.guesses.length===6)this.winner='O';
    return {correct,guesses:this.guesses.length,winner:this.winner};
  }
  hint(){if(this.winner)return '';this.hints=Math.min(this.hints+1,3);
    if(this.hints===1)return this.target.hint;
    if(this.hints===2)return `Chữ đầu: ${this.target.word[0].toUpperCase()}; ${this.target.word.split(' ').length} tiếng.`;
    const letters=Array.from(this.target.word.replace(/\s/g,''));return `Có ${letters.length} chữ cái; chữ cuối là ${letters.at(-1).toUpperCase()}.`;
  }
}

export const CASES = Object.freeze([
  {title:'Bức thư biến mất',intro:'Một lá thư quan trọng biến mất khỏi phòng đọc lúc 19:00. Có ba người từng đến.',
   clues:['Cửa phòng không có dấu cạy phá.', 'Camera ghi người trực thư viện rời bàn trong 3 phút.',
    'Một chiếc phong bì rỗng nằm trong xe đẩy trả sách.', 'Chỉ người trực có chìa khóa xe đẩy khóa bánh.'],
   suspects:['Minh – sinh viên','Lan – quản thư','Huy – nhân viên bảo vệ'],culprit:1,
   logic:'Lan đã chuyển lá thư vào xe đẩy và rời bàn lấy cớ kiểm kê; chìa khóa xe đẩy liên hệ trực tiếp đến cô ấy.'},
  {title:'Chiếc đồng hồ dừng',intro:'Đồng hồ cổ bị đổi trong tủ kính của phòng trưng bày.',
   clues:['Tủ kính còn nguyên và có khóa số.', 'Đồng hồ thay thế dừng ở 10:15 nhưng hệ thống báo mất điện lúc 9:40.',
    'Người hướng dẫn có thẻ mở tủ nhưng đang dẫn đoàn trước 10 giờ.', 'Nhân viên kỹ thuật có mã dự phòng và ra khỏi tòa lúc 10:20.'],
   suspects:['Vân – hướng dẫn viên','Quân – kỹ thuật viên','An – khách tham quan'],culprit:1,
   logic:'Quân có mã dự phòng và có mặt đúng lúc chiếc đồng hồ bị đánh tráo.'},
  {title:'Bản thiết kế mật',intro:'Bản thiết kế robot bị sao chép trước buổi thuyết trình.',
   clues:['Máy in ghi nhận một bản sao lúc 21:12.', 'Chìa khóa phòng lab do trưởng nhóm và trợ lý giữ.',
    'Nhật ký máy cho thấy tài khoản trợ lý đăng nhập lúc 21:10.', 'Trợ lý khai đã về trước 20 giờ nhưng camera ghi nhận xe vẫn ở bãi lúc 21:30.'],
   suspects:['Sơn – trưởng nhóm','Linh – trợ lý','Bảo – khách mời'],culprit:1,
   logic:'Linh có chìa khóa, tài khoản in bản sao và chứng cứ về thời gian khai báo không khớp.'},
  {title:'Bí ẩn căn phòng nhạc',intro:'Một bản thu hiếm bị xóa khỏi phòng thu khi hệ thống đang bảo trì.',
   clues:['Không có đăng nhập từ Internet vào máy thu.', 'Dữ liệu bị xóa bằng lệnh từ bàn điều khiển tại chỗ.',
    'Người dọn vệ sinh không biết mật khẩu điều khiển.', 'Nhạc công phụ có thẻ phòng và đăng nhập máy điều khiển ngay trước giờ bảo trì.'],
   suspects:['Duy – nhạc công phụ','Mai – kỹ thuật âm thanh','Hà – người dọn vệ sinh'],culprit:0,
   logic:'Duy là người dùng bàn điều khiển có quyền truy cập tại chỗ đúng thời điểm.'},
]);
export class DetectiveCase {
  constructor(data=null,rng=Math.random){
    this.caseIndex=Math.floor(rng()*CASES.length);this.revealed=0;this.winner='';this.guessIndex=-1;
    if(data&&within(data.caseIndex,0,CASES.length)){
      this.caseIndex=data.caseIndex;this.revealed=within(data.revealed,0,5)?data.revealed:0;
      this.guessIndex=within(data.guessIndex,0,3)?data.guessIndex:-1;
      if(this.guessIndex>=0)this.winner=this.guessIndex===CASES[this.caseIndex].culprit?'X':'O';
    }
  }
  get case(){return CASES[this.caseIndex];}
  snapshot(){return {caseIndex:this.caseIndex,revealed:this.revealed,guessIndex:this.guessIndex};}
  nextClue(){if(this.winner||this.revealed>=this.case.clues.length)return null;
    return this.case.clues[this.revealed++];}
  accuse(index){if(this.winner||this.revealed<2||!within(index,0,3))return null;
    this.guessIndex=index;this.winner=index===this.case.culprit?'X':'O';
    return {correct:this.winner==='X',culprit:this.case.suspects[this.case.culprit],logic:this.case.logic};
  }
}

export function restoreGame(id,data,rng=Math.random){
  switch(id){
    case 'connect4':return new ConnectFour(data);
    case 'gomoku':return new Gomoku(data);
    case 'word':return new WordDuel(data,rng);
    case 'reversi':return new Reversi(data);
    case 'battleship':return new Battleship(data,rng);
    case 'detective':return new DetectiveCase(data,rng);
    default:throw new Error('Unknown game '+id);
  }
}
