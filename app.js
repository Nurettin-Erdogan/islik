const STORAGE_KEY = 'islik-v1';
const APP_VERSION = 2;

const seedJobs = [
  { id: 101, title: 'Kombi su basıncı arızası', customer: 'Ahmet Yılmaz', phone: '0532 410 24 18', date: todayISO(), time: '09:30', category: 'Teknik servis', amount: 1850, status: 'progress', note: 'Basınç sürekli düşüyor. Genleşme tankı ve tesisat kaçağı kontrol edilecek.' },
  { id: 102, title: 'Klima yıllık bakım', customer: 'Selin Kaya', phone: '0541 330 72 11', date: todayISO(), time: '11:00', category: 'Bakım', amount: 1250, status: 'waiting', note: 'İki iç ünite temizliği ve gaz kontrolü.' },
  { id: 103, title: 'Bulaşık makinesi su almıyor', customer: 'Murat Demir', phone: '0507 221 08 42', date: todayISO(), time: '14:30', category: 'Teknik servis', amount: 950, status: 'waiting', note: 'Giriş valfi veya kart arızası olabilir.' },
  { id: 104, title: 'Yeni petek montajı', customer: 'Derya Akın', phone: '0536 740 19 55', date: offsetISO(1), time: '10:00', category: 'Montaj', amount: 4200, status: 'waiting', note: 'Salon için 140 cm panel radyatör montajı.' },
  { id: 105, title: 'Kombi anakart değişimi', customer: 'Emre Koç', phone: '0553 614 36 29', date: offsetISO(-1), time: '16:00', category: 'Teknik servis', amount: 3600, status: 'done', note: 'Parça değişti, ödeme alındı.' },
  { id: 106, title: 'Tesisat kaçak tespiti', customer: 'Burcu Şen', phone: '0539 160 48 72', date: offsetISO(2), time: '13:30', category: 'Keşif', amount: 750, status: 'waiting', note: 'Alt kata nem geçişi var. Termal kamera ile kontrol.' },
  { id: 107, title: 'Kazan genel bakımı', customer: 'Güneş Apartmanı', phone: '0216 338 82 90', date: offsetISO(-3), time: '12:00', category: 'Bakım', amount: 6800, status: 'done', note: 'Yıllık bakım tamamlandı.' }
];

const state = loadState();
let currentView = 'dashboard';
let deferredInstallPrompt = null;
let editingJobId = null;
let jobViewFilter = 'all';

const pageContent = document.querySelector('#pageContent');
const pageTitle = document.querySelector('#pageTitle');
const jobModal = document.querySelector('#jobModal');
const detailModal = document.querySelector('#detailModal');
const jobForm = document.querySelector('#jobForm');
const sidebar = document.querySelector('#sidebar');
const onboardingModal = document.querySelector('#onboardingModal');
const settingsModal = document.querySelector('#settingsModal');
const onboardingForm = document.querySelector('#onboardingForm');
const settingsForm = document.querySelector('#settingsForm');

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function offsetISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.jobs)) {
      return {
        version: APP_VERSION,
        jobs: saved.jobs,
        setupComplete: Boolean(saved.setupComplete),
        profile: {
          ownerName: saved.profile?.ownerName || 'Nurettin',
          businessName: saved.profile?.businessName || saved.business || 'Nova Teknik',
          phone: saved.profile?.phone || '',
          industry: saved.profile?.industry || 'Teknik servis'
        }
      };
    }
  } catch (error) {
    console.warn('Kayıtlı veriler okunamadı.', error);
  }
  return {
    version: APP_VERSION,
    jobs: [...seedJobs],
    setupComplete: false,
    profile: { ownerName: '', businessName: '', phone: '', industry: 'Teknik servis' }
  };
}

function saveState() {
  state.version = APP_VERSION;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function replaceState(nextState) {
  Object.keys(state).forEach(key => delete state[key]);
  Object.assign(state, nextState);
  saveState();
}

function money(value) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value || 0);
}

function shortDate(value) {
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
}

function longDate(value) {
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function monthKeyForOffset(offset = 0) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function recentMonths(count = 6) {
  return Array.from({ length: count }, (_, index) => {
    const offset = index - (count - 1);
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() + offset);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: new Intl.DateTimeFormat('tr-TR', { month: 'short' }).format(date).replace('.', '')
    };
  });
}

function percentChange(current, previous) {
  if (previous === 0) return current === 0 ? '0%' : '+100%';
  const value = Math.round(((current - previous) / previous) * 100);
  return `${value > 0 ? '+' : ''}${value}%`;
}

function signedDifference(current, previous) {
  const value = current - previous;
  return `${value > 0 ? '+' : ''}${value}`;
}

