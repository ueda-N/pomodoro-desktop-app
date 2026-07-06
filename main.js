const { app, BrowserWindow, ipcMain } = require('electron'); // ipcMain を追加
const path = require('path');

let win; // ウィンドウをグローバル変数にしておきます

function createWindow() {
  win = new BrowserWindow({
    width: 320,
    height: 230,
    resizable: false,
    alwaysOnTop: true,
    frame: true,
    useContentSize: true,  // 重要：ウィンドウの「外枠」ではなく「HTMLの中身」のサイズを基準にする
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
}

//  画面（index.js）からサイズ変更要求を受け取るリスナー
ipcMain.on('resize-window', (event, { width, height }) => {
  if (win) {
    // 中身のサイズに合わせてウィンドウサイズを自動変更
    win.setContentSize(width, height);
  }
});

app.whenReady().then(() => {
  app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath('exe')
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});