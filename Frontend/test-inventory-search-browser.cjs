const http = require('node:http');
const fs = require('node:fs');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const files = ['state.js','asset_classifier.js','ui_render.js','app.js','room-tickets-tv.js'];
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><main id="main-content"></main>
${files.map(f=>'<script src="/'+f+'"></script>').join('')}
<script>
App.init=()=>{};let eventError='';window.addEventListener('error',e=>eventError=e.message);
let checks=0;const check=(ok,msg)=>{if(!ok)throw Error(msg);checks++};
try {
STATE.tab='inventario';
DATA={classifiedAssets:Array.from({length:60},(_,i)=>({id:i+1,name:'Computador '+i,serial:'SN'+i,itemtype:'Computer',category:'computer',stateSummary:'Ativo'}))};
App._renderContent();
const input=document.getElementById('inventory-search');input.focus();
for(const c of 'Computador 12') {
 input.setRangeText(c,input.selectionStart,input.selectionEnd,'end');
 input.dispatchEvent(new InputEvent('input',{bubbles:true,data:c}));
 check(document.activeElement===input,'search focus retained');
 check(document.getElementById('inventory-search')===input,'same input retained');
 check(input.selectionStart===input.value.length,'caret retained');
}
check(document.querySelectorAll('.inventory-row').length===1,'search narrows rows: '+input.value+' state='+STATE.search+' rows='+document.querySelectorAll('.inventory-row').length+' error='+eventError);
input.setSelectionRange(11,13);input.setRangeText('23',11,13,'end');input.dispatchEvent(new InputEvent('input',{bubbles:true}));
check(document.querySelector('.inventory-row').textContent.includes('Computador 23'),'editing query works');
document.getElementById('inventory-search-clear').click();
check(document.activeElement===input && input.value==='','clear retains focus');
check(document.querySelectorAll('.inventory-row').length===25,'clear restores first page');
document.querySelector('.btn-page[data-page="2"]').click();
check(STATE.inventoryPage===2,'pagination still works');
const next=document.getElementById('inventory-search');next.focus();next.value='missing';next.dispatchEvent(new InputEvent('input',{bubbles:true}));
check(STATE.inventoryPage===1,'typing resets page');
check(document.activeElement===next,'focus retained for zero results');
check(document.querySelectorAll('.inventory-row').length===0,'zero results');
STATE.search='sala';check(UI._highlight('São sala').includes('<mark class="search-highlight">sala</mark>'),'accent before match');
STATE.search='sao';check(UI._highlight('São sala').includes('<mark class="search-highlight">São</mark>'),'accent in match');
check(!eventError,'no input exceptions');
let listener;let view={state:'error',label:'Falha de conexão',data:null};
RoomTicketsMonitor={subscribe:fn=>(listener=fn,()=>{}),start:()=>{},snapshot:()=>view,getQueue:()=>[]};
RoomTicketsTV.open();document.querySelector('[data-tv-panel="calls"]').click();
check(document.querySelector('.rt-tv-empty').textContent.includes('Não foi possível'),'TV shows error without data');
check(!document.querySelector('.rt-tv-empty').textContent.includes('Nenhum chamado'),'error is not empty success');
view={state:'ok',label:'Atualizado',data:{items:[],summary:{total:0},meta:{}}};listener(view);
check(document.querySelector('.rt-tv-empty').textContent.includes('Nenhum chamado'),'successful empty result');
view={state:'expired',label:'Expirada',data:null};listener(view);
check(document.querySelector('.rt-tv-empty').textContent.includes('Sessão expirada'),'expired session explicit');
RoomTicketsTV.close();
document.body.dataset.result='passed';document.body.dataset.checks=checks;
}catch(e){document.body.dataset.result='failed';document.body.dataset.error=e.message;}
</script></body></html>`;
const server=http.createServer((req,res)=>{const file=req.url.slice(1);res.setHeader('Content-Type',files.includes(file)?'text/javascript':'text/html; charset=utf-8');res.end(files.includes(file)?fs.readFileSync(__dirname+'/javascript/'+file):html)});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
for(const size of ['1920,1080','1280,800']){
const {stdout}=await promisify(execFile)(process.env.CHROME_BIN||'google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--disable-extensions','--window-size='+size,'--virtual-time-budget=2000','--dump-dom','http://127.0.0.1:'+server.address().port],{timeout:30000,maxBuffer:2000000});
if(!stdout.includes('data-result="passed"'))throw Error(stdout.match(/data-error="([^"]*)"/)?.[1]||'unfinished');
console.log(size+': '+stdout.match(/data-checks="(\d+)"/)[1]+' checks passed');
}}finally{server.close()}})().catch(e=>{console.error(e);process.exitCode=1});
