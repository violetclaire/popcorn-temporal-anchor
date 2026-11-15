// Test-only equivalent of Cloudflare text/data module imports.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function load(url,context,next){
 if(url.startsWith('file:')){
  const filename=fileURLToPath(url),name=path.basename(filename);
  if(name.startsWith('editions-') || (filename.includes(path.sep+'dist'+path.sep)&&name!=='worker.mjs')){
   const bytes=await fs.readFile(filename);
   const value=name.endsWith('.brf')?`Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0)).buffer`:JSON.stringify(bytes.toString('utf8'));
   return {format:'module',source:'export default '+value+';',shortCircuit:true};
  }
 }
 return next(url,context);
}
