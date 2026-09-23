'use strict';

const API_BASE = String(window.PRICE_RADAR_API_URL || '').replace(/\/+$/, '');
const $ = selector => document.querySelector(selector);
const fa = value => Number(value || 0).toLocaleString('fa-IR');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let token = sessionStorage.getItem('price-radar-session') || '';
let results = [];
let watches = [];
let view = 'search';
let searchTimer;

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove('show'), 3200);
}
function apiUrl(path) { return `${API_BASE}/api${path}`; }
async function api(path, options = {}) {
  if (!API_BASE) throw new Error('نشانی بک‌اند هنوز تنظیم نشده است.');
  const headers = {'Content-Type':'application/json', ...(options.headers || {})};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(apiUrl(path), {...options,headers});
  let body = {};
  try { body = await response.json(); } catch {}
  if (response.status === 401 && path !== '/auth/login') {
    signOut(false);
    throw new Error('نشست ورود تمام شده؛ دوباره وارد شو.');
  }
  if (!response.ok) throw new Error(body.error || `خطای سرور (${response.status})`);
  return body;
}
function setConnection(connected, message) {
  $('#connectionBadge').textContent = connected ? '● آمادهٔ دریافت زنده' : '● بک‌اند وصل نیست';
  $('#connectionBadge').classList.toggle('disconnected', !connected);
  $('#connectionNotice').innerHTML = `<span>ⓘ</span><span><b>${connected?'اتصال واقعی':'نیاز به راه‌اندازی بک‌اند'}:</b> ${escapeHtml(message)}</span>`;
  $('#connectionNotice').classList.toggle('offline', !connected);
}
function showAuth(message = '') {
  $('#authPanel').hidden = false;
  $('#searchPanel').hidden = true;
  $('#searchLayout').hidden = true;
  $('#watchView').hidden = true;
  $('#logout').hidden = true;
  $('#authMessage').textContent = message || (API_BASE ? 'برای دیدن قیمت‌های زنده و دیده‌بان‌های سرور وارد شو.' : 'بک‌اند Cloudflare هنوز به این صفحه وصل نشده؛ بدون آن قیمت واقعی نمایش داده نمی‌شود.');
}
function signOut(showMessage = true) {
  token = '';
  sessionStorage.removeItem('price-radar-session');
  watches = [];
  updateCounts();
  showAuth(showMessage ? 'از حساب خارج شدی.' : 'نشست ورود معتبر نیست؛ دوباره وارد شو.');
}
function currentPlatform() {
  const dk = $('#filterDk').checked && $('#filterNew').checked, dv = $('#filterDv').checked && $('#filterUsed').checked;
  if (dk && dv) return 'both';
  if (dk) return 'digikala';
  if (dv) return 'divar';
  return '';
}
function queryOptions() {
  const cap = Number($('#maxPrice').value);
  return {
    query: $('#query').value.trim(),
    city: $('#city').value,
    category: $('#category').value,
    platform: currentPlatform(),
    max_price: cap > 0 && cap < 10_000_000_000 ? cap : null,
    sort: $('#sort').value === 'relevant' ? 'cheap' : $('#sort').value,
  };
}
function getCardKey(item) { return `${item.platform}:${item.target_id}`; }
function isWatched(item) {
  const key=getCardKey(item);
  return watches.some(w=>w.kind==='product' && `${w.platform}:${w.target_id}`===key);
}
function iconFor(item) { return item.source==='dk' ? 'DK' : 'DV'; }
function renderCard(item) {
  const watched=isWatched(item);
  const area=item.source==='dk' ? (item.detail||'فروشگاه') : [item.city,item.detail].filter(Boolean).join('، ');
  return `<article class="card">
    <div class="art ${item.source==='dk'?'art-dk':'art-dv'}"><span class="art-tag">${escapeHtml(item.tag|| (item.source==='dk'?'نو':'آگهی'))}</span><span class="source-icon">${iconFor(item)}</span></div>
    <div class="info"><div class="source"><span class="badge ${item.source==='dk'?'dk':'dv'}">${item.source==='dk'?'دیجی‌کالا':'دیوار'}</span><span class="type">${escapeHtml(item.category||'')} · ${item.source==='dk'?'نو':'کارکرده'}</span></div>
      <a class="product-link" href="${escapeHtml(item.url||'#')}" target="_blank" rel="noopener noreferrer"><h3>${escapeHtml(item.title)}</h3></a>
      <div class="meta"><span>${escapeHtml(item.rating||'')}</span><span>${escapeHtml(area)}</span></div></div>
    <div class="pricebox"><span class="price-label">قیمت فعلی · تومان</span><strong class="price">${fa(item.price)}</strong>
      <button class="heart ${watched?'on':''}" data-watch="${escapeHtml(item.id)}" aria-label="${watched?'حذف از':'افزودن به'} دیده‌بان">${watched?'♥':'♡'}</button>
      <small class="trend neutral">${escapeHtml(item.trend||'تازه از منبع دریافت شد')}</small></div></article>`;
}
function renderResults() {
  const root=$('#cards');
  if (!token) { root.innerHTML='<div class="empty"><b>ابتدا وارد شو</b>برای مشاهدهٔ قیمت‌های واقعی ورود لازم است.</div>'; return; }
  const opts=queryOptions();
  $('#rangeValue').textContent=Number($('#maxPrice').value)>=10_000_000_000?'بدون سقف':`${fa(Math.round(Number($('#maxPrice').value)/1_000_000))} میلیون`;
  if (!opts.platform) { $('#resultCount').textContent=''; root.innerHTML='<div class="empty"><b>منبعی انتخاب نشده</b>حداقل یکی از دیجی‌کالا یا دیوار را فعال کن.</div>'; return; }
  const sort=opts.sort;
  const items=[...results].filter(x=>opts.platform==='both'||x.platform===opts.platform);
  items.sort((a,b)=>sort==='expensive'?b.price-a.price:a.price-b.price);
  $('#resultCount').textContent=`${fa(items.length)} نتیجهٔ زنده`;
  root.innerHTML=items.length?items.map(renderCard).join(''):'<div class="empty"><b>جست‌وجو کن</b>نتیجه‌های واقعی بعد از درخواست از منابع نمایش داده می‌شوند.</div>';
  const foot=$('#resultsFoot');
  if (window.lastChecked) foot.textContent=`آخرین دریافت: ${new Date(window.lastChecked).toLocaleString('fa-IR')} · منبع ممکن است محدودیت یا خطای موقت داشته باشد.`;
}
async function runSearch() {
  if (!token) { renderResults(); return; }
  const options=queryOptions();
  if (!options.query) { notify('عبارت جست‌وجو را وارد کن.'); return; }
  if (!options.platform) { renderResults(); return; }
  $('#cards').innerHTML='<div class="empty"><b>در حال دریافت قیمت واقعی…</b>درخواست به منابع قیمت ارسال شد.</div>';
  $('#resultCount').textContent='';
  try {
    const response=await api('/search',{method:'POST',body:JSON.stringify(options)});
    results=response.items||[];
    window.lastChecked=response.checked_at;
    renderResults();
    const warning=(response.warnings||[]).join(' · ');
    if(warning) notify(`یک منبع پاسخ نداد: ${warning.replaceAll('digikala','دیجی‌کالا').replaceAll('divar','دیوار')}`);
  } catch(error) {
    results=[];
    $('#cards').innerHTML=`<div class="empty"><b>دادهٔ زنده دریافت نشد</b>${escapeHtml(error.message)}<br><button class="primary retry-search" style="height:36px;margin-top:12px">تلاش دوباره</button></div>`;
    $('#cards .retry-search')?.addEventListener('click',runSearch);
    $('#resultCount').textContent='';
    $('#resultsFoot').textContent='در این صفحه نتیجهٔ نمونه نمایش داده نمی‌شود.';
    if(error.message.includes('نشانی بک‌اند')) setConnection(false,error.message);
  }
}
function scheduleSearch() { clearTimeout(searchTimer); searchTimer=setTimeout(runSearch,500); }
function updateCounts() {
  const n=watches.length;
  $('#watchCount').textContent=fa(n);
  $('#mobileWatchCount').textContent=fa(n);
}
async function loadWatches() {
  const response=await api('/watches');
  watches=response.items||[];
  updateCounts();
  if(view==='watches')renderWatches();
}
function renderWatches() {
  const root=$('#watchCards');
  $('#watchSubtitle').textContent=`${fa(watches.length)} مورد روی سرور`;
  if(!watches.length){root.innerHTML='<div class="empty"><b>دیده‌بانی ثبت نشده</b>از صفحهٔ جست‌وجو یک محصول یا عبارت را برای پایش قیمت اضافه کن.<br><button class="primary" id="emptySearch" style="height:35px;margin-top:12px">رفتن به جست‌وجو</button></div>';$('#emptySearch')?.addEventListener('click',()=>setView('search'));return;}
  root.innerHTML=watches.map(w=>`<article class="card"><div class="art art-watch"><span class="source-icon">⌕</span></div><div class="info"><div class="source"><span class="badge dv">${w.kind==='product'?'محصول':'جست‌وجو'}</span><span class="type">${escapeHtml(w.platform==='both'?'دیوار + دیجی‌کالا':w.platform==='digikala'?'دیجی‌کالا':'دیوار')} · ${escapeHtml(w.city||'')}</span></div><h3>${escapeHtml(w.title||w.query||'دیده‌بان')}</h3><div class="meta"><span>سقف: ${w.budget?`${fa(w.budget)} تومان`:'بدون سقف'}</span><span>آخرین بررسی: ${escapeHtml(w.last_checked?new Date(w.last_checked).toLocaleString('fa-IR'):'در صف بررسی')}</span></div></div><div class="pricebox"><span class="price-label">آخرین قیمت · تومان</span><strong class="price">${w.last_price?fa(w.last_price):'—'}</strong><button class="heart on remove-watch" data-id="${w.id}" aria-label="حذف دیده‌بان">حذف</button></div></article>`).join('');
  root.querySelectorAll('.remove-watch').forEach(button=>button.addEventListener('click',()=>removeWatch(button.dataset.id)));
}
async function removeWatch(id) {
  try { await api(`/watches/${encodeURIComponent(id)}`,{method:'DELETE'}); await loadWatches(); renderResults(); notify('دیده‌بان از سرور حذف شد.'); }
  catch(error){notify(error.message);}
}
async function addQueryWatch() {
  const options=queryOptions();
  if(!options.query){notify('اول عبارت جست‌وجو را بنویس.');$('#query').focus();return;}
  if(!options.platform){notify('یک منبع قیمت را انتخاب کن.');return;}
  try {
    await api('/watches',{method:'POST',body:JSON.stringify({kind:'query',platform:options.platform,query:options.query,city:options.city,category:options.category,budget:options.max_price,title:options.query})});
    await loadWatches(); notify('دیده‌بان روی سرور ذخیره شد؛ بررسی دوره‌ای فعال است.');
  } catch(error){notify(error.message);}
}
async function toggleProduct(id) {
  const item=results.find(x=>x.id===id); if(!item)return;
  const found=watches.find(w=>w.kind==='product'&&w.platform===item.platform&&String(w.target_id)===String(item.target_id));
  if(found){await removeWatch(found.id);return;}
  try {
    await api('/watches',{method:'POST',body:JSON.stringify({kind:'product',platform:item.platform,target_id:item.target_id,title:item.title,city:item.city,category:item.category})});
    await loadWatches(); renderResults(); notify('محصول برای پایش قیمت اضافه شد.');
  } catch(error){notify(error.message);}
}
function setView(next) {
  if(!token){showAuth();return;}
  view=next;
  const watching=next==='watches';
  $('#authPanel').hidden=true;$('#searchPanel').hidden=watching;$('#searchLayout').hidden=watching;$('#watchView').hidden=!watching;$('#logout').hidden=false;
  $('#pageTitle').textContent=watching?'دیده‌بان‌های من':'جست‌وجوی واقعی قیمت';
  $('#pageSubtitle').textContent=watching?'فهرست روی سرور ذخیره می‌شود و پایش زمان‌بندی‌شده دارد.':'نتایج زندهٔ منابع انتخاب‌شده را جست‌وجو کن.';
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===next));
  if(watching)loadWatches().catch(error=>notify(error.message));
}