function newCustomerCount(monthKey) {
  const firstJobByCustomer = new Map();
  state.jobs.forEach(job => {
    const previous = firstJobByCustomer.get(job.customer);
    if (!previous || job.date < previous) firstJobByCustomer.set(job.customer, job.date);
  });
  return [...firstJobByCustomer.values()].filter(date => date.startsWith(monthKey)).length;
}

function statusLabel(status) {
  return { waiting: 'Bekliyor', progress: 'Devam ediyor', done: 'Tamamlandı', cancelled: 'İptal' }[status] || 'Bekliyor';
}

function initials(name) {
  return name.split(' ').slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function updateHeader() {
  const now = new Date();
  document.querySelector('#todayLabel').textContent = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const titles = {
    dashboard: greeting(),
    jobs: 'İşleri yönet.',
    customers: 'Müşteri hafızan.',
    calendar: 'Takvimi planla.',
    finance: 'Paranı takip et.'
  };
  pageTitle.textContent = titles[currentView];
  document.querySelector('#openJobCount').textContent = state.jobs.filter(job => ['waiting', 'progress'].includes(job.status)).length;
  updateProfileUI();
}

function greeting() {
  const hour = new Date().getHours();
  const name = state.profile?.ownerName?.trim() || 'usta';
  if (hour < 12) return `Günaydın, ${name}.`;
  if (hour < 18) return `İyi günler, ${name}.`;
  return `İyi akşamlar, ${name}.`;
}

function updateProfileUI() {
  const businessName = state.profile?.businessName || 'İşletmem';
  const ownerName = state.profile?.ownerName || businessName;
  document.querySelector('#profileBusiness').textContent = businessName;
  document.querySelector('#profileRole').textContent = state.profile?.industry || 'Yönetici hesabı';
  document.querySelector('#profileAvatar').textContent = initials(ownerName || 'İş');
}

function setView(view) {
  currentView = view;
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  updateHeader();
  render();
  sidebar.classList.remove('open');
  window.location.hash = view;
}

function render() {
  const renderers = { dashboard: renderDashboard, jobs: renderJobs, customers: renderCustomers, calendar: renderCalendar, finance: renderFinance };
  pageContent.innerHTML = renderers[currentView]();
  bindViewActions();
}

function renderDashboard() {
  const todayJobs = state.jobs.filter(job => job.date === todayISO() && job.status !== 'cancelled').sort((a, b) => a.time.localeCompare(b.time));
  const yesterdayJobs = state.jobs.filter(job => job.date === offsetISO(-1) && job.status !== 'cancelled');
  const currentMonth = monthKeyForOffset(0);
  const previousMonth = monthKeyForOffset(-1);
  const completedRevenue = state.jobs.filter(job => job.status === 'done' && job.date.startsWith(currentMonth)).reduce((sum, job) => sum + Number(job.amount), 0);
  const previousRevenue = state.jobs.filter(job => job.status === 'done' && job.date.startsWith(previousMonth)).reduce((sum, job) => sum + Number(job.amount), 0);
  const pendingJobs = state.jobs.filter(job => ['waiting', 'progress'].includes(job.status));
  const pendingRevenue = pendingJobs.reduce((sum, job) => sum + Number(job.amount), 0);
  const customers = new Set(state.jobs.map(job => job.customer)).size;
  return `
    <div class="dashboard-grid">
      <div class="left-column">
        <div class="metric-grid">
          ${metricCard('Bugünkü işler', todayJobs.length, 'Düne göre', signedDifference(todayJobs.length, yesterdayJobs.length), '□', true)}
          ${metricCard('Aylık kazanç', money(completedRevenue), 'Geçen aya göre', percentChange(completedRevenue, previousRevenue), '₺')}
          ${metricCard('Bekleyen tutar', money(pendingRevenue), 'Açık iş sayısı', pendingJobs.length, '↗')}
          ${metricCard('Toplam müşteri', customers, 'Bu ay yeni', `+${newCustomerCount(currentMonth)}`, '○')}
        </div>

        <section class="panel">
          <div class="panel-header">
            <div class="panel-title"><h2>Bugünün programı</h2><p>${todayJobs.length} iş planlandı · ${todayJobs.filter(j => j.status === 'done').length} tamamlandı</p></div>
            <button class="panel-link" data-go="calendar">Takvimi aç →</button>
          </div>
          <div class="job-list">
            ${todayJobs.length ? todayJobs.map(jobRow).join('') : emptyState('Bugün için planlanmış iş yok.', 'Yeni iş ekleyerek programı oluşturmaya başla.')}
          </div>
        </section>
      </div>

      <aside class="right-column">
        <section class="ai-card">
          <div class="ai-head"><span class="ai-orb">ai</span><div><strong>İşlik Asistan</strong><small>Talebi yaz, gerisini birlikte hazırlayalım</small></div></div>
          <h3>Müşteri mesajını hızlıca iş kaydına dönüştür.</h3>
          <p>Örneğin: “Ayşe Hanım yarın 14:00, kombi bakım, 1.200 TL” yazabilirsin.</p>
          <form class="ai-input" id="assistantForm"><input id="assistantInput" placeholder="Müşteri talebini buraya yaz..." autocomplete="off" /><button aria-label="Gönder">→</button></form>
          <div class="quick-prompts"><button data-prompt="Yarın için bakım işi oluştur">Bakım işi</button><button data-prompt="Bekleyen ödemeleri göster">Ödemeler</button><button data-prompt="Bugünkü programı özetle">Gün özeti</button></div>
        </section>

        <section class="panel week-panel">
          <div class="panel-header"><div class="panel-title"><h2>Bu hafta</h2><p>${weekRangeLabel()}</p></div></div>
          <div class="week-days">${renderWeekDays()}</div>
          <div class="mini-summary"><div><span>Planlanan</span><strong>${state.jobs.filter(j => inCurrentWeek(j.date)).length} iş</strong></div><div><span>Tahmini ciro</span><strong>${money(state.jobs.filter(j => inCurrentWeek(j.date)).reduce((s,j) => s + Number(j.amount), 0))}</strong></div></div>
        </section>
      </aside>
    </div>`;
}

function metricCard(label, value, foot, trend, symbol, dark = false) {
  const trendClass = String(trend).startsWith('-') ? 'trend-down' : 'trend-up';
  return `<article class="metric-card ${dark ? 'dark' : ''}"><div class="metric-top"><span>${label}</span><span class="metric-symbol">${symbol}</span></div><div class="metric-value">${value}</div><div class="metric-foot"><span class="${trendClass}">${trend}</span><span>${foot}</span></div><svg class="spark" viewBox="0 0 80 30" fill="none"><path d="M2 26C12 24 13 15 23 18S34 24 43 14 54 20 61 10 69 4 78 5" stroke="currentColor" stroke-width="2"/><path d="M2 26C12 24 13 15 23 18S34 24 43 14 54 20 61 10 69 4 78 5V30H2Z" fill="currentColor" opacity=".15"/></svg></article>`;
}

function jobRow(job) {
  return `<article class="job-row" data-job-id="${job.id}"><div class="time-cell"><strong>${job.time}</strong><small>${job.date === todayISO() ? 'Bugün' : shortDate(job.date)}</small></div><div class="job-main"><strong>${escapeHTML(job.title)}</strong><small>${escapeHTML(job.customer)} · ${escapeHTML(job.category)}</small></div><div class="job-meta"><strong>${money(job.amount)}</strong><small>Tahmini tutar</small></div><span class="status ${job.status}">${statusLabel(job.status)}</span><span class="row-arrow">›</span></article>`;
}

function renderJobs() {
  const columns = [
    { status: 'waiting', label: 'Bekleyen işler' },
    { status: 'progress', label: 'Devam edenler' },
    { status: 'done', label: 'Tamamlananlar' },
    { status: 'cancelled', label: 'İptal / Arşiv' }
  ];
  const filterLabel = { all: 'Tüm işler', today: 'Bugün', overdue: 'Gecikenler' }[jobViewFilter];
  return `<div class="section-toolbar"><h2>İş panosu</h2><div class="toolbar-group"><button class="filter-button ${jobViewFilter === 'all' ? 'active' : ''}" data-job-filter="all">Tümü</button><button class="filter-button ${jobViewFilter === 'today' ? 'active' : ''}" data-job-filter="today">Bugün</button><button class="filter-button ${jobViewFilter === 'overdue' ? 'active' : ''}" data-job-filter="overdue">Geciken</button><button class="primary-button" data-new-job>＋ Yeni iş</button></div></div><p class="board-hint">${filterLabel} gösteriliyor. Kartlara tıklayarak düzenleme, teklif ve WhatsApp aksiyonlarına ulaşabilirsin.</p><div class="board">${columns.map(column => {
    const jobs = filterJobs(state.jobs).filter(job => job.status === column.status);
    return `<section class="board-column"><div class="board-title">${column.label}<span>${jobs.length}</span></div>${jobs.length ? jobs.map(jobCard).join('') : '<div class="empty-state"><div><strong>Burada iş yok.</strong><span>Yeni kayıtlar burada görünecek.</span></div></div>'}</section>`;
  }).join('')}</div>`;
}

function filterJobs(jobs) {
  if (jobViewFilter === 'today') return jobs.filter(job => job.date === todayISO());
  if (jobViewFilter === 'overdue') return jobs.filter(job => job.date < todayISO() && !['done', 'cancelled'].includes(job.status));
  return jobs;
}

function jobCard(job) {
  return `<article class="job-card" data-job-id="${job.id}"><div class="job-card-top"><span>#${job.id}</span><span>${shortDate(job.date)} · ${job.time}</span></div><h3>${escapeHTML(job.title)}</h3><p>${escapeHTML(job.customer)} · ${escapeHTML(job.category)}</p><div class="job-card-foot"><span class="mini-avatar">${initials(job.customer)}</span><strong>${money(job.amount)}</strong></div></article>`;
}

function renderCustomers() {
  const map = new Map();
  state.jobs.forEach(job => {
    const current = map.get(job.customer) || { name: job.customer, phone: job.phone, count: 0, total: 0, lastDate: job.date };
    current.count += 1;
    current.total += job.status === 'done' ? Number(job.amount) : 0;
    if (job.date > current.lastDate) current.lastDate = job.date;
    map.set(job.customer, current);
  });
  const customers = [...map.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  return `<div class="section-toolbar"><h2>Müşteriler</h2><div class="toolbar-group"><button class="filter-button">${customers.length} kayıt</button><button class="primary-button" data-new-job>＋ Müşteriden iş oluştur</button></div></div>${customers.length ? `<div class="customer-grid">${customers.map(customer => `<article class="customer-card"><div class="customer-head"><span class="customer-avatar">${initials(customer.name)}</span><div><strong>${escapeHTML(customer.name)}</strong><small>${escapeHTML(customer.phone || 'Telefon eklenmedi')}</small></div></div><div class="customer-stats"><div><span>Toplam iş</span><strong>${customer.count}</strong></div><div><span>Toplam ödeme</span><strong>${money(customer.total)}</strong></div></div></article>`).join('')}</div>` : `<section class="panel">${emptyState('Henüz müşterin yok.', 'İlk işi oluşturduğunda müşteri kaydı otomatik oluşur.')}</section>`}`;
}

function renderCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = startDay - 1; i >= 0; i--) cells.push({ day: prevDays - i, other: true, date: '' });
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ day, date, today: date === todayISO(), hasJob: state.jobs.some(job => job.date === date) });
  }
  while (cells.length % 7) cells.push({ day: cells.length - daysInMonth - startDay + 1, other: true, date: '' });
  const upcoming = state.jobs.filter(job => job.date >= todayISO() && job.status !== 'cancelled').sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).slice(0,5);
  const monthName = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(now);
  return `<div class="section-toolbar"><h2>Takvim</h2><button class="primary-button" data-new-job>＋ Randevu ekle</button></div><div class="calendar-layout"><section class="panel month-card"><div class="month-head"><h3>${monthName}</h3><div class="toolbar-group"><button class="filter-button">‹</button><button class="filter-button">Bugün</button><button class="filter-button">›</button></div></div><div class="calendar-grid">${['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(d => `<span>${d}</span>`).join('')}${cells.map(cell => `<div class="calendar-date ${cell.other ? 'other' : ''} ${cell.today ? 'today' : ''}">${cell.day}${cell.hasJob ? '<i class="calendar-dot"></i>' : ''}</div>`).join('')}</div></section><section class="panel agenda-panel"><div class="panel-header"><div class="panel-title"><h2>Yaklaşan işler</h2><p>Sıradaki 5 randevu</p></div></div>${upcoming.length ? upcoming.map(job => `<article class="agenda-item" data-job-id="${job.id}"><i class="agenda-line"></i><div><strong>${escapeHTML(job.title)}</strong><small>${shortDate(job.date)} · ${job.time} · ${escapeHTML(job.customer)}</small></div></article>`).join('') : emptyState('Yaklaşan iş yok.', 'Yeni randevu eklediğinde burada görünür.')}</section></div>`;
}

