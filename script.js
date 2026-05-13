/* ═══════════════════════════════════════════════════════════════════
   ROYAL BLACKJACK — Complete Game Engine v3
   New:  4-deck shoe · Persistent balance (exact) · Leaderboard ·
         Perfect Pair & 21+3 side bets · Player name
   Kept: Hit · Stand · Double · Split · Insurance · Soft Aces ·
         Redo Bet · Max Bet · Animations · Sound stubs · Keyboard
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   CONSTANTS
   ───────────────────────────────────────────────────────────────── */
const SUITS        = ['♠','♥','♦','♣'];
const RANKS        = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS    = new Set(['♥','♦']);
const NUM_DECKS    = 4;          // 4-deck shoe
const RESHUFFLE_AT = 52;         // reshuffle when fewer than 1 deck remains
const STARTING_BAL = 1000;
const MIN_BET      = 5;
const SB_STEP      = 5;          // side-bet increment
const SB_MAX       = 100;        // max side bet per type

/* ─────────────────────────────────────────────────────────────────
   STORAGE KEYS
   ───────────────────────────────────────────────────────────────── */
const SK = {
  balance:     'rjbj_balance',
  stats:       'rjbj_stats',
  prevBet:     'rjbj_prev_bet',
  prevChips:   'rjbj_prev_bet_chips',
  playerName:  'rjbj_player_name',
  leaderboard: 'rjbj_leaderboard',
};

/* ─────────────────────────────────────────────────────────────────
   SOUND ENGINE (Web Audio API — no external files)
   ───────────────────────────────────────────────────────────────── */
const SFX = {
  muted: false, ctx: null,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
  },
  _tone(freq, type, dur, gain = 0.15) {
    if (this.muted || !this.ctx) return;
    try {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(); o.stop(this.ctx.currentTime + dur);
    } catch(e){}
  },
  card()    { this._tone(440, 'triangle', 0.06, 0.12); },
  chip()    { this._tone(880, 'sine',     0.08, 0.10); },
  flip()    { this._tone(660, 'triangle', 0.10, 0.10); },
  bust()    { this._tone(180, 'square',   0.35, 0.08); },
  lose()    { this._tone(220, 'sawtooth', 0.40, 0.10); },
  win()     { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>this._tone(f,'sine',.18,.15),i*80)); },
  bj()      { [784,988,1175,1568].forEach((f,i)=>setTimeout(()=>this._tone(f,'sine',.30,.15),i*60)); },
  shuffle() { for(let i=0;i<6;i++) setTimeout(()=>this._tone(300+Math.random()*200,'sawtooth',.05,.06),i*80); },
  sbWin()   { [660,880,1100].forEach((f,i)=>setTimeout(()=>this._tone(f,'sine',.2,.12),i*70)); },
};

/* ─────────────────────────────────────────────────────────────────
   GAME STATE
   ───────────────────────────────────────────────────────────────── */
let shoe          = [];
let dealerHand    = [];
let playerHands   = [[]];   // supports split: array of hands
let currentHandIdx = 0;
let handBets      = [0];
let dealerRevealed = false;
let gamePhase     = 'betting'; // 'betting' | 'player' | 'dealer' | 'over'
let insuranceBet  = 0;
let hasInsurance  = false;
let splitAces     = false;
let firstMove     = true;

let balance           = STARTING_BAL;
let currentBet        = 0;
let betChips          = [];
let previousBet       = 0;
let previousBetChips  = [];

let sideBets = { pp: 0, tt: 0 }; // Perfect Pair, 21+3

let playerName = '';
let stats = { wins:0, losses:0, streak:0, bestWin:0, totalProfit:0 };
let lbSortKey  = 'balance';

/* ─────────────────────────────────────────────────────────────────
   DOM REFS
   ───────────────────────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const el = {
  app:            $('app'),
  loading:        $('loading-screen'),
  loadingBar:     $('loading-bar'),
  dealerCards:    $('dealer-cards'),
  dealerScore:    $('dealer-score'),
  statusMsg:      $('status-msg'),
  statusSub:      $('status-sub'),
  potAmount:      $('pot-amount'),
  potChipsVis:    $('pot-chips-visual'),
  balAmount:      $('bal-amount'),
  logInner:       $('log-inner'),
  insurancePrompt:$('insurance-prompt'),
  insAmount:      $('ins-amount'),
  deckLabel:      $('deck-label'),
  statWins:       $('stat-wins'),
  statLosses:     $('stat-losses'),
  statStreak:     $('stat-streak'),
  statBest:       $('stat-best'),
  statProfit:     $('stat-profit'),
  btnDeal:        $('btn-deal'),
  btnHit:         $('btn-hit'),
  btnStand:       $('btn-stand'),
  btnDbl:         $('btn-dbl'),
  btnSplit:       $('btn-split'),
  btnNext:        $('btn-next'),
  btnNew:         $('btn-new'),
  btnClear:       $('btn-clear'),
  btnRedo:        $('btn-redo'),
  btnMaxbet:      $('btn-maxbet'),
  btnMute:        $('btn-mute'),
  btnLb:          $('btn-lb'),
  btnRules:       $('btn-rules'),
  rulesModal:     $('rules-modal'),
  modalClose:     $('modal-close'),
  nameModal:      $('name-modal'),
  nameInput:      $('player-name-input'),
  btnNameConfirm: $('btn-name-confirm'),
  btnNameSkip:    $('btn-name-skip'),
  lbModal:        $('lb-modal'),
  lbModalClose:   $('lb-modal-close'),
  lbTbody:        $('lb-tbody'),
  btnLbClear:     $('btn-lb-clear'),
  sbPpAmount:     $('sb-pp-amount'),
  sbTtAmount:     $('sb-tt-amount'),
  sbPpResult:     $('sb-pp-result'),
  sbTtResult:     $('sb-tt-result'),
  sbPpBlock:      $('sb-pp-block'),
  sbTtBlock:      $('sb-21-block'),
  particlesCanvas:$('particles'),
};

/* ═══════════════════════════════════════════════════════════════════
   LOADING SCREEN
   ═══════════════════════════════════════════════════════════════════ */
function runLoadingScreen() {
  const steps = [
    { pct:30,  label:'Shuffling 4 decks…',    delay:0    },
    { pct:60,  label:'Polishing the chips…',  delay:400  },
    { pct:85,  label:'Dimming the lights…',   delay:800  },
    { pct:100, label:'Welcome to the table!', delay:1200 },
  ];
  steps.forEach(({pct,label,delay})=>{
    setTimeout(()=>{
      el.loadingBar.style.width = pct+'%';
      document.querySelector('.loading-sub').textContent = label;
    }, delay);
  });
  setTimeout(()=>{
    el.loading.classList.add('fade-out');
    setTimeout(()=>{
      el.loading.style.display='none';
      el.app.classList.remove('hidden');
      init();
    }, 500);
  }, 1800);
}

