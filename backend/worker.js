const ALLOWED_ORIGIN = "https://mostafa5804.github.io";
const MAX_QUERY = 100;
const MAX_WATCHES = 8;
const HOUR = 60 * 60;
const memoryCache = new Map();

const citySlugs = {
  "تهران":"tehran", tehran:"tehran", "مشهد":"mashhad", mashhad:"mashhad",
  "اصفهان":"isfahan", isfahan:"isfahan", esfahan:"isfahan", "کرج":"karaj", karaj:"karaj",
  "شیراز":"shiraz", shiraz:"shiraz", "تبریز":"tabriz", tabriz:"tabriz", "قم":"qom", qom:"qom",
  "اهواز":"ahvaz", ahvaz:"ahvaz", "رشت":"rasht", rasht:"rasht", "بابل":"babol", babol:"babol",
  "ساری":"sari", sari:"sari", "آمل":"amol", amol:"amol", "بابلسر":"babolsar", babolsar:"babolsar",
  "گرگان":"gorgan", gorgan:"gorgan", "یزد":"yazd", yazd:"yazd", "کرمان":"kerman", kerman:"kerman",
};
const categorySlugs = {
  "خودرو":"car", "ماشین":"car", car:"car", "املاک":"buy-residential", "مسکن":"buy-residential",
  "آپارتمان":"buy-residential", "آپارتمان فروش":"buy-residential", "خانه":"buy-residential",
  "اجاره":"rent-residential", "موبایل":"mobile-phones", "گوشی":"mobile-phones", mobile:"mobile-phones",
  "کالای دیجیتال":"digital", "موتور":"motorcycles",
};
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩";
const LATIN_DIGITS = "01234567890123456789";
const norm = (s = "") => String(s).replace(/[ي]/g,"ی").replace(/[ك]/g,"ک").replace(/[\u200c\u200f]/g,"").replace(/\s+/g," ").trim().toLowerCase();
const digits = (s = "") => String(s).replace(/[۰-۹٠-٩]/g, ch => LATIN_DIGITS[PERSIAN_DIGITS.indexOf(ch)] || ch);
const integer = value => {
  if (typeof value === "number") return Math.trunc(value);
  const raw = digits(value ?? "").replace(/[^0-9]/g, "");
  return raw ? Number(raw) : null;
};
const first = (...values) => values.find(v => v !== undefined && v !== null && v !== "" && !Array.isArray(v) && typeof v !== "object") ?? values.find(v => Array.isArray(v) && v.length) ?? null;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {status, headers:{"Content-Type":"application/json; charset=utf-8", ...headers}});
}
function cors(request, response) {
  const origin = request.headers.get("Origin");
  if (origin === ALLOWED_ORIGIN) {
    const h = new Headers(response.headers);
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    h.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
    h.set("Vary", "Origin");
    return new Response(response.body, {status:response.status, headers:h});
  }
  return response;
}
function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
function unbase64url(text) {
  const normalized = text.replace(/-/g,"+").replace(/_/g,"/");
  const binary = atob(normalized + "=".repeat((4-normalized.length%4)%4));
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}
async function issueSession(secret) {
  const body = base64url(new TextEncoder().encode(JSON.stringify({sub:"owner", exp:Math.floor(Date.now()/1000)+60*60*24*14})));
  return `${body}.${base64url(await hmac(secret, body))}`;
}
async function validSession(token, secret) {
  if (!token || !secret) return false;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return false;
  let given;
  try { given = unbase64url(signature); } catch { return false; }
  const expected = await hmac(secret, body);
  if (given.length !== expected.length) return false;
  let difference = 0;
  for (let i=0;i<given.length;i++) difference |= given[i]^expected[i];
  if (difference) return false;
  try { const claims=JSON.parse(new TextDecoder().decode(unbase64url(body))); return claims.sub === "owner" && claims.exp > Date.now()/1000; }
  catch { return false; }
}

