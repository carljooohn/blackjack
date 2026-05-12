/* ═══════════════════════════════════════════════════════════════
   ROYAL BLACKJACK — Complete Game Engine
   Features: Split, Double Down, Insurance, Soft Aces,
             Animations, localStorage persistence, Sound stubs
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ── Constants ────────────────────────────────────────────────── */
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = new Set(['♥','♦']);
const STARTING_BALANCE = 1000;
const MIN_BET = 5;
const MAX_BET = 1000;
const RESHUFFLE_AT = 20;

/* ── Sound stubs (pluggable) ──────────────────────────────────── */
const SFX = {
  muted: false,
  ctx: null,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  },
  _tone(freq, type, dur, gain=0.18) {
    if (this.muted || !this.ctx) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(); o.stop(this.ctx.currentTime + dur);
    } catch(e) {}
  },
  card()    { this._tone(440, 'triangle', 0.06, 0.12); },
  chip()    { this._tone(880, 'sine', 0.08, 0.1); },
  win()     { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>this._tone(f,'sine',.18,.15),i*80)); },
  lose()    { this._tone(220,'sawtooth',.4,.1); },
  bust()    { this._tone(180,'square',.35,.08); },
  bj()      { [784,988,1175,1568].forEach((f,i)=>setTimeout(()=>this._tone(f,'sine',.3,.15),i*60)); },
  flip()    { this._tone(660,'triangle',.1,.1); },
  shuffle() { for(let i=0;i<6;i++) setTimeout(()=>this._tone(300+Math.random()*200,'sawtooth',.05,.06),i*80); }
};

/* ── State ────────────────────────────────────────────────────── */
let deck = [];
let dealerHand = [];
let playerHands = [[]];          // Array of hands (for split)
let currentHandIdx = 0;          // Which hand player is acting on
let handBets = [0];              // Bet per hand
let dealerRevealed = false;
let gamePhase = 'betting';       // 'betting' | 'player' | 'dealer' | 'over'
let insuranceBet = 0;
let hasInsurance = false;
let splitAces = false;           // True when split was on aces (no extra hit)
let firstMove = true;            // For double-down restriction
let balance = STARTING_BALANCE;
let currentBet = 0;
let betChips = [];               // Track chip denominations for visual

let stats = {
  wins: 0, losses: 0, streak: 0,
  bestWin: 0, totalProfit: 0
};

/* ── DOM Refs ─────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const els = {
  app: $('app'),
  loading: $('loading-screen'),
  loadingBar: $('loading-bar'),
  dealerCards: $('dealer-cards'),
  dealerScore: $('dealer-score'),
  playerSection: $('player-section'),
  statusMsg: $('status-msg'),
  statusSub: $('status-sub'),
  potAmount: $('pot-amount'),
  potChipsVis: $('pot-chips-visual'),
  balAmount: $('bal-amount'),
  logInner: $('log-inner'),
  insurancePrompt: $('insurance-prompt'),
  insAmount: $('ins-amount'),
  deckLabel: $('deck-label'),
  statWins: $('stat-wins'),
  statLosses: $('stat-losses'),
  statStreak: $('stat-streak'),
  statBest: $('stat-best'),
  statProfit: $('stat-profit'),
  btnDeal: $('btn-deal'),
  btnHit: $('btn-hit'),
  btnStand: $('btn-stand'),
  btnDbl: $('btn-dbl'),
  btnSplit: $('btn-split'),
  btnClear: $('btn-clear'),
  btnNext: $('btn-next'),
  btnNew: $('btn-new'),
  btnMute: $('btn-mute'),
  btnRules: $('btn-rules'),
  rulesModal: $('rules-modal'),
  modalClose: $('modal-close'),
  particlesCanvas: $('particles')
};

/* ═══════════════════════════════════════════════════════════════
   LOADING SCREEN
   ═══════════════════════════════════════════════════════════════ */
function runLoadingScreen() {
  let progress = 0;
  const steps = [
    { to: 30, label: 'Shuffling the deck…',    delay: 0 },
    { to: 60, label: 'Polishing the chips…',   delay: 400 },
    { to: 85, label: 'Dimming the lights…',    delay: 800 },
    { to: 100, label: 'Welcome to the table!', delay: 1200 }
  ];
  steps.forEach(({ to, label, delay }) => {
    setTimeout(() => {
      els.loadingBar.style.width = to + '%';
      document.querySelector('.loading-sub').textContent = label;
    }, delay);
  });
  setTimeout(() => {
    els.loading.classList.add('fade-out');
    setTimeout(() => {
      els.loading.style.display = 'none';
      els.app.classList.remove('hidden');
      init();
    }, 500);
  }, 1800);
}

/* ═══════════════════════════════════════════════════════════════
   PARTICLE SYSTEM (subtle background sparkles)
   ═══════════════════════════════════════════════════════════════ */