/* ═══════════════════════════════════════════════════════════════════
   PARTICLE SYSTEM
   ═══════════════════════════════════════════════════════════════════ */
function initParticles() {
  const canvas = el.particlesCanvas, ctx = canvas.getContext('2d');
  let w, h, particles = [];
  const resize = () => { w=canvas.width=innerWidth; h=canvas.height=innerHeight; };
  const make   = () => ({ x:Math.random()*w, y:Math.random()*h,
    r:Math.random()*1.5+.5, dx:(Math.random()-.5)*.4, dy:(Math.random()-.5)*.3,
    alpha:Math.random()*.4+.1, pulse:Math.random()*Math.PI*2 });
  resize();
  for(let i=0;i<80;i++) particles.push(make());
  const tick = () => {
    ctx.clearRect(0,0,w,h);
    particles.forEach(p=>{
      p.x+=p.dx; p.y+=p.dy; p.pulse+=.02;
      const a=p.alpha*(.7+.3*Math.sin(p.pulse));
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(212,168,67,${a})`; ctx.fill();
      if(p.x<0||p.x>w||p.y<0||p.y>h){p.x=Math.random()*w;p.y=Math.random()*h;}
    });
    requestAnimationFrame(tick);
  };
  addEventListener('resize', resize);
  tick();
}

/* ═══════════════════════════════════════════════════════════════════
   4-DECK SHOE
   ═══════════════════════════════════════════════════════════════════ */
function buildShoe() {
  const cards = [];
  for (let d=0; d<NUM_DECKS; d++)
    for (const suit of SUITS)
      for (const rank of RANKS)
        cards.push({suit, rank, hidden:false});
  // Fisher-Yates shuffle
  for (let i=cards.length-1; i>0; i--) {
    const j=Math.floor(Math.random()*(i+1));
    [cards[i],cards[j]]=[cards[j],cards[i]];
  }
  return cards;
}

function drawCard() {
  if (shoe.length < RESHUFFLE_AT) reshuffleShoe();
  return shoe.pop();
}

function reshuffleShoe() {
  shoe = buildShoe();
  showShuffleAnim();
  SFX.shuffle();
  logEntry(`♠ 4-deck shoe reshuffled (${NUM_DECKS*52} cards).`);
  updateDeckLabel();
}

function updateDeckLabel() {
  el.deckLabel.textContent = shoe.length + ' cards';
}

/* ═══════════════════════════════════════════════════════════════════
   SCORE CALCULATION
   ═══════════════════════════════════════════════════════════════════ */
function cardValue(rank) {
  if (rank==='A') return 11;
  if (['J','Q','K'].includes(rank)) return 10;
  return parseInt(rank);
}

function calcScore(hand, ignoreHidden=false) {
  let total=0, aces=0;
  for (const c of hand) {
    if (!ignoreHidden && c.hidden) continue;
    if (c.rank==='A') { total+=11; aces++; } else total+=cardValue(c.rank);
  }
  while (total>21 && aces>0) { total-=10; aces--; }
  return total;
}

const calcFull    = hand => calcScore(hand, true);
const isBlackjack = hand => hand.length===2 && calcFull(hand)===21;
const isSoft      = hand => {
  let t=0,a=0;
  hand.forEach(c=>{ if(c.rank==='A'){t+=11;a++;}else t+=cardValue(c.rank); });
  return a>0 && t<=21;
};

/* ═══════════════════════════════════════════════════════════════════
   CARD RENDERING
   ═══════════════════════════════════════════════════════════════════ */
function makeCardEl(card, dealIdx=0, isHit=false) {
  const wrap  = document.createElement('div');
  wrap.className = 'card-wrap' + (isHit?' hit-card':'');
  wrap.style.setProperty('--deal-i', dealIdx);

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  const face = document.createElement('div');
  face.className = 'card-face '+(RED_SUITS.has(card.suit)?'red':'black');
  face.innerHTML = `
    <div class="card-corner">
      <span class="card-rank">${card.rank}</span>
      <span class="card-suit-sm">${card.suit}</span>
    </div>
    <span class="card-suit-lg">${card.suit}</span>
    <div class="card-corner flip-corner">
      <span class="card-rank">${card.rank}</span>
      <span class="card-suit-sm">${card.suit}</span>
    </div>`;

  const back = document.createElement('div');
  back.className = 'card-back';
  back.textContent = '🂠';

  inner.append(face, back);
  wrap.appendChild(inner);
  if (card.hidden) wrap.classList.add('face-down');
  return wrap;
}

function addDealerCard(card) {
  el.dealerCards.appendChild(makeCardEl(card, 0, true));
  SFX.card();
  refreshDealerScore();
}

function addPlayerCard(card, idx) {
  const row = $(`player-cards-${idx}`);
  if (row) { row.appendChild(makeCardEl(card, 0, true)); SFX.card(); }
  refreshPlayerScore(idx);
}

function renderPlayerCards(idx) {
  const row = $(`player-cards-${idx}`);
  if (!row) return;
  row.innerHTML = '';
  playerHands[idx].forEach((c,i)=>row.appendChild(makeCardEl(c,i)));
  refreshPlayerScore(idx);
}

function refreshDealerScore() {
  let display, cls='score-pill';
  if (dealerRevealed) {
    const s=calcFull(dealerHand);
    display=s;
    if(s>21) cls+=' bust';
    else if(s===21&&dealerHand.length===2) cls+=' blackjack';
    else if(s===21) cls+=' twenty-one';
  } else {
    const vis=dealerHand.filter(c=>!c.hidden);
    display=vis.length ? calcScore(vis) : '?';
  }
  el.dealerScore.textContent=display;
  el.dealerScore.className=cls;
}

function refreshPlayerScore(idx) {
  const pill=$(`player-score-${idx}`); if(!pill) return;
  const hand=playerHands[idx], s=calcScore(hand);
  pill.textContent=s;
  pill.className='score-pill'+(s>21?' bust':s===21&&hand.length===2?' blackjack':s===21?' twenty-one':'');
}

function revealDealer() {
  dealerRevealed=true;
  dealerHand=dealerHand.map(c=>({...c,hidden:false}));
  el.dealerCards.querySelectorAll('.card-wrap.face-down').forEach(w=>{
    w.classList.add('flip-reveal'); w.classList.remove('face-down');
    setTimeout(()=>w.classList.remove('flip-reveal'),600);
  });
  SFX.flip();
  refreshDealerScore();
}

/* ═══════════════════════════════════════════════════════════════════
   SIDE BETS — PERFECT PAIR & 21+3
   ═══════════════════════════════════════════════════════════════════ */

/*
 * Perfect Pair payouts:
 *   Mixed Pair   (same rank, diff colour)  → 6:1
 *   Coloured Pair(same rank, same colour)  → 12:1
 *   Perfect Pair (same rank, same suit)    → 25:1
 */
function evalPerfectPair(hand) {
  if (hand.length<2) return null;
  const [a,b]=hand;
  if (a.rank!==b.rank) return null;
  if (a.suit===b.suit)                               return {name:'Perfect Pair!',  mult:25};
  const aRed=RED_SUITS.has(a.suit), bRed=RED_SUITS.has(b.suit);
  if (aRed===bRed)                                   return {name:'Coloured Pair!', mult:12};
  return                                                    {name:'Mixed Pair!',    mult:6};
}

/*
 * 21+3 uses your 2 cards + dealer's up card (3 cards total):
 *   Flush         (same suit)                        → 5:1
 *   Straight      (sequential ranks, any suit)       → 10:1
 *   Three of a Kind (same rank, diff suits)          → 30:1
 *   Straight Flush (sequential, same suit)           → 40:1
 *   Suited Trips   (same rank, same suit — 4-deck possible!) → 100:1
 */
function eval21plus3(playerHand, dealerUpCard) {
  if (!dealerUpCard || playerHand.length<2) return null;
  const three=[playerHand[0], playerHand[1], dealerUpCard];
  const suits=three.map(c=>c.suit);
  const ranks=three.map(c=>c.rank);

  // Convert ranks to numeric values for straight check
  const rankOrder=['A','2','3','4','5','6','7','8','9','10','J','Q','K','A']; // A can be high or low
  const numVals=ranks.map(r=>rankOrder.indexOf(r)).sort((a,b)=>a-b);

  const allSameSuit = suits.every(s=>s===suits[0]);
  const allSameRank = ranks.every(r=>r===ranks[0]);
  // Straight: consecutive numVals (also handles A-2-3 → indices 0,1,2 and Q-K-A → indices 12,13,0→mapped)
  const isStr8 = (numVals[2]-numVals[1]===1 && numVals[1]-numVals[0]===1) ||
                 // Wrap-around Ace high (A=13 in second slot of rankOrder)
                 (ranks.includes('A') && (() => {
                   const v=ranks.map(r=>r==='A'?14:rankOrder.indexOf(r)).sort((a,b)=>a-b);
                   return v[2]-v[1]===1 && v[1]-v[0]===1;
                 })());

  if (allSameSuit && allSameRank) return {name:'Suited Trips!',    mult:100};
  if (allSameSuit && isStr8)      return {name:'Straight Flush!',  mult:40};
  if (allSameRank)                return {name:'Three of a Kind!', mult:30};
  if (isStr8)                     return {name:'Straight!',        mult:10};
  if (allSameSuit)                return {name:'Flush!',           mult:5};
  return null;
}

function settleSideBets(pHand, dHand) {
  const dealerUp = dHand.find(c=>!c.hidden) || dHand[0];

  if (sideBets.pp > 0) {
    const res = evalPerfectPair(pHand);
    if (res) {
      const payout = sideBets.pp * (res.mult+1);
      balance += payout;
      showSbResult('pp', `${res.name}  +$${payout-sideBets.pp}`, true);
      logEntry(`Perfect Pair: ${res.name} ×${res.mult} → +$${payout-sideBets.pp}`, 'log-win');
      SFX.sbWin();
    } else {
      showSbResult('pp', `No Pair  −$${sideBets.pp}`, false);
      logEntry(`Perfect Pair: no pair, lost $${sideBets.pp}`, 'log-lose');
    }
  }

  if (sideBets.tt > 0) {
    const res = eval21plus3(pHand, dealerUp);
    if (res) {
      const payout = sideBets.tt * (res.mult+1);
      balance += payout;
      showSbResult('tt', `${res.name}  +$${payout-sideBets.tt}`, true);
      logEntry(`21+3: ${res.name} ×${res.mult} → +$${payout-sideBets.tt}`, 'log-win');
      SFX.sbWin();
    } else {
      showSbResult('tt', `No combo  −$${sideBets.tt}`, false);
      logEntry(`21+3: no combo, lost $${sideBets.tt}`, 'log-lose');
    }
  }
}

function showSbResult(key, text, won) {
  const res = key==='pp' ? el.sbPpResult : el.sbTtResult;
  res.textContent = text;
  res.className   = 'sb-result '+(won?'sb-win':'sb-lose');
  res.classList.remove('hidden');
}

function clearSbResults() {
  [el.sbPpResult, el.sbTtResult].forEach(r=>{
    r.textContent=''; r.className='sb-result hidden';
  });
}

function lockSideBets(locked) {
  [el.sbPpBlock, el.sbTtBlock].forEach(b=>b.classList.toggle('sb-locked',locked));
}

function totalSideBet() { return sideBets.pp + sideBets.tt; }

// Called by HTML onclick on the +/- buttons
function adjustSideBet(key, delta) {
  if (gamePhase!=='betting') return;
  const newVal = Math.max(0, Math.min(SB_MAX, sideBets[key]+delta));
  const diff   = newVal - sideBets[key];
  // Check we can afford to increase
  if (diff>0 && diff > balance - currentBet - totalSideBet()) {
    flashEl('bal-amount','flash-loss'); return;
  }
  sideBets[key] = newVal;
  refreshSbUI();
  updateChipStates(); // re-evaluate what main chips are affordable
}

function refreshSbUI() {
  el.sbPpAmount.textContent='$'+sideBets.pp;
  el.sbTtAmount.textContent='$'+sideBets.tt;
  el.sbPpBlock.classList.toggle('sb-active', sideBets.pp>0);
  el.sbTtBlock.classList.toggle('sb-active', sideBets.tt>0);
}

/* ═══════════════════════════════════════════════════════════════════
   BETTING
   ═══════════════════════════════════════════════════════════════════ */
function placeBet(amount) {
  if (gamePhase!=='betting') return;
  if (currentBet+amount+totalSideBet() > balance) { flashEl('bal-amount','flash-loss'); return; }
  SFX.init(); SFX.chip();
  currentBet+=amount; betChips.push(amount);
  updateBetDisplay(); addPotChipVis(amount);

  const chip=document.querySelector(`.chip[data-val="${amount}"]`);
  if (chip) {
    chip.classList.remove('placing'); void chip.offsetWidth; chip.classList.add('placing');
    chip.addEventListener('animationend',()=>chip.classList.remove('placing'),{once:true});
  }
  el.btnDeal.disabled=false;
  updateBetUtilBtns(); updateChipStates();
}

function clearBet() {
  if (gamePhase!=='betting') return;
  currentBet=0; betChips=[];
  el.potChipsVis.innerHTML='';
  updateBetDisplay();
  el.btnDeal.disabled=true;
  updateBetUtilBtns(); updateChipStates();
}

function redoBet() {
  if (gamePhase!=='betting'||previousBet<=0) return;
  if (previousBet+totalSideBet()>balance) { flashEl('bal-amount','flash-loss'); return; }
  currentBet=0; betChips=[]; el.potChipsVis.innerHTML='';
  SFX.init();
  [...previousBetChips].forEach((amt,i)=>{
    setTimeout(()=>{
      currentBet+=amt; betChips.push(amt);
      addPotChipVis(amt); SFX.chip(); updateBetDisplay();
      if(i===previousBetChips.length-1){
        el.btnDeal.disabled=false;
        updateBetUtilBtns(); updateChipStates();
        logEntry(`Redo bet: $${currentBet}`);
      }
    }, i*80);
  });
}

function maxBet() {
  if (gamePhase!=='betting'||balance<=0) return;
  const avail = balance - totalSideBet();
  if (avail<=0) return;
  currentBet=0; betChips=[]; el.potChipsVis.innerHTML='';

  const denoms=[500,100,50,25,10,5];
  let rem=avail; const chips=[];
  for(const d of denoms){while(rem>=d){chips.push(d);rem-=d;}}
  if(rem>0) chips.push(rem);
  const vis=consolidateChips(chips,12);

  SFX.init();
  vis.forEach((amt,i)=>{
    setTimeout(()=>{
      currentBet+=amt; betChips.push(amt);
      addPotChipVis(amt); SFX.chip(); updateBetDisplay();
      if(i===vis.length-1){
        el.btnDeal.disabled=false;
        updateBetUtilBtns(); updateChipStates();
        logEntry(`Max bet: $${currentBet}`);
      }
    }, i*55);
  });
}

function confirmResetBalance() {
  if (!confirm('Reset balance to $1,000 and clear all stats? This cannot be undone.')) return;
  balance=STARTING_BAL;
  stats={wins:0,losses:0,streak:0,bestWin:0,totalProfit:0};
  previousBet=0; previousBetChips=[];
  updateBetDisplay(); updateStatsDisplay(); updateBetUtilBtns(); updateChipStates(); saveState();
  logEntry('Balance reset to $1,000.');
}

function consolidateChips(chips, max) {
  if(chips.length<=max) return chips;
  const total=chips.reduce((a,b)=>a+b,0);
  const denoms=[500,100,50,25,10,5]; const result=[]; let rem=total;
  for(const d of denoms){
    const cnt=Math.min(Math.floor(rem/d),max-result.length-1);
    for(let i=0;i<cnt;i++){result.push(d);rem-=d;}
    if(result.length>=max-1) break;
  }
  if(rem>0) result.push(rem);
  return result;
}

function chipColour(amt) {
  if(amt>=500) return 'pvc-500'; if(amt>=100) return 'pvc-100';
  if(amt>=50)  return 'pvc-50';  if(amt>=25)  return 'pvc-25';
  if(amt>=10)  return 'pvc-10';  return 'pvc-5';
}
function addPotChipVis(amount) {
  const d=document.createElement('div');
  d.className=`pot-chip-vis ${chipColour(amount)}`;
  el.potChipsVis.appendChild(d);
}

function updateBetDisplay() {
  el.potAmount.textContent='$'+currentBet;
  el.potAmount.classList.toggle('has-bet',currentBet>0);
  el.balAmount.textContent='$'+balance.toLocaleString();
}

function updateChipStates() {
  const avail=balance-currentBet-totalSideBet();
  document.querySelectorAll('.chip[data-val]').forEach(chip=>{
    chip.classList.toggle('chip-off', gamePhase!=='betting'||parseInt(chip.dataset.val)>avail);
  });
}

function updateBetUtilBtns() {
  const betting=gamePhase==='betting';
  el.btnRedo.disabled   = !betting||previousBet<=0||previousBet>balance-totalSideBet();
  el.btnMaxbet.disabled = !betting||balance<=0;
  el.btnClear.disabled  = !betting||currentBet<=0;
}

/* ── Payout ──────────────────────────────────────────────────── */
function settleBet(handIdx, outcome) {
  const bet=handBets[handIdx];
  let payout=0;
  if      (outcome==='blackjack') payout=Math.floor(bet*2.5);
  else if (outcome==='win')       payout=bet*2;
  else if (outcome==='push')      payout=bet;
  balance+=payout;
  const net=payout-bet;
  if(outcome!=='loss'&&outcome!=='surrender'){
    flashEl('bal-amount','flash-win'); stats.totalProfit+=net;
    if(net>stats.bestWin) stats.bestWin=net;
  } else if(outcome==='loss'){
    flashEl('bal-amount','flash-loss'); stats.totalProfit+=net;
  }
  updateBetDisplay();
  return payout;
}

function settleInsurance(dealerBJ) {
  if(!hasInsurance) return;
  if(dealerBJ){ balance+=insuranceBet*3; logEntry(`Insurance pays $${insuranceBet*2}.`); flashEl('bal-amount','flash-win'); }
  else logEntry('Insurance lost.');
  hasInsurance=false; insuranceBet=0; updateBetDisplay();
}

/* ═══════════════════════════════════════════════════════════════════
   GAME FLOW
   ═══════════════════════════════════════════════════════════════════ */
function startGame() {
  if (currentBet<MIN_BET) return;
  SFX.init();
  clearStatus(); clearSbResults();
  gamePhase='player'; dealerRevealed=false;
  splitAces=false; firstMove=true;
  hasInsurance=false; insuranceBet=0; currentHandIdx=0;

  // Save for redo
  previousBet=currentBet; previousBetChips=[...betChips];

  // Deduct main bet + side bets
  balance -= (currentBet + totalSideBet());
  handBets=[currentBet]; playerHands=[[]];
  updateBetDisplay(); updateChipStates(); lockBettingUI(true); lockSideBets(true);

  // Reset player UI
  $('hand-zone-0').classList.remove('hidden');
  $('hand-zone-1').classList.add('hidden');
  ['0','1'].forEach(i=>{
    $(`player-cards-${i}`).innerHTML='';
    const sc=$(`player-score-${i}`); sc.textContent='0'; sc.className='score-pill';
    $(`hand-bet-${i}`).textContent='';
  });
  $('hand-zone-0').classList.add('active-hand');
  el.dealerCards.innerHTML=''; dealerHand=[];

  if(shoe.length<RESHUFFLE_AT) reshuffleShoe();

  // Deal sequence: P1 D1 P2 D2(hidden)
  const seq=[
    ()=>{const c=drawCard();playerHands[0].push(c);addPlayerCard(c,0);},
    ()=>{const c=drawCard();dealerHand.push(c);addDealerCard(c);},
    ()=>{const c=drawCard();playerHands[0].push(c);addPlayerCard(c,0);},
    ()=>{const c=drawCard();c.hidden=true;dealerHand.push(c);addDealerCard(c);},
  ];
  seq.forEach((fn,i)=>setTimeout(fn,i*350));

  setTimeout(()=>{
    updateDeckLabel();
    const sbNote=totalSideBet()>0?` · side bets $${totalSideBet()}`:'';
    logEntry(`Hand dealt — bet $${currentBet}${sbNote}.`);
    checkInsurance();
  }, seq.length*350+100);
}

/* ── Insurance ───────────────────────────────────────────────── */
function checkInsurance() {
  const up=dealerHand[0];
  if(!up||dealerRevealed){afterInsurance();return;}
  if(up.rank==='A'){
    const insAmt=Math.floor(currentBet/2);
    if(insAmt>0&&balance>=insAmt){
      el.insAmount.textContent=insAmt;
      el.insurancePrompt.classList.remove('hidden');
      $('btn-ins-yes').onclick=()=>{
        insuranceBet=insAmt; balance-=insAmt; hasInsurance=true;
        updateBetDisplay(); logEntry(`Insurance taken: $${insAmt}.`);
        el.insurancePrompt.classList.add('hidden'); afterInsurance();
      };
      $('btn-ins-no').onclick=()=>{el.insurancePrompt.classList.add('hidden');afterInsurance();};
      return;
    }
  }
  afterInsurance();
}

function afterInsurance() {
  // Settle side bets as soon as we have all the info (player 2 cards + dealer up card)
  if(totalSideBet()>0){ settleSideBets(playerHands[0],dealerHand); updateBetDisplay(); }

  // Player blackjack?
  if(isBlackjack(playerHands[0])){
    revealDealer();
    const dBJ=isBlackjack(dealerHand); settleInsurance(dBJ);
    endRound([{handIdx:0, outcome:dBJ?'push':'blackjack', label:dBJ?'Push — Both Blackjack':'✦ BLACKJACK! ✦'}]);
    return;
  }
  // Dealer BJ peek (10-value up card)
  const up=dealerHand[0];
  if(up&&['10','J','Q','K','A'].includes(up.rank)&&calcFull(dealerHand)===21){
    settleInsurance(true); revealDealer();
    endRound([{handIdx:0,outcome:'loss',label:'Dealer Blackjack'}]);
    return;
  }
  settleInsurance(false);
  setPlayerControls();
}

/* ── Player actions ──────────────────────────────────────────── */
function playerHit() {
  if(gamePhase!=='player') return;
  const hand=playerHands[currentHandIdx];
  const card=drawCard(); hand.push(card); addPlayerCard(card,currentHandIdx); firstMove=false;
  const score=calcScore(hand);
  logEntry(`Hit → ${card.rank}${card.suit} (${score})`);
  if(splitAces){setTimeout(()=>advanceSplit(),400);return;}
  if(score>21){SFX.bust();logEntry('Bust!','log-lose');setTimeout(()=>advanceSplit(),600);}
  else if(score===21){setTimeout(()=>playerStand(),400);}
  else setPlayerControls();
}

function playerStand() {
  if(gamePhase!=='player') return;
  logEntry(`Stand at ${calcScore(playerHands[currentHandIdx])}.`);
  advanceSplit();
}

function playerDouble() {
  if(gamePhase!=='player'||!firstMove) return;
  const extra=handBets[currentHandIdx];
  if(balance<extra){flashEl('bal-amount','flash-loss');return;}
  balance-=extra; handBets[currentHandIdx]*=2; updateBetDisplay();
  $(`hand-bet-${currentHandIdx}`).textContent=`Bet: $${handBets[currentHandIdx]}`;
  SFX.chip();
  const card=drawCard(); playerHands[currentHandIdx].push(card); addPlayerCard(card,currentHandIdx);
  logEntry(`Double → ${card.rank}${card.suit} (${calcScore(playerHands[currentHandIdx])})`);
  if(calcScore(playerHands[currentHandIdx])>21){SFX.bust();logEntry('Bust!','log-lose');}
  setTimeout(()=>advanceSplit(),700);
}

function playerSplit() {
  if(gamePhase!=='player'||!firstMove) return;
  const hand=playerHands[currentHandIdx];
  if(hand.length!==2) return;
  const r0=hand[0].rank,r1=hand[1].rank;
  const match=r0===r1||(['10','J','Q','K'].includes(r0)&&['10','J','Q','K'].includes(r1));
  if(!match) return;
  if(balance<handBets[currentHandIdx]){flashEl('bal-amount','flash-loss');return;}
  balance-=handBets[currentHandIdx]; updateBetDisplay(); SFX.chip();
  if(r0==='A') splitAces=true;
  playerHands[1]=[hand.pop()]; handBets[1]=handBets[currentHandIdx];
  $('hand-zone-1').classList.remove('hidden');
  renderPlayerCards(0); renderPlayerCards(1);
  setTimeout(()=>{
    const c0=drawCard();playerHands[0].push(c0);addPlayerCard(c0,0);
    setTimeout(()=>{
      const c1=drawCard();playerHands[1].push(c1);addPlayerCard(c1,1);
      updateDeckLabel();
      $('hand-bet-0').textContent=`Bet: $${handBets[0]}`;
      $('hand-bet-1').textContent=`Bet: $${handBets[1]}`;
      logEntry('Split! Playing hand 1 of 2.');
      currentHandIdx=0; highlightHand(0); firstMove=true;
      if(splitAces){setTimeout(()=>advanceSplit(),500);}else setPlayerControls();
    },450);
  },400);
}

function advanceSplit() {
  if(currentHandIdx<playerHands.length-1){
    currentHandIdx++; highlightHand(currentHandIdx); firstMove=true;
    const s=calcScore(playerHands[currentHandIdx]);
    if(splitAces||s>=21){setTimeout(()=>advanceSplit(),400);}
    else{logEntry(`Playing split hand ${currentHandIdx+1}.`);setPlayerControls();}
  } else {
    runDealer();
  }
}

function highlightHand(idx) {
  ['hand-zone-0','hand-zone-1'].forEach((id,i)=>{
    const z=$(id);if(z)z.classList.toggle('active-hand',i===idx);
  });
}

/* ── Dealer turn ─────────────────────────────────────────────── */
function runDealer() {
  gamePhase='dealer';
  setControls({deal:false,hit:false,stand:false,dbl:false,split:false,next:false,newGame:false});
  revealDealer();
  setTimeout(dealerStep,700);
}

function dealerStep() {
  const score=calcFull(dealerHand);
  if(score>=17){resolveAll();return;}
  const card=drawCard();dealerHand.push(card);addDealerCard(card);
  logEntry(`Dealer hits → ${card.rank}${card.suit} (${calcFull(dealerHand)})`);
  updateDeckLabel();
  setTimeout(dealerStep,700);
}

/* ═══════════════════════════════════════════════════════════════════
   RESOLVE
   ═══════════════════════════════════════════════════════════════════ */
function resolveAll() {
  gamePhase='over';
  const dScore=calcFull(dealerHand), dBust=dScore>21, results=[];

  playerHands.forEach((hand,idx)=>{
    if(!hand.length) return;
    const pScore=calcScore(hand),pBust=pScore>21;
    const pBJ=isBlackjack(hand)&&playerHands.length===1;
    let outcome,label;
    if(pBust){outcome='loss';label=playerHands.length>1?`Hand ${idx+1}: Bust`:'Bust — Dealer Wins';}
    else if(pBJ&&isBlackjack(dealerHand)){outcome='push';label='Push — Both Blackjack';}
    else if(pBJ){outcome='blackjack';label='✦ BLACKJACK! ✦';}
    else if(dBust){outcome='win';label=playerHands.length>1?`Hand ${idx+1}: Win (Dealer Bust)`:'Dealer Busts — You Win!';}
    else if(pScore>dScore){outcome='win';label=playerHands.length>1?`Hand ${idx+1}: Win`:'You Win!';}
    else if(pScore<dScore){outcome='loss';label=playerHands.length>1?`Hand ${idx+1}: Lose`:'Dealer Wins';}
    else{outcome='push';label=playerHands.length>1?`Hand ${idx+1}: Push`:'Push — Tie';}
    results.push({handIdx:idx,outcome,label});
  });

  endRound(results);
}

function endRound(results) {
  gamePhase='over';
  const primary=results[0];
  const cls=primary.outcome==='blackjack'?'bj':primary.outcome==='win'?'win':primary.outcome==='push'?'push':'lose';

  const subParts=[];
  results.forEach(r=>{
    const payout=settleBet(r.handIdx,r.outcome);
    subParts.push(`${r.label} · Payout $${payout}`);
  });

  const mainLabel=results.length>1?results.map(r=>r.label).join(' / '):primary.label;
  showStatus(mainLabel,cls,subParts.join(' · '));

  if(cls==='bj')SFX.bj();
  else if(cls==='win')SFX.win();
  else if(cls==='lose')SFX.lose();

  const dScore=calcFull(dealerHand);
  results.forEach(r=>{
    const pScore=calcScore(playerHands[r.handIdx]);
    logEntry(`${r.label}  P:${pScore} vs D:${dScore} — Bet $${handBets[r.handIdx]}`,
      r.outcome==='loss'?'log-lose':r.outcome==='push'?'log-push':'log-win');
  });

  const mainOutcome=results.find(r=>r.outcome==='blackjack'||r.outcome==='win')?.outcome
    ||(results.every(r=>r.outcome==='push')?'push':'loss');
  recordResult(mainOutcome);

  if(cls==='bj'||(cls==='win'&&currentBet>=50)) launchConfetti();

  results.forEach(r=>{
    const wraps=$(`player-cards-${r.handIdx}`)?.querySelectorAll('.card-wrap');
    if(!wraps) return;
    const ac=(r.outcome==='win'||r.outcome==='blackjack')?'win-pulse':r.outcome==='loss'?'lose-shake':'';
    if(!ac) return;
    wraps.forEach((w,i)=>{
      w.style.animationDelay=`${i*70}ms`; w.classList.add(ac);
      w.addEventListener('animationend',()=>{
        if(ac==='win-pulse')w.classList.add('win-glow');
        w.style.animationDelay='';
      },{once:true});
    });
  });

  const potChips=el.potChipsVis.querySelectorAll('.pot-chip-vis');
  const isWin=results.some(r=>r.outcome==='win'||r.outcome==='blackjack');
  potChips.forEach((c,i)=>{
    c.style.transition=`transform .4s ${i*50}ms, opacity .4s ${i*50}ms`;
    c.style.transform=isWin?'translateY(-20px) scale(1.4)':'translateY(10px) scale(.5)';
    c.style.opacity='0';
  });
  setTimeout(()=>el.potChipsVis.innerHTML='',600);

  updateBetDisplay(); updateStatsDisplay();
  updateLeaderboard();  // persist updated stats to leaderboard
  checkBalance();

  setControls({deal:false,hit:false,stand:false,dbl:false,split:false,next:false,newGame:true});
}

/* ═══════════════════════════════════════════════════════════════════
   RESET HAND
   ═══════════════════════════════════════════════════════════════════ */
function resetHand() {
  clearStatus(); clearSbResults();
  gamePhase='betting'; dealerRevealed=false;
  currentBet=0; betChips=[]; handBets=[0];
  playerHands=[[]]; currentHandIdx=0; firstMove=true;
  sideBets={pp:0,tt:0};

  el.dealerCards.innerHTML='';
  ['0','1'].forEach(i=>{
    $(`player-cards-${i}`).innerHTML='';
    const sc=$(`player-score-${i}`); sc.textContent='0'; sc.className='score-pill';
    $(`hand-bet-${i}`).textContent='';
  });
  el.dealerScore.textContent='?'; el.dealerScore.className='score-pill';
  $('hand-zone-1').classList.add('hidden');
  $('hand-zone-0').classList.remove('active-hand');
  el.potChipsVis.innerHTML='';
  el.insurancePrompt.classList.add('hidden');

  refreshSbUI(); lockSideBets(false);
  updateBetDisplay(); lockBettingUI(false);
  setControls({deal:false,hit:false,stand:false,dbl:false,split:false,next:false,newGame:false});
  updateBetUtilBtns(); updateChipStates();
  logEntry('── New hand ──');
  saveState();
}

/* ═══════════════════════════════════════════════════════════════════
   CONTROLS
   ═══════════════════════════════════════════════════════════════════ */
function setPlayerControls() {
  const hand=playerHands[currentHandIdx], score=calcScore(hand);
  const r0=hand[0]?.rank,r1=hand[1]?.rank;
  const matchRank=r0===r1||(['10','J','Q','K'].includes(r0)&&['10','J','Q','K'].includes(r1));
  const canSplit=firstMove&&hand.length===2&&playerHands.length<2&&matchRank&&balance>=handBets[currentHandIdx];
  const canDbl=firstMove&&balance>=handBets[currentHandIdx]&&score<21;
  setControls({deal:false,hit:score<21,stand:true,dbl:canDbl,split:canSplit,next:false,newGame:false});
}

function setControls({deal,hit,stand,dbl,split,next,newGame}) {
  el.btnDeal.disabled  = !deal;
  el.btnHit.disabled   = !hit;
  el.btnStand.disabled = !stand;
  el.btnDbl.disabled   = !dbl;
  el.btnSplit.disabled = !split;
  el.btnNext.disabled  = !next;
  el.btnNew.disabled   = !newGame;
  updateBetUtilBtns();
}

function lockBettingUI(lock) {
  if(lock){
    document.querySelectorAll('.chip').forEach(c=>c.classList.add('chip-off'));
    el.btnClear.disabled=el.btnRedo.disabled=el.btnMaxbet.disabled=true;
  } else {
    updateChipStates(); updateBetUtilBtns();
  }
}

/* ═══════════════════════════════════════════════════════════════════
   STATUS / LOG
   ═══════════════════════════════════════════════════════════════════ */
function showStatus(text,cls,sub='') {
  el.statusMsg.className=`status-msg ${cls} show`;
  el.statusMsg.textContent=text;
  el.statusSub.textContent=sub;
}
function clearStatus() {
  el.statusMsg.className='status-msg';
  el.statusMsg.textContent=''; el.statusSub.textContent='';
}
function logEntry(text,cls='') {
  const p=document.createElement('p');
  p.className='log-entry'+(cls?' '+cls:'');
  p.textContent='› '+text;
  el.logInner.appendChild(p);
  const all=el.logInner.querySelectorAll('.log-entry');
  if(all.length>30) all[0].remove();
  el.logInner.parentElement.scrollTop=el.logInner.parentElement.scrollHeight;
}

/* ═══════════════════════════════════════════════════════════════════
   STATS
   ═══════════════════════════════════════════════════════════════════ */
function recordResult(outcome) {
  if(outcome==='win'||outcome==='blackjack'){stats.wins++;stats.streak=stats.streak>0?stats.streak+1:1;}
  else if(outcome==='loss'){stats.losses++;stats.streak=stats.streak<0?stats.streak-1:-1;}
  else stats.streak=0;
}
function updateStatsDisplay() {
  el.statWins.textContent=stats.wins; el.statLosses.textContent=stats.losses;
  const s=stats.streak;
  el.statStreak.textContent=s>0?`+${s}🔥`:s<0?`${s}`:'—';
  el.statBest.textContent='$'+stats.bestWin;
  const p=stats.totalProfit;
  el.statProfit.textContent=(p>=0?'+$':'-$')+Math.abs(p);
  el.statProfit.style.color=p>=0?'var(--neon-green)':'#f07070';
}

/* ═══════════════════════════════════════════════════════════════════
   BALANCE — PERSISTENT (exact value, no defaults on load)
   ═══════════════════════════════════════════════════════════════════ */
function checkBalance() {
  if(balance<=0){
    balance=0; updateBetDisplay();
    setTimeout(()=>showStatus('Out of chips!','lose','Click "Reset $" to reload your balance'),600);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   LEADERBOARD
   ═══════════════════════════════════════════════════════════════════ */
function updateLeaderboard() {
  if(!playerName) return;
  let lb=loadLB();
  const entry={
    name:playerName, balance, profit:stats.totalProfit,
    wins:stats.wins, losses:stats.losses, bestWin:stats.bestWin,
    streak:stats.streak, ts:Date.now(),
  };
  const idx=lb.findIndex(e=>e.name.toLowerCase()===playerName.toLowerCase());
  if(idx>=0) lb[idx]=entry; else lb.push(entry);
  lb=lb.sort((a,b)=>b.balance-a.balance).slice(0,100);
  saveLB(lb);
}

function loadLB() {
  try{return JSON.parse(localStorage.getItem(SK.leaderboard))||[];}catch(e){return [];}
}
function saveLB(lb) {
  try{localStorage.setItem(SK.leaderboard,JSON.stringify(lb));}catch(e){}
}

function renderLeaderboard() {
  const lb=loadLB(); el.lbTbody.innerHTML='';
  if(!lb.length){
    el.lbTbody.innerHTML='<tr><td colspan="8" class="lb-empty">No entries yet — play a few hands!</td></tr>';
    return;
  }
  const sorted=[...lb].sort((a,b)=>
    lbSortKey==='profit'?b.profit-a.profit:lbSortKey==='wins'?b.wins-a.wins:b.balance-a.balance
  );
  sorted.forEach((e,i)=>{
    const tr=document.createElement('tr');
    if(i===0)tr.classList.add('lb-rank-1');
    else if(i===1)tr.classList.add('lb-rank-2');
    else if(i===2)tr.classList.add('lb-rank-3');
    if(e.name.toLowerCase()===playerName.toLowerCase()) tr.classList.add('lb-me');
    const pc=e.profit>=0?'lb-profit-pos':'lb-profit-neg';
    const ps=(e.profit>=0?'+$':'-$')+Math.abs(e.profit||0);
    tr.innerHTML=`<td>${i+1}</td><td>${esc(e.name)}</td>
      <td>$${(e.balance||0).toLocaleString()}</td>
      <td class="${pc}">${ps}</td>
      <td>${e.wins||0}</td><td>${e.losses||0}</td>
      <td>$${e.bestWin||0}</td><td>${e.streak||0}</td>`;
    el.lbTbody.appendChild(tr);
  });
}

function esc(s){
  return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ═══════════════════════════════════════════════════════════════════
   PERSISTENCE — balance is always saved exactly; only reset on
   explicit confirmResetBalance() call or first-ever load
   ═══════════════════════════════════════════════════════════════════ */
function saveState() {
  try {
    localStorage.setItem(SK.balance,   balance);           // exact value, even if 0
    localStorage.setItem(SK.stats,     JSON.stringify(stats));
    localStorage.setItem(SK.prevBet,   previousBet);
    localStorage.setItem(SK.prevChips, JSON.stringify(previousBetChips));
  } catch(e){}
}

function loadState() {
  try {
    const b=localStorage.getItem(SK.balance);
    // If a saved value exists, use it exactly — even 0.
    // Only fall back to STARTING_BAL if no key exists yet (first play).
    if(b!==null) balance=Math.max(0,Number(b)||0);

    const s=localStorage.getItem(SK.stats);
    if(s) Object.assign(stats,JSON.parse(s));

    const pb=localStorage.getItem(SK.prevBet);
    if(pb!==null) previousBet=parseInt(pb)||0;

    const pbc=localStorage.getItem(SK.prevChips);
    if(pbc) previousBetChips=JSON.parse(pbc)||[];

    const pn=localStorage.getItem(SK.playerName);
    if(pn) playerName=pn;
  } catch(e){}
}

/* ═══════════════════════════════════════════════════════════════════
   VISUAL EFFECTS
   ═══════════════════════════════════════════════════════════════════ */
function flashEl(id,cls) {
  const e=$(id); e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls);
  e.addEventListener('animationend',()=>e.classList.remove(cls),{once:true});
}

function launchConfetti() {
  const colors=['#d4a843','#f0c96a','#00ff88','#ff3355','#3498db','#fff8dc','#9b59b6'];
  const cx=innerWidth/2,cy=innerHeight/3;
  for(let i=0;i<80;i++){
    const d=document.createElement('div'); d.className='confetti-piece';
    d.style.background=colors[Math.floor(Math.random()*colors.length)];
    d.style.left=cx+'px';d.style.top=cy+'px';
    d.style.borderRadius=Math.random()>.5?'50%':'2px';
    d.style.width=d.style.height=(4+Math.random()*8)+'px';
    const angle=Math.random()*Math.PI*2,speed=80+Math.random()*200;
    d.style.setProperty('--sx','0px');d.style.setProperty('--sy','0px');
    d.style.setProperty('--ex',Math.cos(angle)*speed+'px');
    d.style.setProperty('--ey',(Math.sin(angle)*speed+200*Math.random())+'px');
    d.style.setProperty('--rot',(Math.random()*720-360)+'deg');
    d.style.setProperty('--dur',(.8+Math.random()*1.4)+'s');
    d.style.setProperty('--delay',(Math.random()*.3)+'s');
    document.body.appendChild(d);
    d.addEventListener('animationend',()=>d.remove());
  }
}

function showShuffleAnim() {
  const o=document.createElement('div'); o.className='shuffle-overlay';
  o.innerHTML='<div class="shuffle-text">♠ SHUFFLING 4 DECKS ♠</div>';
  document.body.appendChild(o);
  o.addEventListener('animationend',()=>o.remove());
}

function attachButtonRipples() {
  document.querySelectorAll('.btn').forEach(btn=>{
    btn.addEventListener('mousedown',()=>{
      btn.classList.remove('ripple');void btn.offsetWidth;btn.classList.add('ripple');
    });
    btn.addEventListener('animationend',()=>btn.classList.remove('ripple'));
  });
}

/* ═══════════════════════════════════════════════════════════════════
   KEYBOARD
   ═══════════════════════════════════════════════════════════════════ */
function attachKeyboard() {
  const rb=btn=>{btn.classList.remove('ripple');void btn.offsetWidth;btn.classList.add('ripple');};
  document.addEventListener('keydown',e=>{
    if(e.target.tagName==='INPUT') return;
    switch(e.key.toUpperCase()){
      case 'H':if(!el.btnHit.disabled){el.btnHit.click();rb(el.btnHit);}break;
      case 'S':if(!el.btnStand.disabled){el.btnStand.click();rb(el.btnStand);}break;
      case 'D':if(!el.btnDbl.disabled){el.btnDbl.click();rb(el.btnDbl);}break;
      case 'P':if(!el.btnSplit.disabled){el.btnSplit.click();rb(el.btnSplit);}break;
      case 'ENTER':
        if(!el.btnDeal.disabled){el.btnDeal.click();rb(el.btnDeal);}
        else if(!el.btnNew.disabled){el.btnNew.click();rb(el.btnNew);}
        break;
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
   UI WIRING
   ═══════════════════════════════════════════════════════════════════ */
function attachUI() {
  // Mute
  el.btnMute.addEventListener('click',()=>{
    SFX.muted=!SFX.muted;
    el.btnMute.textContent=SFX.muted?'🔇':'🔊';
  });

  // Rules
  el.btnRules.addEventListener('click',()=>el.rulesModal.classList.remove('hidden'));
  el.modalClose.addEventListener('click',()=>el.rulesModal.classList.add('hidden'));
  el.rulesModal.addEventListener('click',e=>{if(e.target===el.rulesModal)el.rulesModal.classList.add('hidden');});

  // Leaderboard open / close
  el.btnLb.addEventListener('click',()=>{renderLeaderboard();el.lbModal.classList.remove('hidden');});
  el.lbModalClose.addEventListener('click',()=>el.lbModal.classList.add('hidden'));
  el.lbModal.addEventListener('click',e=>{if(e.target===el.lbModal)el.lbModal.classList.add('hidden');});

  // Leaderboard sort tabs
  document.querySelectorAll('.lb-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('.lb-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active'); lbSortKey=tab.dataset.sort; renderLeaderboard();
    });
  });

  // Clear leaderboard
  el.btnLbClear.addEventListener('click',()=>{
    if(!confirm('Clear the entire leaderboard?')) return;
    saveLB([]); renderLeaderboard();
  });

  // Player name modal
  const confirmName=()=>{
    const raw=el.nameInput.value.trim();
    playerName=raw?raw.slice(0,20):'Anonymous';
    localStorage.setItem(SK.playerName,playerName);
    el.nameModal.classList.add('hidden');
    updateLeaderboard();
    logEntry(`Welcome, ${playerName}!`);
  };
  el.btnNameConfirm.addEventListener('click',confirmName);
  el.btnNameSkip.addEventListener('click',()=>{
    playerName=playerName||'Anonymous';
    el.nameModal.classList.add('hidden');
  });
  el.nameInput.addEventListener('keydown',e=>{if(e.key==='Enter')confirmName();});

  // Reset balance (called by HTML onclick on btn-reset-bal)
  // function is already global: confirmResetBalance()
}

/* ── nextHand stub (required by HTML) ───────────────────────── */
function nextHand(){}

/* ═══════════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════════ */
function init() {
  loadState();          // restore exact balance, stats, prev bet, name

  shoe=buildShoe();     // 4-deck shoe (208 cards)
  updateDeckLabel();
  updateBetDisplay();
  updateStatsDisplay();
  refreshSbUI();
  updateBetUtilBtns();
  updateChipStates();

  attachButtonRipples();
  attachKeyboard();
  attachUI();
  initParticles();

  // Show name prompt only for first-time players
  if(!playerName){
    el.nameModal.classList.remove('hidden');
  } else {
    el.nameModal.classList.add('hidden');
    logEntry(`Welcome back, ${playerName}! Balance: $${balance.toLocaleString()}`);
  }

  setInterval(saveState, 30000); // autosave every 30 s

  logEntry(`Royal Blackjack ready — ${NUM_DECKS}-deck shoe · ${NUM_DECKS*52} cards · Min bet $${MIN_BET}.`);
}

/* Boot */
document.addEventListener('DOMContentLoaded', runLoadingScreen);
