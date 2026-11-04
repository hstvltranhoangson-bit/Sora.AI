'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const hub=import('../src/games/hub/engines.mjs');

test('8 games are present and six have offline engines',async()=>{
  const {ALL_IDS,HUB_IDS,restoreGame}=await hub;
  assert.equal(ALL_IDS.length,8);
  assert.equal(HUB_IDS.length,6);
  for(const id of HUB_IDS) assert.ok(restoreGame(id));
});
test('Connect 4: column gravity, ownership and illegal filled column',async()=>{
  const {ConnectFour}=await hub;const g=new ConnectFour();
  const first=g.play(3);assert.equal(first.index,38);assert.equal(g.board[38],'X');
  assert.equal(g.play(3).index,31);assert.equal(g.board[31],'O');
  for(let i=0;i<4;i++)g.play(3);
  assert.equal(g.play(3),null);
});
test('Connect 4: vertical win and no moves afterward',async()=>{
  const {ConnectFour}=await hub;const g=new ConnectFour();
  [0,1,0,1,0,1,0].forEach(c=>g.play(c));
  assert.equal(g.winner,'X');assert.equal(g.play(2),null);
});
test('Connect 4 AI prevents immediate loss',async()=>{
  const {ConnectFour,chooseConnectFour}=await hub;
  const g=new ConnectFour();[0,6,1,6,2].forEach(c=>g.play(c));
  assert.equal(g.turn,'O');assert.equal(chooseConnectFour(g,{depth:4}),3);
});
test('Gomoku supports five along a diagonal',async()=>{
  const {Gomoku}=await hub;const g=new Gomoku();
  const xs=[0,14,28,42,56],os=[156,157,158,159];
  for(let i=0;i<5;i++){g.play(xs[i]);if(i<4)g.play(os[i]);}
  assert.equal(g.winner,'X');assert.equal(g.play(57),null);
});
test('Gomoku AI blocks an immediate fifth mark',async()=>{
  const {Gomoku,chooseGomoku}=await hub;const g=new Gomoku();
  const xs=[66,67,68,69],os=[15,16,17,18];
  for(let i=0;i<4;i++){g.play(xs[i]);g.play(os[i]);}
  // Sora can win herself immediately: it should prefer the win over the block.
  assert.ok([14,19].includes(chooseGomoku(g)));
  const b=new Gomoku();[66,15,67,31,68,47,69].forEach(i=>b.play(i));
  assert.ok([65,70].includes(chooseGomoku(b)));
});
test('Reversi: initial legal moves, flipping and passing',async()=>{
  const {Reversi}=await hub;const g=new Reversi();
  assert.equal(g.valid('X').length,4);
  const m=g.play(g.valid('X')[0]);assert.equal(m.flipped,1);
  assert.equal(g.board.filter(Boolean).length,5);
  assert.equal(g.valid('O').length>0,true);
});
test('Reversi: no moves ends with correct piece majority',async()=>{
  const {Reversi}=await hub;const g=new Reversi({board:Array(64).fill('X'),turn:'O'});
  assert.equal(g.winner,'X');
});
test('Reversi AI only selects a legal move',async()=>{
  const {Reversi,chooseReversi}=await hub;const g=new Reversi();g.play(g.valid('X')[0]);
  assert.ok(g.valid('O').includes(chooseReversi(g)));
});
test('Battleship: all fleets consist of 17 distinct cells; none overlap',async()=>{
  const {Battleship}=await hub;
  for(let j=0;j<30;j++){
    const g=new Battleship();
    for(const fleet of [g.player,g.sora]){
      assert.deepEqual(fleet.ships.map(x=>x.length),[5,4,3,3,2]);
      assert.equal(fleet.ships.flat().length,17);
      assert.equal(new Set(fleet.ships.flat()).size,17);
    }
  }
});
test('Battleship: a coordinate cannot be attacked twice',async()=>{
  const {Battleship}=await hub;const g=new Battleship();
  assert.ok(g.attack(0));g.attack(1);assert.equal(g.attack(0),null);
});
test('Battleship: AI selects a previously unshot square',async()=>{
  const {Battleship,chooseBattleship}=await hub;const g=new Battleship();
  g.turn='O';g.soraShots[3]=true;
  const index=chooseBattleship(g);assert.equal(g.soraShots[index],false);
});
test('Word game: insensitive to Vietnamese tone and punctuation',async()=>{
  const {WordDuel,normalizeWord}=await hub;
  assert.equal(normalizeWord('  Cầu VỒNG!'),'cau vong');
  assert.equal(normalizeWord('ĐẠI DƯƠNG'),'dai duong');
  const g=new WordDuel({target:'cầu vồng',guesses:[]});
  assert.equal(g.guess('Cau Vong').correct,true);assert.equal(g.winner,'X');
});
test('Word game: six failed guesses mean Sora wins',async()=>{
  const {WordDuel}=await hub;const g=new WordDuel({target:'cầu vồng',guesses:[]});
  for(let i=0;i<6;i++)g.guess('không biết '+i);
  assert.equal(g.winner,'O');assert.equal(g.guess('cầu vồng'),null);
});
test('Word game: at most three optional hints',async()=>{
  const {WordDuel}=await hub;const g=new WordDuel({target:'cầu vồng',guesses:[]});
  for(let i=0;i<8;i++)g.hint();assert.equal(g.hints,3);
});
test('Detective: evidence gates the conclusion and correct accusation wins',async()=>{
  const {DetectiveCase}=await hub;const g=new DetectiveCase({caseIndex:0,revealed:0,guessIndex:-1});
  assert.equal(g.accuse(1),null);g.nextClue();g.nextClue();
  assert.equal(g.accuse(1).correct,true);assert.equal(g.winner,'X');
});
test('Detective: wrong conclusion loses and answer is explained',async()=>{
  const {DetectiveCase}=await hub;const g=new DetectiveCase({caseIndex:0,revealed:2,guessIndex:-1});
  assert.equal(g.accuse(0).correct,false);assert.equal(g.winner,'O');
  assert.ok(g.case.logic.length>15);
});
test('Each engine round-trips snapshots without leaking its data across games',async()=>{
  const {HUB_IDS,restoreGame}=await hub;
  for(const id of HUB_IDS){
    const g=restoreGame(id);const restored=restoreGame(id,g.snapshot());
    assert.deepEqual(restored.snapshot(),g.snapshot(),id);
  }
});
test('All 8 tabs, shared dialog, rail and hub canvas live in one window',()=>{
  const html=fs.readFileSync(path.join(root,'src/games/chess/index.html'),'utf8');
  for(const id of ['chess','tictactoe','connect4','gomoku','word','reversi','battleship','detective'])
    assert.match(html,new RegExp('data-game="'+id+'"'));
  for(const id of ['game-rail','hub-board','messages','voice-toggle'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(fs.readFileSync(path.join(root,'src/games/chess/chess.js'),'utf8'),/new GameHubUI/);
});
test('Backend enforces game sources on both chat and experience requests',()=>{
  const bridge=fs.readFileSync(path.join(root,'backend/sora/bridge.py'),'utf8');
  const memory=fs.readFileSync(path.join(root,'backend/sora/ai/experience_memory.py'),'utf8');
  for(const id of ['connect4','gomoku','word','reversi','battleship','detective']){
    assert.ok(bridge.includes(`"${id}"`));assert.ok(memory.includes(`'${id}'`));
  }
});