function renderFinance() {
  const completedJobs = state.jobs.filter(job => job.status === 'done');
  const openJobs = state.jobs.filter(job => ['waiting', 'progress'].includes(job.status));
  const activeJobs = state.jobs.filter(job => job.status !== 'cancelled');
  const months = recentMonths(6).map(month => ({
    ...month,
    value: completedJobs.filter(job => job.date.startsWith(month.key)).reduce((sum, job) => sum + Number(job.amount), 0)
  }));
  const currentMonthPaid = months.at(-1)?.value || 0;
  const previousMonthPaid = months.at(-2)?.value || 0;
  const allPaid = completedJobs.reduce((sum, job) => sum + Number(job.amount), 0);
  const pending = openJobs.reduce((sum, job) => sum + Number(job.amount), 0);
  const average = activeJobs.length ? activeJobs.reduce((sum, job) => sum + Number(job.amount), 0) / activeJobs.length : 0;
  const collectionRate = Math.round((allPaid / (allPaid + pending || 1)) * 100);
  const max = Math.max(...months.map(month => month.value), 1);
  const recentPayments = [...completedJobs].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)).slice(0, 8);
  return `<div class="section-toolbar"><h2>Finans özeti</h2><div class="toolbar-group"><button class="filter-button active">Son 6 ay</button><button class="secondary-button" id="exportButton">Dışa aktar</button></div></div><div class="metric-grid" style="margin-bottom:20px">${metricCard('Bu ay tahsil edilen', money(currentMonthPaid), 'Geçen aya göre', percentChange(currentMonthPaid, previousMonthPaid), '₺', true)}${metricCard('Bekleyen ödeme', money(pending), 'Açık iş sayısı', openJobs.length, '↗')}${metricCard('Ortalama iş', money(average), 'İptal hariç işler', activeJobs.length, '÷')}${metricCard('Tahsilat oranı', `%${collectionRate}`, 'Toplam iş hacmi', completedJobs.length, '○')}</div><div class="finance-layout"><section class="panel chart-panel"><div class="chart-head"><div><h3>Aylık kazanç</h3><p class="panel-title" style="color:var(--muted);font-size:9px">Tamamlanan işlerden elde edilen gerçek gelir</p></div><strong>${money(currentMonthPaid)}</strong></div><div class="bar-chart">${months.map((month,index) => `<div class="bar-wrap"><div class="bar ${index === months.length-1 ? 'current' : ''}" style="height:${month.value ? Math.max(12,(month.value/max)*100) : 3}%" title="${month.label}: ${money(month.value)}"></div><span>${month.label}</span></div>`).join('')}</div></section><section class="panel"><div class="panel-header"><div class="panel-title"><h2>Son hareketler</h2><p>Son 8 tamamlanan iş</p></div></div><div class="finance-list">${recentPayments.length ? recentPayments.map(job=>`<div class="finance-row"><span>${escapeHTML(job.customer)}<br><small style="color:var(--muted)">${shortDate(job.date)}</small></span><strong>+${money(job.amount)}</strong></div>`).join('') : `<div class="empty-state"><div><strong>Henüz tahsilat yok.</strong><span>Bir işi tamamladığında burada görünür.</span></div></div>`}</div></section></div>`;
}

