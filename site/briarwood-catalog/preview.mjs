import {createServer} from 'node:http';
import {createHandler,renderCatalog} from './worker.mjs';
import {createDemo} from './demo.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const demo=await createDemo();
const handler=createHandler({...demo,writable:true,demo:true});
if(process.argv[2]==='--export'){
  const destination=path.resolve(process.argv[3]);await mkdir(path.dirname(destination),{recursive:true});
  await writeFile(destination,renderCatalog(await demo.repository.read(),{demo:true,writable:false}));
  console.log(destination);
}else{
  const port=Number(process.env.PORT || 8777);
  createServer(async(req,res)=>{
    try {
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413);res.end('Body too large');return;}chunks.push(chunk);}
      const request=new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
      const response=await handler(request);res.writeHead(response.status,{...Object.fromEntries(response.headers),'x-briarwood-preview':'fictional-data-no-public-writes'});res.end(Buffer.from(await response.arrayBuffer()));
    }catch{res.writeHead(500);res.end('Preview error');}
  }).listen(port,'127.0.0.1',()=>console.log(`Local fictional demonstration: http://127.0.0.1:${port}/catalog`));
}
