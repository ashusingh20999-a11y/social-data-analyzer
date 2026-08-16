const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data.json');

function readData(){try{return JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));}catch{return [];}}
function writeData(data){fs.writeFileSync(DATA_FILE,JSON.stringify(data,null,2));}
function send(res,status,body,type='application/json'){res.writeHead(status,{'Content-Type':type,'Access-Control-Allow-Origin':'*'});res.end(type==='application/json'?JSON.stringify(body):body);}
function safeFile(file){const ext=path.extname(file).toLowerCase();const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};return types[ext]||'application/octet-stream';}

const server=http.createServer((req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);

  if(req.method==='GET'&&url.pathname==='/api/stats'){
    const data=readData();
    return send(res,200,{total:data.length,telegram:data.filter(x=>x.platform==='Telegram').length,instagram:data.filter(x=>x.platform==='Instagram').length});
  }

  if(req.method==='GET'&&url.pathname==='/api/telegram/status'){
    const configured=Boolean(process.env.TELEGRAM_API_ID&&process.env.TELEGRAM_API_HASH);
    return send(res,200,{configured,mode:'authorized_account_only'});
  }

  if(req.method==='GET'&&url.pathname==='/api/messages'){
    const data=readData();const search=(url.searchParams.get('search')||'').toLowerCase();const platform=url.searchParams.get('platform')||'';
    const rows=data.filter(x=>{const platformOk=!platform||x.platform===platform;const text=`${x.chat_name} ${x.sender} ${x.message}`.toLowerCase();return platformOk&&(!search||text.includes(search));}).slice(-500).reverse();
    return send(res,200,rows);
  }

  if(req.method==='GET'){
    let requested=decodeURIComponent(url.pathname);if(requested==='/')requested='/index.html';
    const file=path.join(PUBLIC,requested);
    if(!file.startsWith(PUBLIC)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return send(res,404,{error:'Not found'});
    return send(res,200,fs.readFileSync(file),safeFile(file));
  }
  send(res,404,{error:'Not found'});
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Social Data Analyzer running on port ${PORT}`));