$('#loginForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('#loginButton');button.disabled=true;button.textContent='در حال ورود…';
  try {
    const response=await api('/auth/login',{method:'POST',body:JSON.stringify({password:$('#password').value})});
    token=response.token;sessionStorage.setItem('price-radar-session',token);$('#password').value='';$('#authPanel').hidden=true;$('#logout').hidden=false;
    setConnection(true,'جست‌وجو و فهرست دیده‌بان به سرویس واقعی وصل است.');
    await loadWatches();$('#searchPanel').hidden=false;$('#searchLayout').hidden=false;runSearch();
  } catch(error) {$('#authMessage').textContent=error.message;}
  finally {button.disabled=false;button.textContent='ورود امن';}
});
$('#searchForm').addEventListener('submit',event=>{event.preventDefault();runSearch();});
document.querySelectorAll('.quick button').forEach(button=>button.addEventListener('click',()=>{$('#query').value=button.textContent;runSearch();}));
['city','category','filterDk','filterDv','filterNew','filterUsed','maxPrice','sort'].forEach(id=>$('#'+id).addEventListener('input',scheduleSearch));
$('#query').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();runSearch();}});
$('#addQueryWatch').addEventListener('click',addQueryWatch);
$('#clearFilters').addEventListener('click',()=>{$('#filterDk').checked=true;$('#filterDv').checked=true;$('#filterNew').checked=true;$('#filterUsed').checked=true;$('#city').value='تهران';$('#category').value='';$('#maxPrice').value='10000000000';$('#sort').value='cheap';runSearch();});
$('#backToSearch').addEventListener('click',()=>setView('search'));
$('#logout').addEventListener('click',()=>signOut(true));
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
$('#cards').addEventListener('click',event=>{const button=event.target.closest('[data-watch]');if(button)toggleProduct(button.dataset.watch);});

async function boot() {
  if(!API_BASE){setConnection(false,'بک‌اند هنوز در Cloudflare مستقر و به صفحه متصل نشده است. هیچ قیمت نمونه‌ای نمایش داده نمی‌شود.');showAuth();return;}
  try { const response=await fetch(apiUrl('/health')); if(!response.ok) throw new Error(); setConnection(true,'سرویس بک‌اند پاسخ می‌دهد؛ برای دیدن نتایج وارد شو.'); }
  catch { setConnection(false,'سرویس بک‌اند در دسترس نیست.'); }
  if(!token){showAuth();return;}
  try {await loadWatches();$('#authPanel').hidden=true;$('#logout').hidden=false;$('#searchPanel').hidden=false;$('#searchLayout').hidden=false;runSearch();}
  catch(error){signOut(false);}
}
boot();
