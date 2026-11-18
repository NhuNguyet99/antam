const T3=THREE; T3.ColorManagement.legacyMode=false;
let R,S,CAM,TL,C={},papers=[],doorP,chair,bag,stand,phone,mon;
const SPH=new T3.SphereGeometry(1,48,32),BOX=new T3.BoxGeometry(1,1,1),CYL=new T3.CylinderGeometry(1,1,1,40),CONE=new T3.ConeGeometry(1,1,40);
const mat=(c,o)=>new T3.MeshStandardMaterial(Object.assign({color:c,roughness:0.6},o||{}));
function add(p,g,m,pos,s,r){const x=new T3.Mesh(g,m);x.position.set(...(pos||[0,0,0]));if(s)x.scale.set(...s);if(r)x.rotation.set(...r);x.castShadow=x.receiveShadow=true;p.add(x);return x;}
const WH=mat(0xffffff,{roughness:0.3}),BK=mat(0x161616,{roughness:0.2}),PK=mat(0xff9fb5),MO=mat(0x6a1f2b);
const blushM=()=>mat(0xff7f96,{transparent:true,opacity:0.55});
function eyes(h,x,y,z,s){const L=[];for(const sx of[-1,1]){const g=new T3.Group();g.position.set(sx*x,y,z);h.add(g);add(g,SPH,WH,[0,0,0],[s,s*1.15,s*0.6]);add(g,SPH,BK,[0,-s*0.08,s*0.4],[s*0.66,s*0.76,s*0.32]);add(g,SPH,mat(0xffffff,{emissive:0xffffff,emissiveIntensity:0.8}),[s*0.22,s*0.2,s*0.62],[s*0.22,s*0.22,s*0.1]);L.push(g);}return L;}
function arm(g,x,y,m,sz){const p=new T3.Group();p.position.set(x,y,0);add(p,SPH,m,[0,-sz[1],0],sz);g.add(p);return p;}
function mkCat(){const g=new T3.Group(),O=mat(0xf39a3d),CR=mat(0xffe6c7);
 add(g,SPH,O,[0,0.42,0],[0.42,0.44,0.37]);add(g,SPH,WH,[0,0.55,0.13],[0.34,0.3,0.26]);add(g,SPH,CR,[0,0.34,0.2],[0.27,0.26,0.18]);
 add(g,BOX,mat(0x2a4a8c),[0,0.6,0.385],[0.08,0.24,0.03],[0.15,0,0]);
 for(const sx of[-1,1])add(g,SPH,O,[sx*0.18,0.06,0.12],[0.14,0.09,0.17]);
 for(let i=0;i<6;i++)add(g,SPH,O,[0.12+i*0.03,0.12+i*0.12,-0.36-Math.sin(i/5*1.6)*0.12],[0.075,0.075,0.075]);
 const aL=arm(g,-0.38,0.62,O,[0.1,0.17,0.1]),aR=arm(g,0.38,0.62,O,[0.1,0.17,0.1]);
 const h=new T3.Group();h.position.set(0,1.05,0);g.add(h);
 add(h,SPH,O,[0,0,0],[0.52,0.45,0.46]);add(h,SPH,CR,[0,-0.14,0.36],[0.22,0.14,0.12]);add(h,SPH,PK,[0,-0.07,0.475],[0.045,0.035,0.03]);
 for(const sx of[-1,1]){add(h,CONE,O,[sx*0.3,0.36,0],[0.17,0.3,0.15],[0,0,-sx*0.38]);add(h,CONE,PK,[sx*0.29,0.33,0.07],[0.1,0.19,0.04],[0,0,-sx*0.38]);
  add(h,SPH,blushM(),[sx*0.3,-0.12,0.34],[0.08,0.05,0.03]);add(h,new T3.TorusGeometry(0.135,0.017,12,48),BK,[sx*0.18,0.03,0.47]);}
 add(h,BOX,BK,[0,0.05,0.48],[0.1,0.016,0.016]);
 for(let i=-1;i<=1;i++)add(h,SPH,mat(0xd46f22),[i*0.1,0.38,0.24],[0.035,0.09,0.03],[0.6,0,0]);
 const E=eyes(h,0.18,0.03,0.39,0.11);const mo=add(h,SPH,MO,[0,-0.22,0.445],[0.05,0.02,0.02]);
 return{g,h,E,mo,aL,aR,k:'s',mb:-0.22};}
