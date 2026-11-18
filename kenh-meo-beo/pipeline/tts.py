"""python3 tts.py episodes/<id>.json build/<id>  -> build/<id>/timeline.json + mix.wav"""
import subprocess,wave,os,json,sys
src,out=sys.argv[1],sys.argv[2]; os.makedirs(out,exist_ok=True); ep=json.load(open(src))
V={'M':['vi-VN-NamMinhNeural','--rate=-10%','--pitch=-10Hz'],'G':['vi-VN-NamMinhNeural','--rate=+12%','--pitch=+15Hz'],
   'T':['vi-VN-NamMinhNeural','--rate=+18%','--pitch=+35Hz'],'A':['vi-VN-HoaiMyNeural','--rate=+8%','--pitch=+5Hz'],'N':['vi-VN-HoaiMyNeural','--rate=+0%','--pitch=+0Hz']}
SFX={'music':'0.035*sin(2*PI*262*t)*exp(-mod(t\\,0.5)*6)+0.03*sin(2*PI*392*t)*exp(-mod(t+0.25\\,0.5)*6)',
 'dance':'0.55*sin(2*PI*55*t)*exp(-mod(t\\,0.4)*14)+0.10*sin(2*PI*660*t)*exp(-mod(t+0.2\\,0.4)*25)+0.07*sin(2*PI*330*t)*exp(-mod(t\\,0.2)*12)',
 'sting':'0.5*sin(2*PI*90*t)*exp(-mod(t\\,0.45)*5)*lt(t\\,0.9)','pop':'0.5*sin(2*PI*(300+1500*t)*t)*exp(-t*15)',
 'ding':'0.3*sin(2*PI*880*t)*exp(-t*4)+0.2*sin(2*PI*1320*t)*exp(-t*4)','ring':'0.12*(sin(2*PI*988*t)+sin(2*PI*1319*t))*gt(mod(t\\,0.4)\\,0.2)*lt(mod(t\\,2)\\,1.2)',
 'cricket':'0.07*sin(2*PI*4200*t)*gt(mod(t\\,0.6)\\,0.45)*gt(sin(2*PI*30*t)\\,0)','waves':'0.12*(random(0)-0.5)*(0.6+0.4*sin(2*PI*0.3*t))',
 'printer':'0.12*sin(2*PI*140*t)*(0.6+0.4*sin(2*PI*7*t))+0.05*sin(2*PI*900*t)*gt(mod(t\\,0.5)\\,0.35)','hum':'0.015*sin(2*PI*60*t)+0.008*sin(2*PI*120*t)',
 'off':'0.4*sin(2*PI*(800-700*t)*t)*exp(-t*6)','whoosh':'0.25*(random(0)-0.5)*sin(PI*t/0.4)'}
lines=[];t=0;S={}
import re
def R(v,lt):
    if isinstance(v,(int,float)): return v
    m=re.fullmatch(r'L(\d+)(e?)([+-][\d.]+)?',v.replace(' ',''))
    if not m: raise SystemExit('Bad time ref '+v)
    a=lt[int(m.group(1))]; return (a[1] if m.group(2) else a[0])+float(m.group(3) or 0)
for sc in ep['scenes']:
    cur=0.4
    for i,L in enumerate(sc.get('lines',[])):
        w,txt,o=L[0],L[1],(L[2] if len(L)>2 else None); opt=L[3] if len(L)>3 else {}
        k=f"{out}/v_{sc['id']}_{i}"; v,*op=V[w]
        for _ in range(4):
            subprocess.run(['edge-tts','--proxy',os.environ.get('HTTPS_PROXY',''),'--voice',v,*op,'--text',txt.replace('Dịch:','Dịch,'),'--write-media',k+'.mp3'],capture_output=True)
            if os.path.exists(k+'.mp3') and os.path.getsize(k+'.mp3')>1000: break
        else: sys.exit(f'TTS failed: {txt} (cần mở mạng tới speech.platform.bing.com)')
        af='highpass=f=350,lowpass=f=3400,volume=1.4' if opt.get('phone') else 'anull'
        subprocess.run(['ffmpeg','-y','-loglevel','error','-i',k+'.mp3','-af',af,'-ar','24000','-ac','1',k+'.wav'],check=True)
        with wave.open(k+'.wav') as f: d=f.getnframes()/f.getframerate()
        st=o if o is not None else cur; lines.append({'who':w,'text':txt,'start':t+st,'end':t+st+d,'wav':k+'.wav','opt':opt}); cur=st+d+0.3
    lt=[(l['start']-t,l['end']-t) for l in lines if l['start']>=t]
    for mv in sc.get('moves',[]): mv[3]=R(mv[3],lt); mv[4]=R(mv[4],lt) if isinstance(mv[4],str) else mv[3]+mv[4]
    for o in sc.get('overlays',[]):
        for kk in ('from','to'):
            if kk in o: o[kk]=R(o[kk],lt)
    size=max(sc.get('min',0),cur+sc.get('pad',0.6)); s=dict(sc); s['_lt']=lt; s.pop('lines',None); s.update(start=t,end=t+size); S[sc['id']]=s; t+=size
if t-S[ep['scenes'][-1]['id']]['start']<2: t+=1.6; S[ep['scenes'][-1]['id']]['end']=t
TL=dict(ep); TL.update(scenes=list(S.values()),lines=lines,total=t); json.dump(TL,open(out+'/timeline.json','w'),ensure_ascii=False,indent=1)
inp=[];dl=[]
for l in lines: inp+=['-i',l['wav']]; dl.append(l['start'])
for x in ep.get('sfx',[]):
    name,sid,off=x[0],x[1],R(x[2],S[x[1]]['_lt']); dur=x[3] if len(x)>3 else (t if name=='music' else S[sid]['end']-S[sid]['start']-off)
    inp+=['-f','lavfi','-i',f"aevalsrc={SFX[name]}:d={dur:.2f}"]; dl.append(max(0,S[sid]['start']+off))
n=len(dl); flt=[f'[{i}]adelay={int(x*1000)}:all=1[a{i}]' for i,x in enumerate(dl)]
flt.append(''.join(f'[a{i}]' for i in range(n))+f'amix=inputs={n}:normalize=0,apad,atrim=0:{t:.2f}[o]')
subprocess.run(['ffmpeg','-y','-loglevel','error',*inp,'-filter_complex',';'.join(flt),'-map','[o]',out+'/mix.wav'],check=True)
print('timeline',round(t,1),'s,',len(lines),'lines')
