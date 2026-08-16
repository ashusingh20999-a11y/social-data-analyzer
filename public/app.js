function showSection(id){document.querySelectorAll('section').forEach(s=>s.classList.add('hidden'));document.getElementById(id).classList.remove('hidden');if(id==='dashboard')loadStats();if(id==='messages')loadMessages()}

async function loadStats(){try{const r=await fetch('/api/stats');const d=await r.json();document.getElementById('total').textContent=d.total||0;document.getElementById('telegram').textContent=d.telegram||0;}catch{}}

async function checkTelegram(){const box=document.getElementById('telegramResult');box.textContent='Checking secure Telegram configuration...';try{const r=await fetch('/api/telegram/status');const d=await r.json();box.textContent=d.configured?'Telegram API is configured. The account authorization step is next.':'Telegram API credentials are not configured on the server.';}catch{box.textContent='Unable to contact the server.'}}

async function loadMessages(){const q=document.getElementById('search').value;const p='Telegram';const r=await fetch(`/api/messages?search=${encodeURIComponent(q)}&platform=${p}`);const rows=await r.json();const body=document.getElementById('messageTable');body.innerHTML='';for(const row of rows){const tr=document.createElement('tr');[row.platform,row.chat_name,row.sender,row.message,row.message_date].forEach(v=>{const td=document.createElement('td');td.textContent=v||'';tr.appendChild(td)});body.appendChild(tr)}}

loadStats();
