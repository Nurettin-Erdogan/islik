import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9337;
const profile = join(tmpdir(), `islik-smoke-${Date.now()}`);
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
  'http://127.0.0.1:4173/?smoke=1'
], { windowsHide: true, stdio: 'ignore' });
process.on('exit', () => edge.kill());

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then(response => response.json());
      const target = targets.find(item => item.type === 'page' && item.url.includes('127.0.0.1:4173'));
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
await sleep(1200);

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

const initial = await evaluate(`({
  title: document.title,
  dashboard: Boolean(document.querySelector('.dashboard-grid')),
  errors: window.__smokeErrors || []
})`);
assert(initial.title === 'İşlik - İşletme Asistanı', 'Sayfa başlığı beklenen değerde değil.');
assert(initial.dashboard, 'Genel bakış ekranı oluşturulamadı.');

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

const extendedFlows = await evaluate(`(() => {
  document.querySelector('.main-nav [data-view="jobs"]').click();
  let card = [...document.querySelectorAll('.job-card')].find(item => item.textContent.includes('Test cihaz kurulumu'));
  card.click();
  const detail = document.querySelector('#detailContent');
  const actionsReady = Boolean(detail.querySelector('[data-copy-quote]') && detail.querySelector('[data-whatsapp]') && detail.querySelector('[data-edit-job]') && detail.querySelector('[data-delete-job]'));
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
    cancelledVisible,
    todayFilterActive,
    deleted: !saved.jobs.some(job => job.title === 'Silinecek test işi')
  };
})()`);

assert(extendedFlows.actionsReady, 'Teklif, WhatsApp, düzenleme veya silme aksiyonları eksik.');
assert(extendedFlows.quoteReady, 'Teklif önizlemesi oluşturulamadı.');
assert(extendedFlows.edited, 'İş düzenleme akışı başarısız.');
assert(extendedFlows.cancelled === 'cancelled' && extendedFlows.cancelledVisible, 'İptal edilen iş arşiv sütununda görünmüyor.');
assert(extendedFlows.todayFilterActive, 'Bugün filtresi etkinleşmedi.');
assert(extendedFlows.deleted, 'İş silme akışı başarısız.');

const artifactDir = join(tmpdir(), 'islik-artifacts');
await mkdir(artifactDir, { recursive: true });
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

console.log(JSON.stringify({
  title: initial.title,
  createdJobId: created.id,
  updatedStatus,
  extendedFlows,
  mobile,
  screenshots: [join(artifactDir, 'desktop.png'), join(artifactDir, 'mobile.png')]
}, null, 2));

cdp.close();
edge.kill();