function renderWeekDays() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const name = new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(date).replace('.', '');
    return `<div class="day ${iso === todayISO() ? 'today' : ''} ${state.jobs.some(j => j.date === iso) ? 'has-job' : ''}"><span>${name}</span><strong>${date.getDate()}</strong></div>`;
  }).join('');
}

function inCurrentWeek(iso) {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now); monday.setHours(0,0,0,0); monday.setDate(now.getDate() - day);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999);
  const date = new Date(`${iso}T12:00:00`);
  return date >= monday && date <= sunday;
}

function weekRangeLabel() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now); monday.setDate(now.getDate() - day);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return `${new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short'}).format(monday)} – ${new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short'}).format(sunday)}`;
}

function emptyState(title, text) {
  return `<div class="empty-state"><div><strong>${title}</strong><span>${text}</span></div></div>`;
}

function bindViewActions() {
  pageContent.querySelectorAll('[data-job-id]').forEach(element => element.addEventListener('click', () => openDetail(Number(element.dataset.jobId))));
  pageContent.querySelectorAll('[data-new-job]').forEach(button => button.addEventListener('click', openJobModal));
  pageContent.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => setView(button.dataset.go)));
  pageContent.querySelectorAll('[data-job-filter]').forEach(button => button.addEventListener('click', () => {
    jobViewFilter = button.dataset.jobFilter;
    render();
  }));
  pageContent.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
    const input = document.querySelector('#assistantInput');
    input.value = button.dataset.prompt;
    input.focus();
  }));
  document.querySelector('#assistantForm')?.addEventListener('submit', handleAssistant);
  document.querySelector('#exportButton')?.addEventListener('click', exportFinance);
}

