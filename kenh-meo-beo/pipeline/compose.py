"""python3 compose.py build/<id> out.mp4 -> subtitles, overlays, end card, audio"""
import json,subprocess,sys,os
from PIL import Image,ImageDraw,ImageFont
d0,outf=sys.argv[1],sys.argv[2]; TL=json.load(open(d0+'/timeline.json')); FPS=int(open(d0+'/fps.txt').read()); W,H=720,1280
F=lambda s:ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',s)
NAME={'M':('Mỡ',(255,170,80)),'G':('Sếp Ngỗng',(140,200,255)),'T':('Tí',(255,220,90)),'A':('Chị Mái',(255,150,200)),'N':('',(255,255,255))}
def hexc(h,dft): return tuple(int(h[i:i+2],16) for i in (1,3,5)) if h else dft
def txt(d,s,y,f,fill,sw=6):
    for i,l in enumerate(s.split('\n')):
        w=d.textlength(l,font=f); d.text(((W-w)/2,y+i*f.size*1.22),l,font=f,fill=fill,stroke_width=sw,stroke_fill=(0,0,0))
def wrap(s,n=22):
    o,c=[],''
    for w in s.split():
        if len(c)+len(w)>n: o.append(c); c=w
        else: c=(c+' '+w).strip()
    return '\n'.join(o+[c])
def pill(d,s,y,col):
    w=d.textlength(s,font=F(32)); d.rounded_rectangle([(W-w)/2-28,y,(W+w)/2+28,y+64],32,fill=(255,255,255)); d.text(((W-w)/2,y+13),s,font=F(32),fill=col)
ov=Image.new('RGBA',(W,H),(0,0,0,0)); dd=ImageDraw.Draw(ov)
for y in range(0,H,4): dd.line([(0,y),(W,y)],fill=(0,0,0,28))
for r in range(60): dd.rectangle([r*3,r*3,W-r*3,H-r*3],outline=(0,0,0,max(0,90-r*3)),width=3)
T=TL['total']; N=round(T*FPS); hook=TL.get('hook'); hs=TL.get('hook_secs',3)
p=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i',d0+'/mix.wav','-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-shortest',outf],stdin=subprocess.PIPE)
for i in range(N):
    t=i/FPS; sc=next((s for s in TL['scenes'] if t<s['end']),TL['scenes'][-1]); ls=t-sc['start']
    im=Image.open(f'{d0}/frames/{i:04d}.jpg').convert('RGB')
    if im.size!=(W,H): im=im.resize((W,H),Image.BICUBIC)
    if t>T-1.6 and TL.get('end'):
        im=Image.new('RGB',(W,H),(15,15,20)); d=ImageDraw.Draw(im); txt(d,TL['end'],520,F(58),(255,226,70)); txt(d,TL.get('handle','@meobeovanphong'),820,F(32),(255,255,255),3); p.stdin.write(im.tobytes()); continue
    if sc.get('cctv'):
        im=Image.alpha_composite(im.convert('RGBA'),ov).convert('RGB'); d=ImageDraw.Draw(im)
        d.text((28,70),'CAM 03 · VĂN PHÒNG',font=F(30),fill=(255,255,255),stroke_width=3,stroke_fill=(0,0,0))
        if int(t*2)%2==0: d.ellipse([W-150,76,W-126,100],fill=(255,40,40))
        d.text((W-118,70),'REC',font=F(30),fill=(255,255,255),stroke_width=3,stroke_fill=(0,0,0))
        h,m,s=[int(x) for x in sc.get('clock','12:00:00').split(':')]; s=h*3600+m*60+s+int(ls); d.text((28,H-120),f'{s//3600:02d}:{s%3600//60:02d}:{s%60:02d}',font=F(30),fill=(255,255,255),stroke_width=3,stroke_fill=(0,0,0))
    d=ImageDraw.Draw(im)
    d.text((24,24),TL.get('tag',''),font=F(30),fill=(255,255,255),stroke_width=4,stroke_fill=(0,0,0))
    if hook and t<hs: txt(d,hook,170,F(54),(255,226,70))
    for o in sc.get('overlays',[]):
        a,b=o.get('from',0),o.get('to',99)
        if not(a<=ls<b): continue
        k=o['type']; col=hexc(o.get('color'),(30,30,30))
        if k=='pill': pill(d,o['text'],o.get('y',300),col)
        elif k=='big': txt(d,o['text'],o.get('y',260),F(o.get('size',110)),hexc(o.get('color'),(255,60,60)),8)
        elif k=='card': im=Image.new('RGB',(W,H),(15,15,20)); d=ImageDraw.Draw(im); txt(d,o['text'],560,F(60),(255,255,255))
    for l in TL['lines']:
        if not(l['start']-0.05<=t<l['end']+0.35): continue
        if l['text'].startswith('Dịch:'):
            s=l['text'][5:].strip(); s=s[0].upper()+s[1:]; bx=wrap(s,18); nl=bx.count('\n')+1
            d.rounded_rectangle([50,780,W-50,900+nl*66],28,fill=(255,214,10)); txt(d,'DỊCH:',800,F(38),(30,30,30),0); txt(d,bx,850,F(52),(20,20,20),0)
        else:
            n,c=NAME[l['who']]; nm=n+(' (điện thoại)' if l.get('opt',{}).get('phone') else '')
            if n: txt(d,nm,820,F(34),c,5)
            txt(d,wrap(l['text']),868,F(46),(255,255,255))
    p.stdin.write(im.tobytes())
p.stdin.close(); p.wait()
# contact sheet for QA
fr=sorted(os.listdir(d0+'/frames')); pick=[fr[int(j*(len(fr)-1)/11)] for j in range(12)]
sheet=Image.new('RGB',(6*150,2*267))
for j,f in enumerate(pick): sheet.paste(Image.open(f'{d0}/frames/{f}').resize((150,267)),((j%6)*150,(j//6)*267))
sheet.save(d0+'/contact.jpg'); print('video',outf)
