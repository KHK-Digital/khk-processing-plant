const $ = id => document.getElementById(id);
let state = {source:'', weight:null, pack:'', reading:0};
let records = [];
function msg(text='',ok=false){$('message').textContent=text;$('message').className=ok?'message ok':'message'}
function show(panel,step){for(const id of ['source','weigh','pack','save','success','history'])$(id+'Panel').classList.toggle('hidden',id!==panel);for(let i=1;i<=4;i++)$('step'+i).classList.toggle('active',i===step);msg();if(panel==='source')$('source').focus();if(panel==='pack')$('pack').focus()}
function reset(){state={source:'',weight:null,pack:'',reading:0};$('source').value='';$('pack').value='';$('reading').textContent='0';show('source',1)}
function summary(element,items){element.replaceChildren();for(const [key,value] of items){const line=document.createElement('div');const b=document.createElement('strong');b.textContent=key+': ';line.append(b,document.createTextNode(String(value)));element.append(line)}}


async function refresh() {
  try {
    await loadLocalHistory();
  } catch (error) {
    console.error('Local history failed:', error);
    msg('Could not load IndexedDB history: ' + error.message);
  }
}


function renderHistory(){const q=$('search').value.trim().toLowerCase();$('historyRows').replaceChildren();for(const r of records.filter(x=>x.source_qr.toLowerCase().includes(q)||x.packaging_qr.toLowerCase().includes(q))){const tr=document.createElement('tr');for(const value of [r.created_at,r.source_qr,r.weight_g+' g',r.packaging_qr,r.sync_status]){const td=document.createElement('td');td.textContent=value;tr.append(td)}$('historyRows').append(tr)}}
$('toWeigh').onclick=()=>{const value=$('source').value.trim();if(!value)return msg('Scan a source QR first.');state.source=value;show('weigh',2)};
let scaleStatus = null;
let capturedScale = null;

async function pollScale() {
  try {
    // Android tablet uses local Bluetooth HTTP bridge.
    // Windows kiosk continues using the existing Flask scale API.
    const isAndroid =
    /Android/i.test(navigator.userAgent) ||
    /^KHK-ANDROID-/i.test(localStorage.getItem('KHK_KIOSK_ID') || '');

    const endpoint = isAndroid
      ? 'http://127.0.0.1:8765/weight'
      : '/api/scale';

    $('scaleStatus').textContent = 'Requesting: ' + endpoint;

    const response = await fetch(endpoint, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error('Scale API unavailable');
    }

    const data = await response.json();

    console.log('KHK SCALE RESPONSE:', {
      connected: data.connected,
      stable: data.stable,
      stableType: typeof data.stable,
      weight_g: data.weight_g
    });


    // Normalize Android and Windows scale responses.
    const weight = Number(data.weight_g);
    const validWeight =
      data.weight_g !== null &&
      data.weight_g !== undefined &&
      Number.isFinite(weight) &&
      weight > 0;

    scaleStatus = {
      connected: data.connected === true,
      stable: data.stable === true,
      weight_g: validWeight ? weight : null,
      can_capture:
        data.connected === true &&
        data.stable === true &&
        validWeight &&
        (isAndroid || data.can_capture === true),
      mode: isAndroid ? 'bluetooth' : data.mode,
      error: data.error || ''
    };

    $('reading').textContent =
      scaleStatus.weight_g === null
        ? '—'
        : scaleStatus.weight_g.toLocaleString('en-US', {
            maximumFractionDigits: 2
          });

    $('scaleStatus').textContent = scaleStatus.connected
      ? (scaleStatus.stable ? 'Stable' : 'Unstable') +
        ' · ' +
        (isAndroid ? 'Bluetooth' : (
          scaleStatus.mode === 'sim' ? 'Simulated' : 'Serial'
        ))
      : 'Disconnected · ' + (scaleStatus.error || 'No reading');

    $('capture').disabled = !scaleStatus.can_capture;

} catch (error) {
  console.error('KHK scale bridge error:', error);

  scaleStatus = null;

  // Keep the last displayed weight for diagnosis,
  // but never allow capture after a failed request.
  $('scaleStatus').textContent =
    'Bridge request failed · ' + error.message;

  $('capture').disabled = true;
}
}