function initParticles() {
  const canvas = els.particlesCanvas;
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];

  function resize() {
    w = canvas.width  = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function createParticle() {
    return {
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 1.5 + .5,
      dx: (Math.random() - .5) * .4,
      dy: (Math.random() - .5) * .3,
      alpha: Math.random() * .4 + .1,
      pulse: Math.random() * Math.PI * 2
    };
  }

  resize();
  for (let i = 0; i < 80; i++) particles.push(createParticle());

  function tick() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.dx; p.y += p.dy;
      p.pulse += .02;
      const a = p.alpha * (.7 + .3 * Math.sin(p.pulse));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(212,168,67,${a})`;
      ctx.fill();
      if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
        p.x = Math.random() * w;
        p.y = Math.random() * h;
      }
    });
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);
  tick();
}

/* ═══════════════════════════════════════════════════════════════
   DECK HELPERS
   ═══════════════════════════════════════════════════════════════ */
function buildDeck() {
  const d = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      d.push({ suit, rank, hidden: false });
  // Fisher-Yates
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function drawCard() {
  if (deck.length < RESHUFFLE_AT) reshuffleDeck();
  return deck.pop();
}

function reshuffleDeck() {
  deck = buildDeck();
  showShuffleAnimation();
  SFX.shuffle();
  logEntry('♠ Deck reshuffled.');
  updateDeckLabel();
}

function updateDeckLabel() {
  els.deckLabel.textContent = deck.length + ' cards';
}

/* ═══════════════════════════════════════════════════════════════
   SCORE CALCULATION
   ═══════════════════════════════════════════════════════════════ */
function calcScore(hand, ignoreHidden = false) {
  let total = 0, aces = 0;
  for (const card of hand) {
    if (!ignoreHidden && card.hidden) continue;
    if (card.rank === 'A') { total += 11; aces++; }
    else if (['J','Q','K'].includes(card.rank)) total += 10;
    else total += parseInt(card.rank);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function calcFullScore(hand) {
  return calcScore(hand, true);
}

function isBlackjack(hand) {
  return hand.length === 2 && calcFullScore(hand) === 21;
}

function isBust(hand) {
  return calcFullScore(hand) > 21;
}

function isSoft(hand) {
  // True if hand contains an Ace counted as 11
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c.rank === 'A') { total += 11; aces++; }
    else if (['J','Q','K'].includes(c.rank)) total += 10;
    else total += parseInt(c.rank);
  }
  return aces > 0 && total <= 21;
}

/* ═══════════════════════════════════════════════════════════════
   CARD RENDERING
   ═══════════════════════════════════════════════════════════════ */
function createCardEl(card, dealIndex = 0, isHit = false) {
  const wrap = document.createElement('div');
  wrap.className = 'card-wrap' + (isHit ? ' hit-card' : '');
  wrap.style.setProperty('--deal-i', dealIndex);

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  // Face side
  const face = document.createElement('div');
  const colorClass = RED_SUITS.has(card.suit) ? 'red' : 'black';
  face.className = `card-face ${colorClass}`;
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

  // Back side
  const back = document.createElement('div');
  back.className = 'card-back';
  back.innerHTML = '🂠';

  inner.appendChild(face);
  inner.appendChild(back);
  wrap.appendChild(inner);

  if (card.hidden) wrap.classList.add('face-down');

  return wrap;
}

function renderDealerCards() {
  els.dealerCards.innerHTML = '';
  dealerHand.forEach((card, i) => {
    els.dealerCards.appendChild(createCardEl(card, i));
  });
  updateDealerScore();
}

function renderPlayerCards(handIdx) {
  const container = $(`player-cards-${handIdx}`);
  if (!container) return;
  container.innerHTML = '';
  playerHands[handIdx].forEach((card, i) => {
    container.appendChild(createCardEl(card, i));
  });
  updatePlayerScore(handIdx);
}

function addDealerCard(card) {
  const i = dealerHand.length - 1;
  els.dealerCards.appendChild(createCardEl(card, 0, true));
  SFX.card();
  updateDealerScore();
}

function addPlayerCard(card, handIdx) {
  const container = $(`player-cards-${handIdx}`);
  if (!container) return;
  container.appendChild(createCardEl(card, 0, true));
  SFX.card();
  updatePlayerScore(handIdx);
}

function updateDealerScore() {
  if (dealerRevealed) {
    const s = calcFullScore(dealerHand);
    els.dealerScore.textContent = s;
    els.dealerScore.className = 'score-pill' + (s > 21 ? ' bust' : s === 21 && dealerHand.length === 2 ? ' blackjack' : s === 21 ? ' twenty-one' : '');
  } else {
    // Show visible cards score
    const visible = dealerHand.filter(c => !c.hidden);
    if (visible.length) {
      els.dealerScore.textContent = calcScore(visible);
    } else {
      els.dealerScore.textContent = '?';
    }
    els.dealerScore.className = 'score-pill';
  }
}

function updatePlayerScore(handIdx) {
  const pill = $(`player-score-${handIdx}`);
  if (!pill) return;
  const hand = playerHands[handIdx];
  const s = calcScore(hand);
  pill.textContent = s + (isSoft(hand) && s < 21 ? '' : '');
  pill.className = 'score-pill' + (s > 21 ? ' bust' : s === 21 && hand.length === 2 ? ' blackjack' : s === 21 ? ' twenty-one' : '');
}

/* ── Dealer card flip reveal animation ───────────────────────── */
function revealDealerCard() {
  dealerRevealed = true;
  dealerHand = dealerHand.map(c => ({ ...c, hidden: false }));

  const wraps = els.dealerCards.querySelectorAll('.card-wrap.face-down');
  wraps.forEach(wrap => {
    wrap.classList.add('flip-reveal');
    wrap.classList.remove('face-down');
    setTimeout(() => wrap.classList.remove('flip-reveal'), 600);
  });

  SFX.flip();
  updateDealerScore();
}

/* ═══════════════════════════════════════════════════════════════
   BETTING
   ═══════════════════════════════════════════════════════════════ */
function placeBet(amount) {
  if (gamePhase !== 'betting') return;
  if (currentBet + amount > balance) {
    flashEl('bal-amount', 'flash-loss');
    return;
  }
  if (currentBet + amount > MAX_BET) {
    showStatus('Max bet is $' + MAX_BET, 'push', '');
    return;
  }

  SFX.init();
  SFX.chip();

  currentBet += amount;
  betChips.push(amount);
  updateBetDisplay();
  addPotChip(amount);

  // Animate tray chip
  const chip = document.querySelector(`.chip[data-val="${amount}"]`);
  if (chip) {
    chip.classList.remove('placing');
    void chip.offsetWidth;
    chip.classList.add('placing');
    chip.addEventListener('animationend', () => chip.classList.remove('placing'), { once: true });
  }

  els.btnDeal.disabled = false;
  els.btnClear.disabled = false;
  updateChipStates();
}

function clearBet() {
  if (gamePhase !== 'betting') return;
  currentBet = 0;
  betChips = [];
  els.potChipsVis.innerHTML = '';
  updateBetDisplay();
  els.btnDeal.disabled = true;
  els.btnClear.disabled = true;
  updateChipStates();
}

function addPotChip(amount) {
  const colorMap = { 5:'pvc-5', 10:'pvc-10', 25:'pvc-25', 50:'pvc-50', 100:'pvc-100', 500:'pvc-500' };
  const cl = colorMap[amount] || 'pvc-25';
  const el = document.createElement('div');
  el.className = `pot-chip-vis ${cl}`;
  els.potChipsVis.appendChild(el);
}

function updateBetDisplay() {
  els.potAmount.textContent = '$' + currentBet;
  els.potAmount.classList.toggle('has-bet', currentBet > 0);
  els.balAmount.textContent = '$' + balance.toLocaleString();
}

function updateChipStates() {
  document.querySelectorAll('.chip[data-val]').forEach(chip => {
    const v = parseInt(chip.dataset.val);
    chip.classList.toggle('chip-off', gamePhase !== 'betting' || v > balance - currentBet || currentBet + v > MAX_BET);
  });
}

/* ── Payout ───────────────────────────────────────────────────── */
function settleBet(handIdx, outcome) {
  // outcome: 'blackjack' | 'win' | 'push' | 'loss' | 'surrender'
  const bet = handBets[handIdx];
  let payout = 0;

  if (outcome === 'blackjack')  payout = Math.floor(bet * 2.5); // 3:2
  else if (outcome === 'win')   payout = bet * 2;
  else if (outcome === 'push')  payout = bet;
  // loss / surrender: payout stays 0

  balance += payout;
  const net = payout - bet;

  if (outcome !== 'loss' && outcome !== 'surrender') {
    flashEl('bal-amount', 'flash-win');
    stats.totalProfit += net;
    if (net > stats.bestWin) stats.bestWin = net;
  } else if (outcome === 'loss') {
    flashEl('bal-amount', 'flash-loss');
    stats.totalProfit += net;
  }

  updateBetDisplay();
  return payout;
}

/* ── Insurance payout ─────────────────────────────────────────── */
function settleInsurance(dealerHasBlackjack) {
  if (!hasInsurance) return;
  if (dealerHasBlackjack) {
    balance += insuranceBet * 3; // 2:1 on insurance
    logEntry(`Insurance pays $${insuranceBet * 2}.`);
    flashEl('bal-amount', 'flash-win');
  } else {
    logEntry('Insurance lost.');
  }
  hasInsurance = false;
  insuranceBet = 0;
  updateBetDisplay();
}

/* ═══════════════════════════════════════════════════════════════
   GAME FLOW
   ═══════════════════════════════════════════════════════════════ */
function startGame() {
  if (currentBet < MIN_BET) return;
  SFX.init();

  clearStatus();
  gamePhase = 'player';
  dealerRevealed = false;
  splitAces = false;
  firstMove = true;
  hasInsurance = false;
  insuranceBet = 0;
  currentHandIdx = 0;

  // Deduct bet; set up hands
  balance -= currentBet;
  handBets = [currentBet];
  playerHands = [[]];

  updateBetDisplay();
  updateChipStates();
  lockBettingControls(true);

  // Render empty hands areas — ensure only hand-0 is visible
  $('hand-zone-0').classList.remove('hidden');
  $('hand-zone-1').classList.add('hidden');
  $(`player-cards-0`).innerHTML = '';
  $(`player-cards-1`).innerHTML = '';
  $(`player-score-0`).textContent = '0';
  $(`player-score-1`).textContent = '0';
  $('hand-bet-0').textContent = '';
  $('hand-bet-1').textContent = '';

  if (playerHands.length < 2) {
    $('hand-zone-0').classList.remove('active-hand');
    $('hand-zone-0').classList.add('active-hand');
  }

  // Rebuild deck if needed
  if (deck.length < RESHUFFLE_AT) reshuffleDeck();

  els.dealerCards.innerHTML = '';
  dealerHand = [];

  // Deal sequence: P1, D1, P2, D2(hidden) with delays
  const dealSeq = [
    () => { const c = drawCard(); playerHands[0].push(c); addPlayerCard(c, 0); },
    () => { const c = drawCard(); dealerHand.push(c); addDealerCard(c); },
    () => { const c = drawCard(); playerHands[0].push(c); addPlayerCard(c, 0); },
    () => { const c = drawCard(); c.hidden = true; dealerHand.push(c); addDealerCard(c); }
  ];

  dealSeq.forEach((fn, i) => setTimeout(fn, i * 350));

  setTimeout(() => {
    updateDeckLabel();
    logEntry(`Hand dealt — bet $${currentBet}.`);
    checkInsurance();
  }, dealSeq.length * 350 + 100);
}

/* ── Insurance check ─────────────────────────────────────────── */
function checkInsurance() {
  const dealerUpCard = dealerHand[0];
  if (!dealerUpCard || dealerRevealed) { afterInsuranceCheck(); return; }

  if (dealerUpCard.rank === 'A') {
    // Offer insurance
    const insAmt = Math.floor(currentBet / 2);
    if (insAmt > 0 && balance >= insAmt) {
      els.insAmount.textContent = insAmt;
      els.insurancePrompt.classList.remove('hidden');

      $('btn-ins-yes').onclick = () => {
        insuranceBet = insAmt;
        balance -= insAmt;
        hasInsurance = true;
        updateBetDisplay();
        logEntry(`Insurance taken: $${insAmt}.`);
        els.insurancePrompt.classList.add('hidden');
        afterInsuranceCheck();
      };
      $('btn-ins-no').onclick = () => {
        els.insurancePrompt.classList.add('hidden');
        afterInsuranceCheck();
      };
      return;
    }
  }
  afterInsuranceCheck();
}

function afterInsuranceCheck() {
  // Check player blackjack
  if (isBlackjack(playerHands[0])) {
    revealDealerCard();
    const dBJ = isBlackjack(dealerHand);
    settleInsurance(dBJ);
    if (dBJ) {
      endRound([{ handIdx: 0, outcome: 'push', label: 'Push — Both Blackjack!' }]);
    } else {
      SFX.bj();
      endRound([{ handIdx: 0, outcome: 'blackjack', label: '✦ BLACKJACK! ✦' }]);
    }
    return;
  }

  // Check dealer blackjack (when dealer upcard is 10-value)
  const dealerUp = dealerHand[0];
  if (dealerUp && ['10','J','Q','K','A'].includes(dealerUp.rank)) {
    // Peek silently; if dealer has BJ, resolve now
    const dFullScore = calcFullScore(dealerHand);
    if (dFullScore === 21) {
      settleInsurance(true);
      revealDealerCard();
      endRound([{ handIdx: 0, outcome: 'loss', label: 'Dealer Blackjack' }]);
      return;
    }
  }

  settleInsurance(false);
  setPlayerControls();
}

/* ── Player actions ───────────────────────────────────────────── */
function playerHit() {
  if (gamePhase !== 'player') return;
  const hand = playerHands[currentHandIdx];
  const card = drawCard();
  hand.push(card);
  addPlayerCard(card, currentHandIdx);
  firstMove = false;

  const score = calcScore(hand);
  logEntry(`Hit → ${card.rank}${card.suit} (${score})`);

  // Split aces only get 1 card each
  if (splitAces) {
    setTimeout(() => advanceSplitHand(), 400);
    return;
  }

  if (score > 21) {
    SFX.bust();
    logEntry('Bust!', 'log-lose');
    setTimeout(() => advanceSplitHand(), 600);
  } else if (score === 21) {
    // Auto-stand on 21
    setTimeout(() => playerStand(), 400);
  } else {
    setPlayerControls();
  }
}

function playerStand() {
  if (gamePhase !== 'player') return;
  logEntry(`Stand at ${calcScore(playerHands[currentHandIdx])}.`);
  advanceSplitHand();
}

function playerDouble() {
  if (gamePhase !== 'player' || !firstMove) return;
  const hand = playerHands[currentHandIdx];
  const extraBet = handBets[currentHandIdx];
  if (balance < extraBet) { flashEl('bal-amount', 'flash-loss'); return; }

  balance -= extraBet;
  handBets[currentHandIdx] *= 2;
  updateBetDisplay();
  $(`hand-bet-${currentHandIdx}`).textContent = `Bet: $${handBets[currentHandIdx]}`;
  updateChipStates();

  const card = drawCard();
  hand.push(card);
  addPlayerCard(card, currentHandIdx);
  SFX.chip();

  logEntry(`Double Down → ${card.rank}${card.suit} (${calcScore(hand)})`);

  const score = calcScore(hand);
  if (score > 21) {
    SFX.bust();
    logEntry('Bust!', 'log-lose');
  }
  // Always move on after double
  setTimeout(() => advanceSplitHand(), 700);
}

function playerSplit() {
  if (gamePhase !== 'player' || !firstMove) return;
  const hand = playerHands[currentHandIdx];
  if (hand.length !== 2) return;

  // Verify matching ranks
  const r0 = hand[0].rank, r1 = hand[1].rank;
  const sameRank = r0 === r1 ||
    (['10','J','Q','K'].includes(r0) && ['10','J','Q','K'].includes(r1));
  if (!sameRank) return;

  const splitBet = handBets[currentHandIdx];
  if (balance < splitBet) { flashEl('bal-amount', 'flash-loss'); return; }

  balance -= splitBet;
  updateBetDisplay();
  updateChipStates();
  SFX.chip();

  // Split aces rule: only 1 card per hand, no re-split
  if (r0 === 'A') splitAces = true;

  // Split: move second card to hand 1
  playerHands[1] = [hand.pop()];
  handBets[1] = splitBet;

  // Show second hand zone
  $('hand-zone-1').classList.remove('hidden');
  renderPlayerCards(0);
  renderPlayerCards(1);

  // Deal one card to each split hand
  setTimeout(() => {
    const c0 = drawCard();
    playerHands[0].push(c0);
    addPlayerCard(c0, 0);

    setTimeout(() => {
      const c1 = drawCard();
      playerHands[1].push(c1);
      addPlayerCard(c1, 1);
      updateDeckLabel();
      $('hand-bet-0').textContent = `Bet: $${handBets[0]}`;
      $('hand-bet-1').textContent = `Bet: $${handBets[1]}`;
      logEntry(`Split! Playing hand 1 of 2.`);
      currentHandIdx = 0;
      highlightActiveHand(0);
      firstMove = true;
      if (splitAces) {
        // Auto-advance split aces after 1 card each
        setTimeout(() => advanceSplitHand(), 500);
      } else {
        setPlayerControls();
      }
    }, 450);
  }, 400);
}

/* ── Advance through split hands, then dealer ─────────────────── */
function advanceSplitHand() {
  if (currentHandIdx < playerHands.length - 1) {
    currentHandIdx++;
    highlightActiveHand(currentHandIdx);
    firstMove = true;
    const score = calcScore(playerHands[currentHandIdx]);
    if (splitAces || score >= 21) {
      // Auto-advance split aces / already 21
      setTimeout(() => advanceSplitHand(), 400);
    } else {
      logEntry(`Playing split hand ${currentHandIdx + 1}.`);
      setPlayerControls();
    }
  } else {
    // All player hands done — dealer's turn
    runDealerTurn();
  }
}

function highlightActiveHand(idx) {
  [$('hand-zone-0'), $('hand-zone-1')].forEach((zone, i) => {
    if (!zone) return;
    zone.classList.toggle('active-hand', i === idx);
  });
}

/* ── Dealer turn ─────────────────────────────────────────────── */
function runDealerTurn() {
  gamePhase = 'dealer';
  setControls({ deal:false, hit:false, stand:false, dbl:false, split:false, next:false, clear:false, newGame:false });

  revealDealerCard();

  setTimeout(() => {
    dealerPlayStep();
  }, 700);
}

function dealerPlayStep() {
  const score = calcFullScore(dealerHand);

  // Dealer stands on hard 17+, and soft 17+ (hits soft 16)
  const soft = isSoft(dealerHand);
  const shouldHit = score < 17 || (soft && score === 17 && false); // standard: stand soft 17
  // To use "hit soft 17" variant: (score < 17 || (isSoft(dealerHand) && score === 17))

  if (!shouldHit) {
    resolveAllHands();
    return;
  }

  const card = drawCard();
  dealerHand.push(card);
  addDealerCard(card);
  logEntry(`Dealer hits → ${card.rank}${card.suit} (${calcFullScore(dealerHand)})`);
  updateDeckLabel();

  setTimeout(dealerPlayStep, 700);
}

/* ═══════════════════════════════════════════════════════════════
   RESOLVE ALL HANDS
   ═══════════════════════════════════════════════════════════════ */
function resolveAllHands() {
  gamePhase = 'over';
  const dScore = calcFullScore(dealerHand);
  const dBJ = isBlackjack(dealerHand);
  const dBust = dScore > 21;

  const results = [];

  playerHands.forEach((hand, idx) => {
    if (!hand.length) return;
    const pScore = calcScore(hand);
    const pBust = pScore > 21;
    const pBJ = isBlackjack(hand) && playerHands.length === 1; // no BJ on split hands

    let outcome, label;

    if (pBust) {
      outcome = 'loss'; label = playerHands.length > 1 ? `Hand ${idx+1}: Bust` : 'Bust — Dealer Wins';
    } else if (pBJ && dBJ) {
      outcome = 'push'; label = 'Push — Both Blackjack';
    } else if (pBJ) {
      outcome = 'blackjack'; label = '✦ BLACKJACK! ✦';
    } else if (dBust) {
      outcome = 'win'; label = playerHands.length > 1 ? `Hand ${idx+1}: Win (Dealer Bust)` : 'Dealer Busts — You Win!';
    } else if (pScore > dScore) {
      outcome = 'win'; label = playerHands.length > 1 ? `Hand ${idx+1}: Win` : 'You Win!';
    } else if (pScore < dScore) {
      outcome = 'loss'; label = playerHands.length > 1 ? `Hand ${idx+1}: Lose` : 'Dealer Wins';
    } else {
      outcome = 'push'; label = playerHands.length > 1 ? `Hand ${idx+1}: Push` : 'Push — Tie';
    }

    results.push({ handIdx: idx, outcome, label });
  });

  endRound(results);
}

/* ─── End round, show results, animate cards ─────────────────── */
function endRound(results) {
  gamePhase = 'over';

  // Show primary result (first or only hand)
  const primary = results[0];
  const cls = primary.outcome === 'blackjack' ? 'bj'
             : primary.outcome === 'win'       ? 'win'
             : primary.outcome === 'push'      ? 'push' : 'lose';

  let subParts = [];
  results.forEach(r => {
    const payout = settleBet(r.handIdx, r.outcome);
    subParts.push(`${r.label} · Payout $${payout}`);
  });

  // Multi-hand: show combined label
  const mainLabel = results.length > 1
    ? results.map(r => r.label).join('  /  ')
    : primary.label;

  showStatus(mainLabel, cls, subParts.join('  ·  '));

  // Sound
  if (cls === 'bj') SFX.bj();
  else if (cls === 'win') SFX.win();
  else if (cls === 'lose') SFX.lose();

  // Log result
  const dScore = calcFullScore(dealerHand);
  results.forEach(r => {
    const pScore = calcScore(playerHands[r.handIdx]);
    logEntry(`${r.label}  P:${pScore} vs D:${dScore} — Bet $${handBets[r.handIdx]}`, `log-${r.outcome === 'loss' ? 'lose' : r.outcome === 'push' ? 'push' : 'win'}`);
  });

  // Stats
  const mainOutcome = results.find(r => r.outcome === 'blackjack' || r.outcome === 'win')?.outcome
                   || (results.every(r => r.outcome === 'push') ? 'push' : 'loss');
  updateStatsRecord(mainOutcome);

  // Confetti on blackjack / big win
  if (cls === 'bj' || (cls === 'win' && currentBet >= 50)) launchConfetti();

  // Animate player cards
  results.forEach(r => {
    const wraps = $(`player-cards-${r.handIdx}`)?.querySelectorAll('.card-wrap');
    if (!wraps) return;
    const animCls = (r.outcome === 'win' || r.outcome === 'blackjack') ? 'win-pulse'
                  : r.outcome === 'loss' ? 'lose-shake' : '';
    if (!animCls) return;
    wraps.forEach((w, i) => {
      w.style.animationDelay = `${i * 70}ms`;
      w.classList.add(animCls);
      if (animCls === 'win-pulse') {
        w.addEventListener('animationend', () => {
          w.classList.add('win-glow');
          w.style.animationDelay = '';
        }, { once: true });
      } else {
        w.addEventListener('animationend', () => { w.style.animationDelay = ''; }, { once: true });
      }
    });
  });

  // Animate pot chips
  const potChips = els.potChipsVis.querySelectorAll('.pot-chip-vis');
  const isWin = results.some(r => r.outcome === 'win' || r.outcome === 'blackjack');
  potChips.forEach((chip, i) => {
    chip.style.transition = `transform .4s ${i * 50}ms, opacity .4s ${i * 50}ms`;
    chip.style.transform = isWin ? 'translateY(-20px) scale(1.4)' : 'translateY(10px) scale(.5)';
    chip.style.opacity = '0';
  });
  setTimeout(() => { els.potChipsVis.innerHTML = ''; }, 600);

  updateBetDisplay();
  updateStatsDisplay();
  checkBalance();

  setControls({ deal:false, hit:false, stand:false, dbl:false, split:false, next:false, clear:false, newGame: true });
}

/* ═══════════════════════════════════════════════════════════════
   RESET / NEW HAND
   ═══════════════════════════════════════════════════════════════ */
function resetHand() {
  clearStatus();
  gamePhase = 'betting';
  dealerRevealed = false;
  currentBet = 0;
  betChips = [];
  handBets = [0];
  playerHands = [[]];
  currentHandIdx = 0;
  firstMove = true;

  // Clear UI
  els.dealerCards.innerHTML = '';
  $('player-cards-0').innerHTML = '';
  $('player-cards-1').innerHTML = '';
  $('dealer-score').textContent = '?';
  $('dealer-score').className = 'score-pill';
  $('player-score-0').textContent = '0';
  $('player-score-0').className = 'score-pill';
  $('player-score-1').textContent = '0';
  $('player-score-1').className = 'score-pill';
  $('hand-bet-0').textContent = '';
  $('hand-bet-1').textContent = '';
  $('hand-zone-1').classList.add('hidden');
  $('hand-zone-0').classList.remove('active-hand');
  els.potChipsVis.innerHTML = '';
  els.insurancePrompt.classList.add('hidden');

  updateBetDisplay();
  lockBettingControls(false);
  setControls({ deal:false, hit:false, stand:false, dbl:false, split:false, next:false, clear:false, newGame:false });
  updateChipStates();
  logEntry('── New hand ──');
  saveState();
}

/* ═══════════════════════════════════════════════════════════════
   CONTROL HELPERS
   ═══════════════════════════════════════════════════════════════ */
function setPlayerControls() {
  const hand = playerHands[currentHandIdx];
  const score = calcScore(hand);
  const canSplit = firstMove && hand.length === 2 && playerHands.length < 2 &&
    (() => {
      const r0 = hand[0].rank, r1 = hand[1].rank;
      return r0 === r1 ||
        (['10','J','Q','K'].includes(r0) && ['10','J','Q','K'].includes(r1));
    })() && balance >= handBets[currentHandIdx];
  const canDouble = firstMove && balance >= handBets[currentHandIdx];

  setControls({
    deal: false, hit: score < 21, stand: true,
    dbl: canDouble && score < 21, split: canSplit,
    next: false, clear: false, newGame: false
  });
}

function setControls({ deal, hit, stand, dbl, split, next, clear, newGame }) {
  els.btnDeal.disabled  = !deal;
  els.btnHit.disabled   = !hit;
  els.btnStand.disabled = !stand;
  els.btnDbl.disabled   = !dbl;
  els.btnSplit.disabled = !split;
  els.btnNext.disabled  = !next;
  els.btnClear.disabled = !clear;
  els.btnNew.disabled   = !newGame;
}

function lockBettingControls(lock) {
  updateChipStates();
  if (lock) {
    document.querySelectorAll('.chip').forEach(c => c.classList.add('chip-off'));
    els.btnClear.disabled = true;
  }
}

/* ═══════════════════════════════════════════════════════════════
   STATUS / LOG
   ═══════════════════════════════════════════════════════════════ */
function showStatus(text, cls, sub = '') {
  els.statusMsg.className = `status-msg ${cls} show`;
  els.statusMsg.textContent = text;
  els.statusSub.textContent = sub;
}

function clearStatus() {
  els.statusMsg.className = 'status-msg';
  els.statusMsg.textContent = '';
  els.statusSub.textContent = '';
}

function logEntry(text, cls = '') {
  const p = document.createElement('p');
  p.className = 'log-entry' + (cls ? ' ' + cls : '');
  p.textContent = '› ' + text;
  els.logInner.appendChild(p);
  // Keep last 30 entries
  const entries = els.logInner.querySelectorAll('.log-entry');
  if (entries.length > 30) entries[0].remove();
  els.logInner.parentElement.scrollTop = els.logInner.parentElement.scrollHeight;
}

/* ═══════════════════════════════════════════════════════════════
   STATS
   ═══════════════════════════════════════════════════════════════ */
function updateStatsRecord(outcome) {
  if (outcome === 'win' || outcome === 'blackjack') {
    stats.wins++;
    stats.streak = stats.streak > 0 ? stats.streak + 1 : 1;
  } else if (outcome === 'loss') {
    stats.losses++;
    stats.streak = stats.streak < 0 ? stats.streak - 1 : -1;
  } else {
    stats.streak = 0;
  }
}

function updateStatsDisplay() {
  els.statWins.textContent    = stats.wins;
  els.statLosses.textContent  = stats.losses;
  const s = stats.streak;
  els.statStreak.textContent  = s > 0 ? `+${s}🔥` : s < 0 ? `${s}` : '—';
  els.statBest.textContent    = '$' + stats.bestWin;
  const profit = stats.totalProfit;
  els.statProfit.textContent  = (profit >= 0 ? '+$' : '-$') + Math.abs(profit);
  els.statProfit.style.color  = profit >= 0 ? 'var(--neon-green)' : '#f07070';
}

/* ═══════════════════════════════════════════════════════════════
   BALANCE
   ═══════════════════════════════════════════════════════════════ */
function checkBalance() {
  if (balance <= 0) {
    setTimeout(() => {
      showStatus('Broke! Reloading wallet…', 'lose', '');
      setTimeout(() => {
        balance = STARTING_BALANCE;
        stats.totalProfit = 0;
        updateBetDisplay();
        updateStatsDisplay();
        logEntry('Balance reset to $1000.');
      }, 2000);
    }, 600);
  }
}

/* ═══════════════════════════════════════════════════════════════
   VISUAL EFFECTS
   ═══════════════════════════════════════════════════════════════ */
function flashEl(id, cls) {
  const el = $(id);
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

/* ── Confetti ─────────────────────────────────────────────────── */
function launchConfetti() {
  const colors = ['#d4a843','#f0c96a','#00ff88','#ff3355','#3498db','#fff8dc','#9b59b6'];
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 3;

  for (let i = 0; i < 80; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.left = cx + 'px';
    el.style.top = cy + 'px';
    el.style.borderRadius = Math.random() > .5 ? '50%' : '2px';
    el.style.width = el.style.height = (4 + Math.random() * 8) + 'px';

    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 200;
    const ex = Math.cos(angle) * speed;
    const ey = Math.sin(angle) * speed + 200 * Math.random(); // gravity bias

    el.style.setProperty('--sx', '0px');
    el.style.setProperty('--sy', '0px');
    el.style.setProperty('--ex', ex + 'px');
    el.style.setProperty('--ey', ey + 'px');
    el.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    el.style.setProperty('--dur', (.8 + Math.random() * 1.4) + 's');
    el.style.setProperty('--delay', (Math.random() * .3) + 's');

    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

/* ── Shuffle overlay ─────────────────────────────────────────── */
function showShuffleAnimation() {
  const overlay = document.createElement('div');
  overlay.className = 'shuffle-overlay';
  overlay.innerHTML = '<div class="shuffle-text">♠ SHUFFLING ♠</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('animationend', () => overlay.remove());
}

/* ── Button ripple ───────────────────────────────────────────── */
function attachButtonRipples() {
  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('mousedown', () => {
      btn.classList.remove('ripple');
      void btn.offsetWidth;
      btn.classList.add('ripple');
    });
    btn.addEventListener('animationend', () => btn.classList.remove('ripple'));
  });
}

/* ═══════════════════════════════════════════════════════════════
   LOCALSTORAGE PERSISTENCE
   ═══════════════════════════════════════════════════════════════ */
function saveState() {
  try {
    localStorage.setItem('rjbj_balance', balance);
    localStorage.setItem('rjbj_stats', JSON.stringify(stats));
  } catch(e) {}
}

function loadState() {
  try {
    const b = localStorage.getItem('rjbj_balance');
    if (b !== null) balance = Math.max(MIN_BET, parseInt(b) || STARTING_BALANCE);
    const s = localStorage.getItem('rjbj_stats');
    if (s) Object.assign(stats, JSON.parse(s));
  } catch(e) {}
}

/* ═══════════════════════════════════════════════════════════════
   KEYBOARD SUPPORT
   ═══════════════════════════════════════════════════════════════ */
function attachKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    switch(e.key.toUpperCase()) {
      case 'H': if (!els.btnHit.disabled)   { els.btnHit.click();   rippleBtn(els.btnHit); }   break;
      case 'S': if (!els.btnStand.disabled) { els.btnStand.click(); rippleBtn(els.btnStand); } break;
      case 'D': if (!els.btnDbl.disabled)   { els.btnDbl.click();   rippleBtn(els.btnDbl); }   break;
      case 'P': if (!els.btnSplit.disabled) { els.btnSplit.click(); rippleBtn(els.btnSplit); } break;
      case 'ENTER':
        if (!els.btnDeal.disabled) { els.btnDeal.click(); rippleBtn(els.btnDeal); }
        else if (!els.btnNew.disabled) { els.btnNew.click(); rippleBtn(els.btnNew); }
        break;
    }
  });
}

function rippleBtn(btn) {
  btn.classList.remove('ripple');
  void btn.offsetWidth;
  btn.classList.add('ripple');
}

/* ═══════════════════════════════════════════════════════════════
   MUTE / RULES MODAL
   ═══════════════════════════════════════════════════════════════ */
function attachUI() {
  els.btnMute.addEventListener('click', () => {
    SFX.muted = !SFX.muted;
    els.btnMute.textContent = SFX.muted ? '🔇' : '🔊';
  });

  els.btnRules.addEventListener('click', () => {
    els.rulesModal.classList.remove('hidden');
  });

  els.modalClose.addEventListener('click', () => {
    els.rulesModal.classList.add('hidden');
  });

  els.rulesModal.addEventListener('click', e => {
    if (e.target === els.rulesModal) els.rulesModal.classList.add('hidden');
  });
}

/* ── Next Hand (for split flow, not currently used externally) ── */
function nextHand() {}

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
function init() {
  loadState();
  deck = buildDeck();
  updateBetDisplay();
  updateStatsDisplay();
  updateDeckLabel();
  attachButtonRipples();
  attachKeyboard();
  attachUI();
  initParticles();

  // Autosave every 30s
  setInterval(saveState, 30000);

  logEntry('Royal Blackjack ready. Min bet $5 · Max bet $1000.');
}

/* ── Boot ──────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', runLoadingScreen);
