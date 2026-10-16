// Turns the timestamped phone screenshots into one branded 1080x1920 video:
// intro card, the app on the brand background, outro card.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs');const {execSync}=require('child_process');
const S='/tmp/claude-0/-home-user/b366c905-7c9d-592d-a31a-1615a07829a4/scratchpad/';
const FR=S+'dframes/',OUT=S+'cframes/',D='/home/user/Stella-ai-assistant-/docs/marketing/video/';
const stamps=JSON.parse(fs.readFileSync(FR+'stamps.json'));
const FPS=24,total=stamps[stamps.length-1];
fs.rmSync(OUT,{recursive:true,force:true});fs.mkdirSync(OUT,{recursive:true});
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await (await b.newContext({viewport:{width:1080,height:1920},deviceScaleFactor:1})).newPage();
 // One page that holds the brand background; each output frame swaps the phone image in.
 await p.setContent(`<link rel="stylesheet" href="file://${D}../flyers/flyer.css"><style>
  body{width:1080px;height:1920px;position:relative}
  .stage{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;align-items:center;justify-content:center}
  #ph{width:900px;border-radius:56px;border:5px solid transparent;background:linear-gradient(#070b16,#070b16) padding-box,linear-gradient(160deg,#ffb547,#ff7a59,#6ee7ff) border-box;box-shadow:0 30px 100px rgba(0,0,0,.6),0 0 90px rgba(110,160,255,.25);display:block}
 </style><body><div class="glow"></div><div class="grid"></div><div class="stage"><img id="ph"></div></body>`);
 const src=i=>'file://'+FR+String(i).padStart(5,'0')+'.jpg';
 let outN=0,k=0;
 const total_out=Math.floor(total/1000*FPS);
 for(let f=0;f<total_out;f++){const t=f/FPS*1000;while(k<stamps.length-1&&stamps[k+1]<=t)k++;
  await p.evaluate(s=>new Promise(r=>{const im=document.getElementById('ph');im.onload=r;im.src=s;}),src(k));
  await p.screenshot({path:OUT+String(outN++).padStart(5,'0')+'.jpg',type:'jpeg',quality:90});}
 await b.close();console.log('composed',outN);
 const R=S+'frames/';// reel frames for intro/outro
 const seg=(name,from,to)=>{const dir=S+name+'/';fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir);let j=0;for(let i=from;i<to;i++)fs.copyFileSync(R+String(i).padStart(4,'0')+'.png',dir+String(j++).padStart(4,'0')+'.png');return dir;};
 seg('intro',0,60);seg('outro',384,480);
 const enc=(inp,pat,out)=>execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i ${inp}${pat} -c:v libx264 -pix_fmt yuv420p -crf 20 ${S}${out}`);
 enc(S+'intro/','%04d.png','v-intro.mp4');enc(S+'outro/','%04d.png','v-outro.mp4');enc(OUT,'%05d.jpg','v-main.mp4');
 fs.writeFileSync(S+'list.txt',["v-intro.mp4","v-main.mp4","v-outro.mp4"].map(f=>`file '${S}${f}'`).join('\n'));
 execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i ${S}list.txt -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart ${D}safehubby-app-tour.mp4`);
 console.log('done');
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});
