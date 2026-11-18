// node render.js build/<id> [preview]
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const dir=process.argv[2],pv=process.argv[3]==='preview';
(async()=>{const W=pv?360:720,H=pv?640:1280,FPS=pv?12:24;const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:W,height:H}});p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
 await p.setContent('<html><body style="margin:0"></body></html>');await p.evaluate(([w,h])=>{window.RW=w;window.RH=h;},[W,H]);
 for(const f of[path.join(__dirname,'node_modules/three/build/three.min.js'),path.join(__dirname,'core.js')])await p.addScriptTag({path:f});
 const ep=JSON.parse(fs.readFileSync(dir+'/timeline.json'));await p.evaluate(ep=>{init(ep);setInit(ep);},ep);
 const out=dir+'/frames';fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});const N=Math.round(ep.total*FPS);
 for(let i=0;i<N;i++){const d=await p.evaluate(t=>renderAt(t),i/FPS);fs.writeFileSync(`${out}/${String(i).padStart(4,'0')}.jpg`,Buffer.from(d.split(',')[1],'base64'));}
 fs.writeFileSync(dir+'/fps.txt',String(FPS));console.log('rendered',N,'frames');await b.close();})();