function mkGoose(){const g=new T3.Group(),W=mat(0xfdfdfd,{roughness:0.45}),SU=mat(0x4d5a6c),OR=mat(0xff9a2e);
 add(g,SPH,SU,[0,0.5,0],[0.42,0.46,0.38]);add(g,SPH,WH,[0,0.66,0.22],[0.17,0.26,0.16]);add(g,BOX,mat(0xd62828),[0,0.64,0.38],[0.08,0.26,0.03],[0.25,0,0]);
 for(const sx of[-1,1])add(g,SPH,OR,[sx*0.15,0.03,0.15],[0.13,0.04,0.2]);
 const aL=arm(g,-0.4,0.78,W,[0.12,0.26,0.19]),aR=arm(g,0.4,0.78,W,[0.12,0.26,0.19]);
 add(g,CYL,W,[0,1.0,0.02],[0.12,0.45,0.12]);
 const h=new T3.Group();h.position.set(0,1.35,0);g.add(h);add(h,SPH,W,[0,0,0],[0.3,0.28,0.29]);
 add(h,CONE,OR,[0,-0.04,0.36],[0.08,0.22,0.06],[Math.PI/2,0,0]);const mo=add(h,CONE,mat(0xe07a10),[0,-0.1,0.32],[0.06,0.16,0.04],[Math.PI/2,0,0]);
 const E=eyes(h,0.12,0.07,0.23,0.085);const br=[],bl=[];
 for(const sx of[-1,1]){br.push(add(h,BOX,BK,[sx*0.12,0.19,0.25],[0.13,0.028,0.03]));bl.push(add(h,SPH,mat(0xff4d6a,{transparent:true,opacity:0}),[sx*0.19,-0.05,0.21],[0.08,0.05,0.03]));}
 return{g,h,E,mo,aL,aR,br,bl,k:'b',mb:-0.1};}
function mkMouse(){const g=new T3.Group(),GR=mat(0xb8b8c8),Y=mat(0xffc93c);
 add(g,SPH,Y,[0,0.3,0],[0.28,0.3,0.25]);add(g,BOX,WH,[0.09,0.38,0.235],[0.08,0.1,0.02]);
 for(const sx of[-1,1])add(g,SPH,GR,[sx*0.1,0.04,0.1],[0.09,0.05,0.12]);
 for(let i=0;i<6;i++)add(g,SPH,PK,[Math.sin(i)*0.1,0.08+i*0.05,-0.25-i*0.06],[0.03,0.03,0.03]);
 const aL=arm(g,-0.26,0.42,Y,[0.07,0.13,0.07]),aR=arm(g,0.26,0.42,Y,[0.07,0.13,0.07]);
 const h=new T3.Group();h.position.set(0,0.78,0);g.add(h);add(h,SPH,GR,[0,0,0],[0.3,0.27,0.27]);
 for(const sx of[-1,1]){add(h,SPH,GR,[sx*0.27,0.24,-0.03],[0.2,0.2,0.05]);add(h,SPH,PK,[sx*0.27,0.24,0.005],[0.14,0.14,0.03]);add(h,SPH,blushM(),[sx*0.2,-0.07,0.2],[0.06,0.04,0.02]);}
 add(h,SPH,mat(0xdcdce6),[0,-0.07,0.22],[0.13,0.1,0.1]);add(h,SPH,PK,[0,-0.04,0.32],[0.04,0.035,0.03]);
 const E=eyes(h,0.11,0.05,0.22,0.08);const mo=add(h,SPH,MO,[0,-0.14,0.29],[0.035,0.015,0.015]);
 return{g,h,E,mo,aL,aR,k:'s',mb:-0.14};}
function mkHen(){const g=new T3.Group(),BR=mat(0xc9814f),P=mat(0xf7a1c4),RD=mat(0xe63946),YL=mat(0xffc23d);
 add(g,SPH,BR,[0,0.45,0],[0.38,0.42,0.35]);add(g,new T3.CylinderGeometry(0.3,0.44,0.72,40),P,[0,0.42,0]);
 add(g,new T3.TorusGeometry(0.2,0.024,12,48),WH,[0,0.8,0.03],[1,1,1],[Math.PI/2.2,0,0]);
 for(const sx of[-1,1])add(g,SPH,YL,[sx*0.14,0.03,0.12],[0.1,0.04,0.15]);
 const aL=arm(g,-0.36,0.66,P,[0.1,0.22,0.17]),aR=arm(g,0.36,0.66,P,[0.1,0.22,0.17]);
 const h=new T3.Group();h.position.set(0,0.98,0);g.add(h);add(h,SPH,mat(0xdba071),[0,0,0],[0.3,0.28,0.28]);
 for(let i=-1;i<=1;i++)add(h,SPH,RD,[i*0.07,0.27-Math.abs(i)*0.03,0.02],[0.06,0.09,0.05]);
 add(h,CONE,YL,[0,-0.04,0.32],[0.06,0.13,0.05],[Math.PI/2,0,0]);const mo=add(h,CONE,mat(0xe0a020),[0,-0.08,0.29],[0.045,0.1,0.035],[Math.PI/2,0,0]);
 add(h,SPH,RD,[0,-0.15,0.27],[0.04,0.06,0.03]);const E=eyes(h,0.12,0.06,0.22,0.085);
 for(const sx of[-1,1]){add(h,SPH,blushM(),[sx*0.19,-0.06,0.21],[0.06,0.04,0.02]);add(h,BOX,BK,[sx*0.19,0.16,0.22],[0.06,0.015,0.015],[0,0,sx*0.5]);}
 return{g,h,E,mo,aL,aR,k:'b',mb:-0.08};}
