import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' })
const SUPA=(process.env.SUPABASE_URL??'').replace(/\/rest\/v1\/?$/,'').replace(/\/$/,''); const SKEY=process.env.SUPABASE_SERVICE_KEY??''
const EMAIL=process.env.ACCEPTANCE_ADVISOR_EMAIL??'advisor-acceptance@taime.tech'
const H={apikey:SKEY,Authorization:`Bearer ${SKEY}`}
async function main(){
  const u=await(await fetch(`${SUPA}/rest/v1/users?email=eq.${encodeURIComponent(EMAIL)}&select=id`,{headers:H})).json() as any[]
  const uid=u[0]?.id
  const r=await fetch(`${SUPA}/rest/v1/advisor_assessments?user_id=eq.${uid}`,{method:'DELETE',headers:{...H,Prefer:'return=representation'}})
  console.log('deletadas:', (await r.json() as any[]).length, 'linhas do assessment do teste')
}
main()
