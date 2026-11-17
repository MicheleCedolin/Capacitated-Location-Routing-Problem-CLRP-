// Runs every heuristic (default settings of the Solver page) plus a few option combinations through the wasm engine under Node.
const fs=require('fs'),path=require('path'); const W=require('../js/clrp-wasi.js'); const E=require('../js/engine.js');
const cat=require('../data/catalog.json'), man=require('../data/instances.json'); const mod=new WebAssembly.Module(fs.readFileSync(path.join(__dirname,'../wasm/clrp.wasm')));
const inst=man.find(o=>o.id===(process.argv[2]||'coord20-5-1')), T=+(process.argv[3]||1.5);
const P=Object.fromEntries(cat.presets.map(p=>[p.id,p.operators]));
const cases=[];
for(const h of cat.heuristics) cases.push({n:h.id+' (default)',h:h.id,ls:h.default_ls,nb:h.default_nb,ops:P[h.default_nb]||[],params:{}});
const ops3=['intra_relocate1','inter_swap11','depot_close'];
for(const ls of ['vnd','rvnd','best']) cases.push({n:'ils/'+ls+'/common5',h:'ils',ls,nb:'common5',ops:P.common5,params:{}});
cases.push({n:'ils/vnd/custom',h:'ils',ls:'vnd',nb:E.aliasName(ops3),ops:ops3,params:{}});
cases.push({n:'ils/rvnd/hgamp_depot',h:'ils',ls:'rvnd',nb:'hgamp_depot',ops:P.hgamp_depot,params:{}});
cases.push({n:'grasp halving layer',h:'grasp',ls:'first',nb:'baseline_route',ops:P.baseline_route,params:{depot_layer:'halving'}});
// the 'mip' depot layer needs a MILP solver that the C++ engine does not have; the Solver page does not offer it (expected exit 2)
cases.push({n:'grasp mip layer (expected to fail)',h:'grasp',ls:'first',nb:'baseline_route',ops:P.baseline_route,params:{depot_layer:'mip'},expect_fail:true});
(async()=>{ let bad=0;
 for(const c of cases){
  const spec={instance:inst.id,fam:inst.family,file:inst.file,heuristic:c.h,local_search:c.ls,neighborhoods:c.nb,operators:c.ops,time_limit:T,checkpoints:[T/4,T/2,3*T/4,T].map(E.fmtG).join(':'),params:c.params};
  const args=E.buildArgs(spec,1,cat); const files={['data/'+inst.family+'/'+inst.file]:fs.readFileSync(path.join(__dirname,'../data/instances/'+inst.file)),'reference/CLRP_reference.json':JSON.stringify([{problem:'CLRP',family:inst.family,instance_id:inst.id,reference_best:inst.bks,status:inst.status}])};
  const t=Date.now(); const r=await W.run(mod,{files,args}); const dec=new TextDecoder(); const k=Object.keys(r.files).find(p=>p.endsWith('.solution.json'));
  let sj=null; if(k) sj=JSON.parse(dec.decode(r.files[k])); const ok=r.exit===0&&!r.trapped&&sj&&sj.status==='ok'; if(c.expect_fail){ console.log(ok?'UNEXPECTED OK':'expected failure (exit '+r.exit+')',c.n); if(ok) bad++; continue; } if(!ok) bad++;
  console.log((ok?'OK  ':'FAIL'),c.n.padEnd(26),'exit',r.exit,sj?('obj '+sj.objective+' gap '+(sj.gap_pct===null?'null':sj.gap_pct.toFixed(2))+' '+sj.status):'', (Date.now()-t)+'ms', ok?'':(r.trapMsg+' '+r.stderr).slice(0,200));
 } console.log('failures:',bad,'of',cases.length);
})();
