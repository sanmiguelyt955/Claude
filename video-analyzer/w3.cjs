const D=require('better-sqlite3'); const db=new D('./data/db/app.sqlite',{readonly:true})
const s=Date.now()
const tick=()=>{
  const v=db.prepare('SELECT status,error_message FROM videos').get()
  if(v.status==='ready'||v.status==='failed'){
    const c={escenas:db.prepare('SELECT COUNT(*) c FROM scenes').get().c,
      transcripcion:db.prepare('SELECT COUNT(*) c FROM transcript_chunks').get().c,
      elementos:db.prepare('SELECT COUNT(*) c FROM video_elements').get().c}
    const r=db.prepare("SELECT model,processing_mode,input_tokens,output_tokens,estimated_cost_usd FROM analysis_runs WHERE phase='first_pass' AND succeeded=1 ORDER BY created_at DESC LIMIT 1").get()
    console.log(`FIN ${v.status} en ${Math.round((Date.now()-s)/1000)}s`, JSON.stringify(c), JSON.stringify(r||{}), (v.error_message||'').slice(0,300))
    process.exit(0)
  }
  if(Date.now()-s>1700000){console.log('TIMEOUT '+v.status);process.exit(1)}
  setTimeout(tick,5000)
}
tick()
