/* ==========================================================
   Integração com o Supabase — Gestão Hospitalar
   1) Preencha SUPABASE_URL e SUPABASE_ANON_KEY abaixo
      (Supabase > Project Settings > API)
   2) Use SOMENTE a chave "anon / public". Nunca a "service_role".
   ========================================================== */
const SUPABASE_URL      = "https://sfljtynpmreaqxnrembt.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "sb_publishable_ujIxYpCvuLWRmzBLdsZSgA_BmWRl95y";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------- LOGIN ---------------- */
async function sbRequireLogin(){
  const { data:{ session } } = await sb.auth.getSession();
  if(session){ sbAddLogout(); return session; }
  return new Promise(resolve=>{
    const ov=document.createElement("div");
    ov.style.cssText="position:fixed;inset:0;z-index:9999;background:#0f1f3d;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,system-ui,sans-serif";
    ov.innerHTML=`
      <div style="background:#fff;border-radius:12px;padding:28px;width:100%;max-width:360px;box-shadow:0 20px 50px rgba(0,0,0,.35)">
        <h2 style="margin:0 0 4px;font-size:20px;color:#0f172a">Gestão Hospitalar</h2>
        <p style="margin:0 0 18px;color:#64748b;font-size:13px">Entre para acessar os dados.</p>
        <input id="sbEmail" type="email" placeholder="E-mail" autocomplete="username" style="width:100%;padding:10px;margin-bottom:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px">
        <input id="sbPass" type="password" placeholder="Senha" autocomplete="current-password" style="width:100%;padding:10px;margin-bottom:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px">
        <div id="sbErr" style="color:#c81e1e;font-size:12.5px;min-height:18px;margin-bottom:8px"></div>
        <button id="sbGo" style="width:100%;padding:11px;border:0;border-radius:8px;background:#1657d1;color:#fff;font-weight:600;font-size:14px;cursor:pointer">Entrar</button>
      </div>`;
    document.body.appendChild(ov);
    const go=async()=>{
      const email=ov.querySelector("#sbEmail").value.trim(), password=ov.querySelector("#sbPass").value;
      const err=ov.querySelector("#sbErr"); err.textContent="";
      const { error }=await sb.auth.signInWithPassword({ email, password });
      if(error){ err.textContent="E-mail ou senha incorretos."; return; }
      ov.remove(); sbAddLogout(); resolve();
    };
    ov.querySelector("#sbGo").onclick=go;
    ov.querySelector("#sbPass").addEventListener("keydown",e=>{ if(e.key==="Enter") go(); });
  });
}
function sbAddLogout(){
  if(document.getElementById("sbLogout")) return;
  const b=document.createElement("button"); b.id="sbLogout"; b.textContent="Sair";
  b.style.cssText="position:fixed;right:12px;bottom:12px;z-index:50;padding:6px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;font-size:12px;cursor:pointer;opacity:.85";
  b.onclick=async()=>{ await sb.auth.signOut(); location.reload(); };
  document.body.appendChild(b);
}

/* ---------------- CADASTROS (especialidades e médicos) ---------------- */
let _cadTimer=null;
function sbPushCad(cad){               // grava com pequeno atraso para juntar alterações seguidas
  clearTimeout(_cadTimer);
  _cadTimer=setTimeout(async()=>{
    const { error }=await sb.from("cadastros").upsert({ id:"main", data:cad, updated_at:new Date().toISOString() });
    if(error) console.error("Erro ao salvar cadastros:", error.message);
  },300);
}

/* ---------------- PACIENTES ----------------
   Mesma interface que o programa já usava (add / set / delete / bulk / onSnapshot),
   então o resto do código não precisa mudar. */
function makeSupabaseDb({ onCad }={}){
  const listeners=[];
  let cache={};                         // id -> dados do paciente
  const emit=()=>{ const docs=Object.entries(cache).map(([id,data])=>({id,data})); listeners.forEach(fn=>fn(docs)); };
  const isUuid=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const fail=(msg,error)=>{ if(error) throw new Error(msg+": "+error.message); };

  return {
    collection(){ return {
      async add(data){
        const { data:row, error }=await sb.from("patients").insert({ data }).select("id").single();
        fail("Não foi possível salvar",error);
        cache[row.id]=data; emit(); return { id:row.id };
      },
      onSnapshot(fn){ listeners.push(fn); emit(); }
    };},

    doc(path){ const id=path.split("/")[1]; return {
      async set(data){
        const { error }=await sb.from("patients").upsert({ id, data, updated_at:new Date().toISOString() });
        fail("Não foi possível salvar",error);
        cache[id]=data; emit();
      },
      async delete(){
        const { error }=await sb.from("patients").delete().eq("id",id);
        fail("Não foi possível excluir",error);
        delete cache[id]; emit();
      }
    };},

/* Altera vários pacientes de uma vez (ex.: renomear especialidade/médico) */
    async bulk(fn){
      const copy=JSON.parse(JSON.stringify(cache)); fn(copy);
      const rows=Object.entries(copy)
        .filter(([id,d])=>JSON.stringify(d)!==JSON.stringify(cache[id]))
        .map(([id,data])=>({ id, data, updated_at:new Date().toISOString() }));
      if(rows.length){
        const { error }=await sb.from("patients").upsert(rows);
        fail("Não foi possível atualizar",error);
      }
      cache=copy; emit();
    },

    /* Restaurar backup: substitui todos os pacientes */
    async replaceAll(obj){
      const { error:e1 }=await sb.from("patients").delete().not("id","is",null);
      fail("Falha ao limpar dados",e1);
      const rows=Object.entries(obj).map(([k,data])=>({ id:isUuid(k)?k:crypto.randomUUID(), data }));
      for(let i=0;i<rows.length;i+=500){
        const { error }=await sb.from("patients").insert(rows.slice(i,i+500));
        fail("Falha ao restaurar",error);
      }
      await this.load();
    },

    snapshot(){ return JSON.parse(JSON.stringify(cache)); },

    async load(){
      const { data, error }=await sb.from("patients").select("id,data").order("created_at",{ascending:true});
      fail("Não foi possível carregar os dados",error);
      cache={}; data.forEach(r=>{ cache[r.id]=r.data; }); emit();
    },

    /* Carrega tudo e liga a atualização em tempo real */
    async start(defaultCad){
      await this.load();
      const { data:c }=await sb.from("cadastros").select("data").eq("id","main").maybeSingle();
      if(c&&c.data&&Array.isArray(c.data.specs)) onCad&&onCad(c.data); else sbPushCad(defaultCad);

      sb.channel("hospital-realtime")
        .on("postgres_changes",{event:"*",schema:"public",table:"patients"},p=>{
          if(p.eventType==="DELETE") delete cache[p.old.id]; else cache[p.new.id]=p.new.data;
          emit();
        })
        .on("postgres_changes",{event:"*",schema:"public",table:"cadastros"},p=>{
          if(p.new&&p.new.data&&Array.isArray(p.new.data.specs)) onCad&&onCad(p.new.data);
        })
        .subscribe();
    }
  };
}
