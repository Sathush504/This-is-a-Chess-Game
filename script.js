// --- Chess Variables ---
const PIECES = { K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙', k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟' };
const boardEl = document.getElementById('board');
const turnEl = document.getElementById('turn');
const movesEl = document.getElementById('moves');
const p2pPanel = document.getElementById('p2p-panel');
const signalDataEl = document.getElementById('signal-data');
const p2pStatus = document.getElementById('p2p-status');

let board=[], whiteToMove=true, selected=null, history=[], lastMove=null, flipped=false;
let currentMode='local';
let aiEnabled=false;

// P2P Variables
let peer=null, isHost=false, isP2PConnected=false;
let myColor='w';

// --- Build Squares ---
function buildSquares(){
  boardEl.innerHTML='';
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const sq=document.createElement('div');
      sq.className='square '+((r+c)%2?'dark':'light');
      sq.dataset.r=r; sq.dataset.c=c;
      sq.addEventListener('click', ()=>onSquareClick(r,c));
      boardEl.appendChild(sq);
    }
  }
}

// --- Initial Board ---
function emptyBoard(){ return Array.from({length:8},()=>Array(8).fill(null)); }
function loadInitial(){
  const fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
  board = emptyBoard();
  fen.split('/').forEach((row,rIdx)=>{
    let c=0; for(const ch of row){
      if(/[1-8]/.test(ch)){ c+=parseInt(ch,10); }
      else { const isUpper = ch===ch.toUpperCase(); board[rIdx][c]={type:ch.toLowerCase(), color:isUpper?'w':'b', hasMoved:false}; c++; }
    }
  });
}

// --- Render Board ---
function render(){
  [...boardEl.children].forEach(sq=>{
    sq.innerHTML=''; sq.classList.remove('selected','highlight-move','highlight-capture','last-move');
  });

  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p=board[r][c]; if(!p) continue;
      const sq=boardEl.children[squareIndex(r,c)];
      const span=document.createElement('span'); span.className='piece';
      span.textContent = PIECES[p.color==='w'?p.type.toUpperCase():p.type];
      sq.appendChild(span);
    }
  }

  // Selection & legal moves highlight
  if(selected){
    boardEl.children[squareIndex(selected.r,selected.c)].classList.add('selected');
    const moves=legalMoves(selected.r,selected.c);
    moves.forEach(m=>{
      const sq=boardEl.children[squareIndex(m.r,m.c)];
      sq.classList.add(board[m.r][m.c]?'highlight-capture':'highlight-move');
    });
  }

  // Last move highlights
  if(lastMove){
    boardEl.children[squareIndex(lastMove.from.r,lastMove.from.c)].classList.add('last-move');
    boardEl.children[squareIndex(lastMove.to.r,lastMove.to.c)].classList.add('last-move');
  }

  turnEl.textContent = whiteToMove?'White':'Black';
}

// --- Square Index (for flipped board)
function squareIndex(r,c){
  const order=[...Array(8).keys()];
  const rows=flipped?order.slice().reverse():order;
  const cols=flipped?order.slice().reverse():order;
  return rows.indexOf(r)*8 + cols.indexOf(c);
}

// --- Handle Clicks ---
function onSquareClick(r,c){
  const p=board[r][c];

  // Disable illegal moves for P2P players
  if(currentMode==='p2p' && isP2PConnected){
    if((whiteToMove && myColor!=='w') || (!whiteToMove && myColor!=='b')) return;
  }

  // AI move restriction
  if(currentMode==='ai' && !whiteToMove) return;

  if(selected){
    const moves=legalMoves(selected.r,selected.c);
    const found=moves.find(m=>m.r===r && m.c===c);
    if(found){
      makeMove(selected.r, selected.c, r, c, found.promotion);
      selected=null;

      // AI move
      if(currentMode==='ai' && !whiteToMove){ setTimeout(aiMove,200); }

      // Send move to peer
      if(currentMode==='p2p' && isP2PConnected){ peer.send(JSON.stringify({type:'move', move:{from:selected,to:{r,c}}})); }

      render(); return;
    }
  }

  if(p && ((whiteToMove && p.color==='w') || (!whiteToMove && p.color==='b'))){ selected={r,c}; }
  else selected=null;

  render();
}

// --- Make Move ---
function makeMove(r1,c1,r2,c2,promotion){
  const moving=board[r1][c1]; const captured=board[r2][c2];
  board[r2][c2]={...moving, hasMoved:true};
  if(promotion) board[r2][c2].type=promotion;
  board[r1][c1]=null;
  lastMove={from:{r:r1,c:c1},to:{r:r2,c:c2}};
  whiteToMove=!whiteToMove;
  render();
}

// --- Legal Moves (simplified for brevity)
function within(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
function cloneBoard(b=board){ return b.map(r=>r.map(c=>c?{...c}:null)); }
function legalMoves(r,c){ 
  const p=board[r][c]; if(!p) return [];
  const moves=[]; 
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]; 
  dirs.forEach(([dr,dc])=>{
    const nr=r+dr,nc=c+dc; if(within(nr,nc)) moves.push({r:nr,c:nc});
  });
  return moves;
}

// --- AI Move (random)
function aiMove(){
  const pieces=[]; board.forEach((row,r)=>row.forEach((p,c)=>{if(p&&p.color==='b') pieces.push({r,c});}));
  const movable=pieces.filter(p=>legalMoves(p.r,p.c).length>0);
  if(movable.length===0) return;
  const pick=movable[Math.floor(Math.random()*movable.length)];
  const moves=legalMoves(pick.r,pick.c);
  const move=moves[Math.floor(Math.random()*moves.length)];
  makeMove(pick.r,pick.c,move.r,move.c);
}

// --- Reset Game ---
function resetGame(){ loadInitial(); whiteToMove=true; selected=null; history=[]; lastMove=null; render(); }

// --- Mode Buttons ---
document.querySelectorAll('.mode-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    currentMode=btn.dataset.mode;
    p2pPanel.style.display=(currentMode==='p2p')?'block':'none';
    resetGame();
    if(currentMode==='ai') aiEnabled=true; else aiEnabled=false;
  });
});

// --- P2P Connections ---
document.getElementById('btn-connect').addEventListener('click', ()=>{
  const data=signalDataEl.value.trim();
  if(!peer){
    isHost=false; peer=new SimplePeer({initiator:false,trickle:false});
    peer.on('signal', d=>{ signalDataEl.value=JSON.stringify(d); });
    peer.on('connect', ()=>{ isP2PConnected=true; p2pStatus.textContent='Connected'; });
    peer.on('data', msg=>handlePeerData(JSON.parse(msg)));
  }
  peer.signal(JSON.parse(data));
});

// Host initiates
function initHost(){
  isHost=true; myColor='w';
  peer=new SimplePeer({initiator:true,trickle:false});
  peer.on('signal', d=>{ signalDataEl.value=JSON.stringify(d); });
  peer.on('connect', ()=>{ isP2PConnected=true; p2pStatus.textContent='Connected'; });
  peer.on('data', msg=>handlePeerData(JSON.parse(msg)));
}

// Handle data from peer
function handlePeerData(data){
  if(data.type==='move'){
    const m=data.move;
    makeMove(m.from.r,m.from.c,m.to.r,m.to.c);
  }
}

// --- Initialize ---
buildSquares(); resetGame();