async function fetchText(url, headers = {}, timeout = 20000) {
  const key = `text:${url}`;
  const cached = memoryCache.get(key);
  if (cached && cached.until > Date.now()) return cached.value;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36","Accept-Language":"fa-IR,fa;q=0.9,en;q=0.8",...headers}, signal:controller.signal});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value = await response.text();
    memoryCache.set(key,{until:Date.now()+120_000,value});
    return value;
  } finally { clearTimeout(timer); }
}
async function fetchJson(url, headers = {}) {
  const key = `json:${url}`;
  const cached = memoryCache.get(key);
  if (cached && cached.until > Date.now()) return cached.value;
  let last = "";
  for (let attempt=1;attempt<=3;attempt++) {
    try {
      const response = await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36","Accept-Language":"fa-IR,fa;q=0.9,en;q=0.8","Accept":"application/json",...headers}});
      if (response.ok) {
        const value=await response.json(); memoryCache.set(key,{until:Date.now()+120_000,value}); return value;
      }
      last=`HTTP ${response.status}`;
      if (![429,500,502,503,504].includes(response.status)) break;
    } catch (error) { last=String(error).slice(0,120); }
    if (attempt<3) await new Promise(resolve=>setTimeout(resolve,Math.min(4000,600*attempt)));
  }
  throw new Error(last || "پاسخی از منبع قیمت دریافت نشد.");
}

function digikalaCard(item) {
  const variant=item?.default_variant||item?.variant||{};
  const priceBlock=variant.price||item?.price||{};
  const price=integer(priceBlock.selling_price);
  const before=integer(priceBlock.rrp_price);
  let discount=integer(priceBlock.discount_percent)||0;
  if(!discount && price && before>price) discount=Math.round((before-price)/before*100);
  const rate=Number(item?.rating?.rate);
  const stars=Number.isFinite(rate)?(rate>5?Math.round(rate/20*10)/10:Math.round(rate*10)/10):null;
  const uri=item?.url?.uri||"";
  const id=String(item?.id||"");
  return {id:`dk:${id}`,platform:"digikala",source:"dk",city:"",category:"محصول فروشگاهی",state:"نو",title:item?.title_fa||item?.title||"—",price,price_before:before,discount,rating:stars?`★ ${stars} از ۵`:"",detail:variant?.seller?.title||"دیجی‌کالا",tag:discount?`${discount}٪ تخفیف`:"دیجی‌کالا",trend:"قیمت فعلی",tone:"#eef2f7",url:uri?`https://www.digikala.com${uri}`:`https://www.digikala.com/product/dkp-${id}/`,target_id:id};
}
async function searchDigikala(query, minPrice, maxPrice, minRating) {
  const url=new URL("https://api.digikala.com/v1/search/");
  url.searchParams.set("q",query); url.searchParams.set("page","1");
  if(maxPrice!==null) url.searchParams.set("sort","20");
  const data=await fetchJson(url.toString());
  const products=data?.data?.products||[];
  return products.map(digikalaCard).filter(card=>card.price && (!minPrice||card.price>=minPrice) && (!maxPrice||card.price<=maxPrice) && (!minRating || Number(card.rating.match(/[\d.]+/)?.[0]||0)>=minRating));
}