function desk(x,z,ry,big){const g=new T3.Group();g.position.set(x,0,z);g.rotation.y=ry;S.add(g);const W=big?mat(0x7a4a2b):mat(0xf2e3cc),w=big?1.8:1.4;
 add(g,BOX,W,[0,0.76,0],[w,0.06,0.75]);for(const sx of[-1,1])add(g,BOX,mat(0x9a9a9a),[sx*(w/2-0.06),0.37,0],[0.05,0.74,0.65]);
 if(big)add(g,BOX,mat(0x6a3e22),[0.5,0.5,0.1],[0.6,0.45,0.55]);
 const m=new T3.Group();m.position.set(big?-0.65:0,0.79,big?0.05:-0.2);if(big)m.rotation.y=0.7;g.add(m);add(m,BOX,BK,[0,0.26,0],[0.62,0.38,0.04]);add(m,BOX,mat(0x7ec8ff,{emissive:0x4aa8ff,emissiveIntensity:0.6}),[0,0.26,0.022],[0.56,0.32,0.005]);add(m,CYL,BK,[0,0.04,0],[0.05,0.08,0.05]);
 add(g,BOX,mat(0xdddddd),[0,0.8,0.12],[0.45,0.02,0.14]);add(g,CYL,mat(0xff6b6b),[0.45,0.84,0.1],[0.05,0.1,0.05]);return g;}
function mkChair(){const g=new T3.Group();const M=mat(0x2f3e55);add(g,CYL,M,[0,0.45,0],[0.26,0.07,0.26]);add(g,BOX,M,[0,0.78,-0.24],[0.48,0.5,0.07]);add(g,CYL,mat(0x888888),[0,0.22,0],[0.04,0.44,0.04]);add(g,CYL,mat(0x333333),[0,0.03,0],[0.25,0.04,0.25]);S.add(g);return g;}
function plant(x,z,s){const g=new T3.Group();g.position.set(x,0,z);g.scale.setScalar(s);S.add(g);add(g,new T3.CylinderGeometry(0.22,0.16,0.4,32),mat(0xc8693d),[0,0.2,0]);
 for(const[a,b,c,r]of[[0,0.65,0,0.28],[0.15,0.85,0.05,0.2],[-0.14,0.8,-0.05,0.22],[0,1.0,0,0.18]])add(g,SPH,mat(0x4caf6a),[a,b,c],[r,r,r]);}
function init(tl){TL=tl;R=new T3.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});R.setSize(window.RW||720,window.RH||1280);R.shadowMap.enabled=true;R.shadowMap.type=T3.PCFSoftShadowMap;
 R.outputEncoding=T3.sRGBEncoding;R.toneMapping=T3.ACESFilmicToneMapping;R.toneMappingExposure=1.05;document.body.appendChild(R.domElement);
 S=new T3.Scene();S.background=new T3.Color(0xf3e9da);CAM=new T3.PerspectiveCamera(60,720/1280,0.1,100);
 S.add(new T3.HemisphereLight(0xfff4e6,0xb79c84,0.8));const dl=new T3.DirectionalLight(0xfff0d8,1.15);dl.position.set(4,8,5);dl.castShadow=true;dl.shadow.mapSize.set(2048,2048);
 Object.assign(dl.shadow.camera,{left:-7,right:7,top:7,bottom:-7});dl.shadow.bias=-0.0004;S.add(dl);S.add(dl.target);window.DL=dl;const rim=new T3.DirectionalLight(0xffffff,0.6);rim.position.set(-3,4,-6);S.add(rim);const pl=new T3.PointLight(0xcfe6ff,0.35,25);pl.position.set(-2,3,3);S.add(pl);
 add(S,BOX,mat(0xe2bf95),[0,-0.05,0],[10,0.1,10]);add(S,CYL,mat(0x9fd3c7),[0.3,0.006,0.6],[1.9,0.01,1.4]);
 add(S,BOX,mat(0xf7efe1),[0,1.75,-4],[10,3.5,0.1]);add(S,BOX,mat(0xd5ece3),[-4.5,1.75,0],[0.1,3.5,10]);
 add(S,BOX,mat(0xb08060),[0,0.06,-3.94],[10,0.12,0.03]);add(S,BOX,mat(0xb08060),[-4.44,0.06,0],[0.03,0.12,10]);
 add(S,BOX,WH,[-1.2,2.0,-3.95],[1.95,1.35,0.04]);add(S,BOX,mat(0xaee3ff,{emissive:0x9bd8ff,emissiveIntensity:0.7}),[-1.2,2.0,-3.92],[1.8,1.2,0.02]);add(S,BOX,WH,[-1.2,2.0,-3.91],[0.05,1.2,0.02]);
 add(S,CYL,WH,[0.6,2.75,-3.93],[0.28,0.05,0.28],[Math.PI/2,0,0]);add(S,BOX,BK,[0.6,2.82,-3.89],[0.02,0.16,0.01]);add(S,BOX,BK,[0.66,2.75,-3.89],[0.12,0.02,0.01]);
 add(S,BOX,WH,[2.0,1.95,-3.93],[1.1,0.75,0.03]);for(const[a,b,c]of[[1.7,2.1,0xffd166],[1.95,1.85,0x8ecae6],[2.25,2.05,0xf4978e],[2.3,1.75,0xb5e48c]])add(S,BOX,mat(c),[a,b,-3.91],[0.18,0.18,0.01]);
 desk(-0.5,0.3,0);desk(1.2,0.3,0);desk(1.6,-2.95,0,true);chair=mkChair();
 const cp=new T3.Group();cp.position.set(-2.6,0,-2.8);S.add(cp);add(cp,BOX,mat(0xd9dde3),[0,0.475,0],[1.0,0.95,0.7]);add(cp,BOX,mat(0x6b7280),[0,0.99,0],[1.02,0.08,0.72]);add(cp,BOX,mat(0xd9dde3),[0.62,0.7,0],[0.3,0.03,0.4]);add(cp,BOX,mat(0x22c55e,{emissive:0x22c55e}),[-0.3,0.9,0.36],[0.06,0.04,0.01]);
 plant(-3.9,-3.4,1);plant(3.7,-3.4,1.1);plant(-3.9,2.2,0.9);
 const wd=new T3.Group();wd.position.set(-3.95,0,-1.2);S.add(wd);add(wd,BOX,WH,[0,0.5,0],[0.35,1.0,0.35]);add(wd,CYL,mat(0x7cc6ff,{transparent:true,opacity:0.7}),[0,1.2,0],[0.15,0.4,0.15]);
 add(S,BOX,mat(0x8b5a3c),[3.3,1.1,-3.93],[1.05,2.25,0.06]);doorP=new T3.Group();doorP.position.set(2.85,0,-3.88);S.add(doorP);add(doorP,BOX,mat(0xc08a5c),[0.45,1.05,0],[0.9,2.1,0.05]);add(doorP,SPH,mat(0xe0c060,{metalness:0.6}),[0.8,1.0,0.05],[0.04,0.04,0.04]);
 for(let i=0;i<10;i++){papers.push(add(S,BOX,WH,[0,0,0],[0.21,0.004,0.3]));}
 bag=new T3.Group();S.add(bag);add(bag,SPH,mat(0xb5793f),[0,0,0],[0.32,0.38,0.3]);add(bag,CYL,mat(0xe63946),[0,0.36,0],[0.08,0.05,0.08]);
 stand=new T3.Group();S.add(stand);add(stand,CYL,BK,[0,0.6,0],[0.02,1.2,0.02]);phone=add(stand,BOX,BK,[0,1.25,0],[0.16,0.3,0.02]);add(stand,BOX,mat(0xffffff,{emissive:0xff7aa2,emissiveIntensity:0.9}),[0,1.25,-0.012],[0.14,0.27,0.004]);
 mon=new T3.Group();S.add(mon);
 C.M=mkCat();C.G=mkGoose();C.T=mkMouse();C.A=mkHen();for(const k in C)S.add(C[k].g);
 const hp=new T3.Group();add(hp,BOX,BK,[0,0,0],[0.17,0.3,0.025]);add(hp,BOX,mat(0xffffff,{emissive:0x9ad0ff,emissiveIntensity:1}),[0,0,-0.014],[0.15,0.27,0.004]);C.M.phone=hp;S.add(hp);}

