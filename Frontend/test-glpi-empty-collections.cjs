const http = require('node:http');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const path = require('node:path');
const assert = require('node:assert/strict');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
const partial=url.pathname.includes('/82/');
const populated=url.pathname.includes('/83/');
const solution=url.pathname.includes('/85/');
 const forbidden=url.pathname.includes('/84/');
 res.writeHead(forbidden?403:partial?206:200,{'Content-Type':'application/json'});
 res.end(JSON.stringify(populated || solution ? [{id:1}]:[]));
});
const php=`require $argv[1]; $c=new GlpiClient(['url'=>$argv[2],'app_token'=>'fixture','user_token'=>'fixture']); try { $r=$c->getCollection($argv[3],'fixture',['range'=>$argv[4]],100); echo json_encode($r); } catch (RuntimeException $e) { echo 'error:'.$e->getCode(); }`;
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
let checks=0;
for(const [route,range,expected] of [
 ['/Ticket/80/Ticket_User','0-99','{"items":[],"total":0}'],
 ['/Ticket/80/ITILSolution','0-99','{"items":[],"total":0}'],
 ['/Ticket/85/ITILSolution','0-99','{"items":[{"id":1}],"total":1}'],
 ['/Ticket/80/Ticket_User','100-199','{"items":[],"total":0}'],
 ['/Ticket/82/Ticket_User','0-99','error:502'],
 ['/Ticket/83/Ticket_User','0-99','{"items":[{"id":1}],"total":1}'],
 ['/Ticket/84/Ticket_User','0-99','error:403'],
 ['/User','0-99','error:502']]){
const {stdout}=await promisify(execFile)(process.env.PHP_BIN||'php',['-r',php,path.resolve(__dirname,'../Backend/api/client.php'),'http://127.0.0.1:'+server.address().port,route,range]);
assert.equal(stdout,expected,route+' '+range);checks++;
}console.log(checks+' collection HTTP regressions passed');
}finally{server.close()}})().catch(e=>{console.error(e);process.exitCode=1});
