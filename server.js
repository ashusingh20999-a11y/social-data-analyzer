const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data.json');
const SESSION_FILE = path.join(__dirname, 'telegram.session');

let tgClient = null;
let tgPhoneCodeHash = null;
let TelegramClient = null;
let Api = null;
let StringSession = null;

function ensureTelegramPackage(){
  if (TelegramClient) return;
  try {
    ({ TelegramClient, Api } = require('telegram'));
    ({ StringSession } = require('telegram/sessions'));
    return;
  } catch (firstError) {
    console.log('Telegram package missing; installing dependency...');
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--omit=dev', '--no-audit', '--no-fund', 'telegram@2.26.22'], { stdio: 'inherit' });
    ({ TelegramClient, Api } = require('telegram'));
    ({ StringSession } = require('telegram/sessions'));
  }
}

function readData(){try{return JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));}catch{return [];}}
function send(res,status,body,type='application/json'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(type==='application/json'?JSON.stringify(body):body);}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'))}catch(e){reject(e)}});req.on('error',reject)})}
function safeFile(file){const ext=path.extname(file).toLowerCase();const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};return types[ext]||'application/octet-stream';}

function telegramCredentials(){
  const apiId = String(process.env.TELEGRAM_API_ID || '').trim();
  const apiHash = String(process.env.TELEGRAM_API_HASH || '').trim();
  return { apiId, apiHash };
}

function configured(){
  const { apiId, apiHash } = telegramCredentials();
  return Boolean(apiId && apiHash && /^\d+$/.test(apiId));
}

function loadSession(){
  ensureTelegramPackage();
  const envSession = String(process.env.TELEGRAM_SESSION || '').trim();
  if (envSession) return envSession;
  try { return fs.readFileSync(SESSION_FILE,'utf8').trim(); } catch { return ''; }
}

async function makeClient(){
  const { apiId, apiHash } = telegramCredentials();
  if(!configured()) throw new Error('Telegram API credentials are not configured.');
  ensureTelegramPackage();
  if(tgClient) return tgClient;
  const session = loadSession();
  const tgSession = new StringSession(session);
  tgClient = new TelegramClient(tgSession, Number(apiId), apiHash, {connectionRetries:5});
  await tgClient.connect();
  return tgClient;
}

async function saveTelegramSession(){
  if(!tgClient) return false;
  const session = tgClient.session && typeof tgClient.session.save === 'function' ? tgClient.session.save() : '';
  if(!session) return false;
  try { fs.writeFileSync(SESSION_FILE, session, {encoding:'utf8', mode:0o600}); } catch(e) { console.error('Could not save Telegram session:',e.message); }
  return true;
}

async function isAuthorized(){
  try {
    const client = await makeClient();
    return await client.checkAuthorization();
  } catch(e) {
    console.error('Telegram authorization check failed:', e.message);
    return false;
  }
}

const server=http.createServer(async (req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);

    if(req.method==='GET'&&url.pathname==='/api/stats'){
      const data=readData();
      const authorized=await isAuthorized();
      return send(res,200,{total:data.length,telegram:data.filter(x=>x.platform==='Telegram').length,instagram:data.filter(x=>x.platform==='Instagram').length,connected:authorized});
    }

    if(req.method==='GET'&&url.pathname==='/api/telegram/status'){
      const { apiId, apiHash } = telegramCredentials();
      const authorized=await isAuthorized();
      return send(res,200,{configured:configured(),connected:authorized,authorized,mode:'authorized_account_only',apiIdPresent:Boolean(apiId),apiHashPresent:Boolean(apiHash),apiIdValid:/^\d+$/.test(apiId),apiIdLength:apiId.length,apiHashLength:apiHash.length});
    }

    if(req.method==='POST'&&url.pathname==='/api/telegram/send-code'){
      const b=await body(req); if(!b.phone) return send(res,400,{error:'Phone number is required'});
      const client=await makeClient();
      const { apiId, apiHash } = telegramCredentials();
      const result=await client.invoke(new Api.auth.SendCode({phoneNumber:b.phone,apiId:Number(apiId),apiHash:apiHash,settings:new Api.auth.CodeSettings({})}));
      tgPhoneCodeHash=result.phoneCodeHash;
      return send(res,200,{success:true,message:'Telegram code sent. Enter the code in the app.'});
    }

    if(req.method==='POST'&&url.pathname==='/api/telegram/verify'){
      const b=await body(req); if(!b.phone||!b.code||!tgPhoneCodeHash) return send(res,400,{error:'Phone, code and an active login request are required'});
      const client=await makeClient();
      try{
        await client.invoke(new Api.auth.SignIn({phoneNumber:b.phone,phoneCodeHash:tgPhoneCodeHash,phoneCode:b.code}));
      }catch(e){
        if(String(e.errorMessage||e.message).includes('SESSION_PASSWORD_NEEDED')) return send(res,200,{success:false,passwordRequired:true,message:'Telegram 2FA password is required.'});
        throw e;
      }
      await saveTelegramSession();
      return send(res,200,{success:true,connected:true,message:'Telegram account connected and session saved.'});
    }

    if(req.method==='POST'&&url.pathname==='/api/telegram/password'){
      const b=await body(req); if(!b.password) return send(res,400,{error:'2FA password is required'});
      const client=await makeClient();
      await client.checkPassword(b.password);
      await saveTelegramSession();
      return send(res,200,{success:true,connected:true,message:'Telegram account connected and session saved.'});
    }

    if(req.method==='GET'&&url.pathname==='/api/telegram/dialogs'){
      const client=await makeClient();
      if(!await client.checkAuthorization()) return send(res,401,{error:'Telegram account is not authorized. Open Connect Telegram and complete login first.'});
      const dialogs=await client.getDialogs({limit:100});
      const rows=dialogs.map(d=>({id:String(d.id),name:d.name||d.title||'Unnamed',isGroup:Boolean(d.isGroup),isChannel:Boolean(d.isChannel)}));
      return send(res,200,rows);
    }

    if(req.method==='GET'&&url.pathname==='/api/telegram/messages'){
      const client=await makeClient();
      if(!await client.checkAuthorization()) return send(res,401,{error:'Telegram account is not authorized. Complete login first.'});
      const peer=url.searchParams.get('peer'); const limit=Math.min(Number(url.searchParams.get('limit')||50),100);
      if(!peer) return send(res,400,{error:'peer is required'});
      const messages=await client.getMessages(peer,{limit});
      return send(res,200,messages.map(m=>({id:m.id,message:m.message||'',date:m.date, senderId:m.senderId?String(m.senderId):null})));
    }

    if(req.method==='GET'&&url.pathname==='/api/messages'){
      const data=readData();const search=(url.searchParams.get('search')||'').toLowerCase();const platform=url.searchParams.get('platform')||'';
      const rows=data.filter(x=>{const ok=!platform||x.platform===platform;const text=`${x.chat_name} ${x.sender} ${x.message}`.toLowerCase();return ok&&(!search||text.includes(search));}).slice(-500).reverse();
      return send(res,200,rows);
    }

    if(req.method==='GET'){
      let requested=decodeURIComponent(url.pathname);if(requested==='/')requested='/index.html';
      const file=path.join(PUBLIC,requested); if(!file.startsWith(PUBLIC)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return send(res,404,{error:'Not found'});
      return send(res,200,fs.readFileSync(file),safeFile(file));
    }
    return send(res,404,{error:'Not found'});
  }catch(e){console.error(e);return send(res,500,{error:e.message||'Server error'});}
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Social Data Analyzer running on port ${PORT}`));