function extractPreloadedState(html) {
  const marker=html.indexOf("__PRELOADED_STATE__"); if(marker<0) return null;
  const start=html.indexOf("{",marker); if(start<0)return null;
  let depth=0,quoted=false,escaped=false;
  for(let i=start;i<html.length;i++){
    const ch=html[i];
    if(quoted){if(escaped)escaped=false;else if(ch==="\\")escaped=true;else if(ch==='"')quoted=false;continue;}
    if(ch==='"'){quoted=true;continue;}
    if(ch==="{")depth++;
    else if(ch==="}" && --depth===0){try{return JSON.parse(html.slice(start,i+1))}catch{return null;}}
  }
  return null;
}
function parseDivarPrice(value) {
  const raw=String(value||"").trim(); const price=integer(raw);
  return {price,placeholder:price!==null&&price<=1000,raw};
}
function divarCards(state) {
  const widgets=state?.nb?.listWidgets||[]; const ads=[];
  for(const widget of widgets){
    const dto=widget?.data?.dto||{}; if(dto.widget_type!=="POST_ROW")continue;
    const d=dto.data||{}, payload=d.action?.payload||{}, info=payload.web_info||{};
    const token=d.token||payload.token; if(!token)continue;
    const p=parseDivarPrice(d.middle_description_text);
    ads.push({id:`dv:${token}`,platform:"divar",source:"dv",city:info.city_persian||"",category:"آگهی دیوار",state:"کارکرده",title:d.title||info.title||"—",price:p.price,price_is_placeholder:p.placeholder,rating:d.red_text||"",detail:d.bottom_description_text||info.district_persian||"",tag:d.red_text||"دیوار",trend:"قیمت فعلی",tone:"#eff4ee",url:`https://divar.ir/v/${token}`,target_id:String(token)});
  }
  return ads;
}
function resolveCity(city) {
  const key=norm(city); if(!key||key==="همه شهرها")return "tehran";
  return citySlugs[key]||(/^[a-z-]+$/.test(key)?key:"tehran");
}
function resolveCategory(category) {
  const key=norm(category); if(!key||key==="همه دسته‌ها")return null;
  return categorySlugs[key]||key.replace(/\s+/g,"-");
}
function filterDivar(ads, query, minPrice, maxPrice) {
  const words=norm(query).split(" ").filter(Boolean);
  let list=ads;
  if(words.length){
    const strict=ads.filter(a=>words.every(w=>norm(a.title+" "+a.detail).replace(/\s/g,"").includes(w.replace(/\s/g,""))));
    if(strict.length>=2)list=strict;
    else {const loose=ads.filter(a=>words.some(w=>norm(a.title+" "+a.detail).replace(/\s/g,"").includes(w.replace(/\s/g,""))));list=loose.length?loose:ads;}
  }
  return list.filter(a=>!a.price_is_placeholder&&a.price&&(!minPrice||a.price>=minPrice)&&(!maxPrice||a.price<=maxPrice));
}
async function searchDivar(query, city, category, minPrice, maxPrice) {
  const slug=resolveCity(city), cat=resolveCategory(category);
  const root=`https://divar.ir/s/${slug}`; const suffix=query?`?q=${encodeURIComponent(query)}`:"";
  const candidates=[];
  if(cat)candidates.push(`${root}/${cat}${suffix}`,`${root}${suffix}`,`${root}/${cat}`);
  else candidates.push(`${root}${suffix}`);
  candidates.push(root);
  let lastError="", ads=[];
  for(const url of [...new Set(candidates)]){
    try{
      const html=await fetchText(url,{Accept:"text/html,application/xhtml+xml"},25000);
      const state=extractPreloadedState(html);
      ads=divarCards(state);
      if(ads.length)break;
      if(html.length<60_000)throw new Error("صفحهٔ نتایج دیوار به‌علت محدودیت یا ضدربات ناقص است.");
    }catch(error){lastError=String(error); if(lastError.includes("ناقص است"))break;}
  }
  if(!ads.length){throw new Error(lastError||"دیوار نتیجهٔ قابل‌خواندن برنگرداند.");}
  return filterDivar(ads,query,minPrice,maxPrice);
}

async function searchAll(body) {
  const query=String(body.query||"").trim();
  if(!query || query.length>MAX_QUERY) throw new Error("عبارت جست‌وجو را وارد کن (حداکثر ۱۰۰ نویسه).");
  const min=Number.isFinite(Number(body.min_price))&&Number(body.min_price)>0?Number(body.min_price):null;
  const max=Number.isFinite(Number(body.max_price))&&Number(body.max_price)>0?Number(body.max_price):null;
  const platform=["both","divar","digikala"].includes(body.platform)?body.platform:"both";
  const results=[], warnings=[];
  const jobs=[];
  if(platform!=="divar")jobs.push(["digikala",()=>searchDigikala(query,min,max,Number(body.min_rating)||null)]);
  if(platform!=="digikala")jobs.push(["divar",()=>searchDivar(query,body.city,body.category,min,max)]);
  await Promise.all(jobs.map(async ([name,fn])=>{try{results.push(...await fn())}catch(error){warnings.push(`${name}:${String(error).replace(/^Error: /,"")}`)}}));
  if(!results.length) throw new Error(warnings.join(" | ")||"نتیجه‌ای از منابع قیمت دریافت نشد.");
  const sort=body.sort;
  results.sort((a,b)=>sort==="expensive"?b.price-a.price:a.price-b.price);
  return {items:results,checked_at:new Date().toISOString(),warnings};
}

