const fs=require('node:fs'),path=require('node:path');
const template=fs.readFileSync(path.join(__dirname,'explorer-template.html'),'utf8');
const model=fs.readFileSync(path.join(__dirname,'model.cjs'),'utf8');
const license=fs.readFileSync(path.join(__dirname,'LICENSE'),'utf8');
if(template.split('/* MODEL_SOURCE */').length!==2)throw Error('Expected one model marker');
if(template.split('<!-- LICENSE_TEXT -->').length!==2)throw Error('Expected one license marker');
const html=template.replace('/* MODEL_SOURCE */',()=>model).replace('<!-- LICENSE_TEXT -->',()=>`<!--\n${license}\nNames, logos, and branding are excluded under the repository licensing boundaries.\n-->`);
fs.writeFileSync(path.join(__dirname,'index.html'),html);
console.log('Built index.html from model.cjs, explorer-template.html, and LICENSE');