// Poll the Android Bluetooth bridge once per second.
// Wait for each request to finish before starting another.
async function startScalePolling() {
  while (true) {
    await pollScale();
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

startScalePolling();
// Automatic scale polling is handled by pollScale().
$('capture').onclick=()=>{if(!scaleStatus || !scaleStatus.can_capture)return msg('Wait for a valid, stable scale reading.');state.weight=Math.round(Number(scaleStatus.weight_g));summary($('summary'),[['Source QR',state.source],['Captured weight',state.weight+' g']]);show('pack',3)};
$('toSave').onclick=()=>{const value=$('pack').value.trim();if(!value)return msg('Scan a packaging QR first.');if(value===state.source)return msg('Packaging QR must differ from source QR.');state.pack=value;summary($('review'),[['Source QR',state.source],['Weight',state.weight+' g'],['Packaging QR',state.pack]]);show('save',4)};



$('save').onclick = async () => {
  const button = $('save');
  button.disabled = true;

  try {
    const record = await saveKHKTransaction({
      source_qr: state.source,
      weight_g: state.weight,
      packaging_qr: state.pack
    });

    summary($('saved'), [
      ['Transaction ID', record.transaction_id],
      ['Source QR', record.source_qr],
      ['Weight', record.weight_g + ' g'],
      ['Packaging QR', record.packaging_qr],
      ['Sync status', 'Pending']
    ]);

    show('success', 4);
    await refreshLocalCount();

    msg('Transaction saved locally in IndexedDB.', true);

  } catch (error) {
    console.error('IndexedDB save failed:', error);
    msg('Local save failed: ' + error.message);
  } finally {
    button.disabled = false;
  }
};



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
reset();



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
if (!/Android/i.test(navigator.userAgent)) {
  setInterval(pollHardware, 2000);
  pollHardware();
}



 // Stage 6.1: Offline IndexedDB initialization

const KHK_DB_NAME = 'KHKProcessingPlant';
const KHK_DB_VERSION = 1;
const KHK_STORE_NAME = 'weighings';

function openKHKDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KHK_DB_NAME, KHK_DB_VERSION);

    request.onupgradeneeded = event => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(KHK_STORE_NAME)) {
        const store = db.createObjectStore(KHK_STORE_NAME, {
          keyPath: 'transaction_id'
        });

        store.createIndex('sync_status', 'sync_status', {
          unique: false
        });

        store.createIndex('created_at', 'created_at', {
          unique: false
        });
      }
    };

    request.onsuccess = () => resolve(request.result);

    request.onerror = () => reject(request.error);
  });
}

async function initializeKHKDatabase() {
  try {
    const db = await openKHKDatabase();

    console.log('KHK IndexedDB initialized successfully');
    console.log('Database:', db.name);
    console.log('Version:', db.version);

    db.close();
  } catch (error) {
    console.error('KHK IndexedDB initialization failed:', error);
  }
}

initializeKHKDatabase();



 // Stage 6.2: Save transaction to local IndexedDB

async function saveKHKTransaction(data) {
  const db = await openKHKDatabase();

  try {
    
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, byte =>
      byte.toString(16).padStart(2, '0')
    ).join('');

    const transactionId = [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20)
    ].join('-');


    const record = {
      transaction_id: transactionId,
      source_qr: data.source_qr,
      weight_g: data.weight_g,
      packaging_qr: data.packaging_qr,
      kiosk_id: getKioskId(),
      created_at: new Date().toISOString(),
      sync_status: 'pending'
    };

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(
        KHK_STORE_NAME,
        'readwrite'
      );

      const store = transaction.objectStore(KHK_STORE_NAME);

      store.add(record);

      transaction.oncomplete = () => resolve();

      transaction.onerror = () =>
        reject(transaction.error);

      transaction.onabort = () =>
        reject(transaction.error || new Error('Save aborted'));
    });

    return record;
  } finally {
    db.close();
  }
}




 // Stage 6.5: Persistent kiosk identification

function getKioskId() {
  const storageKey = 'KHK_KIOSK_ID';

  let kioskId = localStorage.getItem(storageKey);

  if (!kioskId) {
    const isAndroid =
    /Android/i.test(navigator.userAgent) ||
    /^KHK-ANDROID-/i.test(localStorage.getItem('KHK_KIOSK_ID') || '');

    const prefix = isAndroid ? 'KHK-ANDROID' : 'KHK-WINDOWS';

    const randomBytes = new Uint8Array(4);
    crypto.getRandomValues(randomBytes);

    const uniqueId = Array.from(randomBytes)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();

    kioskId = prefix + '-' + uniqueId;

    localStorage.setItem(storageKey, kioskId);
  }

  return kioskId;
}

const KHK_KIOSK_ID = getKioskId();

console.log('KHK Kiosk ID:', KHK_KIOSK_ID);


// Stage 6.6: Display device-specific kiosk ID

const stationElement = document.getElementById('station');

if (stationElement) {
  stationElement.textContent = KHK_KIOSK_ID;
}



 // Stage 6.9: Count locally saved transactions

async function refreshLocalCount() {
  const db = await openKHKDatabase();

  try {
    const total = await new Promise((resolve, reject) => {
      const transaction = db.transaction(
        KHK_STORE_NAME,
        'readonly'
      );

      const request = transaction
        .objectStore(KHK_STORE_NAME)
        .count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    $('count').textContent = total;
  } catch (error) {
    console.error('Local count failed:', error);
  } finally {
    db.close();
  }
}



 // Stage 6.10: Read transaction history from IndexedDB

async function loadLocalHistory() {
  const db = await openKHKDatabase();

  try {
    const localRecords = await new Promise((resolve, reject) => {
      const transaction = db.transaction(
        KHK_STORE_NAME,
        'readonly'
      );

      const request = transaction
        .objectStore(KHK_STORE_NAME)
        .getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    records = localRecords.sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );

    renderHistory();
    $('count').textContent = records.length;

  } finally {
    db.close();
  }
}


// Initialize local history after all IndexedDB declarations
refresh();



 // Stage 7.8: Register offline PWA service worker

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration =
        await navigator.serviceWorker.register('/cloudsw.js');

      console.log(
        'KHK Service Worker registered:',
        registration.scope
      );
    } catch (error) {
      console.error(
        'KHK Service Worker registration failed:',
        error
      );
    }
  });
}
