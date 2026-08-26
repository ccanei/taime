import dotenv from 'dotenv'; import { randomUUID } from 'crypto'; dotenv.config({ path: '.env.local' })
const SUPA=(process.env.SUPABASE_URL??'').replace(/\/rest\/v1\/?$/,'').replace(/\/$/,''); const ANON=process.env.SUPABASE_ANON_KEY??''; const SKEY=process.env.SUPABASE_SERVICE_KEY??''
const SITE='https://www.taime.tech'; const EMAIL=process.env.ACCEPTANCE_ADVISOR_EMAIL??'advisor-acceptance@taime.tech'; const H={apikey:SKEY,Authorization:`Bearer ${SKEY}`}
async function mint(){const gr=await fetch(`${SUPA}/auth/v1/admin/generate_link`,{method:'POST',headers:{...H,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:EMAIL})});const l=await gr.json() as any;const h=l.hashed_token??l.properties?.hashed_token;const vr=await fetch(`${SUPA}/auth/v1/verify`,{method:'POST',headers:{apikey:ANON,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',token_hash:h})});return await vr.json() as any}
function ck(s:any){const ref=new URL(SUPA).hostname.split('.')[0];const key=`sb-${ref}-auth-token`;const e='base64-'+Buffer.from(JSON.stringify(s)).toString('base64url');const M=3180;if(e.length<=M)return `${key}=${e}`;const p:string[]=[];for(let i=0,n=0;i<e.length;i+=M,n++)p.push(`${key}.${n}=${e.slice(i,i+M)}`);return p.join('; ')}
async function main(){
  const s=await mint();const cookie=ck(s);const sid=randomUUID()
  const q='como devo pensar a segurança dos agentes que quero colocar em produção?'
  await fetch(`${SITE}/api/advisor/chat`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({message:q,sessionId:sid})})
  await new Promise(r=>setTimeout(r,1500))
  const m=await(await fetch(`${SUPA}/rest/v1/advisory_memory?session_id=eq.${sid}&role=eq.assistant&select=context_metadata&order=created_at.desc&limit=1`,{headers:H})).json() as any[]
  const cap=m[0]?.context_metadata?.assessment_capture
  console.log('assessment_capture:', JSON.stringify(cap))
}
main().catch(e=>{console.error(e);process.exit(1)})
