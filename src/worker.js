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
   const updated=await env.DB.prepare('UPDATE users SET points=points+((?+multitap_level)*?),energy=MIN(max_energy,energy+MAX(0,CAST((?-updated_at)/3600000 AS INTEGER))*(5+recharge_level*2))-(?*?),updated_at=CASE WHEN MIN(max_energy,energy+MAX(0,CAST((?-updated_at)/3600000 AS INTEGER))*(5+recharge_level*2))>=max_energy THEN ? ELSE updated_at+MAX(0,CAST((?-updated_at)/3600000 AS INTEGER))*3600000 END WHERE telegram_id=? AND MIN(max_energy,energy+MAX(0,CAST((?-updated_at)/3600000 AS INTEGER))*(5+recharge_level*2))>=(?*?) RETURNING telegram_id').bind(tapReward,count,now,energyCost,count,now,now,now,id,now,energyCost,count).first();
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
    const isMember=status==='member'||status==='administrator'||status==='creator'||(status==='restricted'&&mj?.result?.is_member===true);if(!mj.ok||!isMember)return fail('Join the official Telegram channel first, then try Claim.',403);
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
  if(url.pathname==='/api/tap'&&request.method==='POST'){verified=await auth(request,env,body);if((await readAdminSetting(env,'mining_enabled','1'))!=='1')return fail('Mining is temporarily paused',403);await ensureUser(env,verified);const now=Date.now();const id=String(verified.user.id);const tapReward=Math.max(0,Math.min(100,Number(await readAdminSetting(env,'tap_reward','1'))||1));const energyCost=Math.max(1,Math.min(100,Number(await readAdminSetting(env,'energy_cost','10'))||10));const updated=await env.DB.prepare('UPDATE users SET points=points+(?+multitap_level),energy=MIN(max_energy,energy+MAX(0,CAST((?-updated_at)/3600000 AS INTEGER))*(5+recharge_level*2))-?,updated_at=CASE WHEN MIN(max_energy,energy+MAX(0,CAST((?-updated_at)/3600000 AS INTEGER))*(5+recharge_level*2))>=max_energy THEN ? ELSE updated_at+MAX(0,CAST((?-updated_at)/3600000 AS INTEGER))*3600000 END WHERE telegram_id=? AND MIN(max_energy,energy+MAX(0,CAST((?-updated_at)/3600000 AS INTEGER))*(5+recharge_level*2))>=? RETURNING telegram_id').bind(tapReward,now,energyCost,now,now,now,id,now,energyCost).first();if(!updated)return fail('Not enough energy',409);const row=await getUser(env,id);if(Number(row.points)>=500){const referralBonus=Math.max(0,Math.min(100000,Number(await readAdminSetting(env,'referral_bonus','250'))||250));await env.DB.batch([env.DB.prepare('UPDATE users SET points=points+? WHERE telegram_id=(SELECT inviter_id FROM referrals WHERE invitee_id=? AND active=0 AND bonus_awarded=0)').bind(referralBonus,id),env.DB.prepare('UPDATE users SET points=points+? WHERE telegram_id=? AND EXISTS (SELECT 1 FROM referrals WHERE invitee_id=? AND active=0 AND bonus_awarded=0)').bind(referralBonus,id,id),env.DB.prepare('UPDATE referrals SET active=1,bonus_awarded=1 WHERE invitee_id=? AND active=0 AND bonus_awarded=0').bind(id)]);}return json({user:await refreshed(env,await getUser(env,id))})}
  if(url.pathname==='/api/upgrade'&&request.method==='POST'){verified=await auth(request,env,body);const kind=body.kind;if(!Object.hasOwn(UPGRADE_BASE,kind))return fail('Unknown upgrade');const row=await ensureUser(env,verified);const levelKey=kind==='multitap'?'multitap_level':kind==='energy'?'energy_level':'recharge_level';const level=Number(row[levelKey]||0);const cost=Math.ceil(UPGRADE_BASE[kind]*Math.pow(1.65,level));if(Number(row.points)<cost)return fail('Not enough NXG Points',409);const extra=kind==='energy'?',max_energy=max_energy+250,energy=energy+250':'';const r=await env.DB.prepare(`UPDATE users SET points=points-?,${levelKey}=${levelKey}+1${extra},updated_at=? WHERE telegram_id=? AND points>=? AND ${levelKey}=?`).bind(cost,Date.now(),String(verified.user.id),cost,level).run();if(!r.success||!(r.meta?.changes>0))return fail('Upgrade failed. Refresh and try again.',409);return json({user:await refreshed(env,await getUser(env,String(verified.user.id)))})}
  if(url.pathname==='/api/daily'&&request.method==='POST'){verified=await auth(request,env,body);await ensureUser(env,verified);const day=new Date().toISOString().slice(0,10);const rewards=[50,75,100,150,200,300,500];const dailyBase=Math.max(0,Math.min(100000,Number(await readAdminSetting(env,'daily_bonus','50'))||50));const claim=await env.DB.prepare('INSERT INTO daily_claims (telegram_id,claim_day,created_at) VALUES (?,?,?) ON CONFLICT(telegram_id,claim_day) DO NOTHING RETURNING id').bind(String(verified.user.id),day,Date.now()).first();if(!claim)return fail('Daily reward already claimed',409);const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);const existing=await getUser(env,String(verified.user.id));const nextStreak=existing?.last_daily_day===yesterday?Math.min(7,Number(existing.streak||0)+1):1;const reward=Math.round(rewards[nextStreak-1]*(dailyBase/50));await env.DB.prepare('UPDATE users SET points=points+?,streak=?,last_daily_day=? WHERE telegram_id=?').bind(reward,nextStreak,day,String(verified.user.id)).run();return json({user:await refreshed(env,await getUser(env,String(verified.user.id))),reward})}
  if(url.pathname==='/api/ad-reward'&&request.method==='POST'){verified=await auth(request,env,body);if(env.ADSGRAM_REWARD_MODE!=='client')return fail('Ad rewards are not enabled for this publisher yet',403);await ensureUser(env,verified);const claimId=String(body.claimId||'');if(!/^[0-9a-f-]{36}$/i.test(claimId))return fail('Invalid ad claim');const id=String(verified.user.id);const day=new Date().toISOString().slice(0,10);const claim=await env.DB.prepare('INSERT INTO ad_claims (claim_id,telegram_id,claim_day,created_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM ad_claims WHERE telegram_id=? AND claim_day=?)<3 ON CONFLICT(claim_id) DO NOTHING RETURNING claim_id').bind(claimId,id,day,Date.now(),id,day).first();if(!claim)return fail('Daily ad reward limit reached or claim already used',409);await env.DB.prepare('UPDATE users SET points=points+25 WHERE telegram_id=?').bind(id).run();return json({user:await refreshed(env,await getUser(env,id)),reward:25})}
  if(url.pathname==='/api/admin/stats'&&request.method==='POST'){verified=await auth(request,env,body);if(!isAdmin(env,verified.user.id))return fail('Admin access denied',403);const users=await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();const points=await env.DB.prepare('SELECT COALESCE(SUM(points),0) AS n FROM users').first();return json({users:Number(users?.n||0),points:Number(points?.n||0)})}
  return fail('API route not found',404);
 }catch(e){return fail(e.message||'Server error',401)}
 }
 if(url.pathname==='/app.js') return new Response(EMBEDDED_APP_JS,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'}});
 if(url.pathname==='/app.css') return new Response(EMBEDDED_APP_CSS,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'no-store'}});
 if(env.ASSETS)return env.ASSETS.fetch(request);
 return new Response('NexusGram assets not configured',{status:404});}
export default {fetch:handle};
