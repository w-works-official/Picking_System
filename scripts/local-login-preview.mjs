// Local-only development preview. No real passwords, DB calls, or writes.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const mockScript=`
<script>
{
 const localFetch=window.fetch.bind(window);
 window.fetch=async function(input,options={}) {
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.hostname.endsWith('.supabase.co')) {
   if(url.pathname.endsWith('/picking_login_v1')) {
    const body=JSON.parse(options.body||'{}');
    return new Response(JSON.stringify(body.p_username==='demo'&&body.p_password==='demo'?
     {authenticated:true,session_token:'a'.repeat(64),expires_at:new Date(Date.now()+3600000).toISOString()}:
     {authenticated:false,error_code:'invalid_credentials'}));
   }
   if(url.pathname.endsWith('/picking_check_session_v1')) return new Response(JSON.stringify({authenticated:true,expires_at:new Date(Date.now()+3600000).toISOString()}));
   if(url.pathname.endsWith('/picking_logout_v1')) return new Response(JSON.stringify({logged_out:true}));
   if(url.pathname.includes('/storage/v1/')) return new Response('[]',{headers:{'content-type':'application/json'}});
   return new Response('[]',{headers:{'content-type':'application/json','content-range':'*/0'}});
  }
  return localFetch(input,options);
 };
}
</script>`;
const types={".html":"text/html; charset=utf-8",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".svg":"image/svg+xml"};
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,"http://localhost");
  const relative=url.pathname==="/"?"/index.html":url.pathname;
  const file=path.resolve(root,"."+decodeURIComponent(relative));
  if(!file.startsWith(root+path.sep))throw Error("outside root");
  let data=await readFile(file);
  if(relative==="/index.html")data=data.toString().replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',mockScript+'<div style="position:fixed;top:0;right:0;z-index:999999;background:#6d28d9;color:white;padding:.4rem;font:12px system-ui">LOCAL MOCK · 운영 DB 미접속 · demo / demo</div><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
  // Tool setup pages only generate code. Never execute bookmarklets here.
  res.writeHead(200,{"content-type":types[path.extname(file)]||"application/octet-stream"});
  res.end(data);
 }catch{res.writeHead(404);res.end("Not found");}
});
server.listen(4187,"127.0.0.1",()=>console.log("LOCAL MOCK http://127.0.0.1:4187/ (demo / demo)"));