let BX=20,SX=40,blanket,sea,thermo,tred,hemi;
function buildSets(){
const W=mat(0xffffff);
 add(S,BOX,mat(0xd9b48f),[BX,-0.05,0],[9,0.1,9]);add(S,BOX,mat(0xcfe3f7),[BX,1.75,-3],[9,3.5,0.1]);add(S,BOX,mat(0xf6d7e0),[BX-4.5,1.75,0],[0.1,3.5,9]);
 add(S,CYL,mat(0xf2c6a0),[BX+0.4,0.006,-0.3],[1.6,0.01,1.1]);
 add(S,BOX,mat(0x9c6b45),[BX+0.5,0.25,-1.6],[1.6,0.5,2.3]);add(S,BOX,W,[BX+0.5,0.56,-1.6],[1.5,0.14,2.2]);add(S,BOX,mat(0x9c6b45),[BX+0.5,0.85,-2.78],[1.7,1.2,0.12]);
 add(S,SPH,W,[BX+0.5,0.72,-2.35],[0.45,0.1,0.22]);blanket=add(S,SPH,mat(0x7fb3e6),[BX+0.5,0.85,-1.15],[0.78,0.33,0.7]);
 add(S,BOX,mat(0xb07a50),[BX-0.9,0.3,-2.3],[0.6,0.6,0.5]);add(S,CYL,mat(0xfff1c1,{emissive:0xffe08a,emissiveIntensity:0.5}),[BX-1.05,0.95,-2.4],[0.13,0.22,0.13]);add(S,CYL,mat(0x777777),[BX-1.05,0.7,-2.4],[0.02,0.3,0.02]);
 add(S,CYL,mat(0xe9c79c),[BX-0.75,0.72,-2.2],[0.09,0.24,0.09]);add(S,CYL,mat(0xffffff,{transparent:true,opacity:0.6}),[BX-0.75,0.85,-2.2],[0.095,0.02,0.095]);add(S,CYL,BK,[BX-0.73,0.95,-2.2],[0.012,0.25,0.012],[0,0,0.15]);
 add(S,BOX,W,[BX+1.6,1.95,-2.94],[1.3,1.0,0.04]);add(S,BOX,mat(0xffd29a,{emissive:0xffb15c,emissiveIntensity:0.6}),[BX+1.6,1.95,-2.91],[1.2,0.9,0.02]);
 add(S,BOX,mat(0x9bd0a8),[BX-1.0,2.0,-2.94],[0.6,0.8,0.02]);
 thermo=add(S,CYL,W,[BX-0.72,0.92,-2.2],[0.012,0.36,0.012],[0,0,0.3]);tred=add(S,CYL,mat(0xff2020,{emissive:0xff0000,emissiveIntensity:0.5}),[BX-0.72,0.85,-2.19],[0.014,0.1,0.014],[0,0,0.3]);
add(S,BOX,mat(0xf3d9a4),[SX,-0.05,0],[30,0.1,30]);sea=add(S,BOX,mat(0x2fa6d9,{emissive:0x1a6f99,emissiveIntensity:0.3,roughness:0.2}),[SX,0,-9],[40,0.1,12]);
 add(S,SPH,mat(0xfff3b0,{emissive:0xffe066,emissiveIntensity:1}),[SX+3,5,-20],[1.4,1.4,1.4]);
 const tr=new T3.Group();tr.position.set(SX-1.6,0,-1.2);S.add(tr);for(let i=0;i<7;i++)add(tr,CYL,mat(0x9b6b3f),[i*0.06,0.2+i*0.38,0],[0.11-i*0.007,0.4,0.11-i*0.007],[0,0,-0.08]);
 for(let i=0;i<6;i++){const a=i/6*Math.PI*2;add(tr,SPH,mat(0x3fae5a),[0.42+Math.cos(a)*0.55,2.75,Math.sin(a)*0.55],[0.6,0.08,0.22],[0,-a,-0.35]);}
 add(S,CYL,W,[SX+0.8,1.1,-0.7],[0.03,2.2,0.03]);add(S,CONE,mat(0xff6b6b),[SX+0.8,2.25,-0.7],[1.3,0.45,1.3]);
 for(const x of[SX,SX+1.6]){add(S,BOX,mat(0xffffff),[x,0.3,0.1],[0.75,0.08,1.5]);add(S,BOX,mat(0x4cc9f0),[x,0.36,0.1],[0.7,0.04,1.45]);add(S,BOX,mat(0x4cc9f0),[x,0.7,-0.75],[0.7,0.06,0.85],[-1.0,0,0]);for(const sx of[-1,1])add(S,BOX,mat(0xdddddd),[x+sx*0.3,0.13,0.1],[0.05,0.26,1.3]);}

hemi=S.children.find(o=>o.isHemisphereLight);}
// ---- face/reset helpers
function face(c,who,t,ph){const talk=TL.lines.some(l=>l.who===who&&t>=l.start&&t<l.end);const b=((t+ph)%3.4)<0.12?0.12:1;c.E.forEach(e=>e.scale.y=b);
 const o=Math.abs(Math.sin(t*17));if(c.k==='s'){c.mo.scale.set(c.mo.scale.x,talk?0.02+0.05*o:0.02,0.02);}else c.mo.position.y=c.mb-(talk?0.05*o:0);return talk;}
