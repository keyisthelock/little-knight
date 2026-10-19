const { app, BrowserWindow, Menu, protocol, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const debug = message => { try { fs.appendFileSync(path.join(path.dirname(process.execPath),'knight-debug.log'),new Date().toISOString()+' '+message+'\n'); } catch {} };
process.on('uncaughtException',error=>debug(error.stack));
process.on('unhandledRejection',error=>debug(error?.stack||String(error)));

protocol.registerSchemesAsPrivileged([{scheme:'knight',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,allowServiceWorkers:true}}]);
// Keep this portable development app's journal beside the app, not in AppData.
const portableRoot = app.isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname,'..');
app.setPath('userData',path.join(portableRoot,'LocalProfile'));
app.commandLine.appendSwitch('renderer-process-limit','2');
app.setAppUserModelId('LittleKnight.Chess');
let window;
const singleInstance=app.requestSingleInstanceLock();
if(!singleInstance)app.quit();
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
if(singleInstance)app.whenReady().then(()=>{
  debug('Ready: '+app.getAppPath());
  Menu.setApplicationMenu(null);
  const root=path.join(app.getAppPath(),'dist');
  protocol.handle('knight', request=>{
    let filename;
    try {
      const url=new URL(request.url);
      if(url.host!=='app')return new Response('Forbidden',{status:403});
      const pathname=decodeURIComponent(url.pathname);
      filename=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
      if(!filename.startsWith(root+path.sep)||!fs.statSync(filename).isFile())throw new Error();
    }catch{return new Response('Not found',{status:404});}
    return net.fetch(pathToFileURL(filename).href);
  });
  window=new BrowserWindow({width:1330,height:940,minWidth:760,minHeight:620,title:'Little Knight',backgroundColor:'#f5f5ef',show:true,
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:true}});
  window.webContents.setWindowOpenHandler(({url})=>url.startsWith('knight://app/')?{action:'allow',overrideBrowserWindowOptions:{webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}}}:{action:'deny'});
  window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('knight://app/'))event.preventDefault();});
  window.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  window.webContents.on('did-finish-load',()=>debug('Page loaded'));
  window.webContents.on('did-fail-load',(_event,code,description)=>debug('Load failed: '+code+' '+description));
  window.webContents.on('render-process-gone',(_event,details)=>debug('Renderer exited: '+JSON.stringify(details)));
  window.loadURL('knight://app/');
});
app.on('window-all-closed',()=>app.quit());
