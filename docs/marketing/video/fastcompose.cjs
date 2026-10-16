// Fast path: one background image rendered once, then ffmpeg does the rest.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs');const {execSync}=require('child_process');
const S='/tmp/claude-0/-home-user/b366c905-7c9d-592d-a31a-1615a07829a4/scratchpad/';
const FR=S+'dframes/',D='/home/user/Stella-ai-assistant-/docs/marketing/video/';
const stamps=JSON.parse(fs.readFileSync(FR+'stamps.json'));
const PW=900,PH=Math.round(900*764/430);// phone size on screen
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await (await b.newContext({viewport:{width:1080,height:1920}})).newPage();
 await p.setContent(`<link rel="stylesheet" href="file://${D}../flyers/flyer.css"><style>body{width:1080px;height:1920px;position:relative}
  .frame{position:absolute;left:${(1080-PW)/2-6}px;top:${(1920-PH)/2-6}px;width:${PW+12}px;height:${PH+12}px;border-radius:58px;background:linear-gradient(160deg,#ffb547,#ff7a59,#6ee7ff);box-shadow:0 30px 100px rgba(0,0,0,.6),0 0 90px rgba(110,160,255,.28)}
  .in{position:absolute;inset:6px;border-radius:52px;background:#070b16}</style><body><div class="glow"></div><div class="grid"></div><div class="frame"><div class="in"></div></div></body>`);
 await p.screenshot({path:S+'bg.png'});await b.close();
 // concat list with each screenshot held for the time it was on screen
 let list='';for(let i=0;i<stamps.length;i++){const dur=((stamps[i+1]??stamps[i]+400)-stamps[i])/1000;list+=`file '${FR}${String(i).padStart(5,'0')}.jpg'\nduration ${Math.max(dur,0.02).toFixed(3)}\n`;}
 list+=`file '${FR}${String(stamps.length-1).padStart(5,'0')}.jpg'\n`;fs.writeFileSync(S+'dlist.txt',list);
 // rounded corners via a mask would be slow; the 6px inner frame already hides square corners poorly, so crop with a rounded alpha
 execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i ${S}dlist.txt -loop 1 -i ${S}bg.png -filter_complex "[0:v]scale=${PW}:${PH},format=yuva420p,geq=lum='p(X,Y)':cb='p(X,Y)':cr='p(X,Y)':a='if(gt(abs(X-${PW}/2),${PW}/2-50)*gt(abs(Y-${PH}/2),${PH}/2-50),if(lte(hypot(abs(X-${PW}/2)-(${PW}/2-50),abs(Y-${PH}/2)-(${PH}/2-50)),50),255,0),255)'[ph];[1:v][ph]overlay=(W-w)/2:(H-h)/2:shortest=1,fps=24,format=yuv420p[v]" -map "[v]" -c:v libx264 -crf 21 ${S}v-main.mp4`);
 const R=S+'frames/';
 for(const [name,from,to] of [['intro',0,60],['outro',384,480]]){const dir=S+name+'/';fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir);let j=0;for(let i=from;i<to;i++)fs.copyFileSync(R+String(i).padStart(4,'0')+'.png',dir+String(j++).padStart(4,'0')+'.png');
  execSync(`ffmpeg -y -loglevel error -framerate 24 -i ${dir}%04d.png -c:v libx264 -pix_fmt yuv420p -crf 20 ${S}v-${name}.mp4`);}
 fs.writeFileSync(S+'list.txt',["v-intro.mp4","v-main.mp4","v-outro.mp4"].map(f=>`file '${S}${f}'`).join('\n'));
 execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i ${S}list.txt -c:v libx264 -pix_fmt yuv420p -crf 21 -movflags +faststart ${D}safehubby-app-tour.mp4`);
 console.log('done');})().catch(e=>{console.log('ERR',e.message.slice(0,300));process.exit(1)});
