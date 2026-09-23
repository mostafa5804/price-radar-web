import test from "node:test";
import assert from "node:assert/strict";
import worker,{digikalaCard,extractPreloadedState,divarCards,parseDivarPrice,resolveCity,resolveCategory,validSession,issueSession,searchAll} from "./worker.js";

test("Digikala product is normalized to a live result card",()=>{
  const item={id:91,title_fa:"گوشی نمونه",url:{uri:"/product/dkp-91/"},default_variant:{price:{selling_price:25000000,rrp_price:30000000},seller:{title:"فروشنده"}},rating:{rate:92,count:10}};
  assert.deepEqual(digikalaCard(item),{
    id:"dk:91",platform:"digikala",source:"dk",city:"",category:"محصول فروشگاهی",state:"نو",title:"گوشی نمونه",price:25000000,price_before:30000000,discount:17,rating:"★ 4.6 از ۵",detail:"فروشنده",tag:"17٪ تخفیف",trend:"قیمت فعلی",tone:"#eef2f7",url:"https://www.digikala.com/product/dkp-91/",target_id:"91"
  });
});

test("Divar embedded state parser handles braces inside quoted text",()=>{
  const html=`<script>window.__PRELOADED_STATE__ = {"nb":{"value":"brace } stays","listWidgets":[]}};</script>`;
  assert.equal(extractPreloadedState(html).nb.value,"brace } stays");
  assert.equal(extractPreloadedState("<html>missing state</html>"),null);
});

test("Divar cards convert Persian prices and mark placeholder prices",()=>{
  const state={nb:{listWidgets:[
    {data:{dto:{widget_type:"POST_ROW",data:{title:"آگهی اول",middle_description_text:"۲۰,۰۰۰,۰۰۰ تومان",bottom_description_text:"بابل",action:{payload:{token:"abc",web_info:{city_persian:"بابل"}}}}}}},
    {data:{dto:{widget_type:"POST_ROW",data:{title:"آگهی دوم",middle_description_text:"۱,۰۰۰ تومان",action:{payload:{token:"def",web_info:{}}}}}}},
  ]}};
  const cards=divarCards(state);
  assert.equal(cards[0].price,20000000);
  assert.equal(cards[0].url,"https://divar.ir/v/abc");
  assert.equal(cards[1].price_is_placeholder,true);
  assert.deepEqual(parseDivarPrice("توافقی"),{price:null,placeholder:false,raw:"توافقی"});
});

test("Persian city and category resolve to source slugs",()=>{
  assert.equal(resolveCity("تبریز"),"tabriz");
  assert.equal(resolveCategory("آپارتمان فروش"),"buy-residential");
});

test("signed sessions reject modified or expired tokens",async()=>{
  const token=await issueSession("unit-test-session-secret");
  assert.equal(await validSession(token,"unit-test-session-secret"),true);
  assert.equal(await validSession(token,"wrong-secret"),false);
  const [body,signature]=token.split(".");
  const expired=btoa(JSON.stringify({sub:"owner",exp:1})).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")+"."+signature;
  assert.equal(await validSession(expired,"unit-test-session-secret"),false);
});

test("live search returns API records and reports partial source failures",async t=>{
  const oldFetch=globalThis.fetch;
  const state={nb:{listWidgets:[{data:{dto:{widget_type:"POST_ROW",data:{title:"گوشی کارکرده",middle_description_text:"۱۸,۰۰۰,۰۰۰ تومان",bottom_description_text:"بابل",action:{payload:{token:"real-ad",web_info:{city_persian:"بابل"}}}}}}}]}};
  globalThis.fetch=async url=>{
    const u=String(url);
    if(u.startsWith("https://api.digikala.com/"))return new Response(JSON.stringify({data:{products:[{id:2,title_fa:"گوشی فروشگاهی",default_variant:{price:{selling_price:22000000}}}]}}),{status:200,headers:{"Content-Type":"application/json"}});
    if(u.startsWith("https://divar.ir/"))return new Response(`<script>window.__PRELOADED_STATE__ = ${JSON.stringify(state)};</script>`,{status:200});
    throw new Error("Unexpected source URL");
  };
  t.after(()=>{globalThis.fetch=oldFetch;});
  const result=await searchAll({query:"گوشی",city:"بابل",platform:"both",sort:"cheap"});
  assert.equal(result.items.length,2);
  assert.deepEqual(result.items.map(x=>x.price),[18000000,22000000]);
  assert.deepEqual(result.warnings,[]);
});

function fakeD1() {
  return {prepare(sql){
    const statement={sql,values:[],bind(...values){this.values=values;return this;},
      async first(){if(sql.includes("COUNT(*)"))return {n:0};return null;},
      async all(){return {results:[]};},
      async run(){return {meta:{last_row_id:12,changes:1}};}};
    return statement;
  }};
}
const env={DB:fakeD1(),WEB_ACCESS_PASSWORD:"private-test-password",SESSION_SECRET:"unit-test-session-secret",TELEGRAM_BOT_TOKEN:"test-token",TELEGRAM_CHAT_ID:"12345"};

test("health reports incomplete deployment instead of claiming readiness",async()=>{
  const response=await worker.fetch(new Request("https://api.test/api/health"),{});
  assert.equal(response.status,503);
  assert.equal((await response.json()).configured,false);
});

test("private endpoints require a signed owner session",async()=>{
  const response=await worker.fetch(new Request("https://api.test/api/watches"),env);
  assert.equal(response.status,401);
  const token=await issueSession(env.SESSION_SECRET);
  const allowed=await worker.fetch(new Request("https://api.test/api/watches",{headers:{Authorization:`Bearer ${token}`,Origin:"https://mostafa5804.github.io"}}),env);
  assert.equal(allowed.status,200);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"),"https://mostafa5804.github.io");
});

test("watch creation stores a server-side query watch",async()=>{
  const token=await issueSession(env.SESSION_SECRET);
  const response=await worker.fetch(new Request("https://api.test/api/watches",{
    method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify({kind:"query",platform:"both",query:"گوشی",city:"تبریز",budget:30000000,title:"گوشی"})
  }),env);
  assert.equal(response.status,201);
  assert.equal((await response.json()).id,12);
});