function reset(c){c.g.visible=true;c.g.position.set(0,0,0);c.g.rotation.set(0,0,0);c.g.scale.set(1,1,1);c.h.rotation.set(0,0,0);c.aL.rotation.set(0,0,0);c.aR.rotation.set(0,0,0);}

// ================= DIRECTOR: renders any episode JSON =================
const lerp=(a,b,u)=>a+(b-a)*Math.max(0,Math.min(1,u)),ease=u=>{u=Math.max(0,Math.min(1,u));return u*u*(3-2*u);};
let EP,V3=T3.Vector3;
const SPOTS={office:{boss_desk:[1.6,0,-3.45,0],guest_chair:[1.6,0.33,-1.85,Math.PI],boss_stand:[0.6,0,-1.2,1.1],a:[-0.6,0,1.5,0.5],b:[0.9,0,1.7,-0.5],c:[0.15,0,2.4,0],
  door:[3.05,0,-3.35,-0.7],copier_sit:[-2.6,0.99,-2.75,0.4],copier_sleep:[-2.55,1.38,-2.8,0.5,'side'],desk_sleep:[-0.2,0.05,-0.45,0,'slump'],window:[-1.2,0,-3.2,0.2],side:[2.55,0,-2.0,-1.0]},
 bedroom:{bed_lie:[BX+0.5,0.98,-0.95,0,'lie'],bed_sit:[BX+0.3,0.62,-0.85,0.35],stand:[BX+0.6,0,0.4,0.2]},
 beach:{lounger1:[SX,0.42,-0.1,0,'recline'],lounger2:[SX+1.6,0.42,-0.1,0,'recline'],sand:[SX-0.3,0,1.0,0.3]}};
