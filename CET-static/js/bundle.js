// bundle.js - classic no-module build attaching to window
(function(){
  // ui.js
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'style') node.style.cssText = v;
      else if (v != null) node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function mount(node, child) { clear(node).appendChild(child); }
  function btn(label, { className = 'btn', onClick } = {}) { return el('button', { class: className, onClick }, label); }
  function badge(text) { return el('span', { class: 'badge' }, text); }
  window.UI = { el, clear, mount, btn, badge };
  // Global stub to avoid external inline calls
  window.solveSimpleChallenge = window.solveSimpleChallenge || function(){ return true; };
  // small util
  function debounce(fn, ms){ let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), ms); } }
  // Centralized RNG (seedable). Mulberry32 + string seeding.
  function mulberry32(a){ return function(){ let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } }
  function cyrb128(str){ let h1=1779033703,h2=3144134277,h3=1013904242,h4=2773480762; for(let i=0;i<str.length;i++){ let k=str.charCodeAt(i); h1=h2^Math.imul(h1^k,597399067); h2=h3^Math.imul(h2^k,2869860233); h3=h4^Math.imul(h3^k,951274213); h4=h1^Math.imul(h4^k,2716044179); } h1=Math.imul(h3^ (h1>>>18),597399067); h2=Math.imul(h4^ (h2>>>22),2869860233); h3=Math.imul(h1^ (h3>>>17),951274213); h4=Math.imul(h2^ (h4>>>19),2716044179); const h=(h1^h2^h3^h4)>>>0; return h; }
  function todayKey(){ const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}${m}${da}`; }
  const RNG = (function(){
    let rand = Math.random;
    function setSeed(n){ rand = mulberry32(n>>>0); }
    function seedFromString(s){ return cyrb128(String(s)); }
    function random(){ return rand(); }
    function int(min,max){ return Math.floor(random()*(max-min+1))+min; }
    function pick(arr){ return arr[Math.floor(random()*arr.length)]; }
    return { setSeed, seedFromString, random, int, pick };
  })();
  // default initialization with crypto when available (until router params override)
  try{ if (crypto && crypto.getRandomValues){ const a=new Uint32Array(1); crypto.getRandomValues(a); RNG.setSeed(a[0]||Date.now()); } }catch(_){ RNG.setSeed((Date.now()^Math.random()*1e9)>>>0); }
  window.RNG = RNG;
  function shuffleWith(fnRandom, arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j = Math.floor(fnRandom()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
  function shuffleDeterministic(arr, seedStr){ const seed = RNG.seedFromString(seedStr); const r = mulberry32(seed); return shuffleWith(r, arr); }

  // bookmarks & notes helpers
  function getBookmarks(){ try{ return JSON.parse(localStorage.getItem('cet:bookmarks')||'{}'); }catch(_){ return {}; } }
  function setBookmarks(map){ localStorage.setItem('cet:bookmarks', JSON.stringify(map||{})); }
  function toggleBookmark(id){ const b=getBookmarks(); if (b[id]) delete b[id]; else b[id]=true; setBookmarks(b); return !!b[id]; }
  function isBookmarked(id){ const b=getBookmarks(); return !!b[id]; }
  function getNotes(){ try{ return JSON.parse(localStorage.getItem('cet:notes')||'{}'); }catch(_){ return {}; } }
  function setNotes(map){ localStorage.setItem('cet:notes', JSON.stringify(map||{})); }
  function setNote(id, text){ const n=getNotes(); if (text && text.trim()) n[id]=text.trim(); else delete n[id]; setNotes(n); return n[id]||''; }
  function getNote(id){ const n=getNotes(); return n[id]||''; }

  // router.js
  const routes = new Map();
  let notFound = () => document.createTextNode('Not found');
  function route(path, handler) { routes.set(path, handler); }
  function setNotFound(handler) { notFound = handler; }
  function parse() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = hash.split('?');
    const params = new URLSearchParams(qs || '');
    return { path, params };
  }
  function match(path) {
    for (const [pat, handler] of routes.entries()) {
      if (pat.includes(':')) {
        const names = [];
        const rx = new RegExp('^' + pat.replace(/\//g, '\\/').replace(/:([A-Za-z0-9_]+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
        const m = path.match(rx);
        if (m) {
          const args = {}; names.forEach((n, i) => args[n] = decodeURIComponent(m[i+1]));
          return { handler, args };
        }
      } else if (pat === path) {
        return { handler, args: {} };
      }
    }
    return { handler: notFound, args: {} };
  }
  function startRouter(onChange) {
    function applySeed(params){ const s=params.get('seed'); if (s){ const seed = (s==='daily') ? RNG.seedFromString(todayKey()) : RNG.seedFromString(s); RNG.setSeed(seed); } }
    function go() { const { path, params } = parse(); applySeed(params); const { handler, args } = match(path); onChange(handler, args, params); }
    window.addEventListener('hashchange', go);
    go();
  }
  window.Router = { route, setNotFound, startRouter };

  // api.js (http fetch preferred, fallback inline)
  async function loadHTTP() {
    try {
      const res = await fetch('data/questions.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('network');
      const d = await res.json();
      return Array.isArray(d) ? d : [];
    } catch (e) { return null; }
  }
  function loadLocalDataset(){
    try { const raw = localStorage.getItem('cet:dataset'); return raw? JSON.parse(raw): null; } catch(e){ return null; }
  }
  // --- IndexedDB helpers ---
  const IDB_NAME = 'cet-db';
  const IDB_STORE = 'dataset';
  const IDB_META = 'meta';
  function idbOpen(){
    return new Promise((resolve,reject)=>{
      if (!('indexedDB' in window)) return reject(new Error('no-indexeddb'));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e)=>{
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(IDB_META)) db.createObjectStore(IDB_META);
      };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }
  async function idbSetDataset(arr){
    const db = await idbOpen();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction([IDB_STORE, IDB_META], 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const meta = tx.objectStore(IDB_META);
      // Clear existing then sequentially put to keep transaction active
      const clearReq = store.clear();
      clearReq.onerror = ()=> reject(clearReq.error);
      clearReq.onsuccess = ()=>{
        let i=0; const total = arr.length;
        function step(){
          if (i < total){
            const r = store.put(arr[i++]);
            r.onerror = ()=> reject(r.error);
            r.onsuccess = step;
          } else {
            // write meta as last ops in same tx
            meta.put(total, 'count');
            meta.put(true, 'enabled');
          }
        }
        step();
      };
      tx.oncomplete = ()=> resolve({ ok:true, count: arr.length });
      tx.onerror = ()=> reject(tx.error);
    });
  }
  async function idbLoadAll(){
    const db = await idbOpen();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction([IDB_STORE], 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = ()=> resolve(req.result||[]);
      req.onerror = ()=> reject(req.error);
    });
  }
  async function idbClear(){
    const db = await idbOpen();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction([IDB_STORE, IDB_META], 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.objectStore(IDB_META).clear();
      tx.oncomplete = ()=> resolve(true);
      tx.onerror = ()=> reject(tx.error);
    });
  }

  const api = {
    async load() {
      if (Array.isArray(cache)) return cache;
      const local = loadLocalDataset(); if (Array.isArray(local)) { cache = local; return cache; }
      // Prefer IDB if flagged
      try {
        if (localStorage.getItem('cet:dataset_source') === 'idb') {
          const all = await idbLoadAll(); cache = all; return cache;
        }
      } catch(_) {}
      const http = await loadHTTP();
      if (Array.isArray(http)) { cache = http; return cache; }
      if (Array.isArray(window.CET_QUESTIONS)) { cache = window.CET_QUESTIONS; return cache; }
      return [];
    },
    questions() {
      const local = loadLocalDataset(); if (Array.isArray(local)) return local;
      if (localStorage.getItem('cet:dataset_source') === 'idb' && Array.isArray(cache)) return cache;
      if (Array.isArray(cache)) return cache;
      if (Array.isArray(window.CET_QUESTIONS)) return window.CET_QUESTIONS;
      console.warn('No dataset available yet; returning empty list');
      return [];
    },
    getQuestion(id) { return this.questions().find(q => q.id === id); },
    setDataset(arr){
      // Heuristic: skip localStorage if payload too large (~>4.5MB)
      try { if (JSON.stringify(arr).length > 4500000) { return { ok: false, error: new Error('too-large-for-localStorage') }; } } catch(_) {}
      try {
        localStorage.setItem('cet:dataset', JSON.stringify(arr));
        cache = arr;
        localStorage.setItem('cet:dataset_source','ls');
        return { ok: true, via: 'ls' };
      } catch(e) {
        console.warn('Failed to persist dataset', e);
        return { ok: false, error: e };
      }
    },
    async setDatasetIDB(arr){
      try {
        const r = await idbSetDataset(arr);
        localStorage.setItem('cet:dataset_source','idb');
        cache = null; // will be loaded on demand
        return { ok: true, via: 'idb', count: r.count };
      } catch(e){
        console.warn('Failed to persist dataset to IDB', e);
        return { ok:false, error:e };
      }
    },
    async clearDatasetAll(){
      localStorage.removeItem('cet:dataset');
      localStorage.removeItem('cet:dataset_source');
      try { await idbClear(); } catch(_) {}
      cache = null;
    }
  };
  window.api = api;
  let cache = null;
  loadHTTP().then(d=>{ if (Array.isArray(d)) cache=d; }).catch(()=>{});

  // Synthetic random question generator (parametric)
  function rnd(min, max){ return RNG.int(min,max); }
  function pick(arr){ return RNG.pick(arr); }
  function mkId(prefix){ return prefix+'-'+Math.floor(RNG.random()*Number.MAX_SAFE_INTEGER).toString(36).slice(0,8); }
  function genMath(){
    const letters=['A','B','C','D'];
    const kind = pick(['add','sub','mul','eq']);
    if (kind==='add'){
      const a=rnd(2,99), b=rnd(2,99); const ans=a+b; const opts=[ans, ans+rnd(1,5), ans-rnd(1,5), ans+rnd(6,10)];
      const shuffled=shuffleWith(RNG.random, opts.map((v,i)=>({v,i})));
      const correctId = letters[shuffled.findIndex(o=>o.v===ans)];
      return { id: mkId('m'), subject:'Mathematics', topic:'Arithmetic', difficulty: pick(['easy','medium','medium','hard']), type:'single_choice', question_text:`What is ${a} + ${b}?`, options: shuffled.map((o,idx)=>({id:letters[idx], text:String(o.v)})), correct_option_ids:[correctId], marks:1, negative_marks:0.25, explanation:`${a}+${b}=${ans}.`, solution_steps:[`Compute sum: ${a}+${b}=${ans}`], tags:['generated'] };
    }
    if (kind==='sub'){
      const a=rnd(50,150), b=rnd(2,49); const ans=a-b; const opts=[ans, ans+rnd(1,5), ans-rnd(1,5), ans+rnd(6,10)];
      const shuffled=shuffleWith(RNG.random, opts.map((v,i)=>({v,i})));
      const correctId = letters[shuffled.findIndex(o=>o.v===ans)];
      return { id: mkId('m'), subject:'Mathematics', topic:'Arithmetic', difficulty: pick(['easy','medium','hard']), type:'single_choice', question_text:`What is ${a} - ${b}?`, options: shuffled.map((o,idx)=>({id:letters[idx], text:String(o.v)})), correct_option_ids:[correctId], marks:1, negative_marks:0.25, explanation:`${a}-${b}=${ans}.`, solution_steps:[`Compute difference: ${a}-${b}=${ans}`], tags:['generated'] };
    }
    if (kind==='mul'){
      const a=rnd(3,20), b=rnd(3,20); const ans=a*b; const opts=[ans, ans+rnd(2,10), ans-rnd(2,10), ans+rnd(11,20)];
      const shuffled=shuffleWith(RNG.random, opts.map((v,i)=>({v,i})));
      const correctId = letters[shuffled.findIndex(o=>o.v===ans)];
      return { id: mkId('m'), subject:'Mathematics', topic:'Multiplication', difficulty: pick(['easy','medium','hard']), type:'single_choice', question_text:`What is ${a} × ${b}?`, options: shuffled.map((o,idx)=>({id:letters[idx], text:String(o.v)})), correct_option_ids:[correctId], marks:1, negative_marks:0.25, explanation:`${a}×${b}=${ans}.`, solution_steps:[`Multiply: ${a}×${b}=${ans}`], tags:['generated'] };
    }
    // eq: simple linear equation ax + b = c
    const a=rnd(2,9), x=rnd(2,15), b=rnd(1,9); const c=a*x+b; const ans=x; const opts=[ans, ans+1, ans-1, ans+2];
    const shuffled=shuffleWith(RNG.random, opts.map((v,i)=>({v,i})));
    const correctId = letters[shuffled.findIndex(o=>o.v===ans)];
    return { id: mkId('m'), subject:'Mathematics', topic:'Linear Equations', difficulty: pick(['easy','medium','medium','hard']), type:'single_choice', question_text:`Solve for x: ${a}x + ${b} = ${c}`, options: shuffled.map((o,idx)=>({id:letters[idx], text:String(o.v)})), correct_option_ids:[correctId], marks:1, negative_marks:0.25, explanation:`${a}x=${c}-${b}=${c-b} ⇒ x=${(c-b)}/${a}=${ans}.`, solution_steps:[`Move b: ${a}x=${c}-${b}=${c-b}`,`Divide by ${a}: x=${ans}`], tags:['generated'] };
  }
  function genPhysics(){
    const letters=['A','B','C','D'];
    const kind = pick(['kinematics','acc','ke']);
    if (kind==='kinematics'){
      const v=rnd(2,30), t=rnd(2,20); const s=v*t; const opts=[s, s+rnd(1,10), s-rnd(1,10), s+rnd(11,20)];
      const shuffled=shuffleWith(RNG.random, opts.map((v,i)=>({v,i})));
      const correctId = letters[shuffled.findIndex(o=>o.v===s)];
      return { id: mkId('p'), subject:'Physics', topic:'Kinematics', difficulty: pick(['easy','medium','medium','hard']), type:'single_choice', question_text:`If velocity is ${v} m/s for ${t} s, displacement is?`, options: shuffled.map((o,idx)=>({id:letters[idx], text:`${o.v} m`})), correct_option_ids:[correctId], marks:1, negative_marks:0.25, explanation:`s=vt=${v}×${t}=${s} m.`, solution_steps:[`Use s=vt`], tags:['generated'] };
    }
    if (kind==='acc'){
      const u=rnd(0,10), a=rnd(1,5), t=rnd(2,10); const v=u+a*t; const opts=[v, v+rnd(1,3), v-rnd(1,3), v+rnd(4,6)];
      const shuffled=shuffleWith(RNG.random, opts.map((v,i)=>({v,i})));
      const correctId = letters[shuffled.findIndex(o=>o.v===v)];
      return { id: mkId('p'), subject:'Physics', topic:'Motion', difficulty: pick(['easy','medium','hard']), type:'single_choice', question_text:`Final velocity with u=${u} m/s, a=${a} m/s², t=${t} s is?`, options: shuffled.map((o,idx)=>({id:letters[idx], text:`${o.v} m/s`})), correct_option_ids:[correctId], marks:1, negative_marks:0.25, explanation:`v=u+at=${u}+${a}×${t}=${v} m/s.`, solution_steps:[`Use v=u+at`], tags:['generated'] };
    }
    // kinetic energy
    const m=rnd(1,10), v=rnd(2,20); const ke=0.5*m*v*v; const opts=[ke, ke+rnd(2,20), ke-rnd(2,20), ke+rnd(21,40)];
    const shuffled=shuffleWith(RNG.random, opts.map((v,i)=>({v,i})));
    const correctId = letters[shuffled.findIndex(o=>o.v===ke)];
    return { id: mkId('p'), subject:'Physics', topic:'Work-Energy', difficulty: pick(['easy','medium','hard']), type:'single_choice', question_text:`Kinetic energy of mass ${m} kg with speed ${v} m/s is?`, options: shuffled.map((o,idx)=>({id:letters[idx], text:`${o.v} J`})), correct_option_ids:[correctId], marks:1, negative_marks:0.25, explanation:`KE=1/2 mv² = 0.5×${m}×${v}² = ${ke} J.`, solution_steps:[`KE=1/2 mv²`], tags:['generated'] };
  }
  function genChem(){
    const letters=['A','B','C','D'];
    const kind = pick(['molarity','gas','massno']);
    if (kind==='molarity'){
      const n=rnd(1,5), v=rnd(1,5); const M=(n/v);
      const opts=[M, M+0.2, M-0.2, M+0.4].map(x=>Number(x.toFixed(2)));
      const shuffled=shuffleWith(RNG.random, opts.map((v,i)=>({v,i})));
      const correctId = letters[shuffled.findIndex(o=>o.v===Number(M.toFixed(2)) )];
      return { id: mkId('c'), subject:'Chemistry', topic:'Solutions', difficulty: pick(['easy','medium','medium','hard']), type:'single_choice', question_text:`A solution has ${n} mol solute in ${v} L. Molarity is?`, options: shuffled.map((o,idx)=>({id:letters[idx], text:`${o.v} mol/L`})), correct_option_ids:[correctId], marks:1, negative_marks:0.25, explanation:`M=n/V=${n}/${v}=${M.toFixed(2)} mol/L.`, solution_steps:[`M=n/V`], tags:['generated'] };
    }
    if (kind==='gas'){
      const n=rnd(1,3), T=rnd(250,350), V=rnd(10,30); const R=0.082; const P=Number(((n*R*T)/V).toFixed(2));
      const opts=[P, P+0.2, P-0.2, P+0.4].map(x=>Number(x.toFixed(2)));
      const shuffled=shuffleWith(RNG.random, opts.map((v,i)=>({v,i})));
      const correctId = letters[shuffled.findIndex(o=>o.v===P)];
      return { id: mkId('c'), subject:'Chemistry', topic:'Gas Laws', difficulty: pick(['easy','medium','hard']), type:'single_choice', question_text:`For n=${n} mol ideal gas at T=${T}K in V=${V}L, pressure P (atm) is? (R=0.082)`, options: shuffled.map((o,idx)=>({id:letters[idx], text:`${o.v} atm`})), correct_option_ids:[correctId], marks:1, negative_marks:0.25, explanation:`PV=nRT ⇒ P=nRT/V=${P} atm.`, solution_steps:[`Use PV=nRT`], tags:['generated'] };
    }
    const Z=rnd(1,30); const ans='Protons'; const opts=['Neutrons','Protons','Electrons in shell','Mass number'];
    const shuffled=shuffleWith(RNG.random, opts.map((v,i)=>({v,i})));
    const correctId = ['A','B','C','D'][shuffled.findIndex(o=>o.v===ans)];
    return { id: mkId('c'), subject:'Chemistry', topic:'Atomic Structure', difficulty: pick(['easy','medium']), type:'single_choice', question_text:`Atomic number (Z=${Z}) represents number of?`, options: shuffled.map((o,idx)=>({id:['A','B','C','D'][idx], text:o.v})), correct_option_ids:[correctId], marks:1, negative_marks:0.25, explanation:`Z counts protons.`, solution_steps:[`Z = protons`], tags:['generated'] };
  }
  function genBio(){
    const organ = pick(['Mitochondria','Ribosome','Lysosome','Golgi apparatus']);
    const map = { Mitochondria:'ATP synthesis', Ribosome:'Protein synthesis', Lysosome:'Intracellular digestion', 'Golgi apparatus':'Packaging and secretion' };
    const options = ['ATP synthesis','Protein synthesis','Intracellular digestion','Packaging and secretion'];
    const correctText = map[organ]; const letters=['A','B','C','D'];
    const shuffled=shuffleWith(RNG.random, options.map((v,i)=>({v, i})));
    const correctId = letters[shuffled.findIndex(o=>o.v===correctText)];
    return {
      id: mkId('b'), subject:'Biology', topic:'Cell', difficulty: pick(['easy','medium','medium','hard']), type:'single_choice',
      question_text: `${organ} are primarily responsible for?`,
      options: shuffled.map((o,idx)=>({ id: letters[idx], text: o.v })),
      correct_option_ids:[correctId], marks:1, negative_marks:0.25,
      explanation:`${organ}: ${correctText}.`, solution_steps:[`${organ} → ${correctText}`], tags:['generated']
    };
  }
  function genReasoning(){
    const letters=['A','B','C','D'];
    const kind = pick(['series+2','series*2','odd','analogy']);
    if (kind.startsWith('series')){
      const start=rnd(1,9);
      if (kind==='series+2'){
        const seq=[start, start+2, start+4, start+6]; const next=start+8; const opts=[next, next+1, next-1, next+2];
        const shuffled=shuffleWith(RNG.random, opts.map((v,i)=>({v,i})));
        const correctId = letters[shuffled.findIndex(o=>o.v===next)];
        return { id: mkId('r'), subject:'Reasoning', topic:'Number Series', difficulty: pick(['easy','medium']), type:'single_choice', question_text:`Next number: ${seq.join(', ')}, ?`, options: shuffled.map((o,idx)=>({id:letters[idx], text:String(o.v)})), correct_option_ids:[correctId], marks:1, negative_marks:0.25, explanation:`+2 series`, solution_steps:[`Add 2 each step`], tags:['generated'] };
      } else {
        const seq=[start, start*2, start*4, start*8]; const next=start*16; const opts=[next, next+start, next-2, next+4];
        const shuffled=shuffleWith(RNG.random, opts.map((v,i)=>({v,i})));
        const correctId = letters[shuffled.findIndex(o=>o.v===next)];
        return { id: mkId('r'), subject:'Reasoning', topic:'Number Series', difficulty: pick(['easy','medium','hard']), type:'single_choice', question_text:`Next number: ${seq.join(', ')}, ?`, options: shuffled.map((o,idx)=>({id:letters[idx], text:String(o.v)})), correct_option_ids:[correctId], marks:1, negative_marks:0.25, explanation:`×2 series`, solution_steps:[`Multiply by 2 each step`], tags:['generated'] };
      }
    }
    if (kind==='odd'){
      const set = pick([
        ['Apple','Banana','Car','Mango'],
        ['Circle','Triangle','Square','Elephant'],
        ['Red','Blue','Green','Table']
      ]);
      const correct = set.find(s=>['Car','Elephant','Table'].includes(s));
      const shuffled=shuffleWith(RNG.random, set.map((v,i)=>({v, i})));
      const correctId = letters[shuffled.findIndex(o=>o.v===correct)];
      return { id: mkId('r'), subject:'Reasoning', topic:'Odd One Out', difficulty: pick(['easy','medium']), type:'single_choice', question_text:`Find the odd one out`, options: shuffled.map((o,idx)=>({id:letters[idx], text:o.v})), correct_option_ids:[correctId], marks:1, negative_marks:0.25, explanation:`${correct} is different.`, solution_steps:[`Identify different category`], tags:['generated'] };
    }
    // analogy
    const pairs = pick([
      ['Cat : Kitten :: Dog : ?', 'Puppy'],
      ['Bird : Nest :: Bee : ?', 'Hive'],
      ['Hand : Glove :: Foot : ?', 'Sock']
    ]);
    const [stem, ans] = pairs; const opts=[ans, 'Den', 'Web', 'Hat'];
    const shuffled=shuffleWith(RNG.random, opts.map((v,i)=>({v,i})));
    const correctId = letters[shuffled.findIndex(o=>o.v===ans)];
    return { id: mkId('r'), subject:'Reasoning', topic:'Analogy', difficulty: pick(['easy','medium']), type:'single_choice', question_text:stem, options: shuffled.map((o,idx)=>({id:letters[idx], text:o.v})), correct_option_ids:[correctId], marks:1, negative_marks:0.25, explanation:`Analogy relation.`, solution_steps:[`Match relation`], tags:['generated'] };
  }
  function generateQuestions(subjects, total){
    const gens = {
      'Mathematics': genMath,
      'Physics': genPhysics,
      'Chemistry': genChem,
      'Biology': genBio,
      'Reasoning': genReasoning,
    };
    const subs = (subjects && subjects.length)? subjects: Object.keys(gens);
    const out=[]; for(let i=0;i<total;i++){ const s = pick(subs); out.push(gens[s]()); }
    return out;
  }
  window.generateSyntheticDataset = async function(n, subs){
    const data = generateQuestions(subs, n);
    const res = api.setDataset(data);
    if (res.ok) return { data, persisted: true, via: res.via };
    // Fallback to IDB
    const idbRes = await api.setDatasetIDB(data);
    return { data, persisted: !!idbRes.ok, via: idbRes.via, error: idbRes.error };
  };

  // practice.js
  function PracticeView(params) {
    const { el, btn, badge } = window.UI;
    const root = el('div', { class: 'grid' });
    const filters = el('div', { class: 'grid grid-3 card' },
      el('label', {}, 'Subject ', el('select', { id: 'f-sub' }, el('option', { value: '' }, 'Any'))),
      el('label', {}, 'Difficulty ', el('select', { id: 'f-diff' }, el('option', { value: '' }, 'Any'), ...['easy','medium','hard'].map(d=>el('option',{value:d},d)))),
      el('label', {}, 'Search ', el('input', { id: 'f-q', class: 'input', placeholder: 'Search...' }))
    );
    const shuffleBtn = btn('Shuffle', { className:'btn ghost', onClick: ()=> recomputeList() });
    const nav = el('div', { class: 'grid' }, btn('Prev', { onClick: ()=>go(-1) }), btn('Next', { onClick: ()=>go(1) }), shuffleBtn);
    const body = el('div');
    root.append(filters, nav, body);

    const all = api.questions();
    const subSel = filters.querySelector('#f-sub');
    [...new Set(all.map(q=>q.subject))].forEach(s=>subSel.appendChild(el('option',{value:s},s)));

    let state = { idx: 0, list: [], answers: JSON.parse(localStorage.getItem('cet:practiceAnswers')||'{}') };
    function setState(next){ state=next; localStorage.setItem('cet:practiceAnswers', JSON.stringify(state.answers)); render(); }

    function renderQuestion(q){
      const selected = new Set(state.answers[q.id] || []);
      const isMulti = (q.type||'single_choice') !== 'single_choice';
      // Deterministic option order: stable per question per day in Practice
      const orderedOpts = shuffleDeterministic(q.options||[], 'practice:'+ (q.id||'') + ':' + todayKey());
      const options = orderedOpts.map(opt => {
        const lbl = el('label', { class: 'card option'+(selected.has(opt.id)?' selected':''), style: 'display:flex;align-items:center;gap:8px' },
          el('input', { type: isMulti?'checkbox':'radio', name: q.id, checked: selected.has(opt.id) ? '' : null, onChange: ()=>{
            if (isMulti) { selected.has(opt.id) ? selected.delete(opt.id) : selected.add(opt.id); }
            else { selected.clear(); selected.add(opt.id); }
            state.answers[q.id] = [...selected];
            setState({ ...state });
          }}),
          el('span', {}, opt.text)
        );
        return lbl;
      });
      const ref = q.source_link || ('https://www.google.com/search?q='+encodeURIComponent((q.question_text||'')+' '+(q.subject||'')+' '+(q.topic||'')));
      // actions: note only (bookmarks section removed)
      const noteBtn = btn('Add Note', { className:'btn ghost', onClick:()=>{ const current = getNote(q.id); const text = prompt('Add/Edit note for this question:', current); if (text!==null){ setNote(q.id, text); } }});
      return el('div', { class: 'card' },
        el('div', { class: 'badge' }, `${q.subject} • ${q.topic} • ${q.difficulty}`),
        el('div', {}, q.question_text),
        el('div', { class: 'grid' }, ...options),
        el('div', { class: 'grid' }, noteBtn),
        el('div', {}, el('a', { href: ref, target: '_blank', rel: 'noreferrer' }, q.source || 'Google reference'))
      );
    }

    function recomputeList(){
      const sub = subSel.value; const diff = filters.querySelector('#f-diff').value; const q = filters.querySelector('#f-q').value.toLowerCase();
      const filteredRaw = all.filter(it => (!sub || it.subject===sub) && (!diff || it.difficulty===diff) && (!q || (it.question_text||'').toLowerCase().includes(q)));
      // De-duplicate by id
      const seen = new Set();
      const filtered = filteredRaw.filter(it=>{ if (seen.has(it.id)) return false; seen.add(it.id); return true; });
      // Shuffle for randomness in practice browsing (seeded by day so it changes daily)
      state.list = shuffleDeterministic(filtered, 'practice-list:'+todayKey());
      state.idx = 0;
      // Deep link to a specific question id if provided in URL
      const qid = params && params.get ? params.get('id') : null;
      if (qid){ const at = state.list.findIndex(x=>x.id===qid); if (at>=0) state.idx = at; }
      render();
    }
    filters.addEventListener('input', debounce(recomputeList, 120));
    recomputeList();

    function go(delta){ if (!state.list.length) return; state.idx = Math.max(0, Math.min(state.list.length-1, state.idx+delta)); render(); }

    function render(){
      body.textContent='';
      if (!state.list.length) { body.appendChild(el('div',{class:'card'},'No questions match filters.')); return; }
      const q = state.list[state.idx];
      body.appendChild(renderQuestion(q));
      body.appendChild(el('div', { class: 'grid' }, badge(`${state.idx+1}/${state.list.length}`)));
    }
    return root;
  }
  function Bookmarks() {
    const { el, btn, badge } = window.UI; const root = el('div');
    const b = getBookmarks(); const notes = getNotes(); const ids = Object.keys(b);
    const all = api.questions();
    // Map by id for quick lookup; if not found in dataset, show placeholder
    const byId = new Map(all.map(q=>[q.id,q]));
    const list = el('div', { class: 'grid' });
    function render(){ list.textContent='';
      if (!ids.length){ list.appendChild(el('div',{class:'card'}, 'No bookmarks yet. Use Bookmark in Practice/Test.')); return; }
      ids.forEach(id=>{
        const q = byId.get(id) || { id, subject:'', topic:'', difficulty:'', question_text:'(Question unavailable in current dataset)' };
        const open = el('a',{href:`#/practice?id=${encodeURIComponent(id)}`, class:'btn'}, 'Open');
        const rm = btn('Remove', { className:'btn danger', onClick:()=>{ const map=getBookmarks(); delete map[id]; setBookmarks(map); const at=ids.indexOf(id); if (at>=0) ids.splice(at,1); render(); }});
        const note = notes[id] ? el('div',{}, 'Note: ', notes[id]) : null;
        list.appendChild(el('div',{class:'card'},
          el('div',{class:'badge'}, `${q.subject} • ${q.topic} • ${q.difficulty}`),
          el('div',{}, q.question_text),
          note,
          el('div',{class:'grid'}, open, rm)
        ));
      });
    }
    render();
    return el('div', { class:'grid' }, el('div',{class:'card'}, el('h2',{},'Bookmarks')), list);
  }
  window.PracticeView = PracticeView;

  // test.js
  function sample(arr, n){ const a=shuffleWith(RNG.random, arr); return a.slice(0,Math.min(n,a.length)); }
  function pickBalanced(questions, count, weights){
    const by = {
      easy: questions.filter(q=>q.difficulty==='easy'),
      medium: questions.filter(q=>q.difficulty==='medium'),
      hard: questions.filter(q=>q.difficulty==='hard'),
    };
    const w = weights && (weights.easy+weights.medium+weights.hard>0)
      ? weights
      : { easy: 0.4, medium: 0.4, hard: 0.2 };
    const target = {
      easy: Math.round(count*(w.easy||0)),
      medium: Math.round(count*(w.medium||0)),
      hard: count - Math.round(count*(w.easy||0)) - Math.round(count*(w.medium||0))
    };
    const take = [];
    for (const k of ['easy','medium','hard']){
      const arr = by[k]; const need = Math.max(0, target[k]);
      take.push(...sample(arr, need));
    }
    if (take.length<count){
      const rest = questions.filter(q=>!take.includes(q));
      take.push(...sample(rest, count-take.length));
    }
    return take.slice(0,count);
  }
  function saveSession(sess){ localStorage.setItem('cet:lastSession', JSON.stringify({ id: sess.id, at: Date.now() })); localStorage.setItem(`cet:sess:${sess.id}`, JSON.stringify(sess)); }
  function loadSession(id){ const raw = localStorage.getItem(`cet:sess:${id}`); return raw? JSON.parse(raw): null; }
  function newSessionFromParams(params){
    const subs = params.get('subjects')?.split(',').map(s=>s.trim()).filter(Boolean);
    const useRandom = params.get('random')==='1';
    const count = Math.max(5, Math.min(parseInt(params.get('count')||'30',10) || 30, 200));
    const timeMinutes = Math.max(10, Math.min(parseInt(params.get('timeMinutes')||'90',10) || 90, 300));
    const neg = params.get('negative')!=='0';
    const topicsParam = params.get('topics')?.split(',').map(s=>s.trim()).filter(Boolean) || null;
    const weights = {
      easy: Math.max(0, parseFloat(params.get('wEasy')||'')) || 0.4,
      medium: Math.max(0, parseFloat(params.get('wMed')||'')) || 0.4,
      hard: Math.max(0, parseFloat(params.get('wHard')||'')) || 0.2,
    };
    let pool = useRandom
      ? generateQuestions(subs, Math.max(count*3, 400))
      : sample(api.questions().filter(q => !subs || subs.includes(q.subject)), Math.max(count*3, 400));
    // Topic filter (supports exact or substring match)
    if (topicsParam && topicsParam.length){
      const toks = topicsParam.map(t=>t.toLowerCase());
      pool = pool.filter(q=>{
        const t = (q.topic||'').toLowerCase();
        return toks.some(tok => t===tok || t.includes(tok));
      });
    }
    // De-duplicate pool by id to avoid repeats
    const uniq = new Map();
    pool.forEach(q=>{ if (!uniq.has(q.id)) uniq.set(q.id, q); });
    pool = [...uniq.values()];
    // Cross-session de-duplication: avoid using recently seen IDs
    const seenRaw = localStorage.getItem('cet:seenIds')||'[]';
    let seen = new Set();
    try{ seen = new Set(JSON.parse(seenRaw)); }catch(_){ seen = new Set(); }
    const filteredPool = pool.filter(q=>!seen.has(q.id));
    if (filteredPool.length >= count){ pool = filteredPool; }
    let questions = pickBalanced(pool, count, weights);
    // Ensure subject variety: guarantee at least one per subject if present in pool
    const poolBySub = new Map(); pool.forEach(q=>{ const k=q.subject||'General'; if(!poolBySub.has(k)) poolBySub.set(k,[]); poolBySub.get(k).push(q); });
    const present = new Set(questions.map(q=>q.subject));
    for (const [sub, arr] of poolBySub.entries()){
      if (!present.has(sub)){
        // replace a random question with one from this subject
        const idx = RNG.int(0, questions.length-1);
        questions[idx] = arr[RNG.int(0, arr.length-1)];
        present.add(sub);
      }
    }
    const id = mkId('sess');
    // Update seen IDs (cap to last 500 to prevent growth)
    const cap = 500; const nextSeen = [...seen, ...questions.map(q=>q.id)].slice(-cap);
    localStorage.setItem('cet:seenIds', JSON.stringify(nextSeen));
    return { id, questions, answers:{}, index:0, left: timeMinutes*60, createdAt: Date.now(), subjects: subs && subs.length ? subs : null, settings:{ negative: neg, weights } };
  }
  function renderNavigator(sess, set){
    const { el } = window.UI; const grid = el('div',{class:'navgrid'});
    const flags = sess.flags || {};
    sess.questions.forEach((q, i) => {
      const answered = (sess.answers[q.id]||[]).length > 0;
      const flagged = !!flags[q.id];
      const cls = [answered?'answered':'', flagged?'flagged':'', (i===sess.index)?'current':''].join(' ').trim();
      const label = flagged ? `${i+1} ⚑` : String(i+1);
      const b = el('button',{class: cls, title: flagged?'Flagged for review':'' , onClick:()=>{sess.index=i; set(sess);} }, label);
      grid.appendChild(b);
    });
    return el('div',{class:'card'}, el('h3',{},'Navigator'), grid);
  }
  function fmt(s){ const m=Math.floor(s/60), ss= s%60; return `${m.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}`; }
  function renderHeader(sess){
    const { el, btn, badge } = window.UI; const h = el('div', { class: 'grid grid-3 card' });
    const timer = el('div', { class: 'timer' }, fmt(sess.left));
    const submitBtn = btn('Submit', { onClick: ()=>{ location.hash = `#/results/${sess.id}`; }});
    h.append(el('div',{}, badge(`${sess.index+1}/${sess.questions.length}`)), timer, submitBtn);
    h._tick = ()=>{
      timer.textContent = fmt(sess.left);
      // low-time visual warning
      timer.classList.remove('warn','danger');
      if (sess.left <= 60) timer.classList.add('danger');
      else if (sess.left <= 300) timer.classList.add('warn');
    };
    return h;
  }
  function renderQuestion(sess, set){
    const { el, btn } = window.UI; const q = sess.questions[sess.index];
    if (!q) { return el('div',{class:'card'}, 'No question available. Try changing filters or generating a dataset.'); }
    const multi = (q.type||'single_choice') !== 'single_choice';
    const selected = new Set(sess.answers[q.id]||[]);
    // Deterministic option order per session+question
    const ordered = shuffleDeterministic(q.options||[], 'test:'+ (sess.id||'') + ':' + (q.id||''));
    const opts = ordered.map((opt, idx) => el('label', { class:'card option opt-item'+(selected.has(opt.id)?' selected':''), 'data-idx': String(idx+1), style:'display:flex;align-items:center;gap:8px' },
      el('input', { type: multi?'checkbox':'radio', name:q.id, checked:selected.has(opt.id)?'':null, onChange:()=>{ if (multi){ selected.has(opt.id)?selected.delete(opt.id):selected.add(opt.id); } else { selected.clear(); selected.add(opt.id); } sess.answers[q.id]=[...selected]; set(sess);} }),
      el('span',{},opt.text)
    ));
    const ref = q.source_link || ('https://www.google.com/search?q='+encodeURIComponent((q.question_text||'')+' '+(q.subject||'')+' '+(q.topic||'')));
    // actions row: flag, bookmark, note
    const isFlagged = !!(sess.flags && sess.flags[q.id]);
    const flagBtn = btn(isFlagged?'Unflag':'Flag for Review', { className:'btn ghost', 'data-action':'flag', onClick:()=>{ sess.flags = sess.flags||{}; if (sess.flags[q.id]) delete sess.flags[q.id]; else sess.flags[q.id]=true; set(sess); }});
    const isBm = isBookmarked(q.id);
    const bmBtn = btn(isBm?'Remove Bookmark':'Bookmark', { className:'btn ghost', 'data-action':'bookmark', onClick:()=>{ const now = toggleBookmark(q.id); bmBtn.textContent = now? 'Remove Bookmark':'Bookmark'; }});
    const noteBtn = btn('Add Note', { className:'btn ghost', 'data-action':'note', onClick:()=>{ const current = getNote(q.id); const text = prompt('Add/Edit note for this question:', current); if (text!==null){ setNote(q.id, text); } }});
    return el('div',{class:'card', 'data-role':'qview'},
      el('div',{class:'badge'}, `${q.subject} • ${q.topic} • ${q.difficulty}`),
      el('h3',{}, q.question_text),
      el('div',{class:'grid'}, ...opts),
      el('div',{class:'grid'}, flagBtn, bmBtn, noteBtn),
      el('div',{}, el('a',{href:ref,target:'_blank',rel:'noreferrer'}, q.source||'Google reference'))
    );
  }
  function attachTimer(sess, header, set){ let ticks=0; const iv = setInterval(()=>{ if (sess.left>0){
      sess.left--; header._tick();
      // time tracking per question
      const cq = sess.questions[sess.index]; if (cq){ sess.timeSpent = sess.timeSpent||{}; sess.timeSpent[cq.id] = (sess.timeSpent[cq.id]||0)+1; }
      if ((++ticks % 5)===0) saveSession(sess);
    }
    if (sess.left<=0){ clearInterval(iv); saveSession(sess); location.hash = `#/results/${sess.id}`; }
  },1000); }
  function TestViewNew(params){ let sess = newSessionFromParams(params); saveSession(sess); const { el, btn } = window.UI; const root = el('div', { class: 'grid' }); const header = renderHeader(sess); const body = el('div'); const nav = el('div', { class: 'grid grid-3' }, btn('Prev',{onClick:()=>{sess.index=Math.max(0,sess.index-1); set(sess);}}), btn('Next',{onClick:()=>{sess.index=Math.max(0,Math.min((sess.questions.length||1)-1,sess.index+1)); set(sess);}})); function set(next){ sess=next; if (sess.index>=sess.questions.length) sess.index=Math.max(0,sess.questions.length-1); saveSession(sess); render(); } function render(){ body.textContent=''; body.append(renderQuestion(sess,set), renderNavigator(sess,set)); } root.append(header, nav, body);
    // keyboard shortcuts
    if (!root._keys){
      root._keys = (e)=>{
        const tag = (e.target && (e.target.tagName||'')).toLowerCase(); if (tag==='input' || tag==='textarea') return;
        const code = e.code;
        if (code==='ArrowLeft' || code==='KeyA'){ e.preventDefault(); sess.index=Math.max(0,sess.index-1); set(sess); return; }
        if (code==='ArrowRight' || code==='KeyD'){ e.preventDefault(); sess.index=Math.min((sess.questions.length||1)-1,sess.index+1); set(sess); return; }
        if (code.startsWith('Digit')){
          const n = parseInt(code.slice(5),10); if (n>=1 && n<=9){ const qv = body.querySelector('[data-role="qview"]'); const opt = qv && qv.querySelector(`.opt-item[data-idx="${n}"] input`); if (opt){ opt.click(); e.preventDefault(); return; } }
        }
        if (code==='KeyF'){ const btn = body.querySelector('[data-action="flag"]'); if (btn){ btn.click(); e.preventDefault(); return; } }
        if (code==='KeyB'){ const btn = body.querySelector('[data-action="bookmark"]'); if (btn){ btn.click(); e.preventDefault(); return; } }
        if (code==='KeyN'){ const btn = body.querySelector('[data-action="note"]'); if (btn){ btn.click(); e.preventDefault(); return; } }
      };
      window.addEventListener('keydown', root._keys);
    }
    attachTimer(sess, header, set); if (!sess.questions.length && localStorage.getItem('cet:dataset_source')==='idb'){ body.textContent='Loading dataset...'; api.load().then(()=>{ sess = newSessionFromParams(params); saveSession(sess); render(); }); } return root; }
  function TestViewResume(id){ let sess = loadSession(id); const { el, btn } = window.UI; if (!sess) return el('div',{class:'card'}, 'Session not found', ' ', el('a',{href:'#/'},'Go Home')); saveSession(sess); const root = el('div', { class: 'grid' }); const header = renderHeader(sess); const body = el('div'); const nav = el('div', { class: 'grid grid-3' }, btn('Prev',{onClick:()=>{sess.index=Math.max(0,sess.index-1); set(sess);}}), btn('Next',{onClick:()=>{sess.index=Math.max(0,Math.min((sess.questions.length||1)-1,sess.index+1)); set(sess);}})); function set(next){ sess=next; if (sess.index>=sess.questions.length) sess.index=Math.max(0,sess.questions.length-1); saveSession(sess); render(); } function render(){ body.textContent=''; body.append(renderQuestion(sess,set), renderNavigator(sess,set)); } root.append(header, nav, body);
    if (!root._keys){
      root._keys = (e)=>{
        const tag = (e.target && (e.target.tagName||'')).toLowerCase(); if (tag==='input' || tag==='textarea') return;
        const code = e.code;
        if (code==='ArrowLeft' || code==='KeyA'){ e.preventDefault(); sess.index=Math.max(0,sess.index-1); set(sess); return; }
        if (code==='ArrowRight' || code==='KeyD'){ e.preventDefault(); sess.index=Math.min((sess.questions.length||1)-1,sess.index+1); set(sess); return; }
        if (code.startsWith('Digit')){
          const n = parseInt(code.slice(5),10); if (n>=1 && n<=9){ const qv = body.querySelector('[data-role="qview"]'); const opt = qv && qv.querySelector(`.opt-item[data-idx="${n}"] input`); if (opt){ opt.click(); e.preventDefault(); return; } }
        }
        if (code==='KeyF'){ const btn = body.querySelector('[data-action="flag"]'); if (btn){ btn.click(); e.preventDefault(); return; } }
        if (code==='KeyB'){ const btn = body.querySelector('[data-action="bookmark"]'); if (btn){ btn.click(); e.preventDefault(); return; } }
        if (code==='KeyN'){ const btn = body.querySelector('[data-action="note"]'); if (btn){ btn.click(); e.preventDefault(); return; } }
      };
      window.addEventListener('keydown', root._keys);
    }
    attachTimer(sess, header, set); if (!sess.questions.length && localStorage.getItem('cet:dataset_source')==='idb'){ body.textContent='Loading dataset...'; api.load().then(()=>{ const s = loadSession(id); if (s){ const all = api.questions(); const filtered = s.subjects && s.subjects.length ? all.filter(q=>s.subjects.includes(q.subject)) : all; // de-dup
            const m = new Map(); filtered.forEach(q=>{ if(!m.has(q.id)) m.set(q.id,q); }); const uniq=[...m.values()];
            s.questions = pickBalanced(uniq, s.questions.length||30); sess=s; saveSession(sess); render(); } }); } return root; }
  window.TestViewNew = TestViewNew; window.TestViewResume = TestViewResume;

  // results.js
  function scoreSession(sess){ let score=0, correct=0, incorrect=0, unanswered=0; const details=[]; const negOn = !sess.settings || sess.settings.negative!==false; for (const q of sess.questions){ const ans = sess.answers[q.id] || []; const isAnswered = Array.isArray(ans) ? ans.length>0 : ans!=='' && ans!=null; let isCorrect=false; if (!isAnswered){ unanswered++; } else { const ansSet = new Set(Array.isArray(ans)?ans:[ans]); const corrSet = new Set((q.correct_option_ids||[])); isCorrect = ansSet.size===corrSet.size && [...ansSet].every(a=>corrSet.has(a)); if (isCorrect){ correct++; score += q.marks || 0; } else { incorrect++; score -= negOn ? (q.negative_marks || 0) : 0; } } details.push({ id:q.id, subject:q.subject, topic:q.topic, difficulty:q.difficulty, isCorrect, chosen:ans, correct:q.correct_option_ids||[], text:q.question_text }); } return { total: sess.questions.length, score, correct, incorrect, unanswered, details }; }
  function spawnConfetti(){
    try{
      const root=document.body; const box=document.createElement('div'); box.style.position='fixed'; box.style.inset='0'; box.style.pointerEvents='none'; box.style.overflow='hidden'; box.style.zIndex='9999'; root.appendChild(box);
      const colors=['#f59e0b','#84cc16','#06b6d4','#a78bfa','#f43f5e'];
      for(let i=0;i<120;i++){
        const p=document.createElement('div'); p.className='confetti';
        const size=4+Math.random()*6; p.style.width=p.style.height=size+'px';
        p.style.background=colors[i%colors.length]; p.style.position='absolute';
        p.style.left=(Math.random()*100)+'%'; p.style.top='-10px'; p.style.opacity='0.9';
        p.style.transform=`translateY(0) rotate(${Math.random()*360}deg)`;
        p.style.animation=`confettiFall ${6+Math.random()*3}s ease-out forwards`;
        box.appendChild(p);
      }
      setTimeout(()=>{ box.remove(); }, 10000);
    }catch(e){/*noop*/}
  }
  function ResultsView(id){ const { el, btn } = window.UI; const raw = localStorage.getItem(`cet:sess:${id}`); if (!raw) return el('div',{class:'card'}, 'Session not found ', el('a',{href:'#/'},'Go Home')); const sess = JSON.parse(raw); const sum = scoreSession(sess); const mastery = JSON.parse(localStorage.getItem('cet:mastery')||'{}'); for (const d of sum.details){ const key = d.topic || 'General'; mastery[key] = mastery[key] || { attempts:0, correct:0, lastAttemptAt:0 }; mastery[key].attempts += 1; mastery[key].correct += d.isCorrect ? 1 : 0; mastery[key].lastAttemptAt = Date.now(); } localStorage.setItem('cet:mastery', JSON.stringify(mastery));
    // record session history (for trends)
    try{ const hist = JSON.parse(localStorage.getItem('cet:history')||'[]'); hist.push({ at: Date.now(), total: sum.total, correct: sum.correct, subjects: sess.subjects||[], id: sess.id }); localStorage.setItem('cet:history', JSON.stringify(hist.slice(-200))); }catch(_){/*noop*/}
    // seed spaced repetition queue for incorrect or flagged
    try{ const sr = JSON.parse(localStorage.getItem('cet:sr')||'{}'); const now = Date.now(); const day = 24*60*60*1000; for (const d of sum.details){ const flagged = (sess.flags||{})[d.id]; if (!d.isCorrect || flagged){ const cur = sr[d.id]||{ interval:0, dueAt:0 }; cur.interval = 0; cur.dueAt = now + day; sr[d.id]=cur; } } localStorage.setItem('cet:sr', JSON.stringify(sr)); }catch(_){/*noop*/}
    spawnConfetti();
    const filterRow = (function(){ const wrap = el('div',{class:'grid'}); const info = el('div',{});
      let mode='all';
      function render(){ const det = filtered(); list.textContent=''; list.appendChild(el('div',{}, ...det.map(d=> el('div',{class:'badge'}, `${d.subject} • ${d.topic} • ${d.isCorrect?'✔':'✘'} • ${fmt((sess.timeSpent||{})[d.id]||0)}`))));
        info.textContent = `Accuracy: ${sum.total? Math.round((sum.correct/sum.total)*100):0}%`;
      }
      function filtered(){ if (mode==='incorrect') return sum.details.filter(d=>!d.isCorrect && (sess.answers[d.id]||[]).length>0); if (mode==='flagged') return sum.details.filter(d=> (sess.flags||{})[d.id]); if (mode==='unanswered') return sum.details.filter(d=> (sess.answers[d.id]||[]).length===0); return sum.details; }
      const list = el('div',{});
      wrap.append(
        btn('All',{onClick:()=>{mode='all'; render();}}),
        btn('Incorrect',{onClick:()=>{mode='incorrect'; render();}}),
        btn('Flagged',{onClick:()=>{mode='flagged'; render();}}),
        btn('Unanswered',{onClick:()=>{mode='unanswered'; render();}}),
        info,
        list
      );
      render(); return wrap; })();
    const root = el('div', { class:'grid' });
    root.append(
      el('div',{class:'card'}, el('h2',{},'Score Summary'), el('div',{}, `Score: ${sum.score}`), el('div',{}, `Correct: ${sum.correct}`), el('div',{}, `Incorrect: ${sum.incorrect}`), el('div',{}, `Unanswered: ${sum.unanswered}`)),
      el('div',{class:'card'}, el('h2',{},'Details'), filterRow)
    );
    return root;
  }
  window.ResultsView = ResultsView;

  // analytics.js
  function listSessionIds(){ return Object.keys(localStorage).filter(k=>k.startsWith('cet:sess:')).map(k=>k.replace('cet:sess:','')); }
  function readSessions(){ return listSessionIds().map(id=>{ try{ return JSON.parse(localStorage.getItem(`cet:sess:${id}`)||'null'); }catch(_){ return null; } }).filter(Boolean); }
  function Analytics(){
    const { el, btn } = window.UI; const root = el('div',{class:'grid'});
    const sessions = readSessions();
    const agg = { subject:{}, topic:{}, difficulty:{} };
    sessions.forEach(s=>{
      const sum = scoreSession(s);
      sum.details.forEach(d=>{
        function add(map, key){ const m = map[key] = map[key] || { attempts:0, correct:0, time:0 }; m.attempts += 1; m.correct += d.isCorrect?1:0; m.time += (s.timeSpent||{})[d.id]||0; }
        add(agg.subject, d.subject||'General'); add(agg.topic, d.topic||'General'); add(agg.difficulty, d.difficulty||'unknown');
      });
    });
    // tiny sparkline generator (SVG) for accuracy trend
    function sparkline(values, width=260, height=40, color='#22d3ee'){
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns,'svg');
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      const pad = 3; const h = height - pad*2; const w = width - pad*2;
      const n = Math.max(1, values.length);
      const step = n>1 ? (w/(n-1)) : 0;
      let d = '';
      values.forEach((v,i)=>{
        const x = pad + i*step;
        const y = pad + (1 - Math.max(0, Math.min(1, v))) * h;
        d += (i===0? 'M':' L') + x + ' ' + y;
      });
      const path = document.createElementNS(ns,'path');
      path.setAttribute('d', d || `M${pad} ${height-pad} L${width-pad} ${height-pad}`);
      path.setAttribute('fill','none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width','2');
      path.setAttribute('stroke-linecap','round');
      path.setAttribute('stroke-linejoin','round');
      svg.appendChild(path);
      // optional points
      values.forEach((v,i)=>{
        const x = pad + i*step; const y = pad + (1 - Math.max(0, Math.min(1, v))) * h;
        const c = document.createElementNS(ns,'circle'); c.setAttribute('cx',x); c.setAttribute('cy',y); c.setAttribute('r','2'); c.setAttribute('fill',color); c.setAttribute('opacity','0.9'); svg.appendChild(c);
      });
      return svg;
    }
    function listFrom(map, title){ const items = Object.entries(map).map(([k,v])=>({k,acc: v.attempts? (v.correct/v.attempts):0, avgTime: v.attempts? (v.time/v.attempts):0, attempts:v.attempts})); items.sort((a,b)=>a.acc-b.acc); return el('div',{class:'card'}, el('h3',{}, title), el('div',{}, ...items.slice(0,5).map(it=> el('div',{class:'badge'}, `${it.k} • ${Math.round(it.acc*100)}% • ${it.attempts} • ${Math.round(it.avgTime)}s`)))); }
    // Trends
    const trends = (function(){
      try{
        const hist = JSON.parse(localStorage.getItem('cet:history')||'[]');
        if (!hist.length) return el('div',{class:'card'}, el('h3',{},'Trends'), el('div',{}, 'No history yet. Take a few tests.'));
        const last = hist.slice(-10);
        const points = last.map(h=> ({ when: new Date(h.at).toLocaleDateString(), acc: h.total? (h.correct/h.total):0 }));
        const avg = points.reduce((a,p)=>a+p.acc,0)/points.length;
        const txt = points.map(p=> Math.round(p.acc*100)).join(' → ');
        const wrap = el('div',{});
        // mount sparkline after element is in DOM
        setTimeout(()=>{ try{ wrap.textContent=''; wrap.appendChild(sparkline(points.map(p=>p.acc))); }catch(_){} }, 0);
        return el('div',{class:'card'},
          el('h3',{},'Trends'),
          el('div',{}, `Last ${points.length} accuracies: ${txt}%`),
          wrap,
          el('div',{}, `Avg: ${Math.round(avg*100)}%`)
        );
      }catch(_){ return el('div',{class:'card'}, el('h3',{},'Trends'), el('div',{}, 'No history yet.')); }
    })();
    root.append(
      el('div',{class:'card'},
        el('h2', {}, 'Analytics')
      ),
      trends,
      listFrom(agg.topic,'Weak Topics'),
      listFrom(agg.subject,'By Subject'),
      listFrom(agg.difficulty,'By Difficulty')
    );
    return root;
  }
  window.Analytics = Analytics;

  // spaced-review.js
  function Review(){
    const { el, btn, badge } = window.UI; const root = el('div',{class:'grid'});
    // due queue from spaced repetition
    const sr = JSON.parse(localStorage.getItem('cet:sr')||'{}'); const now = Date.now();
    const dueIds = Object.entries(sr).filter(([_,v])=> (v && v.dueAt && v.dueAt<=now)).map(([k])=>k);
    let list;
    const all = api.questions(); const byId = new Map(all.map(q=>[q.id,q]));
    if (dueIds.length){ list = dueIds.map(id=>byId.get(id)).filter(Boolean); }
    else {
      // fallback to recent incorrect/flagged
      const sessions = readSessions().sort((a,b)=>b.createdAt-a.createdAt).slice(0,10);
      const ids = new Set(); sessions.forEach(s=>{ const sum = scoreSession(s); sum.details.forEach(d=>{ if (!d.isCorrect || (s.flags||{})[d.id]) ids.add(d.id); }); });
      list = [...ids].map(id=>byId.get(id)).filter(Boolean);
    }
    if (!list.length) return el('div',{class:'card'}, 'Great! No items to review. Due items will appear here based on your results.');
    // lightweight practice-like navigator
    let idx=0; const body=el('div');
    function render(){ const q=list[idx]; if (!q){ body.textContent=''; body.append('Done.'); return; }
      body.textContent='';
      const selected=new Set(); const multi=(q.type||'single_choice')!=='single_choice';
      const ordered = shuffleDeterministic(q.options||[], 'review:'+ (q.id||'') + ':' + todayKey());
      const opts = ordered.map(opt=> el('label',{class:'card option', style:'display:flex;align-items:center;gap:8px'}, el('input',{type:multi?'checkbox':'radio', name:q.id}), el('span',{},opt.text)));
      const controls = el('div',{class:'grid'},
        btn('Again',{className:'btn danger', onClick:()=>schedule('again')}),
        btn('Good',{className:'btn', onClick:()=>schedule('good')}),
        btn('Easy',{className:'btn accent', onClick:()=>schedule('easy')})
      );
      body.append(el('div',{class:'card'},
        el('div',{class:'badge'}, `${q.subject} • ${q.topic} • ${q.difficulty}`),
        el('div',{}, q.question_text),
        el('div',{class:'grid'}, ...opts),
        controls
      ));
      function schedule(mode){
        try{
          const sr = JSON.parse(localStorage.getItem('cet:sr')||'{}');
          const cur = sr[q.id]||{interval:0,dueAt:0};
          const day = 24*60*60*1000; // simple interval scheme
          if (mode==='again'){ cur.interval = 0; cur.dueAt = Date.now() + day; }
          else if (mode==='good'){ cur.interval = Math.max(1, cur.interval)*2; cur.dueAt = Date.now() + cur.interval*day; }
          else { cur.interval = Math.max(1, cur.interval)*3; cur.dueAt = Date.now() + cur.interval*day; }
          sr[q.id]=cur; localStorage.setItem('cet:sr', JSON.stringify(sr));
        }catch(_){/*noop*/}
        idx=Math.min(list.length-1, idx+1); render();
      }
    }
    const nav = el('div',{class:'grid'}, btn('Prev',{onClick:()=>{idx=Math.max(0,idx-1); render();}}), btn('Next',{onClick:()=>{idx=Math.min(list.length-1,idx+1); render();}}), badge(`${idx+1}/${list.length}`));
    render();
    return el('div',{class:'grid'}, el('div',{class:'card'}, el('h2',{},'Spaced Review')), nav, body);
  }
  window.Review = Review;

  // pyq.js
  function PYQ(){
    const { el, btn } = window.UI; const root = el('div',{class:'grid'});
    // references provided by user (always visible)
    const pyqRefs = [
      { exam:'MHT-CET', year:2021, subject:'Physics', pdf_url:'https://static.collegedekho.com/media/uploads/2025/03/26/physics-2021_TPlTGyD.pdf' },
      { exam:'MHT-CET', year:2021, subject:'PCM (combined paper examples)', pdf_url:'https://media.getmyuni.com/assets/downloadables/a9b7212c-1489-40c5-8c6e-cce85c393864.pdf' },
      { exam:'MHT-CET', year:2022, subject:'Physics (6 Aug 2022 Shift I)', pdf_url:'https://static.collegedekho.com/media/uploads/2025/03/26/physics-2022_QlnXwJi.pdf' },
      { exam:'MHT-CET', year:2022, subject:'Chemistry (6 Aug 2022 Shift I)', pdf_url:'https://static.collegedekho.com/media/uploads/2025/03/26/chemistry-2022.pdf' },
      { exam:'MHT-CET', year:2022, subject:'Mathematics (6 Aug 2022 Shift I)', pdf_url:'https://static.collegedekho.com/media/uploads/2025/03/26/maths-2022_rlEyuWe.pdf' },
      { exam:'MHT-CET', year:2023, subject:'Combined / Multiple shifts (sample)', pdf_url:'https://static.collegedekho.com/media/uploads/2025/01/08/mht-cet-question-paper-2023-pdf.pdf' },
      { exam:'MHT-CET', year:2023, subject:'May 9 2023 (memory-based example)', pdf_url:'https://static.zollege.in/public/image/3a42976b31fbb6d18f8d6475fb83680b.pdf' },
      { exam:'MHT-CET', year:2023, subject:'May 15 2023 (example with solutions)', pdf_url:'https://media.getmyuni.com/assets/downloadables/52983156-7d2f-4301-bfed-ed942e1736ad.pdf' },
      { exam:'MHT-CET', year:2024, subject:'Example shift (May 15, 2024) — landing page for PDF', pdf_url:'https://collegedunia.com/news/e-452-mht-cet-2024-may-15-shift-1-question-paper-pcm' },
      { exam:'MHT-CET', year:2024, subject:'Combined PDF (2024 repository)', pdf_url:'https://collegedunia.com/exams/mht-cet/question-paper-2024' },
      { exam:'MHT-CET', year:2025, subject:'Sample MHT-CET 2025 question paper (official sample PDF)', pdf_url:'https://static.collegedekho.com/media/uploads/2025/02/21/sample-mht-cet-2025-question-paper.pdf' },
      { exam:'MHT-CET', year:2025, subject:'27 April 2025 PCM Shift 1 (Collegedunia page; per-shift PDFs available on page)', pdf_url:'https://collegedunia.com/news/e-452-mht-cet-2025-27-april-shift-1-question-paper' }
    ];
    const refsList = el('div',{}, ...pyqRefs.map(r=> el('div',{class:'badge'}, `${r.exam} • ${r.year} • ${r.subject} `, el('a',{href:r.pdf_url, target:'_blank', rel:'noopener', class:'btn ghost', style:'margin-left:8px'}, 'Open'))));

    const data = api.questions().filter(q=> (q.source||'').toLowerCase().includes('pyq') || (q.topic||'').toLowerCase().includes('pyq'));
    if (!data.length){
      return el('div',{class:'grid'},
        el('div',{class:'card'}, el('h2',{},'Past Year Questions')),
        el('div',{class:'card'}, 'No in-app PYQ dataset found. Use the references below to access PDFs or import data via Dataset Tools.'),
        el('div',{class:'card'}, el('h3',{},'References'), refsList)
      );
    }
    // group by paper/year key
    function paperKey(q){ const t=(q.topic||''); const m=t.match(/(20\d{2}|19\d{2})/); return (q.paper||q.year|| (m?`PYQ ${m[1]}`:(q.source||'PYQ'))); }
    const groups = new Map();
    for (const q of data){ const k=paperKey(q); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(q); }
    const list = el('div', { class:'grid' }, ...[...groups.entries()].map(([k, arr])=> el('div',{class:'card'},
      el('div',{class:'badge'}, `${k} • ${arr.length} Qs`),
      btn('Start', { onClick:(e)=>{ e.preventDefault(); const subs=[...new Set(arr.map(q=>q.subject))]; const cnt=Math.min(50,arr.length); const topics = encodeURIComponent(k); location.hash = `#/test/new?subjects=${encodeURIComponent(subs.join(','))}&topics=${topics}&count=${cnt}&timeMinutes=60`; } })
    )));
    const startAll = el('a',{class:'btn', href:'#', onClick:(e)=>{ e.preventDefault(); const subs=[...new Set(data.map(q=>q.subject))]; const cnt=Math.min(100,data.length); location.hash = `#/test/new?subjects=${encodeURIComponent(subs.join(','))}&count=${cnt}&timeMinutes=90`; }}, 'Start All PYQ');
    return el('div',{class:'grid'}, el('div',{class:'card'}, el('h2',{},'Past Year Questions')), list, el('div',{class:'card'}, startAll), el('div',{class:'card'}, el('h3',{},'References'), refsList));
  }
  window.PYQ = PYQ;

  // app.js (Dashboard, Browse, routes, boot)
  const app = document.getElementById('app');
  function Dashboard() {
    const { el, badge } = window.UI;
    const last = JSON.parse(localStorage.getItem('cet:lastSession') || 'null');
    const hero = (function(){
      const ctaStart = el('a', { href: '#/test/new', class: 'btn' }, 'Start Mock Test');
      const ctaPractice = el('a', { href: '#/practice', class: 'btn accent' }, 'Quick Practice');
      return el('section', { class: 'hero card' },
        el('h1', { class: 'title' }, 'Crack CET with Confidence'),
        el('p', { class: 'subtitle' }, 'Smart mock tests, practice by subject, and instant insights. Everything you need in one place.'),
        el('div', { class: 'grid' }, ctaStart, ctaPractice)
      );
    })();
    const wrap = el('div', { class: 'grid grid-2' },
      el('div',{class:'card'},
        el('h2', {}, 'Quick Actions'),
        el('div', { class: 'grid grid-2' },
          el('a', { href: '#/test/new', class: 'btn' }, 'Start Mock Test'),
          last ? el('a', { href: `#/test/${last.id}`, class: 'btn secondary' }, 'Continue Last Test') : null,
          el('a', { href: '#/practice', class: 'btn ghost' }, 'Practice'),
          el('a', { href: '#/browse', class: 'btn ghost' }, 'Browse')
        )
      ),
      el('div',{class:'card'},
        el('h2', {}, 'Weak Topics'),
        el('div', { id: 'weak' }, 'No data yet')
      ),
      el('div',{class:'card'},
        el('h2', {}, 'Start by Subject'),
        (function(){
          const subjects = ['Mathematics','Physics','Chemistry','Biology','Reasoning'];
          const box = el('div', { class: 'grid grid-3' }, ...subjects.map(s=> el('label',{}, el('input',{type:'checkbox', value:s, checked:''}), ' ', s)));
          const countInput = el('input',{class:'input', type:'number', min:'5', max:'200', value:'30'});
          const timeInput = el('input',{class:'input', type:'number', min:'10', max:'300', value:'90'});
          // custom test builder controls
          const wEasy = el('input',{class:'input', type:'number', min:'0', max:'1', step:'0.1', value:'0.4'});
          const wMed  = el('input',{class:'input', type:'number', min:'0', max:'1', step:'0.1', value:'0.4'});
          const wHard = el('input',{class:'input', type:'number', min:'0', max:'1', step:'0.1', value:'0.2'});
          const negToggle = el('input',{type:'checkbox', checked:''});
          const topicsInput = el('input',{class:'input', type:'text', placeholder:'Topics (comma-separated)'});
          function navTo(random){
            const subs=[...box.querySelectorAll('input:checked')].map(i=>i.value);
            const cnt=parseInt(countInput.value||'30',10);
            const t=parseInt(timeInput.value||'90',10);
            const we=parseFloat(wEasy.value||'0.4');
            const wm=parseFloat(wMed.value||'0.4');
            const wh=parseFloat(wHard.value||'0.2');
            const negative = negToggle.checked ? 1 : 0; // 1 means enabled, 0 means disabled for URL compatibility
            const topics = (topicsInput.value||'').trim();
            const parts = [`subjects=${encodeURIComponent(subs.join(','))}`,`count=${cnt}`,`timeMinutes=${t}`,`wEasy=${we}`,`wMed=${wm}`,`wHard=${wh}`,`negative=${negative?1:0}`];
            if (topics) parts.push(`topics=${encodeURIComponent(topics)}`);
            if (random) parts.push('random=1');
            location.hash = `#/test/new?${parts.join('&')}`;
          }
          const start = el('a',{class:'btn', href:'#', onClick:(e)=>{ e.preventDefault(); navTo(false); }}, 'Start');
          const startRandom = el('a',{class:'btn secondary', href:'#', onClick:(e)=>{ e.preventDefault(); navTo(true); }}, 'Start Random');
          return el('div', { class:'grid' },
            el('div',{}, box),
            el('div',{}, el('label',{}, 'Questions ', countInput), ' ', el('label',{}, 'Time (min) ', timeInput)),
            el('div',{}, el('label',{}, 'Weights — Easy ', wEasy), ' ', el('label',{}, 'Medium ', wMed), ' ', el('label',{}, 'Hard ', wHard), ' ', el('label',{}, 'Negative marking ', negToggle)),
            el('div',{}, el('label',{}, 'Topics ', topicsInput)),
            el('div', { class:'grid' }, start, startRandom)
          );
        })()
      )
,
      el('div',{class:'card'},
        el('h2', {}, 'Dataset Tools'),
        (function(){
          const subjects = ['Mathematics','Physics','Chemistry','Biology','Reasoning'];
          const box = el('div', { class: 'chip-row' }, ...subjects.map(s=> el('label',{class:'chip'}, el('input',{type:'checkbox', value:s, checked:''}), ' ', s)));
          const countInput = el('input',{class:'input', type:'number', min:'1000', step:'1000', value:'50000'});
          const genBtn = el('a',{class:'btn', href:'#', onClick:async (e)=>{ e.preventDefault(); const subs=[...box.querySelectorAll('input:checked')].map(i=>i.value); const n=parseInt(countInput.value||'50000',10); const t0=performance.now(); const res = await window.generateSyntheticDataset(n, subs); const dt=(performance.now()-t0)|0; if (res.persisted) { alert(`Generated ${res.data.length} questions in ${dt} ms. Stored via ${res.via || 'unknown'}.`); } else { alert(`Generated ${res.data.length} questions in ${dt} ms. Could not store (quota). Use Start Random or smaller count.`); } }}, 'Generate Synthetic Dataset');
          const clrBtn = el('a',{class:'btn danger', href:'#', onClick:async (e)=>{ e.preventDefault(); await api.clearDatasetAll(); alert('Cleared synthetic dataset (localStorage + IndexedDB).'); }}, 'Clear Dataset');
          return el('div', { class:'grid' },
            el('div',{}, el('label',{}, 'Count ', countInput)),
            el('div',{}, box),
            el('div', { class:'grid grid-2' }, genBtn, clrBtn)
          );
        })()
      )
    );
    const mastery = JSON.parse(localStorage.getItem('cet:mastery') || '{}');
    const weakDiv = wrap.querySelector('#weak');
    const arr = Object.entries(mastery).map(([topic, v]) => ({ topic, rate: v.attempts ? v.correct / v.attempts : 0, attempts: v.attempts }));
    arr.sort((a,b)=>a.rate-b.rate);
    if (arr.length) { weakDiv.textContent = ''; weakDiv.appendChild(el('ul', {}, ...arr.slice(0,3).map(t => el('li', {}, `${t.topic} — ${Math.round(t.rate*100)}% (${t.attempts})`)))); }
    return el('div', { class:'grid' }, hero, wrap);
  }
  function Browse() {
    const { el } = window.UI; const root = el('div');
    const controls = el('div', { class: 'grid grid-3' },
      el('label', {}, 'Subject ', el('select', { id: 'subSel' }, el('option', { value: '' }, 'Any'))),
      el('label', {}, 'Difficulty ', el('select', { id: 'diffSel' }, el('option', { value: '' }, 'Any'), ...['easy','medium','hard'].map(d=>el('option',{value:d},d)))),
      el('label', {}, 'Search ', el('input', { id: 'q', class: 'input', placeholder: 'Search...' }))
    );
    const list = el('div', { class: 'grid' });
    root.append(controls, el('hr'), list);
    const data = api.questions();
    const subjects = [...new Set(data.map(q=>q.subject))];
    const subSel = controls.querySelector('#subSel');
    subjects.forEach(s=>subSel.appendChild(el('option',{value:s},s)));
    function render() {
      const sub = subSel.value; const diff = controls.querySelector('#diffSel').value; const q = controls.querySelector('#q').value.toLowerCase();
      const itemsRaw = data.filter(it => (!sub || it.subject===sub) && (!diff || it.difficulty===diff) && (!q || (it.question_text||'').toLowerCase().includes(q)));
      // De-dup by id
      const seen = new Set();
      const items = itemsRaw.filter(it=>{ if (seen.has(it.id)) return false; seen.add(it.id); return true; });
      const itemsShuffled = sample(items, items.length);
      list.textContent='';
      itemsShuffled.slice(0,50).forEach(it => {
        const ref = it.source_link || ('https://www.google.com/search?q='+encodeURIComponent((it.question_text||'')+' '+(it.subject||'')+' '+(it.topic||'')));
        list.appendChild(el('div',{class:'card'},
          el('div',{class:'badge'}, `${it.subject} • ${it.topic} • ${it.difficulty}`),
          el('div',{}, it.question_text),
          el('div',{}, el('a',{href:`#/practice?id=${encodeURIComponent(it.id)}`},'Open'), ' · ', el('a',{href:ref, target:'_blank', rel:'noreferrer'}, it.source||'Google reference'))
        ));
      });
    }
    const shuffle = btn('Shuffle', { className:'btn ghost', onClick: ()=> render() });
    root.insertBefore(el('div',{class:'grid'}, shuffle), list);
    controls.addEventListener('input', debounce(render, 120)); render();
    return root;
  }
  function Practice(args, params) { return window.PracticeView(params); }
  function TestNew(args, params) { return window.TestViewNew(params); }
  function TestResume(args) { return window.TestViewResume(args.id); }
  function Results(args) { return window.ResultsView(args.id); }
  function AnalyticsRoute(){ return Analytics(); }
  function PYQRoute(){ return PYQ(); }
  function NotFound() { const { el } = window.UI; return el('div',{class:'card'}, el('h2',{},'Not found'), el('a',{href:'#/'},'Go Home')); }

  const RouterRef = window.Router;
  RouterRef.route('/', Dashboard);
  RouterRef.route('/browse', Browse);
  RouterRef.route('/practice', Practice);
  RouterRef.route('/analytics', AnalyticsRoute);
  RouterRef.route('/pyq', PYQRoute);
  RouterRef.route('/test/new', TestNew);
  RouterRef.route('/test/:id', TestResume);
  RouterRef.route('/results/:id', Results);
  RouterRef.setNotFound(NotFound);
  function setActiveNav(){ const links = document.querySelectorAll('.app-header a[data-link]'); const hash = location.hash.replace('#',''); links.forEach(a=>{ const href = a.getAttribute('href')||''; const path = href.replace('#',''); if (path==='/' && (hash===''||hash==='/'||hash.startsWith('/?'))) a.classList.add('active'); else if (hash.startsWith(path)) a.classList.add('active'); else a.classList.remove('active'); }); }
  function applyTheme(t){ const root=document.documentElement; if (t==='dark'){ root.setAttribute('data-theme','dark'); } else { root.removeAttribute('data-theme'); } localStorage.setItem('cet:theme', t); }
  function injectThemeToggle(){ const header=document.querySelector('.app-header nav'); if (!header) return; let btn=document.getElementById('themeToggle'); if (btn) return; btn=document.createElement('a'); btn.id='themeToggle'; btn.href='#'; btn.className='btn ghost'; const isDark= document.documentElement.getAttribute('data-theme')==='dark'; btn.textContent = isDark? 'Light Mode' : 'Dark Mode'; btn.onclick=(e)=>{ e.preventDefault(); const now = document.documentElement.getAttribute('data-theme')==='dark' ? 'light':'dark'; applyTheme(now); btn.textContent = now==='dark' ? 'Light Mode' : 'Dark Mode'; }; header.appendChild(btn); }
  const savedTheme = localStorage.getItem('cet:theme')||'light'; applyTheme(savedTheme);
  RouterRef.startRouter((handler, args, params) => { window.UI.mount(app, handler(args || {}, params || new URLSearchParams())); setActiveNav(); injectThemeToggle(); });

  // Footer year
  const y=document.getElementById('yy'); if (y) y.textContent = new Date().getFullYear();
})();
