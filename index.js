const { ipcRenderer } = require('electron');
let timerId = null;
let timeLeft = 25 * 60;
let timerMode = 'work';
let lastStateChangedTime = null;

const timerDisplay = document.getElementById('timer');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const memoInput = document.getElementById('memoInput');
const historyList = document.getElementById('historyList');
const TEN_HOURS_MS = 10 * 60 * 60 * 1000;

const db = {
  get: (key) => JSON.parse(localStorage.getItem(key)) || null,
  set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  remove: (key) => localStorage.removeItem(key)
};

function updateDisplay() {
  if (timerMode === 'break') {
    timerDisplay.classList.add('break-mode');
  } else {
    timerDisplay.classList.remove('break-mode');
  }
  
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  autoResizeWindow();
}

function startTimer() {
  if (timerId) clearInterval(timerId);
  lastStateChangedTime = Date.now();
  
  timerId = setInterval(() => {
    if (timeLeft > 0) {
      timeLeft--;
      updateDisplay();
    } else {
      clearInterval(timerId);
      精算();
      
      if (timerMode === 'work') {
        timerMode = 'break';
        timeLeft = 5 * 60;
        showNotification('集中時間終了！', 'お疲れ様でした。5分間の休憩に入ります。');
      } else {
        timerMode = 'work';
        timeLeft = 25 * 60;
        showNotification('休憩終了！', '次の集中時間が自動で始まりました。');
      }
      updateDisplay();
      startTimer();
    }
  }, 1000);
}

// 💡 どんな状態からでも絶対に時間を救済する堅牢な精算ロジック
function 精算() {
  if (!lastStateChangedTime) return;
  const currentMemo = db.get('currentMemo');
  let memos = db.get('memos') || [];
  
  if (currentMemo) {
    const elapsedSec = Math.floor((Date.now() - lastStateChangedTime) / 1000);
    if (elapsedSec > 0) {
      // 履歴が存在し、かつ末尾のタスク名が一致していれば時間を加算
      if (memos.length > 0 && memos[memos.length - 1].text === currentMemo) {
        memos[memos.length - 1].duration = (memos[memos.length - 1].duration || 0) + elapsedSec;
      } else {
        // ★【バグ修正：自動救済】履歴が空、または末尾のタスク名がズレていた場合は、その場で新規履歴を作って時間を精算する
        memos.push({ 
          text: currentMemo, 
          timestamp: Date.now() - (elapsedSec * 1000), 
          duration: elapsedSec 
        });
      }
      db.set('memos', memos);
    }
  }
  lastStateChangedTime = Date.now();
  loadAndRenderHistory();
}

function handleStartOrResume() {
  const memoText = memoInput.value.trim();
  const currentMemo = db.get('currentMemo');

  // 新しいタスク名が入力された場合（Resetと同じように新しく始める）
  if (memoText !== '' && memoText !== currentMemo) {
    精算(); // 直前まで動いていたタスクがあれば確実に精算
    
    let memos = db.get('memos') || [];
    memos.push({ text: memoText, timestamp: Date.now(), duration: 0 });
    db.set('memos', memos);
    db.set('currentMemo', memoText);
    
    timerMode = 'work';
    timeLeft = 25 * 60;
    updateDisplay();
    startTimer();
  } else {
    // タスク名が同じ、または空の場合（一時停止からの再開など）
    if (timerId) return; 
    
    // ★【自動救済】同じタスク名で再開するのに、何らかの理由で履歴の末尾にレコードがない場合は空枠を確保する
    if (memoText !== '') {
      let memos = db.get('memos') || [];
      if (memos.length === 0 || memos[memos.length - 1].text !== memoText) {
        memos.push({ text: memoText, timestamp: Date.now(), duration: 0 });
        db.set('memos', memos);
        db.set('currentMemo', memoText);
      }
    }
    startTimer();
  }
}

startBtn.addEventListener('click', handleStartOrResume);
memoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleStartOrResume(); });

stopBtn.addEventListener('click', () => {
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
  精算(); // ここでStopする瞬間までの時間を確定
  lastStateChangedTime = null;
  autoResizeWindow();
});

resetBtn.addEventListener('click', () => {
  clearInterval(timerId);
  timerId = null;
  精算();
  db.remove('currentMemo');
  memoInput.value = '';
  timerMode = 'work';
  timeLeft = 25 * 60;
  lastStateChangedTime = null;
  updateDisplay();
});

function loadAndRenderHistory() {
  let memos = db.get('memos') || [];
  const now = Date.now();
  memos = memos.filter(memo => (now - memo.timestamp) < TEN_HOURS_MS);
  db.set('memos', memos);

  if (memos.length === 0) {
    historyList.innerHTML = '<div style="font-size:0.8rem;color:#999;">履歴はありません</div>';
    autoResizeWindow();
    return;
  }

  const summaryMap = {};
  memos.forEach(memo => {
    const duration = memo.duration || 0;
    summaryMap[memo.text] = (summaryMap[memo.text] || 0) + duration;
  });

  let summaryHtml = '<div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #eee;"><b style="font-size: 0.8rem; color: #333;">過去10時間の集計レポート</b>';
  for (const [taskName, totalSeconds] of Object.entries(summaryMap)) {
    const totalMinutes = Math.round(totalSeconds / 60);
    let timeString = totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)}時間${totalMinutes % 60}分` : `${totalMinutes}分`;
    
    // ★【バグ修正】1分未満のテストでも、しっかり集計レポートに計上されるようにロジックを復活
    if (totalMinutes === 0 && totalSeconds > 0) {
      timeString = "1分未満";
    }
    
    summaryHtml += `<div style="font-size: 0.75rem; color: #555; margin-top: 4px; display: flex; justify-content: space-between;"><span>• ${escapeHtml(taskName)}</span><b>${timeString}</b></div>`;
  }
  summaryHtml += '</div>';

  let timelineHtml = '<b style="font-size: 0.8rem; color: #666;">タイムライン</b>';
  memos.slice().reverse().forEach(memo => {
    const date = new Date(memo.timestamp);
    const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    timelineHtml += `<div class="history-item"><span class="history-time">[${timeStr}]</span><span>${escapeHtml(memo.text)}</span></div>`;
  });

  historyList.innerHTML = summaryHtml + timelineHtml;
  autoResizeWindow();
}

function escapeHtml(str) { return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function showNotification(title, body) { new Notification(title, { body }); }

// 初期化
updateDisplay();
const savedMemo = db.get('currentMemo');
if (savedMemo) memoInput.value = savedMemo;
loadAndRenderHistory();

function autoResizeWindow() {
  const height = document.body.offsetHeight;
  const width = 320;
  ipcRenderer.send('resize-window', { width, height });
}

const historySection = document.getElementById('historySection');
historySection.addEventListener('toggle', () => {
  setTimeout(autoResizeWindow, 50);
});