const WIDE={office:[[2.9,4.3,4.0],[-0.6,0.5,-0.9],60],bedroom:[[BX+1.9,2.3,0.7],[BX+0.5,0.9,-1.5],50],beach:[[SX+0.8,2.1,3.9],[SX+0.8,0.8,-0.2],50]};
const MET={M:{chest:0.62,front:0.43,arm:0.34},G:{chest:0.72,front:0.42,arm:0.52},T:{chest:0.36,front:0.27,arm:0.26},A:{chest:0.62,front:0.42,arm:0.44}};
const EYE={M:[0.18,0.03,0.4],G:[0.12,0.07,0.25],T:[0.11,0.05,0.23],A:[0.12,0.06,0.23]};
function mkProp(k,n){const c=C[k],m=MET[k],g=new T3.Group();
 if(n==='book'){add(g,BOX,mat(0xc0392b),[0,0,0],[0.42,0.52,0.13]);add(g,BOX,mat(0xfff6e0),[0,0,0.002],[0.38,0.48,0.135]);add(g,BOX,mat(0xffd34d),[0,0.08,0.067],[0.25,0.06,0.005]);g.position.set(0,m.chest-0.05,m.front+0.14);g.rotation.x=-0.5;c.g.add(g);}
 else if(n==='book_blue'){add(g,BOX,mat(0x2c5aa0),[0,0,0],[0.42,0.52,0.13]);add(g,BOX,mat(0xfff6e0),[0,0,0.002],[0.38,0.48,0.135]);g.position.set(0,m.chest-0.05,m.front+0.14);g.rotation.x=-0.5;c.g.add(g);}
 else if(n==='phone'){add(g,BOX,BK,[0,0,0],[0.17,0.3,0.025]);add(g,BOX,mat(0xffffff,{emissive:0x9ad0ff,emissiveIntensity:1}),[0,0,-0.014],[0.15,0.27,0.004]);g.position.set(0,m.chest+0.15,m.front+0.12);g.rotation.x=0.4;c.g.add(g);}
 else if(n==='phone_ear'){add(g,BOX,BK,[0,0,0],[0.17,0.3,0.025]);g.position.set(0.47,-0.05,0.1);g.rotation.set(0,Math.PI/2,0.2);c.h.add(g);}
 else if(n==='towel'){add(g,SPH,mat(0xffffff),[0,0,0],[0.38,0.08,0.3]);g.position.set(0,0.4,0.05);c.h.add(g);}
 else if(n==='shades'){const e=EYE[k];for(const sx of[-1,1])add(g,SPH,BK,[sx*e[0],e[1],e[2]+0.04],[0.1,0.07,0.03]);add(g,BOX,BK,[0,e[1]+0.03,e[2]+0.05],[0.12,0.015,0.015]);c.h.add(g);}
 else if(n==='coconut'){add(g,SPH,mat(0x7a4b2a),[0,0,0],[0.13,0.13,0.13]);add(g,CYL,mat(0xff7aa2),[0.03,0.15,0],[0.01,0.2,0.01],[0,0,-0.3]);g.position.set(0,-m.arm-0.02,0.06);c.aR.add(g);}
 else if(n==='milktea'){add(g,CYL,mat(0xe9c79c),[0,0,0],[0.08,0.2,0.08]);add(g,CYL,BK,[0.02,0.16,0],[0.01,0.2,0.01]);g.position.set(0,-m.arm-0.02,0.08);c.aR.add(g);}
 else if(n==='bag'){add(g,SPH,mat(0xb5793f),[0,0,0],[0.32,0.38,0.3]);add(g,CYL,mat(0xe63946),[0,0.36,0],[0.08,0.05,0.08]);g.position.set(0,1.42,0);c.g.add(g);}
 else if(n==='sweat'){for(let i=0;i<3;i++)add(g,SPH,mat(0x8fd8ff,{transparent:true,opacity:0.85}),[(i-1)*0.32,0.2,0.36],[0.035,0.05,0.03]);c.h.add(g);}
 return g;}
function prop(k,n,on){const c=C[k];c.props=c.props||{};let p=c.props[n];if(!p&&on)p=c.props[n]=mkProp(k,n);if(p)p.visible=!!on;return p;}
function setInit(ep){EP=ep;buildSets();}
function charFace(k){const c=C[k],sp=c.spot||[0,0,0,0];const y=sp[3];if(sp[4]==='lie')return new V3(0,1,0.25);if(sp[4]==='recline')return new V3(Math.sin(y),0.7,Math.cos(y));return new V3(Math.sin(y),0,Math.cos(y));}
function head(k){return C[k].h.getWorldPosition(new V3());}
function segD(p,a,b){const ab=b.clone().sub(a),t=Math.max(0,Math.min(1,p.clone().sub(a).dot(ab)/ab.lengthSq()));return a.clone().addScaledVector(ab,t).distanceTo(p);}
const OBST=[[-0.5,1.05,0.1,0.5],[1.2,1.05,0.1,0.5],[0.95,1.05,-2.85,0.45],[-2.6,0.6,-2.8,0.6]];
function blocked(cam,tgt,me){for(const o of OBST){const p=new V3(o[0],o[1],o[2]);if(segD(p,cam,tgt)<o[3]||cam.distanceTo(p)<o[3]+0.2)return true;}for(const k in C){if(k===me||!C[k].g.visible)continue;const hp=head(k),bp=C[k].g.getWorldPosition(new V3()).add(new V3(0,0.45,0));
 if(segD(hp,cam,tgt)<0.55||segD(bp,cam,tgt)<0.5||cam.distanceTo(hp)<0.7)return true;}return false;}
