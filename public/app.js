function showSection(id){document.querySelectorAll('section').forEach(s=>s.classList.add('hidden'));document.getElementById(id).classList.remove('hidden');if(id==='dashboard')loadStats();if(id==='messages')loadMessages()}

async function loadStats(){const r=await fetch('/api/stats');const d=await r.json();document.getElementById('total').textContent=d.total;document.getElementById('telegram').textContent=d.telegram;document.getElementById('instagram').textContent=d.instagram}

async function importData(){const file=document.getElementById('file').files[0];const platform=document.getElementById('platform').value;if(!file){document.getElementById('importResult').textContent='Please select a JSON export.';return}const fd=new FormData();fd.append('file',file);fd.append('platform',platform);const r=await fetch('/api/import',{method:'POST',body:fd});const d=await r.json();document.getElementById('importResult').textContent=d.success?`Imported ${d.imported} messages.`:(d.error||'Import failed');loadStats()}

async function loadMessages(){const q=document.getElementById('search').value;const p=document.getElementById('filterPlatform').value;const r=await fetch(`/api/messages?search=${encodeURIComponent(q)}&platform=${encodeURIComponent(p)}`);const rows=await r.json();const body=document.getElementById('messageTable');body.innerHTML='';for(const row of rows){const tr=document.createElement('tr');[row.platform,row.chat_name,row.sender,row.message,row.message_date].forEach(v=>{const td=document.createElement('td');td.textContent=v||'';tr.appendChild(td)});body.appendChild(tr)}}

loadStats();