function openJobModal(prefill = {}) {
  editingJobId = prefill.id || null;
  jobForm.reset();
  jobModal.querySelector('.eyebrow').textContent = editingJobId ? 'İŞİ DÜZENLE' : 'YENİ KAYIT';
  document.querySelector('#jobModalTitle').textContent = editingJobId ? 'İşi düzenle' : 'Yeni iş oluştur';
  jobForm.querySelector('button[type="submit"]').textContent = editingJobId ? 'Değişiklikleri kaydet' : 'İşi oluştur';
  jobForm.elements.date.value = prefill.date || todayISO();
  jobForm.elements.time.value = prefill.time || '09:00';
  Object.entries(prefill).forEach(([key, value]) => { if (jobForm.elements[key]) jobForm.elements[key].value = value; });
  jobModal.hidden = false;
  setTimeout(() => jobForm.elements.title.focus(), 50);
}

function closeJobModal() {
  editingJobId = null;
  jobModal.hidden = true;
}

function handleJobSubmit(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(jobForm));
  if (editingJobId) {
    const job = state.jobs.find(item => item.id === editingJobId);
    if (!job) return;
    Object.assign(job, { ...data, amount: Number(data.amount) || 0 });
    showToast(`${job.title} güncellendi.`);
  } else {
    const job = { ...data, id: Date.now(), amount: Number(data.amount) || 0, status: 'waiting' };
    state.jobs.unshift(job);
    showToast(`${job.customer} için yeni iş oluşturuldu.`);
  }
  saveState();
  closeJobModal();
  updateHeader();
  render();
}