function camClose(k,fov){const h=head(k),f=charFace(k).normalize(),r=new V3(f.z,0,-f.x).normalize(),base=k==='T'?1.9:2.4;
 for(const[d,s]of[[base,0.45],[base,0.85],[base,-0.6],[base*1.3,1.2],[base*0.8,0.2],[base*1.5,-1.1]]){const p=h.clone().addScaledVector(f,d).addScaledVector(r,s).add(new V3(0,0.22,0));if(!blocked(p,h,k)){CAM.position.copy(p);break;}if(d===base*1.5)CAM.position.copy(p);}
 CAM.fov=fov||40;CAM.lookAt(h.x,h.y-0.3,h.z);}
function camTwo(ks){const hs=ks.map(head),mid=hs.reduce((a,b)=>a.add(b),new V3()).multiplyScalar(1/hs.length);let f=ks.map(charFace).reduce((a,b)=>a.add(b),new V3());f.y=0;
 let spread=0;hs.forEach(a=>hs.forEach(b=>spread=Math.max(spread,a.distanceTo(b))));
 if(f.length()<0.4&&hs.length>1){const s=hs[1].clone().sub(hs[0]);f=new V3(s.z,0,-s.x);if(f.z<0)f.negate();}f.normalize();
 const d=2.0+spread*1.25;CAM.position.copy(mid).addScaledVector(f,d).add(new V3(d*0.25,0.6,0));CAM.fov=48;CAM.lookAt(mid.x,mid.y-0.25,mid.z);}
function camWide(set){const w=WIDE[set==='office_night'?'office':set];CAM.position.set(...w[0]);CAM.lookAt(...w[1]);CAM.fov=w[2];}
function setLook(set){const night=set==='office_night',bed=set==='bedroom',beach=set==='beach';
 S.background=new T3.Color(night?0x1b2236:bed?0xdbeafe:beach?0x8fd3ff:0xf3e9da);R.toneMappingExposure=night?0.45:1.05;DL.intensity=night?0.1:1.15;hemi.intensity=night?0.2:0.8;
 const bx=bed?BX:beach?SX:0;DL.position.set(bx+4,8,5);DL.target.position.set(bx,0,bed?-1:0);if(beach)sea.position.y=-0.02+0.03*Math.sin(TT*1.5);}
let TT=0;
function applyPose(k,p,t,ls){const c=C[k],o=Math.abs(Math.sin(t*9));
 if(p==='angry'){if(c.br)c.br.forEach((x,i)=>x.rotation.z=(i?1:-1)*0.4);if(c.bl)c.bl.forEach(b=>b.material.opacity=0.85);c.aL.rotation.z=-(1.8+0.2*Math.sin(t*25));c.aR.rotation.z=1.8+0.2*Math.sin(t*25+1);}
 else if(p==='shock'){c.E.forEach(e=>e.scale.set(1.3,1.3,1));if(c.k==='s')c.mo.scale.y=0.07;else c.mo.position.y=c.mb-0.06;c.g.scale.multiplyScalar(0.94);}
 else if(p==='happy'||p==='cheer'){c.g.position.y+=o*0.15;c.aL.rotation.z=-(2.2+0.5*o);c.aR.rotation.z=2.2+0.5*o;c.E.forEach(e=>e.scale.y=0.55);}
 else if(p==='dance'){c.g.rotation.y+=0.55*Math.sin(ls*6);c.g.position.y+=Math.abs(Math.sin(ls*8))*0.14;c.aL.rotation.z=-(0.6+0.9*Math.abs(Math.sin(ls*8)));c.aR.rotation.z=0.6+0.9*Math.abs(Math.sin(ls*8+1));c.h.rotation.z=0.25*Math.sin(ls*8);}
 else if(p==='sleep'){c.E.forEach(e=>e.scale.y=0.1);c.g.scale.y*=1+0.03*Math.sin(t*3);}
 else if(p==='smug'){c.E.forEach(e=>e.scale.y=0.55);c.h.rotation.z=0.08;}
 else if(p==='sad'){c.h.rotation.x=0.35;c.E.forEach(e=>e.scale.y=0.6);}
 else if(p==='nervous'){prop(k,'sweat',true);c.E.forEach(e=>e.scale.set(1.2,1.2,1));c.g.position.x+=0.01*Math.sin(t*40);}
 else if(p==='raise_hand'){c.aR.rotation.z=2.7;}
 else if(p==='squint'){c.E.forEach(e=>e.scale.y=0.45);if(c.br)c.br.forEach((x,i)=>x.rotation.z=(i?1:-1)*0.3);}
 else if(p==='celebrate'){c.g.position.y+=o*0.25;c.aL.rotation.z=-(1.2+0.8*o);c.aR.rotation.z=1.2+0.8*o;c.E.forEach(e=>e.scale.set(1.2,1.2,1));}}
