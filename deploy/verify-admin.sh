#!/usr/bin/env bash
set +e
cd "$(dirname "$0")/.."
export PATH="/root/.nvm/versions/node/v24.16.0/bin:$PATH"
echo "=== strings da UI nova no bundle single ==="
grep -aroh "Administ\|Gerar hist\|Personagens\|Acesso restrito\|Temas" deploy/dist-single/_expo/static/js 2>/dev/null | sort -u | head
echo "=== fluxo admin via proxy interno (18080 -> api) ==="
node - <<'NODE'
const B="http://127.0.0.1:18080";
const H=s=>({ "Content-Type":"application/json","X-App-Slug":"historias-da-gigi", ...(s?{Authorization:"Bearer "+s}:{}) });
const j=async(p,o={})=>{const r=await fetch(B+p,o);const t=await r.text();try{return[r.status,JSON.parse(t)]}catch{return[r.status,t]}};
(async()=>{
  const [,login]=await j("/api/v1/auth/login",{method:"POST",headers:H(),body:JSON.stringify({email:"admin@storygen.dev",password:"admin123"})});
  const tok=login.access_token; if(!tok){console.log("LOGIN FAIL",JSON.stringify(login));return;}
  const [ms,me]=await j("/api/v1/me",{headers:H(tok)}); console.log("/me ->",ms,JSON.stringify(me));
  const [,cfg]=await j("/api/v1/config",{headers:H(tok)}); const uni=cfg.singleModeUniverseId;
  const [ls,chars]=await j("/api/v1/universes/"+uni+"/characters",{headers:H(tok)});
  console.log("characters ->",ls,Array.isArray(chars)?chars.map(c=>c.name).join(", "):chars);
  const [ts,themes]=await j("/api/v1/universes/"+uni+"/themes",{headers:H(tok)});
  console.log("themes ->",ts,Array.isArray(themes)?themes.map(t=>t.title).join(", "):themes);
  const [crs,nc]=await j("/api/v1/universes/"+uni+"/characters",{method:"POST",headers:H(tok),body:JSON.stringify({name:"Pingo",classification:"SECUNDARIO",traits:["curioso","alegre"]})});
  console.log("create char ->",crs,nc&&nc.name);
})();
NODE
