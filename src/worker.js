import { handleTelegramRequest, isUserBlocked, readAdminSetting } from './admin.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const MAX_INIT_AGE = 60 * 60 * 24;
const START_ENERGY = 1000;
const REGEN_PER_SECOND = 5;
const DAILY_BONUS = 50;
const UPGRADE_BASE = { multitap: 100, energy: 150, recharge: 125 };

function json(data, status=200){ return new Response(JSON.stringify(data), {status, headers:JSON_HEADERS}); }
function fail(message,status=400){ return json({error:message},status); }
async function hmac(keyBytes, message){ const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message))); }
function hex(bytes){return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('')}
function safeEqual(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function verifyInitData(initData,botToken){
  if(!initData||!botToken)throw new Error('Telegram sign-in is not configured');
  const params=new URLSearchParams(initData);const received=params.get('hash');if(!received)throw new Error('Invalid Telegram launch data');params.delete('hash');
  const authDate=Number(params.get('auth_date')||0);if(!authDate||Math.floor(Date.now()/1000)-authDate>MAX_INIT_AGE)throw new Error('Telegram session expired. Reopen the Mini App.');
  const check=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret=await hmac(new TextEncoder().encode('WebAppData'),botToken);const expected=hex(await hmac(secret,check));if(!safeEqual(expected,received))throw new Error('Telegram signature verification failed');
  const user=JSON.parse(params.get('user')||'{}');if(!user.id)throw new Error('Telegram user missing');return {user,startParam:params.get('start_param')||''};
}
function energyState(row,now){const max=Number(row.max_energy||START_ENERGY);const last=Number(row.updated_at||now);const regen=REGEN_PER_SECOND+Number(row.recharge_level||0)*2;const energy=Math.min(max,Number(row.energy||0)+Math.max(0,Math.floor((now-last)/1000))*regen);return {energy,max,regen}}
function userShape(row,referralCount=0){const multi=Number(row.multitap_level||0),energy=Number(row.energy_level||0),recharge=Number(row.recharge_level||0);return {telegramId:String(row.telegram_id),firstName:row.first_name||'Miner',points:Number(row.points||0),energy:Number(row.energy||0),maxEnergy:Number(row.max_energy||START_ENERGY),tapPower:1+multi,streak:Number(row.streak||0),rank:'Rookie',referralCount,upgrades:{multitap:multi,energy,recharge},upgradeCosts:{multitap:Math.ceil(UPGRADE_BASE.multitap*Math.pow(1.65,multi)),energy:Math.ceil(UPGRADE_BASE.energy*Math.pow(1.65,energy)),recharge:Math.ceil(UPGRADE_BASE.recharge*Math.pow(1.65,recharge))}}}
async function getUser(env,id){return await env.DB.prepare('SELECT * FROM users WHERE telegram_id=?').bind(String(id)).first()}
async function auth(request,env,body){const data=body||{};const initData=data.initData||new URL(request.url).searchParams.get('initData')||'';const verified=await verifyInitData(initData,env.BOT_TOKEN);if(await isUserBlocked(env,verified.user.id))throw new Error('Your account is restricted. Contact NexusGram support.');return verified}
async function ensureUser(env,verified){const id=String(verified.user.id);let row=await getUser(env,id);const now=Date.now();if(!row){const first=String(verified.user.first_name||'Miner').slice(0,64);await env.DB.prepare('INSERT OR IGNORE INTO users (telegram_id,first_name,username,points,energy,max_energy,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,first,String(verified.user.username||'').slice(0,64),0,START_ENERGY,START_ENERGY,now,now).run();row=await getUser(env,id);const match=verified.startParam.match(/^ref_(\d{1,20})$/);if(match&&match[1]!==id){const inviter=await getUser(env,match[1]);if(inviter){await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO referrals (inviter_id,invitee_id,created_at,active) VALUES (?,?,?,0)').bind(match[1],id,now),env.DB.prepare('UPDATE users SET referred_by=? WHERE telegram_id=? AND referred_by IS NULL').bind(match[1],id)]);}}}else{await env.DB.prepare('UPDATE users SET first_name=?,username=? WHERE telegram_id=?').bind(String(verified.user.first_name||row.first_name).slice(0,64),String(verified.user.username||'').slice(0,64),id).run();row=await getUser(env,id);}return row}
async function refreshed(env,row){const now=Date.now();const e=energyState(row,now);await env.DB.prepare('UPDATE users SET energy=?,updated_at=? WHERE telegram_id=?').bind(e.energy,now,row.telegram_id).run();const updated=await getUser(env,row.telegram_id);const refs=await env.DB.prepare('SELECT COUNT(*) AS n FROM referrals WHERE inviter_id=? AND active=1').bind(row.telegram_id).first();return userShape(updated,Number(refs?.n||0))}
function isAdmin(env,id){return (env.ADMIN_IDS||'').split(',').map(x=>x.trim()).filter(Boolean).includes(String(id))}
async function handle(request,env){const url=new URL(request.url);const botResponse=await handleTelegramRequest(request,env,url);if(botResponse)return botResponse;if(request.method==='OPTIONS')return new Response(null,{headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'}});if(url.pathname==='/health')return json({ok:true,service:'nexusgram-api'});if(url.pathname.startsWith('/api/')){
 let verified,body={};if(request.method==='POST'){try{body=await request.json()}catch{return fail('Invalid JSON')}}
 try{
  if(url.pathname==='/api/session'&&request.method==='POST'){verified=await auth(request,env,body);const row=await ensureUser(env,verified);const user=await refreshed(env,row);return json({user,config:{botUsername:(env.BOT_USERNAME||'').startsWith('REPLACE_')?'':(env.BOT_USERNAME||''),adsgramBlockId:env.ADSGRAM_BLOCK_ID||'',adRewardEnabled:env.ADSGRAM_REWARD_MODE==='client',newsUrl:env.NEWS_URL||'',chatUrl:env.CHAT_URL||'',youtubeUrl:env.YOUTUBE_URL||'',isAdmin:isAdmin(env,verified.user.id)}})}
  if(url.pathname==='/api/tap-batch'&&request.method==='POST'){
   verified=await auth(request,env,body);
   if((await readAdminSetting(env,'mining_enabled','1'))!=='1')return fail('Mining is temporarily paused',403);
   const count=Math.max(1,Math.min(20,Number(body.count||0)));
   await ensureUser(env,verified);
   const now=Date.now(),id=String(verified.user.id);
   const tapReward=Math.max(0,Math.min(100,Number(await readAdminSetting(env,'tap_reward','1'))||1));
   const energyCost=Math.max(1,Math.min(100,Number(await readAdminSetting(env,'energy_cost','10'))||10));
   const updated=await env.DB.prepare('UPDATE users SET points=points+((?+multitap_level)*?),energy=MIN(max_energy,energy+MAX(0,CAST((?-updated_at)/1000 AS INTEGER))*(5+recharge_level*2))-(?*?),updated_at=? WHERE telegram_id=? AND MIN(max_energy,energy+MAX(0,CAST((?-updated_at)/1000 AS INTEGER))*(5+recharge_level*2))>=(?*?) RETURNING telegram_id').bind(tapReward,count,now,energyCost,count,now,id,now,energyCost,count).first();
   if(!updated)return fail('Not enough energy',409);
   const row=await getUser(env,id);
   if(Number(row.points)>=500){
    const referralBonus=Math.max(0,Math.min(100000,Number(await readAdminSetting(env,'referral_bonus','250'))||250));
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET points=points+? WHERE telegram_id=(SELECT inviter_id FROM referrals WHERE invitee_id=? AND active=0 AND bonus_awarded=0)').bind(referralBonus,id),
      env.DB.prepare('UPDATE users SET points=points+? WHERE telegram_id=? AND EXISTS (SELECT 1 FROM referrals WHERE invitee_id=? AND active=0 AND bonus_awarded=0)').bind(referralBonus,id,id),
      env.DB.prepare('UPDATE referrals SET active=1,bonus_awarded=1 WHERE invitee_id=? AND active=0 AND bonus_awarded=0').bind(id)
    ]);
   }
   return json({user:await refreshed(env,await getUser(env,id))});
  }
  if(url.pathname==='/api/task-reward'&&request.method==='POST'){
   verified=await auth(request,env,body);await ensureUser(env,verified);
   const task=String(body.task||'');
   if(!['news','youtube'].includes(task))return fail('Unknown task');
   await env.DB.prepare('CREATE TABLE IF NOT EXISTS task_claims (telegram_id TEXT NOT NULL, task TEXT NOT NULL, claim_day TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(telegram_id,task))').run();
   if(task==='news'){
    const target=(env.NEWS_URL||'').match(/^https:\/\/t\.me\/([^/?#]+)/i)?.[1];
    if(!target)return fail('Telegram channel is not configured',400);
    const member=await fetch('https://api.telegram.org/bot'+env.BOT_TOKEN+'/getChatMember?chat_id=@'+encodeURIComponent(target)+'&user_id='+encodeURIComponent(String(verified.user.id)));
    const mj=await member.json();
    const status=mj?.result?.status;
    if(!mj.ok||!['member','administrator','creator'].includes(status))return fail('Join the official Telegram channel first, then try Claim.',403);
   }else{
    const started=Number(body.startedAt||0);
    if(!started||Date.now()-started<5000)return fail('Watch the YouTube task for at least 5 seconds before claiming.',403);
   }
   const day=new Date().toISOString().slice(0,10);
   const reward=Math.max(0,Math.min(100000,Number(await readAdminSetting(env,task==='news'?'telegram_task_reward':'youtube_task_reward','25'))||25));
   const claim=await env.DB.prepare('INSERT INTO task_claims (telegram_id,task,claim_day,created_at) VALUES (?,?,?,?) ON CONFLICT(telegram_id,task) DO NOTHING RETURNING telegram_id').bind(String(verified.user.id),task,day,Date.now()).first();
   if(!claim)return fail('Task reward already claimed',409);
   await env.DB.prepare('UPDATE users SET points=points+? WHERE telegram_id=?').bind(reward,String(verified.user.id)).run();
   return json({user:await refreshed(env,await getUser(env,String(verified.user.id))),reward});
  }
  if(url.pathname==='/api/admin/settings'&&request.method==='POST'){
   verified=await auth(request,env,body);if(!isAdmin(env,verified.user.id))return fail('Admin access denied',403);
   const keys=['tap_reward','energy_cost','daily_bonus','referral_bonus','ad_reward','telegram_task_reward','youtube_task_reward','mining_enabled','ads_enabled','maintenance_mode','multitap_base_cost','energy_base_cost','recharge_base_cost','news_url','chat_url','youtube_url'];
   const defaults={tap_reward:'1',energy_cost:'10',daily_bonus:'50',referral_bonus:'250',ad_reward:'25',telegram_task_reward:'25',youtube_task_reward:'25',mining_enabled:'1',ads_enabled:'0',maintenance_mode:'0',multitap_base_cost:'100',energy_base_cost:'150',recharge_base_cost:'125',news_url:env.NEWS_URL||'',chat_url:env.CHAT_URL||'',youtube_url:env.YOUTUBE_URL||''};
   const settings={};for(const k of keys)settings[k]=await readAdminSetting(env,k,defaults[k]);
   return json({settings});
  }
  if(url.pathname==='/api/admin/set'&&request.method==='POST'){
   verified=await auth(request,env,body);if(!isAdmin(env,verified.user.id))return fail('Admin access denied',403);
   const key=String(body.key||''),value=String(body.value??'').trim();
   const allowed=new Set(['tap_reward','energy_cost','daily_bonus','referral_bonus','ad_reward','telegram_task_reward','youtube_task_reward','mining_enabled','ads_enabled','maintenance_mode','multitap_base_cost','energy_base_cost','recharge_base_cost','news_url','chat_url','youtube_url']);
   if(!allowed.has(key))return fail('Unknown admin setting');
   if(['mining_enabled','ads_enabled','maintenance_mode'].includes(key)&&!['0','1'].includes(value))return fail('Switch must be 0 or 1');
   if(['news_url','chat_url','youtube_url'].includes(key)&&value&&!/^https:\/\//i.test(value))return fail('URL must start with https://');
   if(['tap_reward','energy_cost','daily_bonus','referral_bonus','ad_reward','telegram_task_reward','youtube_task_reward','multitap_base_cost','energy_base_cost','recharge_base_cost'].includes(key)&&(!/^\\d{1,9}$/.test(value)||Number(value)>100000000))return fail('Invalid numeric value');
   await env.DB.prepare('INSERT INTO admin_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(key,value,Date.now(),String(verified.user.id)).run();
   return json({ok:true,key,value});
  }
  if(url.pathname==='/api/leaderboard'&&request.method==='GET'){verified=await auth(request,env);const rows=await env.DB.prepare('SELECT first_name AS firstName,points FROM users ORDER BY points DESC LIMIT 50').all();return json({rows:rows.results||[]})}
  if(url.pathname==='/api/referrals'&&request.method==='GET'){verified=await auth(request,env);const rows=await env.DB.prepare('SELECT u.first_name AS firstName,r.active FROM referrals r JOIN users u ON u.telegram_id=r.invitee_id WHERE r.inviter_id=? ORDER BY r.created_at DESC LIMIT 100').bind(String(verified.user.id)).all();return json({referrals:rows.results||[]})}
  if(url.pathname==='/api/tap'&&request.method==='POST'){verified=await auth(request,env,body);if((await readAdminSetting(env,'mining_enabled','1'))!=='1')return fail('Mining is temporarily paused',403);await ensureUser(env,verified);const now=Date.now();const id=String(verified.user.id);const tapReward=Math.max(0,Math.min(100,Number(await readAdminSetting(env,'tap_reward','1'))||1));const energyCost=Math.max(1,Math.min(100,Number(await readAdminSetting(env,'energy_cost','10'))||10));const updated=await env.DB.prepare('UPDATE users SET points=points+(?+multitap_level),energy=MIN(max_energy,energy+MAX(0,CAST((?-updated_at)/1000 AS INTEGER))*(5+recharge_level*2))-?,updated_at=? WHERE telegram_id=? AND MIN(max_energy,energy+MAX(0,CAST((?-updated_at)/1000 AS INTEGER))*(5+recharge_level*2))>=? RETURNING telegram_id').bind(tapReward,now,energyCost,now,id,now,energyCost).first();if(!updated)return fail('Not enough energy',409);const row=await getUser(env,id);if(Number(row.points)>=500){const referralBonus=Math.max(0,Math.min(100000,Number(await readAdminSetting(env,'referral_bonus','250'))||250));await env.DB.batch([env.DB.prepare('UPDATE users SET points=points+? WHERE telegram_id=(SELECT inviter_id FROM referrals WHERE invitee_id=? AND active=0 AND bonus_awarded=0)').bind(referralBonus,id),env.DB.prepare('UPDATE users SET points=points+? WHERE telegram_id=? AND EXISTS (SELECT 1 FROM referrals WHERE invitee_id=? AND active=0 AND bonus_awarded=0)').bind(referralBonus,id,id),env.DB.prepare('UPDATE referrals SET active=1,bonus_awarded=1 WHERE invitee_id=? AND active=0 AND bonus_awarded=0').bind(id)]);}return json({user:await refreshed(env,await getUser(env,id))})}
  if(url.pathname==='/api/upgrade'&&request.method==='POST'){verified=await auth(request,env,body);const kind=body.kind;if(!Object.hasOwn(UPGRADE_BASE,kind))return fail('Unknown upgrade');const row=await ensureUser(env,verified);const levelKey=kind==='multitap'?'multitap_level':kind==='energy'?'energy_level':'recharge_level';const level=Number(row[levelKey]||0);const cost=Math.ceil(UPGRADE_BASE[kind]*Math.pow(1.65,level));if(Number(row.points)<cost)return fail('Not enough NXG Points',409);const extra=kind==='energy'?',max_energy=max_energy+250,energy=energy+250':'';const r=await env.DB.prepare(`UPDATE users SET points=points-?,${levelKey}=${levelKey}+1${extra},updated_at=? WHERE telegram_id=? AND points>=? AND ${levelKey}=?`).bind(cost,Date.now(),String(verified.user.id),cost,level).run();if(!r.success||!(r.meta?.changes>0))return fail('Upgrade failed. Refresh and try again.',409);return json({user:await refreshed(env,await getUser(env,String(verified.user.id)))})}
  if(url.pathname==='/api/daily'&&request.method==='POST'){verified=await auth(request,env,body);await ensureUser(env,verified);const day=new Date().toISOString().slice(0,10);const rewards=[50,75,100,150,200,300,500];const dailyBase=Math.max(0,Math.min(100000,Number(await readAdminSetting(env,'daily_bonus','50'))||50));const claim=await env.DB.prepare('INSERT INTO daily_claims (telegram_id,claim_day,created_at) VALUES (?,?,?) ON CONFLICT(telegram_id,claim_day) DO NOTHING RETURNING id').bind(String(verified.user.id),day,Date.now()).first();if(!claim)return fail('Daily reward already claimed',409);const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);const existing=await getUser(env,String(verified.user.id));const nextStreak=existing?.last_daily_day===yesterday?Math.min(7,Number(existing.streak||0)+1):1;const reward=Math.round(rewards[nextStreak-1]*(dailyBase/50));await env.DB.prepare('UPDATE users SET points=points+?,streak=?,last_daily_day=? WHERE telegram_id=?').bind(reward,nextStreak,day,String(verified.user.id)).run();return json({user:await refreshed(env,await getUser(env,String(verified.user.id))),reward})}
  if(url.pathname==='/api/ad-reward'&&request.method==='POST'){verified=await auth(request,env,body);if(env.ADSGRAM_REWARD_MODE!=='client')return fail('Ad rewards are not enabled for this publisher yet',403);await ensureUser(env,verified);const claimId=String(body.claimId||'');if(!/^[0-9a-f-]{36}$/i.test(claimId))return fail('Invalid ad claim');const id=String(verified.user.id);const day=new Date().toISOString().slice(0,10);const claim=await env.DB.prepare('INSERT INTO ad_claims (claim_id,telegram_id,claim_day,created_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM ad_claims WHERE telegram_id=? AND claim_day=?)<3 ON CONFLICT(claim_id) DO NOTHING RETURNING claim_id').bind(claimId,id,day,Date.now(),id,day).first();if(!claim)return fail('Daily ad reward limit reached or claim already used',409);await env.DB.prepare('UPDATE users SET points=points+25 WHERE telegram_id=?').bind(id).run();return json({user:await refreshed(env,await getUser(env,id)),reward:25})}
  if(url.pathname==='/api/admin/stats'&&request.method==='POST'){verified=await auth(request,env,body);if(!isAdmin(env,verified.user.id))return fail('Admin access denied',403);const users=await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();const points=await env.DB.prepare('SELECT COALESCE(SUM(points),0) AS n FROM users').first();return json({users:Number(users?.n||0),points:Number(points?.n||0)})}
  return fail('API route not found',404);
 }catch(e){return fail(e.message||'Server error',401)}
 }
 if(env.ASSETS)return env.ASSETS.fetch(request);return new Response('NexusGram assets not configured',{status:404});}
export default {fetch:handle};
