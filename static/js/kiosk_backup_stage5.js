const $ = id => document.getElementById(id);
let state = {source:'', weight:null, pack:'', reading:0};
let records = [];
function msg(text='',ok=false){$('message').textContent=text;$('message').className=ok?'message ok':'message'}
function show(panel,step){for(const id of ['source','weigh','pack','save','success','history'])$(id+'Panel').classList.toggle('hidden',id!==panel);for(let i=1;i<=4;i++)$('step'+i).classList.toggle('active',i===step);msg();if(panel==='source')$('source').focus();if(panel==='pack')$('pack').focus()}
function reset(){state={source:'',weight:null,pack:'',reading:0};$('source').value='';$('pack').value='';$('reading').textContent='0';show('source',1)}
function summary(element,items){element.replaceChildren();for(const [key,value] of items){const line=document.createElement('div');const b=document.createElement('strong');b.textContent=key+': ';line.append(b,document.createTextNode(String(value)));element.append(line)}}
async function refresh(){try{const r=await fetch('/api/history');if(!r.ok)throw Error('History unavailable');const data=await r.json();records=data.records;$('count').textContent=data.total;renderHistory()}catch(e){msg('Could not load local history: '+e.message)}}
function renderHistory(){const q=$('search').value.trim().toLowerCase();$('historyRows').replaceChildren();for(const r of records.filter(x=>x.source_qr.toLowerCase().includes(q)||x.packaging_qr.toLowerCase().includes(q))){const tr=document.createElement('tr');for(const value of [r.created_at,r.source_qr,r.weight_g+' g',r.packaging_qr,r.sync_status]){const td=document.createElement('td');td.textContent=value;tr.append(td)}$('historyRows').append(tr)}}
$('toWeigh').onclick=()=>{const value=$('source').value.trim();if(!value)return msg('Scan a source QR first.');state.source=value;show('weigh',2)};
let scaleStatus = null;
let capturedScale = null;
async function pollScale() {
  try {
    const response = await fetch('/api/scale', {cache:'no-store'});
    if (!response.ok) throw Error('Scale API unavailable');
    scaleStatus = await response.json();
    const g = scaleStatus.weight_g;
    $('reading').textContent = g === null ? '—' : Number(g).toLocaleString('en-US', {maximumFractionDigits:2});
    $('scaleStatus').textContent = scaleStatus.connected
      ? (scaleStatus.stable ? 'Stable' : 'Unstable') + ' · ' + (scaleStatus.mode === 'sim' ? 'Simulated' : 'Serial')
      : 'Disconnected · ' + (scaleStatus.error || 'No reading');
    $('capture').disabled = !scaleStatus.can_capture;
  } catch (e) {
    scaleStatus = null;
    $('scaleStatus').textContent = 'Disconnected · ' + e.message;
    $('capture').disabled = true;
  }
}
setInterval(pollScale, 350);
pollScale();
// Automatic scale polling is handled by pollScale().
$('capture').onclick=()=>{if(!scaleStatus || !scaleStatus.can_capture)return msg('Wait for a valid, stable scale reading.');state.weight=Math.round(Number(scaleStatus.weight_g));summary($('summary'),[['Source QR',state.source],['Captured weight',state.weight+' g']]);show('pack',3)};
$('toSave').onclick=()=>{const value=$('pack').value.trim();if(!value)return msg('Scan a packaging QR first.');if(value===state.source)return msg('Packaging QR must differ from source QR.');state.pack=value;summary($('review'),[['Source QR',state.source],['Weight',state.weight+' g'],['Packaging QR',state.pack]]);show('save',4)};
$('save').onclick=async()=>{const button=$('save');button.disabled=true;try{const response=await fetch('/api/weighings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_qr:state.source,weight_g:state.weight,packaging_qr:state.pack})});const result=await response.json();if(!response.ok)throw Error(result.error||'Save failed');summary($('saved'),[['Transaction ID',result.record.transaction_id],['Source QR',result.record.source_qr],['Weight',result.record.weight_g+' g'],['Packaging QR',result.record.packaging_qr],['Sync status','Pending']]);show('success',4);msg('Record safely stored on this kiosk.',true);await refresh()}catch(e){msg(e.message)}finally{button.disabled=false}};
$('backSource').onclick=()=>show('source',1);
$('backWeigh').onclick=()=>show('weigh',2);
$('backPack').onclick=()=>show('pack',3);
$('new').onclick=reset;
$('next').onclick=reset;
$('showHistory').onclick=async()=>{show('history',0);await refresh()};
$('closeHistory').onclick=()=>reset();
$('search').oninput=renderHistory;
$('source').addEventListener('keydown',e=>{if(e.key==='Enter')e.preventDefault()});
$('pack').addEventListener('keydown',e=>{if(e.key==='Enter')e.preventDefault()});
refresh();reset();



document.addEventListener("DOMContentLoaded", function () {
    const sourceQR = document.querySelector(
        'input[name="source_qr"]'
    );

    if (sourceQR) {
        sourceQR.focus();
    }
});

// Stage 2.7: hardware status, independent of the weighing workflow.


function renderHardware(id, device) {
  const indicator = $(id);
  const detail = $(id + 'Detail');

  if (!indicator) return;

  const status = String(device?.status || '').toLowerCase();
  const connected = ['connected', 'detected', 'ready'].includes(status);

  indicator.textContent = '';
  indicator.dataset.status = connected ? 'connected' : 'disconnected';
  indicator.title = connected ? 'Connected' : 'Disconnected';
  indicator.setAttribute(
    'aria-label',
    connected ? 'Connected' : 'Disconnected'
  );

  if (detail) detail.style.display = 'none';
}


async function pollHardware() {
  try {
    const response = await fetch('/api/hardware/status', {cache:'no-store'});
    if (!response.ok) throw Error('Status API unavailable');
    const data = await response.json();
    renderHardware('hwScanner', data.scanner);
    renderHardware('hwPrinter', data.printer);
    renderHardware('hwScale', data.scale);
  } catch(e) {
    for (const id of ['hwScanner','hwPrinter','hwScale'])
      renderHardware(id, {status:'unknown',detail:e.message});
  }
}
setInterval(pollHardware, 2000);
pollHardware();
