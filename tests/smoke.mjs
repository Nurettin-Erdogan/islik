import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9337;
const APP_URL = process.env.ISLIK_URL || 'http://127.0.0.1:4173/?smoke=1';
const APP_ORIGIN = new URL(APP_URL).origin;
const profile = join(tmpdir(), `islik-smoke-${Date.now()}`);
const server = process.env.ISLIK_URL ? null : spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url))], {
  windowsHide: true,
  stdio: 'ignore'
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForApp() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(APP_URL)).ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Test adresine ulaşılamadı: ${APP_URL}`);
}

await waitForApp();

const edge = spawn(EDGE, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-sync',
  '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--window-size=1440,1000',
  APP_URL
], { windowsHide: true, stdio: 'ignore' });
process.on('exit', () => {
  edge.kill();
  server?.kill();
});

async function waitForTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then(response => response.json());
      const target = targets.find(item => item.type === 'page' && item.url.startsWith(APP_ORIGIN));
      if (target) return target;
    } catch {}
    await sleep(250);
  }
  throw new Error('Edge test sayfası zamanında açılamadı.');
}

function createClient(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let id = 0;

  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  return {
    ready: new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    }),
    send(method, params = {}) {
      const commandId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(commandId, { resolve, reject });
        socket.send(JSON.stringify({ id: commandId, method, params }));
      });
    },
    close() { socket.close(); }
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const target = await waitForTarget();
const cdp = createClient(target.webSocketDebuggerUrl);
await cdp.ready;
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');
await cdp.send('Network.enable');
await sleep(1200);

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

const initial = await evaluate(`({
  title: document.title,
  dashboard: Boolean(document.querySelector('.dashboard-grid')),
  duplicateIds: [...document.querySelectorAll('[id]')].map(element => element.id).filter((id, index, ids) => ids.indexOf(id) !== index),
  unnamedButtons: [...document.querySelectorAll('button')].filter(button => !(button.textContent.trim() || button.getAttribute('aria-label'))).length,
  unlabeledFields: [...document.querySelectorAll('input:not([type="hidden"]):not([hidden]), select, textarea')].filter(field => !field.closest('label') && !field.getAttribute('aria-label')).length,
  errors: window.__smokeErrors || []
})`);
assert(initial.title === 'İşlik - İşletme Asistanı', 'Sayfa başlığı beklenen değerde değil.');
assert(initial.dashboard, 'Genel bakış ekranı oluşturulamadı.');
assert(initial.duplicateIds.length === 0, `Tekrarlanan HTML kimliği var: ${initial.duplicateIds.join(', ')}`);
assert(initial.unnamedButtons === 0, 'Erişilebilir adı olmayan düğme var.');
assert(initial.unlabeledFields === 0, 'Etiketi olmayan form alanı var.');

const setup = await evaluate(`(() => {
  const modal = document.querySelector('#onboardingModal');
  if (modal.hidden) throw new Error('İlk kurulum ekranı açılmadı.');
  const form = document.querySelector('#onboardingForm');
  form.elements.ownerName.value = 'Nurettin';
  form.elements.businessName.value = 'Nova Teknik';
  form.elements.phone.value = '0555 111 22 33';
  form.elements.industry.value = 'Teknik servis';
  form.requestSubmit();
  const saved = JSON.parse(localStorage.getItem('islik-v1'));
  return { setupComplete: saved.setupComplete, businessName: saved.profile.businessName, modalHidden: modal.hidden };
})()`);
assert(setup.setupComplete && setup.businessName === 'Nova Teknik' && setup.modalHidden, 'İlk işletme kurulumu tamamlanamadı.');

const settings = await evaluate(`(() => {
  document.querySelector('#profileButton').click();
  const modal = document.querySelector('#settingsModal');
  const form = document.querySelector('#settingsForm');
  form.elements.businessName.value = 'Nova Teknik Servis';
  form.requestSubmit();
  const saved = JSON.parse(localStorage.getItem('islik-v1'));
  modal.querySelector('[data-close-settings]').click();
  return { businessName: saved.profile.businessName, modalHidden: modal.hidden };
})()`);
assert(settings.businessName === 'Nova Teknik Servis' && settings.modalHidden, 'İşletme ayarları kaydedilemedi.');

await evaluate(`(() => {
  document.querySelector('#newJobButton').click();
  const form = document.querySelector('#jobForm');
  form.elements.title.value = 'Test cihaz kurulumu';
  form.elements.customer.value = 'Deniz Test';
  form.elements.phone.value = '0555 000 00 00';
  form.elements.amount.value = '2400';
  form.elements.note.value = 'Otomatik Edge testi ile oluşturuldu.';
  form.requestSubmit();
  return true;
})()`);
await sleep(300);

const created = await evaluate(`(() => {
  const state = JSON.parse(localStorage.getItem('islik-v1'));
  return state.jobs.find(job => job.title === 'Test cihaz kurulumu') || null;
})()`);
assert(created, 'Yeni iş yerel depolamaya kaydedilmedi.');

await evaluate(`(() => {
  document.querySelector('.main-nav [data-view="jobs"]').click();
  const card = [...document.querySelectorAll('.job-card')].find(item => item.textContent.includes('Test cihaz kurulumu'));
  if (!card) throw new Error('Oluşturulan iş panoda görünmüyor.');
  card.click();
  document.querySelector('#detailContent [data-status="progress"]').click();
  document.querySelector('.main-nav [data-view="dashboard"]').click();
  return true;
})()`);

const updatedStatus = await evaluate(`JSON.parse(localStorage.getItem('islik-v1')).jobs.find(job => job.title === 'Test cihaz kurulumu').status`);
assert(updatedStatus === 'progress', 'İş durumu güncellenemedi.');

const paymentFlow = await evaluate(`(() => {
  document.querySelector('.main-nav [data-view="jobs"]').click();
  const card = [...document.querySelectorAll('.job-card')].find(item => item.textContent.includes('Test cihaz kurulumu'));
  card.click();
  document.querySelector('#detailContent [data-payment="paid"]').click();
  const saved = JSON.parse(localStorage.getItem('islik-v1')).jobs.find(job => job.title === 'Test cihaz kurulumu');
  const detailText = document.querySelector('#detailContent').textContent;
  document.querySelector('[data-close-detail]').click();
  document.querySelector('.main-nav [data-view="dashboard"]').click();
  return { paymentStatus: saved.paymentStatus, paidAt: saved.paidAt, detailUpdated: detailText.includes('Tahsil edildi') };
})()`);
assert(paymentFlow.paymentStatus === 'paid' && paymentFlow.paidAt && paymentFlow.detailUpdated, 'Ödeme tahsilatı kaydedilemedi.');

const calendarFlow = await evaluate(`(() => {
  document.querySelector('.main-nav [data-view="calendar"]').click();
  const before = document.querySelector('.month-head h3').textContent;
  document.querySelector('[data-calendar-shift="1"]').click();
  const after = document.querySelector('.month-head h3').textContent;
  document.querySelector('[data-calendar-shift="0"]').click();
  const reset = document.querySelector('.month-head h3').textContent;
  document.querySelector('.main-nav [data-view="dashboard"]').click();
  return { before, after, reset };
})()`);
assert(calendarFlow.before !== calendarFlow.after, 'Takvim sonraki aya geçmedi.');
assert(calendarFlow.before === calendarFlow.reset, 'Takvim bugüne dönemedi.');

const extendedFlows = await evaluate(`(() => {
  document.querySelector('.main-nav [data-view="jobs"]').click();
  let card = [...document.querySelectorAll('.job-card')].find(item => item.textContent.includes('Test cihaz kurulumu'));
  card.click();
  const detail = document.querySelector('#detailContent');
  const actionsReady = Boolean(detail.querySelector('[data-payment]') && detail.querySelector('[data-copy-quote]') && detail.querySelector('[data-whatsapp]') && detail.querySelector('[data-edit-job]') && detail.querySelector('[data-delete-job]'));
  const quoteReady = detail.querySelector('.quote-preview')?.textContent.includes('2.400');

  detail.querySelector('[data-edit-job]').click();
  const editForm = document.querySelector('#jobForm');
  editForm.elements.title.value = 'Test cihaz kurulumu güncellendi';
  editForm.requestSubmit();

  card = [...document.querySelectorAll('.job-card')].find(item => item.textContent.includes('Test cihaz kurulumu güncellendi'));
  card.click();
  document.querySelector('#detailContent [data-status="cancelled"]').click();
  const cancelledVisible = [...document.querySelectorAll('.board-column')].some(column => column.textContent.includes('İptal / Arşiv') && column.textContent.includes('Test cihaz kurulumu güncellendi'));

  document.querySelector('[data-job-filter="today"]').click();
  const todayFilterActive = document.querySelector('[data-job-filter="today"]').classList.contains('active');

  document.querySelector('#newJobButton').click();
  const createForm = document.querySelector('#jobForm');
  createForm.elements.title.value = 'Silinecek test işi';
  createForm.elements.customer.value = 'Silme Test';
  createForm.elements.amount.value = '100';
  createForm.requestSubmit();
  const deleteCard = [...document.querySelectorAll('.job-card')].find(item => item.textContent.includes('Silinecek test işi'));
  deleteCard.click();
  window.confirm = () => true;
  document.querySelector('#detailContent [data-delete-job]').click();
  const saved = JSON.parse(localStorage.getItem('islik-v1'));
  document.querySelector('.main-nav [data-view="dashboard"]').click();

  return {
    actionsReady,
    quoteReady,
    edited: saved.jobs.some(job => job.title === 'Test cihaz kurulumu güncellendi'),
    cancelled: saved.jobs.find(job => job.title === 'Test cihaz kurulumu güncellendi')?.status,
    paymentStatus: saved.jobs.find(job => job.title === 'Test cihaz kurulumu güncellendi')?.paymentStatus,
    cancelledVisible,
    todayFilterActive,
    deleted: !saved.jobs.some(job => job.title === 'Silinecek test işi')
  };
})()`);

assert(extendedFlows.actionsReady, 'Ödeme, teklif, WhatsApp, düzenleme veya silme aksiyonları eksik.');
assert(extendedFlows.quoteReady, 'Teklif önizlemesi oluşturulamadı.');
assert(extendedFlows.edited, 'İş düzenleme akışı başarısız.');
assert(extendedFlows.cancelled === 'cancelled' && extendedFlows.cancelledVisible, 'İptal edilen iş arşiv sütununda görünmüyor.');
assert(extendedFlows.paymentStatus === 'paid', 'İptal edilen işin gerçek tahsilat kaydı korunmadı.');
assert(extendedFlows.todayFilterActive, 'Bugün filtresi etkinleşmedi.');
assert(extendedFlows.deleted, 'İş silme akışı başarısız.');

const financePayment = await evaluate(`(() => {
  const saved = JSON.parse(localStorage.getItem('islik-v1'));
  const currentMonth = todayISO().slice(0, 7);
  const expected = saved.jobs.filter(job => job.paymentStatus === 'paid' && job.paidAt.startsWith(currentMonth)).reduce((sum, job) => sum + Number(job.amount), 0);
  document.querySelector('.main-nav [data-view="finance"]').click();
  const displayed = document.querySelector('.metric-card .metric-value').textContent;
  document.querySelector('.main-nav [data-view="dashboard"]').click();
  return { expected: money(expected), displayed };
})()`);
assert(financePayment.displayed === financePayment.expected, 'Finans ekranı gerçek tahsilat toplamını göstermiyor.');

const dataGuards = await evaluate(`(async () => {
  const before = localStorage.getItem('islik-v1');
  const invalidBackup = new File([JSON.stringify({
    data: {
      profile: { businessName: 'Geçersiz Yedek' },
      jobs: [{ id: '1" onclick="alert(1)', title: 'Eksik kayıt' }]
    }
  })], 'invalid.json', { type: 'application/json' });
  await restoreBackup(invalidBackup);
  return {
    backupRejected: localStorage.getItem('islik-v1') === before,
    csvFormulaEscaped: escapeCSVCell('=1+1').startsWith('"\\'='),
    csvPlainValueKept: escapeCSVCell('Normal').includes('Normal'),
    legacyDoneMigrated: normalizeJobs([{ id: 44, title: 'Eski iş', customer: 'Eski müşteri', date: '2026-01-02', time: '10:00', status: 'done', amount: 500 }])[0].paymentStatus === 'paid'
  };
})()`);
assert(dataGuards.backupRejected, 'Geçersiz yedek mevcut verinin üzerine yazdı.');
assert(dataGuards.csvFormulaEscaped && dataGuards.csvPlainValueKept, 'CSV hücre güvenliği başarısız.');
assert(dataGuards.legacyDoneMigrated, 'Eski tamamlanan işler ödeme modeline taşınamadı.');

const artifactDir = join(tmpdir(), 'islik-artifacts');
await mkdir(artifactDir, { recursive: true });
await evaluate(`document.querySelector('#toastRegion').replaceChildren()`);
const desktop = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile(join(artifactDir, 'desktop.png'), Buffer.from(desktop.data, 'base64'));

await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await sleep(300);
const mobile = await evaluate(`(() => {
  const nav = document.querySelector('.mobile-nav');
  const addButton = document.querySelector('#newJobButton');
  return {
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    mobileNavVisible: getComputedStyle(nav).display !== 'none',
    mobileNavItems: nav.children.length,
    addButtonVisible: addButton.getBoundingClientRect().right <= window.innerWidth,
    metricColumns: getComputedStyle(document.querySelector('.metric-grid')).gridTemplateColumns
  };
})()`);

assert(mobile.innerWidth === 390, 'Mobil görünüm genişliği uygulanamadı.');
assert(mobile.scrollWidth <= mobile.innerWidth, `Mobil sayfada yatay taşma var: ${mobile.scrollWidth}px.`);
assert(mobile.mobileNavVisible && mobile.mobileNavItems === 5, 'Mobil alt menü eksik veya görünmüyor.');
assert(mobile.addButtonVisible, 'Mobil yeni iş düğmesi ekran dışında kalıyor.');

const mobileShot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile(join(artifactDir, 'mobile.png'), Buffer.from(mobileShot.data, 'base64'));

const serviceWorkerReady = await evaluate(`navigator.serviceWorker.ready.then(() => Boolean(navigator.serviceWorker.controller))`);
assert(serviceWorkerReady, 'Service worker sayfayı kontrol etmiyor.');
await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await cdp.send('Page.reload', { ignoreCache: false });
await sleep(1500);
const offline = await evaluate(`({
  title: document.title,
  dashboard: Boolean(document.querySelector('.dashboard-grid')),
  online: navigator.onLine
})`);
assert(offline.title === 'İşlik - İşletme Asistanı' && offline.dashboard, 'Uygulama çevrimdışıyken açılamadı.');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

console.log(JSON.stringify({
  title: initial.title,
  createdJobId: created.id,
  updatedStatus,
  paymentFlow,
  calendarFlow,
  extendedFlows,
  financePayment,
  dataGuards,
  mobile,
  offline,
  screenshots: [join(artifactDir, 'desktop.png'), join(artifactDir, 'mobile.png')]
}, null, 2));

cdp.close();
edge.kill();
server?.kill();
