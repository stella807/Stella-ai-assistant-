const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const S='/tmp/claude-0/-home-user/b366c905-7c9d-592d-a31a-1615a07829a4/scratchpad/';
const keys=require(S+'keys.json');
const B='http://localhost:5173';
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:450,height:800},deviceScaleFactor:1,geolocation:{latitude:18.4655,longitude:-66.1057},permissions:['geolocation'],recordVideo:{dir:S+'tour/',size:{width:450,height:800}}});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERR',e.message));
const log=[];
const cap=async(t,sub='')=>{await p.evaluate(([t,sub])=>{let d=document.getElementById('cap');if(!d){d=document.createElement('div');d.id='cap';d.style.cssText='position:fixed;left:12px;right:12px;top:10px;z-index:99999;padding:10px 14px;border-radius:14px;background:rgba(10,14,26,.88);border:1px solid #c99a4c;color:#fff;font:600 15px system-ui;text-align:center;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.5)';document.body.appendChild(d)}d.innerHTML=t+(sub?'<div style="font:400 12px system-ui;color:#d9bd8a;margin-top:2px">'+sub+'</div>':'')},[t,sub]).catch(()=>{});};
const step=async(name,fn)=>{try{await fn();log.push('ok '+name)}catch(e){log.push('FAIL '+name+': '+e.message.split('\n')[0]);}};
const wait=ms=>p.waitForTimeout(ms);
const scroll=async(y,ms=900)=>{await p.evaluate(y=>window.scrollTo({top:y,behavior:'smooth'}),y);await wait(ms)};
const logout=async()=>{await ctx.clearCookies();};

// 1 landing
await step('landing',async()=>{await p.goto(B);await wait(1200);await cap('Safehubby','Real people. For anything. Puerto Rico');await wait(2500);await scroll(500,1800);await scroll(1100,1800);await scroll(0,800);});
// 2 sign in
await step('signin',async()=>{await cap('Welcome back');await p.locator('#email').fill('maria@example.com');await p.locator('#pw').fill('Correct-Horse-9281');await wait(600);await p.getByRole('button',{name:/^sign in$/i}).click();await p.waitForSelector('.tabs-bottom',{timeout:15000});await wait(1200);});
await step('home',async()=>{await cap('Your home','A photo, one big ask, a few simple doors');await wait(2600);await scroll(450,1500);await wait(1500);await scroll(0,800);});
await step('help',async()=>{await cap('Speak with your assistant','A real person. Ask for anything.');await p.getByRole('button',{name:/speak with your assistant/i}).click();await wait(3000);await scroll(400,1500);await wait(1200);await scroll(0,600);});
await step('errands',async()=>{await cap('Errands','You set the limit. Never charged past it.');await p.getByRole('tab',{name:/^errands$/i}).click();await wait(3200);});
await step('rides',async()=>{await cap('Rides','We book it and tell you the price first');await p.getByRole('tab',{name:/^rides$/i}).click();await wait(3200);});
await step('desk',async()=>{await cap('Handle a task','Appointments, reminders, calls and emails');await p.getByRole('tab',{name:/handle a task/i}).click();await wait(3000);});
await step('no-club',async()=>{await cap('By invitation only','The Wingman Club is not shown to anyone who has not been invited');await wait(3000);});
await step('payments',async()=>{await cap('Payments','ATH Móvil balance, PayPal, Visa and Mastercard');await p.getByRole('tab',{name:/payments/i}).click();await wait(2500);await scroll(500,1600);await wait(1500);await scroll(0,600);});
await step('watch',async()=>{await cap('Safety','Check-ins, location sharing and SOS — always free');await p.getByRole('tab',{name:/watch/i}).click();await wait(3200);});
await step('account',async()=>{await cap('Text or email alerts','Discreet, and your choice');await p.getByRole('button',{name:/^account$/i}).click();await wait(3000);await scroll(500,1500);await wait(1200);await scroll(0,500);});
// 3 club assistant
await logout();
await step('club-signin',async()=>{await p.goto(B+'/master');await wait(1000);await cap('The club assistant','Your own assistant for the club — signs in with its own key');await p.locator('#mst-key').fill(keys.clubKey);await wait(800);await p.getByRole('button',{name:/sign in|continue/i}).first().click();await p.waitForSelector('text=Club desk',{timeout:15000});await wait(1500);});
await step('club-desk',async()=>{await cap('Club desk','How the business is doing, at a glance');await wait(3200);});
await step('invite',async()=>{await cap('Invite someone','The club is by invitation');const row=p.locator('.row-between',{hasText:'Maria Torres'}).first();await row.getByRole('button',{name:/invite/i}).click();await wait(2600);});
// 4 member accepts
await logout();
await step('member-again',async()=>{await p.goto(B);await wait(1000);await p.locator('#email').fill('maria@example.com');await p.locator('#pw').fill('Correct-Horse-9281');await p.getByRole('button',{name:/^sign in$/i}).click();await p.waitForSelector('.tabs-bottom',{timeout:15000});await wait(800);await cap('Maria has been invited','Now the Wingman Club appears for her');await scroll(450,1200);await wait(2200);});
await step('club-open',async()=>{await p.getByRole('button',{name:/wingman club/i}).first().click();await wait(2000);await cap('The Wingman Club','Cigars, bourbon, the track, the sky');await scroll(500,1600);await wait(1500);await scroll(1100,1600);await wait(1200);});
await step('club-join',async()=>{await p.getByRole('button',{name:/join the club/i}).click();await wait(1500);await scroll(99999,1200);await cap('Ask your club assistant','A table for six, a car to the track…');await p.getByLabel('Ask your club assistant').fill('A table for six at the cigar lounge on Friday, and a car there');await wait(900);await p.getByRole('button',{name:/^ask$/i}).click();await wait(2400);});
// 5 club assistant arranges
await logout();
await step('arrange',async()=>{await p.goto(B+'/master');await wait(800);await p.locator('#mst-key').fill(keys.clubKey);await p.getByRole('button',{name:/sign in|continue/i}).first().click();await p.waitForSelector('text=Club desk',{timeout:15000});await cap('The assistant arranges it','Books everything and tells the member');await wait(1800);await p.getByLabel(/reply to/i).first().fill('Table for six booked at 8pm, car at 7:30.');await wait(1200);await p.getByRole('button',{name:/^arranged$/i}).first().click();await wait(2400);});
// 6 owner
await logout();
await step('owner',async()=>{await p.goto(B+'/master');await wait(800);await cap('The owner\'s portal','Everything, with an access log');await p.locator('#mst-key').fill(keys.ownerKey);await p.getByRole('button',{name:/sign in|continue/i}).first().click();await p.waitForSelector('text=Club desk',{timeout:15000});await wait(2500);await scroll(700,1500);await wait(1500);await scroll(1500,1500);await wait(1500);});
// 7 assistant portal
await logout();
await step('employee',async()=>{await p.goto(B+'/employee');await wait(800);await cap('The assistants\' portal','Each assistant has their own sign-in');await p.locator('#emp-username').fill('asst_camila');await p.locator('#emp-password').fill('demo-assistant-pass-1');await wait(700);await p.getByRole('button',{name:/sign in/i}).click();await wait(3000);await scroll(500,1500);await wait(1500);});
await step('outro',async()=>{await cap('Safehubby','safehubby.com');await wait(2000);});
console.log(log.join('\n'));
await ctx.close();await b.close();
})().catch(e=>{console.log('ERR',e.message.slice(0,300));process.exit(1)});