async function getProduct(platform, id) {
  if(platform==="digikala"){
    const data=await fetchJson(`https://api.digikala.com/v2/product/${encodeURIComponent(id)}/`);
    const product=data?.data?.product;
    if(!product)throw new Error("محصول دیجی‌کالا پیدا نشد.");
    return digikalaCard(product);
  }
  const data=await fetchJson(`https://api.divar.ir/v8/posts-v2/web/${encodeURIComponent(id)}`);
  const seo=data?.seo||{}; let title=seo.title||"آگهی دیوار"; let price=null;
  for(const section of data?.sections||[])for(const widget of section?.widgets||[]){
    const p=widget?.data||{};
    if(p.items){for(const item of p.items){if(String(item?.title||"").includes("قیمت")){price=integer(item.value||item.text);}}}
    if(String(p.title||"").includes("قیمت"))price=integer(p.value);
  }
  return {id:`dv:${id}`,platform:"divar",source:"dv",title,price,state:"کارکرده",url:`https://divar.ir/v/${id}`,target_id:String(id)};
}

async function telegramNotify(env, text) {
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return;
  const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text,disable_web_page_preview:true}),
  });
  if(!response.ok)throw new Error(`Telegram HTTP ${response.status}`);
}
async function scanWatches(env) {
  const {results=[]}=await env.DB.prepare("SELECT * FROM watch WHERE active = 1 ORDER BY COALESCE(last_checked, '') ASC, id LIMIT 8").all();
  for(const [index,watch] of results.entries()){
    if(index) await new Promise(resolve=>setTimeout(resolve,1500));
    try{
      let price=null,title=watch.title||watch.query||"دیده‌بان";
      if(watch.kind==="product"){
        const p=await getProduct(watch.platform,watch.target_id); price=p.price; title=p.title||title;
      }else{
        const found=await searchAll({query:watch.query,city:watch.city,category:watch.category,platform:watch.platform,max_price:watch.budget,sort:"cheap"});
        const valid=found.items.filter(x=>x.price>0);
        if(valid.length){const best=valid.reduce((a,b)=>a.price<=b.price?a:b);price=best.price;title=best.title||title;}
      }
      if(!price)continue;
      const previous=watch.last_price;
      await env.DB.prepare("INSERT INTO price_history(watch_id, price, checked_at) VALUES(?,?,?)").bind(watch.id,price,new Date().toISOString()).run();
      await env.DB.prepare("UPDATE watch SET last_price=?, last_checked=? WHERE id=?").bind(price,new Date().toISOString(),watch.id).run();
      if(previous && price<previous){
        const percent=Math.round((previous-price)/previous*1000)/10;
        await telegramNotify(env,`📉 کاهش قیمت\n${title}\n${previous.toLocaleString("fa-IR")} ← ${price.toLocaleString("fa-IR")} تومان (${percent}٪)\nرادار قیمت`);
      }
    }catch(error){console.error("watch-check",watch.id,String(error));}
  }
}

async function login(request, env) {
  const ip=request.headers.get("CF-Connecting-IP")||"unknown";
  const row=await env.DB.prepare("SELECT failures, window_start FROM login_limits WHERE ip=?").bind(ip).first();
  const now=Date.now();
  if(row && now-Number(row.window_start)<10*60_000 && Number(row.failures)>=8)return json({error:"تعداد تلاش زیاد است؛ ۱۰ دقیقه دیگر دوباره تلاش کن."},429);
  let body; try{body=await request.json()}catch{return json({error:"درخواست نامعتبر است."},400);}
  const provided=String(body.password||"");
  const good=Boolean(env.WEB_ACCESS_PASSWORD)&&constantEqual(provided,env.WEB_ACCESS_PASSWORD);
  if(!good){
    await env.DB.prepare("INSERT INTO login_limits(ip,failures,window_start) VALUES(?,1,?) ON CONFLICT(ip) DO UPDATE SET failures=CASE WHEN ?-window_start>600000 THEN 1 ELSE failures+1 END, window_start=CASE WHEN ?-window_start>600000 THEN ? ELSE window_start END").bind(ip,now,now,now,now).run();
    return json({error:"رمز ورود درست نیست."},401);
  }
  await env.DB.prepare("DELETE FROM login_limits WHERE ip=?").bind(ip).run();
  return json({token:await issueSession(env.SESSION_SECRET)});
}
function constantEqual(a,b){
  const aa=new TextEncoder().encode(String(a)),bb=new TextEncoder().encode(String(b));
  let x=aa.length^bb.length; for(let i=0;i<Math.max(aa.length,bb.length);i++)x|=(aa[i%Math.max(1,aa.length)]||0)^(bb[i%Math.max(1,bb.length)]||0);
  return x===0;
}
async function requireAuth(request, env){
  const header=request.headers.get("Authorization")||"";
  return header.startsWith("Bearer ")&&validSession(header.slice(7),env.SESSION_SECRET);
}