function openDetail(id) {
  const job = state.jobs.find(item => item.id === id);
  if (!job) return;
  document.querySelector('#detailModalTitle').textContent = job.title;
  document.querySelector('#detailContent').innerHTML = `<div class="detail-grid"><div class="detail-box"><span>Müşteri</span><strong>${escapeHTML(job.customer)}</strong></div><div class="detail-box"><span>Telefon</span><strong>${escapeHTML(job.phone || '-')}</strong></div><div class="detail-box"><span>Randevu</span><strong>${longDate(job.date)} · ${job.time}</strong></div><div class="detail-box"><span>Tutar</span><strong>${money(job.amount)}</strong></div><div class="detail-box"><span>İş türü</span><strong>${escapeHTML(job.category)}</strong></div><div class="detail-box"><span>Durum</span><strong>${statusLabel(job.status)}</strong></div></div><div class="detail-note">${escapeHTML(job.note || 'Bu iş için not eklenmemiş.')}</div><div class="quote-preview"><span>Hazır teklif mesajı</span><p>${escapeHTML(buildQuoteMessage(job))}</p></div><div class="detail-actions"><button class="primary-button" data-status="progress">İşe başla</button><button class="secondary-button" data-status="done">Tamamlandı</button><button class="secondary-button" data-status="cancelled">İptal et</button><button class="secondary-button" data-copy-quote>Teklifi kopyala</button><button class="secondary-button" data-whatsapp>WhatsApp taslağı</button><button class="secondary-button" data-edit-job>Düzenle</button><button class="danger-button" data-delete-job>Sil</button></div>`;
  document.querySelectorAll('#detailContent [data-status]').forEach(button => button.addEventListener('click', () => updateJobStatus(id, button.dataset.status)));
  document.querySelector('#detailContent [data-copy-quote]').addEventListener('click', () => copyQuote(job));
  document.querySelector('#detailContent [data-whatsapp]').addEventListener('click', () => openWhatsAppDraft(job));
  document.querySelector('#detailContent [data-edit-job]').addEventListener('click', () => {
    detailModal.hidden = true;
    openJobModal(job);
  });
  document.querySelector('#detailContent [data-delete-job]').addEventListener('click', () => deleteJob(id));
  detailModal.hidden = false;
}

function updateJobStatus(id, status) {
  const job = state.jobs.find(item => item.id === id);
  if (!job) return;
  job.status = status;
  saveState();
  detailModal.hidden = true;
  updateHeader();
  render();
  showToast(`İş durumu “${statusLabel(status)}” olarak güncellendi.`);
}

function buildQuoteMessage(job) {
  const businessName = state.profile?.businessName || 'İşlik';
  const date = `${longDate(job.date)} ${job.time}`;
  return `Merhaba ${job.customer}, ${businessName} olarak “${job.title}” işi için randevunuz ${date}. Tahmini tutar: ${money(job.amount)}. Not: ${job.note || 'Detaylar servis sırasında netleşecektir.'}`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

async function copyQuote(job) {
  try {
    await copyText(buildQuoteMessage(job));
    showToast('Teklif mesajı kopyalandı.');
  } catch {
    showToast('Kopyalama başarısız oldu. Metni detay ekranından seçebilirsin.');
  }
}

function normalizePhone(phone = '') {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('90')) return digits;
  if (digits.startsWith('0')) return `9${digits}`;
  if (digits.length === 10) return `90${digits}`;
  return digits;
}

function openWhatsAppDraft(job) {
  const phone = normalizePhone(job.phone);
  const text = encodeURIComponent(buildQuoteMessage(job));
  if (!phone) {
    copyQuote(job);
    showToast('Telefon olmadığı için mesajı panoya kopyaladım.');
    return;
  }
  window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener');
  showToast('WhatsApp mesaj taslağı açıldı. Göndermeden önce kontrol et.');
}

function deleteJob(id) {
  const job = state.jobs.find(item => item.id === id);
  if (!job) return;
  if (!window.confirm(`“${job.title}” işi silinsin mi?`)) return;
  state.jobs = state.jobs.filter(item => item.id !== id);
  saveState();
  detailModal.hidden = true;
  updateHeader();
  render();
  showToast('İş kaydı silindi.');
}