function renderAt(t){TT=t;const sc=EP.scenes.find(s=>t<s.end)||EP.scenes[EP.scenes.length-1],ls=t-sc.start,sd=sc.end-sc.start,set=sc.set||'office';
 for(const k in C){reset(C[k]);C[k].g.visible=false;C[k].spot=null;if(C[k].props)for(const n in C[k].props)C[k].props[n].visible=false;}
 C.G.br.forEach(b=>b.rotation.z=0);C.G.bl.forEach(b=>b.material.opacity=0);C.M.phone.visible=false;bag.visible=stand.visible=false;
 papers.forEach(p=>{p.visible=!!sc.papers;});doorP.rotation.y=sc.door_open?-1.3*ease(ls/0.5):0;blanket.visible=true;tred.scale.y=0.1;
 chair.position.set(-0.5,0,0.95);chair.rotation.set(0,Math.PI,0);setLook(set);
 const SP=SPOTS[set==='office_night'?'office':set];
 for(const[k,s]of Object.entries(sc.place||{})){const c=C[k],p=SP[s];if(!p)continue;c.g.visible=true;c.spot=p;c.g.position.set(p[0],p[1],p[2]);
  if(p[4]==='side')c.g.rotation.set(0,p[3],Math.PI/2);else if(p[4]==='lie')c.g.rotation.set(-Math.PI/2,0,0);else if(p[4]==='recline'){c.g.rotation.set(-0.75,p[3],0);}else if(p[4]==='slump')c.g.rotation.set(0.35,p[3],0);else c.g.rotation.y=p[3];
  if(s==='guest_chair'){chair.position.set(p[0],0,p[2]);chair.rotation.set(0,p[3],0);}}
 for(const mv of sc.moves||[]){const[k,a,b,t0,t1]=mv,pa=SP[a],pb=SP[b],u=ease((ls-t0)/(t1-t0)),c=C[k];c.g.visible=true;c.spot=[lerp(pa[0],pb[0],u),lerp(pa[1],pb[1],u),lerp(pa[2],pb[2],u),u>0&&u<1?Math.atan2(pb[0]-pa[0],pb[2]-pa[2]):(u>=1?pb[3]:pa[3])];
  c.g.position.set(c.spot[0],c.spot[1]+(u>0&&u<1?Math.abs(Math.sin(ls*10))*0.05:0),c.spot[2]);c.g.rotation.set(0,c.spot[3],0);}
 const lines=EP.lines.filter(l=>l.start>=sc.start&&l.start<sc.end),cur=lines.filter(l=>l.start-0.15<=t).pop();
 for(const k in C)if(C[k].g.visible){face(C[k],k,t,k.charCodeAt(0)*0.37);}
 for(const k in C){if(!C[k].g.visible)continue;let p=(sc.pose||{})[k];for(const l of lines)if(l.start-0.1<=t&&l.opt&&l.opt.pose&&l.opt.pose[k]!==undefined)p=l.opt.pose[k];if(p)applyPose(k,p,t,ls);
  let pr=[...((sc.props||{})[k]||[])];for(const l of lines)if(l.start-0.1<=t&&l.opt&&l.opt.props&&l.opt.props[k])pr=l.opt.props[k];
  for(const n of pr){prop(k,n,true);const c=C[k];if(n==='book'||n==='book_blue'||n==='phone')c.aL.rotation.x=c.aR.rotation.x=-1.1;if(n==='phone_ear')c.aR.rotation.z=2.3;if(n==='coconut'||n==='milktea')c.aR.rotation.x=-0.9;}
  if(C[k].props&&C[k].props.sweat&&C[k].props.sweat.visible)C[k].props.sweat.children.forEach((s,i)=>s.position.y=0.25-((ls*0.5+i*0.33)%1)*0.35);}
 S.updateMatrixWorld(true);
 let cm=(cur&&cur.opt&&cur.opt.cam)||sc.cam||'auto';const vis=Object.keys(C).filter(k=>C[k].g.visible);
 if(sc.cctv)cm='wide';
 if(cm==='auto')cm=cur?'close:'+cur.who:(vis.length>1?'two':(vis.length?'close:'+vis[0]:'wide'));
 if(cm.startsWith('close:')&&!C[cm.slice(6)].g.visible)cm='two';
 if(cm==='wide')camWide(set);else if(cm==='two')camTwo(vis.length?vis:['M']);
 else if(cm.startsWith('close:'))camClose(cm.slice(6));
 else if(cm.startsWith('zoom:'))camClose(cm.slice(5),lerp(44,30,ls/sd));
 else if(cm.startsWith('reveal:')){camClose(cm.slice(7),34);const a=CAM.position.clone(),la=head(cm.slice(7));const w=WIDE[set==='office_night'?'office':set],u=ease((ls-0.9)/1.6);
  CAM.position.lerpVectors(a,new V3(...w[0]),u);CAM.fov=lerp(34,w[2],u);CAM.lookAt(la.lerp(new V3(...w[1]),u));}
 for(const k in C){if(!C[k].g.visible)continue;let lc=(sc.lookcam||[]).includes(k);for(const l of lines)if(l.start-0.1<=t&&l.opt&&l.opt.lookcam)lc=l.opt.lookcam.includes(k);
  if(lc){const h=head(k),d=CAM.position.clone().sub(h),gy=C[k].g.rotation.y;let a=Math.atan2(d.x,d.z)-gy;a=Math.atan2(Math.sin(a),Math.cos(a));C[k].h.rotation.y=Math.max(-0.9,Math.min(0.9,a));}}
 CAM.updateProjectionMatrix();R.render(S,CAM);return R.domElement.toDataURL('image/jpeg',0.92);}