async function route(request, env, ctx) {
  const url=new URL(request.url), path=url.pathname;
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS","Access-Control-Allow-Headers":"Authorization,Content-Type","Access-Control-Max-Age":"86400"}});
  if(path==="/api/health"&&request.method==="GET"){
    const missing=[];
    if(!env.DB)missing.push("D1");
    if(!env.WEB_ACCESS_PASSWORD)missing.push("WEB_ACCESS_PASSWORD");
    if(!env.SESSION_SECRET)missing.push("SESSION_SECRET");
    if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)missing.push("Telegram");
    return json({ok:missing.length===0,service:"price-radar-api",configured:missing.length===0,missing,checked_at:new Date().toISOString()},missing.length?503:200);
  }
  if(path==="/api/auth/login"&&request.method==="POST")return login(request,env);
  if(!await requireAuth(request,env))return json({error:"نشست معتبر نیست؛ دوباره وارد شو."},401);
  if(path==="/api/search"&&request.method==="POST"){
    try{return json(await searchAll(await request.json()));}
    catch(error){return json({error:String(error).replace(/^Error: /,"")},502);}
  }
  if(path==="/api/watches"&&request.method==="GET"){
    const {results=[]}=await env.DB.prepare("SELECT id,platform,kind,query,target_id,title,city,category,budget,last_price,last_checked,created_at FROM watch WHERE active=1 ORDER BY id DESC").all();
    return json({items:results});
  }
  if(path==="/api/watches"&&request.method==="POST"){
    let body; try{body=await request.json()}catch{return json({error:"درخواست نامعتبر است."},400);}
    const kind=body.kind==="product"?"product":"query";
    const platform=["divar","digikala","both"].includes(body.platform)?body.platform:"both";
    const query=String(body.query||"").trim().slice(0,MAX_QUERY);
    const target=String(body.target_id||"").trim().slice(0,100);
    if((kind==="query"&&!query)||(kind==="product"&&!target))return json({error:"جست‌وجو یا شناسهٔ محصول نامعتبر است."},400);
    const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM watch WHERE active=1").first();
    if(Number(count?.n||0)>=MAX_WATCHES)return json({error:`حداکثر ${MAX_WATCHES} دیده‌بان مجاز است.`},409);
    const title=String(body.title||query||"محصول").slice(0,180);
    try{
      const result=await env.DB.prepare("INSERT INTO watch(platform,kind,query,target_id,title,city,category,budget,last_price,last_checked,created_at,active) VALUES(?,?,?,?,?,?,?,?,NULL,NULL,?,1)").bind(platform,kind,query||null,target||null,title,String(body.city||"تهران").slice(0,50),String(body.category||"").slice(0,80),Number(body.budget)>0?Number(body.budget):null,new Date().toISOString()).run();
      return json({ok:true,id:result.meta.last_row_id},201);
    }catch(error){return json({error:"ذخیرهٔ دیده‌بان انجام نشد."},500);}
  }
  const match=path.match(/^\/api\/watches\/(\d+)$/);
  if(match&&request.method==="DELETE"){
    const result=await env.DB.prepare("DELETE FROM watch WHERE id=?").bind(Number(match[1])).run();
    return json({ok:Boolean(result.meta.changes)});
  }
  return json({error:"مسیر پیدا نشد."},404);
}

export default {
  async fetch(request, env, ctx) {
    const response=await route(request,env,ctx);
    return cors(request,response);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(scanWatches(env));
  },
};

export {digikalaCard,extractPreloadedState,divarCards,parseDivarPrice,resolveCity,resolveCategory,filterDivar,validSession,issueSession,searchAll};