function handleAssistant(event) {
  event.preventDefault();
  const input = document.querySelector('#assistantInput');
  const text = input.value.trim();
  if (!text) return;
  const lower = text.toLocaleLowerCase('tr-TR');
  if (lower.includes('ödeme')) {
    setView('finance');
    showToast('Bekleyen ödemeleri finans ekranında açtım.');
    return;
  }
  if (lower.includes('özet')) {
    const count = state.jobs.filter(j => j.date === todayISO()).length;
    showToast(`Bugün ${count} iş var. Programın genel görünümü hazır.`);
    return;
  }
  const amountMatch = text.match(/([\d.]+)\s*(?:tl|₺)/i);
  const timeMatch = text.match(/(?:saat\s*)?(\d{1,2}[.:]\d{2})/i);
  const nameMatch = text.match(/^([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)?)/);
  openJobModal({
    title: lower.includes('bakım') ? 'Periyodik bakım' : lower.includes('kombi') ? 'Kombi servis talebi' : 'Yeni servis talebi',
    customer: nameMatch?.[1] || '',
    amount: amountMatch ? amountMatch[1].replace('.', '') : '',
    time: timeMatch ? timeMatch[1].replace('.', ':') : '09:00',
    date: lower.includes('yarın') ? offsetISO(1) : todayISO(),
    note: text
  });
  showToast('Talebi okudum, iş taslağını hazırladım.');
}

function showToast(message) {
  const region = document.querySelector('#toastRegion');
  while (region.children.length >= 3) region.firstElementChild.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  region.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function openCommandPanel(query = '') {
  const panel = document.querySelector('#commandPanel');
  panel.hidden = false;
  const input = document.querySelector('#commandInput');
  input.value = query;
  renderCommandResults(query);
  setTimeout(() => input.focus(), 20);
}

function renderCommandResults(query) {
  const normalized = query.toLocaleLowerCase('tr-TR');
  const results = state.jobs.filter(job => !normalized || `${job.title} ${job.customer} ${job.phone}`.toLocaleLowerCase('tr-TR').includes(normalized)).slice(0, 7);
  document.querySelector('#commandResults').innerHTML = results.length ? results.map(job => `<button class="command-result" data-command-id="${job.id}"><span><strong>${escapeHTML(job.title)}</strong><small>${escapeHTML(job.customer)} · ${shortDate(job.date)}</small></span><span>${money(job.amount)}</span></button>`).join('') : emptyState('Sonuç bulunamadı.', 'Farklı bir kelime deneyebilirsin.');
  document.querySelectorAll('[data-command-id]').forEach(button => button.addEventListener('click', () => {
    document.querySelector('#commandPanel').hidden = true;
    openDetail(Number(button.dataset.commandId));
  }));
}

function exportFinance() {
  const rows = [['Müşteri','İş','Tarih','Durum','Tutar'], ...state.jobs.map(job => [job.customer, job.title, job.date, statusLabel(job.status), job.amount])];
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(';')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `islik-finans-${todayISO()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('Finans dökümü CSV olarak hazırlandı.');
}

function openOnboarding() {
  const profile = state.profile || {};
  onboardingForm.elements.ownerName.value = profile.ownerName || '';
  onboardingForm.elements.businessName.value = profile.businessName || '';
  onboardingForm.elements.phone.value = profile.phone || '';
  onboardingForm.elements.industry.value = profile.industry || 'Teknik servis';
  onboardingForm.elements.keepDemo.checked = state.jobs.length > 0;
  onboardingModal.hidden = false;
  setTimeout(() => onboardingForm.elements.ownerName.focus(), 50);
}

function handleOnboarding(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(onboardingForm));
  state.profile = {
    ownerName: data.ownerName.trim(),
    businessName: data.businessName.trim(),
    phone: data.phone.trim(),
    industry: data.industry
  };
  if (!data.keepDemo) state.jobs = [];
  state.setupComplete = true;
  saveState();
  onboardingModal.hidden = true;
  updateHeader();
  render();
  showToast(`${state.profile.businessName} kullanıma hazır.`);
}

function openSettings() {
  const profile = state.profile || {};
  settingsForm.elements.ownerName.value = profile.ownerName || '';
  settingsForm.elements.businessName.value = profile.businessName || '';
  settingsForm.elements.phone.value = profile.phone || '';
  settingsForm.elements.industry.value = profile.industry || 'Teknik servis';
  updateInstallUI();
  settingsModal.hidden = false;
}

function closeSettings() {
  settingsModal.hidden = true;
}

function handleSettingsSave(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(settingsForm));
  state.profile = {
    ownerName: data.ownerName.trim(),
    businessName: data.businessName.trim(),
    phone: data.phone.trim(),
    industry: data.industry
  };
  saveState();
  updateHeader();
  showToast('İşletme bilgileri kaydedildi.');
}

function downloadBackup() {
  const payload = {
    product: 'İşlik',
    exportedAt: new Date().toISOString(),
    data: state
  };
  downloadFile(
    `islik-yedek-${todayISO()}.json`,
    JSON.stringify(payload, null, 2),
    'application/json'
  );
  showToast('Yedek dosyası hazırlandı.');
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function restoreBackup(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const restored = parsed.data || parsed;
    if (!restored || !Array.isArray(restored.jobs) || !restored.profile?.businessName) {
      throw new Error('Geçersiz İşlik yedeği');
    }
    replaceState({
      version: APP_VERSION,
      jobs: restored.jobs,
      setupComplete: true,
      profile: {
        ownerName: restored.profile.ownerName || '',
        businessName: restored.profile.businessName,
        phone: restored.profile.phone || '',
        industry: restored.profile.industry || 'Diğer'
      }
    });
    closeSettings();
    updateHeader();
    render();
    showToast('Yedek başarıyla geri yüklendi.');
  } catch (error) {
    showToast('Bu dosya geçerli bir İşlik yedeği değil.');
  }
}

function resetAllJobs() {
  if (!window.confirm('Tüm iş kayıtları kalıcı olarak silinsin mi? İşletme profilin korunacak.')) return;
  state.jobs = [];
  saveState();
  closeSettings();
  updateHeader();
  render();
  showToast('Tüm iş kayıtları silindi.');
}

function updateInstallUI() {
  const button = document.querySelector('#installButton');
  const status = document.querySelector('#installStatus');
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  if (standalone) {
    button.disabled = true;
    button.textContent = 'Yüklendi';
    status.textContent = 'İşlik bu cihazda uygulama olarak yüklü.';
  } else if (deferredInstallPrompt) {
    button.disabled = false;
    button.textContent = 'Uygulamayı yükle';
    status.textContent = 'İşlik bu cihaza uygulama olarak yüklenmeye hazır.';
  } else {
    button.disabled = true;
    button.textContent = 'Henüz hazır değil';
    status.textContent = location.protocol === 'file:'
      ? 'Yükleme için uygulamayı yerel sunucu veya web adresi üzerinden aç.'
      : 'Tarayıcı yükleme seçeneğini kullanılabilir olduğunda burada göstereceğiz.';
  }
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  updateInstallUI();
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelector('#newJobButton').addEventListener('click', () => openJobModal());
document.querySelector('#mobileNewJob').addEventListener('click', () => openJobModal());
document.querySelector('#mobileMenu').addEventListener('click', () => sidebar.classList.toggle('open'));
document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', closeJobModal));
document.querySelectorAll('[data-close-detail]').forEach(button => button.addEventListener('click', () => { detailModal.hidden = true; }));
jobForm.addEventListener('submit', handleJobSubmit);
jobModal.addEventListener('click', event => { if (event.target === jobModal) closeJobModal(); });
detailModal.addEventListener('click', event => { if (event.target === detailModal) detailModal.hidden = true; });
document.querySelector('#globalSearch').addEventListener('focus', event => { event.target.blur(); openCommandPanel(); });
document.querySelector('#commandInput').addEventListener('input', event => renderCommandResults(event.target.value));
document.querySelector('#notificationButton').addEventListener('click', () => showToast('Yeni bildirimin yok. Her şey yolunda.'));
document.querySelector('#proInfoButton').addEventListener('click', () => showToast('WhatsApp ve otomatik hatırlatma özellikleri sonraki sürümde.'));
document.querySelector('#profileButton').addEventListener('click', openSettings);
document.querySelectorAll('[data-close-settings]').forEach(button => button.addEventListener('click', closeSettings));
onboardingForm.addEventListener('submit', handleOnboarding);
settingsForm.addEventListener('submit', handleSettingsSave);
document.querySelector('#backupButton').addEventListener('click', downloadBackup);
document.querySelector('#restoreButton').addEventListener('click', () => document.querySelector('#restoreInput').click());
document.querySelector('#restoreInput').addEventListener('change', event => {
  const [file] = event.target.files;
  if (file) restoreBackup(file);
  event.target.value = '';
});
document.querySelector('#resetDataButton').addEventListener('click', resetAllJobs);
document.querySelector('#installButton').addEventListener('click', installApp);
settingsModal.addEventListener('click', event => { if (event.target === settingsModal) closeSettings(); });

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallUI();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updateInstallUI();
  showToast('İşlik bu cihaza yüklendi.');
});

document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openCommandPanel();
  }
  if (event.key === 'Escape') {
    jobModal.hidden = true;
    detailModal.hidden = true;
    if (state.setupComplete) onboardingModal.hidden = true;
    settingsModal.hidden = true;
    document.querySelector('#commandPanel').hidden = true;
    sidebar.classList.remove('open');
  }
});

document.addEventListener('click', event => {
  const commandPanel = document.querySelector('#commandPanel');
  if (!commandPanel.hidden && !commandPanel.contains(event.target) && !event.target.closest('.search-box')) commandPanel.hidden = true;
});

const hashView = window.location.hash.replace('#', '');
if (['dashboard','jobs','customers','calendar','finance'].includes(hashView)) currentView = hashView;
updateHeader();
render();
if (!state.setupComplete) openOnboarding();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
