
/* Production feature layer merged into the supplied Admin V4 UI. Visual/CSS baseline is intentionally unchanged. */
(function(){
  // State extensions
  if(!Array.isArray(db.branches)){
    db.branches=[];
    db.businesses.forEach((b)=>db.branches.push({id:'br-'+b.id+'-main',businessId:b.id,name:'Main Branch',address:b.address||'',phone:b.phone||'',active:true}));
  }
  function normalizeProductBranches(){
    (db.products||[]).forEach(p=>{
      // Legacy products without branch assignment remain available in all branches that already exist.
      // Once a product has an explicit branch list, preserve it so new branches can choose their catalogue.
      if(!Array.isArray(p.branchIds)||p.branchIds.length===0){
        p.branchIds=(db.branches||[]).filter(br=>br.businessId===p.businessId&&br.active!==false).map(br=>br.id);
      }
      delete p.branchId;
    });
  }
  normalizeProductBranches();
  db.businesses.forEach(b=>{if(!Array.isArray(b.productNameList))b.productNameList=[];if(!b.header)b.header={businessName:b.name||'',brand:'',sub:b.type||'',readonly:"OWNER'S VIEW",install:'Chat Admin',showInstall:true};if(b.header.readonly==='VIEW ONLY • DATA ENTRY DISABLED'||!String(b.header.readonly||'').trim())b.header.readonly="OWNER'S VIEW";if(b.header.install==='Install Business Control'||!String(b.header.install||'').trim())b.header.install='Chat Admin';(db.products||[]).filter(p=>p.businessId===b.id).forEach(p=>{const n=String(p.name||'').trim();if(n&&!b.productNameList.some(x=>String(x).trim().toLowerCase()===n.toLowerCase()))b.productNameList.push(n)})});
  save();
  var activeBranchId='all';
  // Public read-only accessor for code defined outside this IIFE.
  window.getActiveBranchId=function(){return activeBranchId};
  window.resetBranchSelection=function(){activeBranchId='all'};
  let customFrom=today, customTo=today;

  const oldScoped=scoped;
  window.branchFor=function(id){return db.branches.find(b=>b.id===id)};
  window.branchesFor=function(bid){return (db.branches||[]).filter(b=>b.businessId===bid&&b.active!==false)};
  // Backfill older records that were created before branch support so every branch-scoped record belongs to a branch.
  ['products','customers','sales','payments','expenses','stockMovements'].forEach(key=>{
    (db[key]||[]).forEach(r=>{
      if(!r.branchId){const br=branchesFor(r.businessId)?.[0];if(br)r.branchId=br.id;}
    });
  });
  window.branchAllowed=function(bid){return activeBranchId==='all'||String(bid||'')===String(activeBranchId)};
  window.scoped=function(list){return list.filter(x=>{if(x.businessId!==db.activeBusinessId)return false;if(activeBranchId==='all')return true;if(Array.isArray(x.branchIds))return x.branchIds.includes(activeBranchId);return branchAllowed(x.branchId);});};
  window.range=function(){
    const d=new Date(today), y=d.getFullYear(),m=d.getMonth(),day=d.getDate();
    if(period==='custom')return [customFrom,customTo];
    if(period==='all')return ['0000-01-01','9999-12-31'];
    if(period==='today')return [today,today];
    if(period==='week'){const start=new Date(d);start.setDate(day-d.getDay());return [iso(start),today]}
    if(period==='month')return [`${y}-${String(m+1).padStart(2,'0')}-01`,today];
    const pm=new Date(y,m-1,1),end=new Date(y,m,0);return [iso(pm),iso(end)]
  };
  window.periodLabel=function(){const r=range();return r[0]==='0000-01-01'?'All Time':`${r[0]} to ${r[1]}`};

  function ensureTopControls(){
    const top=document.querySelector('.top-right'); if(!top)return;
    const bs=document.getElementById('businessSelect');
    if(bs && !document.getElementById('branchSelect')){
      const sel=document.createElement('select'); sel.className='business-select'; sel.id='branchSelect'; sel.title='Branch';
      bs.insertAdjacentElement('afterend',sel);
      sel.addEventListener('change',()=>{activeBranchId=sel.value||'all';render()});
    }
    const periodEl=document.getElementById('period');
    if(periodEl && ![...periodEl.options].some(o=>o.value==='custom')){
      periodEl.insertAdjacentHTML('beforeend','<option value="custom">Custom</option>');
    }
    if(periodEl && !document.getElementById('customDates')){
      const wrap=document.createElement('span');wrap.id='customDates';wrap.style.display='none';wrap.innerHTML='<input id="customFrom" class="period" type="date"><input id="customTo" class="period" type="date"><button id="applyCustom" class="btn secondary small" type="button">Apply</button>';
      periodEl.insertAdjacentElement('afterend',wrap);
      document.getElementById('customFrom').value=customFrom;document.getElementById('customTo').value=customTo;
      document.getElementById('applyCustom').onclick=()=>{customFrom=document.getElementById('customFrom').value||today;customTo=document.getElementById('customTo').value||today;if(customFrom>customTo){const x=customFrom;customFrom=customTo;customTo=x}render()};
    }
    if(document.querySelector('#nav button[data-page="admins"]'))document.querySelector('#nav button[data-page="admins"]').textContent='Staff';
  }

  const baseRenderBusinessSelect=window.renderBusinessSelect;
  window.renderBusinessSelect=function(){
    baseRenderBusinessSelect(); ensureTopControls();
    const bsel=document.getElementById('businessSelect'), brsel=document.getElementById('branchSelect');
    if(brsel){const brs=branchesFor(db.activeBusinessId); if(activeBranchId!=='all'&&!brs.some(b=>b.id===activeBranchId))activeBranchId='all';brsel.innerHTML='<option value="all">All Branches</option>'+brs.map(b=>`<option value="${b.id}" ${b.id===activeBranchId?'selected':''}>${esc(b.name)}</option>`).join('');brsel.value=activeBranchId;}
    const p=document.getElementById('period'); if(p){p.value=period;const c=document.getElementById('customDates');if(c)c.style.display=period==='custom'?'inline-flex':'none';}
  };

  // Business-aware metrics: branch filter now applies everywhere.
  window.totals=function(){
    const ss=scoped(db.sales).filter(s=>inRange(s.date));
    const ps=scoped(db.payments).filter(p=>inRange(p.date));
    const es=scoped(db.expenses).filter(e=>inRange(e.date));
    const cash=ss.filter(s=>paymentStatus(s)==='Cash');
    const credit=ss.filter(s=>saleOutstanding(s)>0);
    const creditTotal=ss.reduce((a,s)=>a+saleOutstanding(s),0);
    const saleTotal=ss.reduce((a,s)=>a+Number(s.total||0),0);
    const amountReceived=ss.reduce((a,s)=>a+Number(s.paid||0),0)+ps.reduce((a,p)=>a+Number(p.amount||0),0);
    const owing=scoped(db.customers).map(c=>({...c,balance:customerOutstanding(c.id)})).filter(c=>c.balance>0);
    return{sales:ss,cashSales:cash,credit,creditTotal,saleTotal,payments:ps.reduce((a,p)=>a+Number(p.amount||0),0),cashReceived:amountReceived,amountReceived,exp:es.reduce((a,e)=>a+e.amount,0),owing};
  };

  function duplicateSale(items,total,paid,type,cid,date){
    const sig=a=>JSON.stringify(a.map(x=>({p:x.productId,q:Number(x.qty),pr:Number(x.price)})).sort((a,b)=>a.p.localeCompare(b.p)));
    const s=db.sales.find(x=>x.businessId===db.activeBusinessId&&branchAllowed(x.branchId)&&x.branchId===activeBranchId&&x.customerId===cid&&x.date===date&&x.type===type&&Number(x.total)===Number(total)&&Number(x.paid)===Number(paid));
    return s&&sig(s.items||[])===sig(items);
  }

  // Replace sale form with the agreed customer/phone/address + Paid Amount/Full-Payment workflow.
  window.saleForm=function(s){
    s=s||{customerId:'',customerName:'',phone:'',address:'',date:today,type:'cash',paid:0,items:[{productId:scoped(db.products)[0]?.id||'',qty:1,price:scoped(db.products)[0]?.sell||0}]};
    const c=s.customerId?db.customers.find(x=>x.id===s.customerId):null;
    return `<div class="form-grid"><div class="field"><label>Customer Name</label><input id="fCustomerName" value="${esc(c?.name||s.customerName||'')}" placeholder="Walk-in Customer"></div><div class="field"><label>Phone</label><input id="fPhone" value="${esc(c?.phone||s.phone||'')}"></div><div class="field full"><label>Address</label><input id="fAddress" value="${esc(c?.address||s.address||'')}"></div><div class="field"><label>Date</label><input id="fDate" type="date" value="${s.date}"></div><div class="field"><label>Payment Status</label><div id="fPaymentStatus" class="status">Cash</div></div><div class="field full"><label>Paid Amount</label><div style="display:flex;gap:8px;align-items:center"><input id="fPaid" type="number" min="0" value="${s.paid||0}" style="flex:1"><label style="font-weight:400"><input id="fullPay" type="checkbox"> Full-Payment</label></div><div id="saleOutstanding" class="status">Outstanding: ₦0.00</div></div><div class="field full"><label>Sale Items — multiple items supported</label><div id="items">${s.items.map(itemRow).join('')}</div><button type="button" class="btn secondary small" id="addItem">+ Add Item</button></div></div>`
  };

  window.newSale=function(existing){
    openModal(existing?'Edit Sale':'New Sale',saleForm(existing),()=>{
      const items=collectItems(); if(!items.length){alert('Add at least one item.');return false}
      const name=document.getElementById('fCustomerName').value.trim()||'Walk-in Customer',phone=document.getElementById('fPhone').value.trim(),address=document.getElementById('fAddress').value.trim();
      const date=document.getElementById('fDate').value,total=items.reduce((a,x)=>a+x.qty*x.price,0),paidPreview=Number(document.getElementById('fPaid').value||0),type=total<=0||paidPreview>=total?'cash':(paidPreview>0?'partly_credit':'credit');if(activeBranchId==='all'){alert('Select a specific branch before recording a sale.');return false}let paid=Number(document.getElementById('fPaid').value||0);if(document.getElementById('fullPay')?.checked)paid=total;
      if(paidPreview<total&&(name==='Walk-in Customer'||!phone||!address)){alert('Credit or Partly Credit sales require Customer Name, Phone and Address. Walk-in Customer is fully-paid only.');return false}
      const samePhone=phone&&db.customers.find(c=>c.businessId===db.activeBusinessId&&c.phone===phone);
      if(samePhone&&name!==samePhone.name&&!existing){alert(`Existing Customer Detected: ${samePhone.name}. Please use the existing customer's details or correct the phone number.`);return false}
      const cid=samePhone?.id||(name==='Walk-in Customer'?'':existing?.customerId||'');
      if(!existing && duplicateSale(items,total,paid,type,cid,date)){if(!confirm('An identical sale already exists for this date, customer, items, amount and payment details. Do you want to save it again?'))return false}
      if(!existing&&name!=='Walk-in Customer'&&!samePhone){db.customers.push({id:id(),businessId:db.activeBusinessId,branchId:activeBranchId,name,phone,address,opening:0})}
      const customer=db.customers.find(c=>c.id===cid)||db.customers.find(c=>c.businessId===db.activeBusinessId&&c.phone===phone);const customerId=customer?.id||'';
      if(existing)Object.assign(existing,{customerId:customerId,date,type,paid,items,total,branchId:activeBranchId});else db.sales.push({id:id(),businessId:db.activeBusinessId,branchId:activeBranchId,customerId:customerId,date,type,paid,items,total,createdBy:currentAdminId});
      save();render();return true
    });
    const calc=()=>{const its=collectItems(),tot=its.reduce((a,x)=>a+x.qty*x.price,0),full=document.getElementById('fullPay'),paid=full?.checked?tot:Number(document.getElementById('fPaid')?.value||0);if(full)document.getElementById('fPaid').value=tot;const o=document.getElementById('saleOutstanding');if(o)o.textContent='Outstanding: '+money(Math.max(0,tot-paid));const st=document.getElementById('fPaymentStatus');if(st){const ps=tot<=0||paid>=tot?'Cash':(paid>0?'Partly Credit':'Credit');st.textContent=ps;st.className='status '+(ps==='Cash'?'green-text':(ps==='Partly Credit'?'orange-text':'red-text'));}};
    document.getElementById('items')?.addEventListener('input',calc);document.getElementById('fPaid')?.addEventListener('input',calc);document.getElementById('fullPay')?.addEventListener('change',calc);calc();
  };

  // Customer creation with duplicate-phone protection.
  const oldNewCustomer=window.newCustomer;
  window.newCustomer=function(existing){
    openModal(existing?'Edit Customer':'New Customer',`<div class="form-grid"><div class="field"><label>Name</label><input id="fName" value="${esc(existing?.name||'')}"></div><div class="field"><label>Phone</label><input id="fPhone" value="${esc(existing?.phone||'')}"></div><div class="field full"><label>Address</label><input id="fAddress" value="${esc(existing?.address||'')}"></div></div>`,()=>{const name=document.getElementById('fName').value.trim(),phone=document.getElementById('fPhone').value.trim(),address=document.getElementById('fAddress').value.trim(),branchId=(window.getActiveBranchId?.()&&window.getActiveBranchId()!=='all'?window.getActiveBranchId():'')||existing?.branchId||'';if(!name||!phone||!address){alert('Name, Phone and Address are required.');return false}const dup=db.customers.find(c=>c.businessId===db.activeBusinessId&&c.phone===phone&&c.id!==existing?.id);if(dup){alert(`This phone number already belongs to ${dup.name}.`);return false}if(!branchId){alert('Select a specific branch from the Dashboard before saving the customer.');return false}if(existing)Object.assign(existing,{name,phone,address,branchId});else db.customers.push({id:id(),businessId:db.activeBusinessId,branchId,name,phone,address,opening:0});save();render();return true})
  };

  // Staff page replaces the old Admin Access page; staff can be selected and assigned to businesses/branches.
  window.renderAdmins=function(){
    const me=db.admins.find(a=>a.id===currentAdminId);const major=me?.role==='major';
    const rows=db.admins.filter(a=>a.role!=='major').map(a=>{const assigns=(a.branchIds||[]).map(idv=>{const br=branchFor(idv),b=br&&db.businesses.find(x=>x.id===br.businessId);return br?`${esc(b?.name||'')} / ${esc(br.name)}`:''}).filter(Boolean).join('<br>');return `<tr><td><b>${esc(a.name)}</b><br><span class="status">${esc(a.email)}</span></td><td>Staff</td><td>${assigns||'<span class="status">Not assigned</span>'}</td><td><span class="tag ${a.active?'active':'off'}">${a.active?'ACTIVE':'INACTIVE'}</span></td><td>${major?`<div class="actions"><button class="btn secondary small" data-action="edit-admin" data-id="${a.id}">Edit</button><button class="btn ${a.active?'danger':'green'} small" data-action="toggle-admin" data-id="${a.id}">${a.active?'Deactivate':'Activate'}</button><button class="btn danger small" data-action="delete-admin" data-id="${a.id}">Delete</button></div>`:'—'}</td></tr>`}).join('');
    document.getElementById('page-admins').innerHTML=`<div class="notice"><b>Staff List.</b> Create Staff first, then assign an existing Staff member to a Business and one or more branches.</div><div class="toolbar"><div class="statline" style="margin:0"><span class="pill">Staff <b>${db.admins.filter(a=>a.role!=='major').length}</b></span></div>${major?'<button class="btn" data-action="new-admin">+ Add Staff</button>':''}</div><div class="section"><div class="section-body"><div class="table-wrap"><table class="table"><thead><tr><th>Staff</th><th>Role</th><th>Business / Branch Access</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="empty">No Staff yet.</td></tr>'}</tbody></table></div></div></div>`;
  };

  function staffForm(a){a=a||{name:'',email:'',active:true,branchIds:[],role:'entry_staff'};return `<div class="form-grid"><div class="field"><label>Staff Name</label><input id="fName" value="${esc(a.name)}"></div><div class="field"><label>Email / Username</label><input id="fEmail" value="${esc(a.email)}"></div><div class="field full"><label>Permission Level</label><select id="fRole"><option value="entry_staff" ${a.role==='entry_staff'?'selected':''}>Entry Staff</option><option value="supervisor" ${a.role==='supervisor'?'selected':''}>Supervisor</option><option value="owner" ${a.role==='owner'?'selected':''}>Business Owner</option><option value="admin" ${a.role==='admin'?'selected':''}>Legacy Admin</option><option value="major" ${a.role==='major'?'selected':''}>Major Admin</option></select></div></div>`}
  function assignmentForm(pre){return `<div class="form-grid"><div class="field"><label>Staff</label><select id="assignStaff"><option value="">Select Staff</option>${db.admins.filter(a=>a.role!=='major'&&a.active).map(a=>`<option value="${a.id}">${esc(a.name)} — ${esc(a.email)}</option>`).join('')}</select></div><div class="field"><label>Business</label><select id="assignBusiness"><option value="">Select Business</option>${db.businesses.filter(b=>b.active).map(b=>`<option value="${b.id}" ${b.id===pre?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div><div class="field full"><label>Branches</label><div id="branchChecks" class="section-body" style="padding:10px">Select a business first.</div></div></div>`}
  function openAssignment(pre){openModal('Assign Staff to Business',assignmentForm(pre),()=>{const uid=document.getElementById('assignStaff').value,bid=document.getElementById('assignBusiness').value,ids=[...document.querySelectorAll('.branch-check:checked')].map(x=>x.value);if(!uid||!bid||!ids.length){alert('Select Staff, Business and at least one branch.');return false}for(const br of ids){const occupied=db.admins.find(a=>a.role!=='major'&&(a.branchIds||[]).includes(br)&&a.id!==uid);if(occupied){alert('One of the selected branches is already assigned to another Staff member. Reassignment must be done by Major Admin.');return false}}const st=db.admins.find(a=>a.id===uid);st.branchIds=Array.from(new Set([...(st.branchIds||[]),...ids]));st.businessIds=Array.from(new Set([...(st.businessIds||[]),bid]));save();render();return true});const sel=document.getElementById('assignBusiness');const draw=()=>{const host=document.getElementById('branchChecks'),brs=branchesFor(sel.value);host.innerHTML=brs.map(b=>`<label style="display:block;margin:6px 0"><input class="branch-check" type="checkbox" value="${b.id}"> ${esc(b.name)}</label>`).join('')||'No branches';};sel.onchange=draw;draw()}

  // Businesses & Branches with visible business list first.
  window.renderBusinesses=function(){const rows=db.businesses.map(b=>{const brs=branchesFor(b.id),staff=db.admins.filter(a=>a.role!=='major'&&(a.branchIds||[]).some(idv=>brs.some(x=>x.id===idv))).map(a=>a.name).join(', ');const branchHtml=brs.map(x=>`<div style="display:flex;align-items:center;gap:6px;margin:3px 0"><span>${esc(x.name)}</span><button class="btn secondary small" data-action="edit-branch" data-id="${x.id}">Edit</button></div>`).join('')||'—';return `<tr><td><b>${esc(b.name)}</b><br><span class="status">${esc(b.address||'')}</span></td><td>${esc(b.type||'')}</td><td>${branchHtml}</td><td>${esc(staff)||'<span class="status">No Staff assigned</span>'}</td><td><div class="actions"><button class="btn ${b.id===db.activeBusinessId?'green':'secondary'} small" data-action="select-business" data-id="${b.id}">${b.id===db.activeBusinessId?'Selected':'Select'}</button><button class="btn secondary small" data-action="edit-business" data-id="${b.id}">Edit</button><button class="btn secondary small" data-action="assign-staff-business" data-id="${b.id}">Assign Staff</button><button class="btn secondary small" data-action="new-branch" data-id="${b.id}">+ Branch</button><button class="btn danger small" data-action="delete-business" data-id="${b.id}">Delete</button></div></td></tr>`}).join('');document.getElementById('page-businesses').innerHTML=`<div class="toolbar"><div class="toolbar-left"><input class="search" id="bizSearch" placeholder="Search businesses"></div><button class="btn" data-action="new-business">+ Add Business</button></div><div class="section"><div class="section-body"><div class="table-wrap"><table class="table"><thead><tr><th>Business</th><th>Type</th><th>Branches</th><th>Staff</th><th>Actions</th></tr></thead><tbody id="bizBody">${rows||'<tr><td colspan="5" class="empty">No businesses.</td></tr>'}</tbody></table></div></div></div>`;document.getElementById('bizSearch').oninput=e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('#bizBody tr').forEach(r=>{const txt=(r.textContent||'').toLowerCase();r.style.display=txt.includes(q)?'':'none'})}}

  const baseHandle=window.handle;
  window.handle=function(action,el){
    const x=el?.dataset?.id;
    if(action==='new-payment'){window.newPayment();return}
    if(action==='new-product'){window.newProduct();return}
    if(action==='edit-product'){window.newProduct(db.products.find(p=>p.id===x));return}
    if(action==='new-admin'){openModal('Add Staff',staffForm(),()=>{const name=document.getElementById('fName').value.trim(),email=document.getElementById('fEmail').value.trim();if(!name||!email)return false;if(db.admins.some(a=>a.email.toLowerCase()===email.toLowerCase())){alert('A Staff member with this email already exists.');return false}const role=document.getElementById('fRole').value;if(role==='major'&&db.admins.some(v=>v.role==='major')){alert('A Major Admin already exists in this local profile.');return false}db.admins.push({id:id(),name,email,role,active:true,businessIds:[],branchIds:[],permissions:rolePermissionDefaults(role),permissionsCustomized:false});auditEvent('Staff account created',`${name}; role ${role}`,'security');save();render();return true});return}
    if(action==='edit-admin'){const a=db.admins.find(a=>a.id===x);if(!a)return;openModal('Edit Staff',staffForm(a),()=>{a.name=document.getElementById('fName').value.trim();a.email=document.getElementById('fEmail').value.trim();const newRole=document.getElementById('fRole').value;if(a.role==='major'&&newRole!=='major'){alert('Major Admin role cannot be removed here.');return false}if(newRole==='major'&&db.admins.some(v=>v.role==='major'&&v.id!==a.id)){alert('A Major Admin already exists in this local profile.');return false}a.role=newRole;if(!a.name||!a.email)return false;if(!a.permissionsCustomized)a.permissions=rolePermissionDefaults(newRole);auditEvent('Staff permissions changed',`${a.name}; role ${newRole}`,'security');save();render();return true});return}
    if(action==='delete-admin'){
      const a=db.admins.find(v=>v.id===x); if(!a || a.role==='major') return;
      const ok=confirm(`Delete Staff "${a.name}" permanently?\n\nThis will remove the Staff member from the Staff list and remove all of their business/branch assignments. This action cannot be undone.`);
      if(!ok)return;
      db.admins=db.admins.filter(v=>v.id!==a.id);
      if(currentAdminId===a.id){currentAdminId=db.admins.find(v=>v.role==='major')?.id||db.admins[0]?.id||'';}
      save(); render(); return;
    }
    if(action==='assign-staff-business'){openAssignment(x);return}
    if(action==='edit-business'){const b=db.businesses.find(b=>b.id===x);if(!b)return;openModal('Edit Business',formBusiness(b),()=>{const o={name:document.getElementById('fName').value.trim(),type:document.getElementById('fType').value.trim(),phone:document.getElementById('fPhone').value.trim(),address:document.getElementById('fAddress').value.trim(),currency:document.getElementById('fCurrency').value||'NGN'};if(!o.name||!o.type){alert('Business name and type are required.');return false}if(db.businesses.some(v=>v.id!==b.id&&v.name.toLowerCase()===o.name.toLowerCase())){alert('Another business with this name already exists.');return false}Object.assign(b,o);const brs=branchesFor(b.id);if(brs.length===1&&brs[0].name==='Main Branch'){brs[0].address=o.address;brs[0].phone=o.phone}save();render();return true});return}
    if(action==='edit-branch'){const br=db.branches.find(v=>v.id===x),b=br&&db.businesses.find(v=>v.id===br.businessId);if(!br||!b)return;openModal('Edit Branch',`<div class="form-grid"><div class="field"><label>Business</label><input value="${esc(b.name)}" disabled></div><div class="field"><label>Branch Name</label><input id="fName" value="${esc(br.name)}"></div><div class="field"><label>Phone</label><input id="fPhone" value="${esc(br.phone||'')}"></div><div class="field full"><label>Address</label><input id="fAddress" value="${esc(br.address||'')}"></div></div>`,()=>{const name=document.getElementById('fName').value.trim();if(!name){alert('Branch name is required.');return false}if(db.branches.some(v=>v.id!==br.id&&v.businessId===br.businessId&&v.name.toLowerCase()===name.toLowerCase())){alert('Another branch with this name already exists in this business.');return false}br.name=name;br.phone=document.getElementById('fPhone').value.trim();br.address=document.getElementById('fAddress').value.trim();save();render();return true});return}
    if(action==='delete-business'){const b=db.businesses.find(v=>v.id===x);if(!b)return;if(db.businesses.length<=1){alert('You cannot delete the only remaining business.');return}const ok=confirm(`Delete business "${b.name}" permanently?\n\nThis will remove its branches, staff assignments, sales, customers, payments, expenses, stock and other business records from this Admin dataset. This action cannot be undone.`);if(!ok)return;const branchIds=db.branches.filter(v=>v.businessId===b.id).map(v=>v.id);db.businesses=db.businesses.filter(v=>v.id!==b.id);db.branches=db.branches.filter(v=>v.businessId!==b.id);db.admins.forEach(a=>{a.businessIds=(a.businessIds||[]).filter(idv=>idv!==b.id);a.branchIds=(a.branchIds||[]).filter(idv=>!branchIds.includes(idv))});['products','customers','sales','payments','expenses','stockMovements'].forEach(k=>{if(Array.isArray(db[k]))db[k]=db[k].filter(v=>v.businessId!==b.id&&(!v.branchId||!branchIds.includes(v.branchId)))});if(db.activeBusinessId===b.id){db.activeBusinessId=db.businesses[0]?.id||'';activeBranchId='all';currentPage='businesses'}save();render();return}
    if(action==='new-branch'){
      const b=db.businesses.find(v=>v.id===x);if(!b)return;
      const products=(db.products||[]).filter(p=>p.businessId===b.id);
      const productRows=products.map(p=>`<div class="branch-product-row" style="display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #e2e8f0"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-branch-product="${p.id}" style="width:auto">${esc(p.name)} <span class="status">(${esc(p.unit||'units')})</span></label><input data-branch-qty="${p.id}" type="number" min="0" step="any" value="0" placeholder="Opening qty" disabled></div>`).join('');
      openModal('Add Branch',`<div class="form-grid"><div class="field"><label>Business</label><input value="${esc(b.name)}" disabled></div><div class="field"><label>Branch Name</label><input id="fName"></div><div class="field full"><label>Address</label><input id="fAddress" value="${esc(b.address||'')}"></div><div class="field full"><label>Stock arrangement</label><select id="fStockMode"><option value="separate">Separate stock for this branch</option><option value="shared">Share live stock with another branch</option></select></div><div class="field full" id="fStockSourceWrap" style="display:none"><label>Share stock with</label><select id="fStockSource">${branchesFor(b.id).map(br=>`<option value="${br.id}">${esc(br.name)}</option>`).join('')}</select></div><div class="field full" id="fBranchProductsWrap"><label>Products this branch sells and opening quantities</label><p class="status">Tick each product this branch will sell, then enter the quantity physically available in this branch. These quantities will not be copied from other branches.</p>${productRows||'<div class="status">No existing products in this business yet. You can add products later.</div>'}</div></div>`,()=>{
        const name=document.getElementById('fName').value.trim();if(!name)return false;
        if(branchesFor(b.id).some(br=>br.name.trim().toLowerCase()===name.toLowerCase())){alert('A branch with this name already exists in this business.');return false}
        const mode=document.getElementById('fStockMode').value,source=document.getElementById('fStockSource')?.value||'';
        const branchId=id();const chosen=mode==='separate'?[...document.querySelectorAll('[data-branch-product]:checked')].map(el=>el.dataset.branchProduct):products.filter(p=>{const src=mode==='shared'?source:'';return !src||Array.isArray(p.branchIds)&&p.branchIds.includes(src)}).map(p=>p.id);
        const newBranch={id:branchId,businessId:b.id,name,address:document.getElementById('fAddress').value,active:true,stockMode:mode,stockSharedWith:mode==='shared'?source:null,productIds:chosen};
        db.branches.push(newBranch);
        products.forEach(p=>{
          const idsNow=Array.isArray(p.branchIds)?p.branchIds.slice():[];
          if(chosen.includes(p.id)){if(!idsNow.includes(branchId))idsNow.push(branchId)}else{const idx=idsNow.indexOf(branchId);if(idx>=0)idsNow.splice(idx,1)}
          p.branchIds=idsNow;
          if(mode==='separate'){
            if(!p.branchQty)p.branchQty={};
            const qtyEl=document.querySelector(`[data-branch-qty="${p.id}"]`);const q=chosen.includes(p.id)?Math.max(0,Number(qtyEl?.value||0)):0;
            p.branchQty[branchId]=q;
            if(chosen.includes(p.id)&&q>0){if(!Array.isArray(db.stockMovements))db.stockMovements=[];db.stockMovements.push({id:id(),businessId:b.id,branchId,productId:p.id,qty:q,type:'branch_opening_stock',notes:'Opening quantity at branch creation',date:today,createdAt:new Date().toISOString()})}
          }
        });
        auditEvent('Branch created',`${name}; stock mode ${mode}; ${chosen.length} product(s) assigned${source?'; shares with '+source:''}`);
        save();activeBranchId=branchId;render();return true
      });
      const modeEl=document.getElementById('fStockMode');
      const updateBranchStockMode=()=>{const separate=modeEl.value==='separate';document.getElementById('fStockSourceWrap').style.display=separate?'none':'block';document.getElementById('fBranchProductsWrap').style.display=separate?'block':'none'};
      modeEl.addEventListener('change',updateBranchStockMode);
      document.querySelectorAll('[data-branch-product]').forEach(cb=>cb.addEventListener('change',()=>{const q=document.querySelector(`[data-branch-qty="${cb.dataset.branchProduct}"]`);if(q){q.disabled=!cb.checked;if(!cb.checked)q.value='0'}}));
      updateBranchStockMode();return
    }
    if(action==='new-business'){
      openModal('Add Business',formBusiness(),()=>{const o={name:document.getElementById('fName').value.trim(),type:document.getElementById('fType').value.trim(),phone:document.getElementById('fPhone').value,address:document.getElementById('fAddress').value,currency:document.getElementById('fCurrency').value||'NGN'};if(!o.name||!o.type)return false;if(db.businesses.some(b=>b.name.toLowerCase()===o.name.toLowerCase())){alert('A business with this name already exists.');return false}const nb={id:id(),...o,active:true,clientFeedId:'CLIENT-'+Math.random().toString(36).slice(2,8).toUpperCase(),header:{businessName:o.name,brand:'',sub:o.type,readonly:"OWNER'S VIEW",install:'Chat Admin',showInstall:true},clientReport:{visible:false,published:false,content:null},productNameList:[]};db.businesses.push(nb);db.branches.push({id:id(),businessId:nb.id,name:'Main Branch',address:o.address,phone:o.phone,active:true});const major=db.admins.find(a=>a.role==='major');if(major)major.businessIds.push(nb.id);db.activeBusinessId=nb.id;activeBranchId='all';save();render();return true});return}
    if(action==='new-sale'){editingSaleId=null;saleDraftItems=null;saleDraftCustomer=null;pendingSaleFormState=null;pendingSaleSave=null;salesView='new';currentPage='sales';render();return}
    if(action==='edit-sale'){editingSaleId=x;saleDraftItems=null;saleDraftCustomer=null;pendingSaleFormState=null;pendingSaleSave=null;salesView='new';currentPage='sales';render();return}
    if(action==='back-sales'){document.getElementById('salesListBelow')?.scrollIntoView({behavior:'smooth',block:'start'});return}
    if(action==='add-sale-item'){readSalePageItems();if(!Array.isArray(saleDraftItems))saleDraftItems=[];saleDraftItems.push({productId:'',itemName:'',qty:1,price:0});renderSaleRows();updateSalePageTotals();return}
    if(action==='delete-sale'){
      const sale=db.sales.find(v=>v.id===x);if(!sale)return;
      if(!confirm('Delete this sale? The sold quantities will be returned to stock.'))return;
      const quantities=saleQuantityMap(sale.items||[]);
      Object.keys(quantities).forEach(pid=>{const product=db.products.find(p=>p.id===pid&&p.businessId===sale.businessId);if(!product)return;adjustProductStockAt(product,sale.branchId,Number(quantities[pid]||0));if(!Array.isArray(db.stockMovements))db.stockMovements=[];db.stockMovements.push({id:id(),businessId:sale.businessId,branchId:sale.branchId||'',productId:pid,qty:Number(quantities[pid]||0),type:'sale_deleted',saleId:sale.id,date:today,createdAt:new Date().toISOString()});});
      db.sales=db.sales.filter(v=>v.id!==x);auditEvent('Sale deleted',`Sale ${sale.id}; stock restored`,'sensitive');save();render();return;
    }
    if(action==='save-sale-page'){saveSalePage(false);return}
    if(action==='save-sale-page-new'){saveSalePage(true);return}
    if(action==='generate-client-report'){const b=biz(),sales=(db.sales||[]).filter(s=>s.businessId===b.id&&inRange(s.date));const qty={},custTotals={};sales.forEach(s=>{(s.items||[]).forEach(i=>{const p=db.products.find(p=>p.id===i.productId);if(p)qty[p.name]=(qty[p.name]||0)+Number(i.qty||i.quantity||0)});const cu=db.customers.find(c=>c.id===s.customerId);if(cu)custTotals[cu.name]=(custTotals[cu.name]||0)+Number(s.total||0)});const ranked=Object.entries(qty).sort((x,y)=>y[1]-x[1]),best=Object.entries(custTotals).sort((x,y)=>y[1]-x[1])[0];b.clientReport={...(b.clientReport||{}),visible:document.getElementById('clientReportVisible')?.value==='yes',published:false,content:{period:periodLabel(),highestSellingProduct:ranked[0]?`${ranked[0][0]} (${ranked[0][1]} units)`:'No product sales',lowestSellingProduct:ranked.length?`${ranked[ranked.length-1][0]} (${ranked[ranked.length-1][1]} units)`:'No product sales',bestCustomer:best?`${best[0]} (${money(best[1])})`:'No customer sales',totalSales:money(sales.reduce((sum,s)=>sum+Number(s.total||0),0)),transactions:sales.length,generatedAt:new Date().toISOString()}};auditEvent('Client report generated',`Draft for ${periodLabel()}`);save();render();alert('Report draft generated. Review it before publishing.');return}
    if(action==='save-client-report'){const b=biz(),host=document.getElementById('page-reports');b.clientReport={...(b.clientReport||{}),visible:document.getElementById('clientReportVisible')?.value==='yes',reportMode:document.getElementById('clientReportMode')?.value||'both',selectedSummaryItems:Array.from(host.querySelectorAll('[data-report-item]:checked')).map(el=>el.dataset.reportItem),published:!!b.clientReport?.published};auditEvent('Client report controls saved','Visibility, publication type and selected summary items updated');save();render();return}
    if(action==='publish-client-report'){const b=biz();if(!b.clientReport?.content){alert('Generate a report draft first.');return}if(!confirm('Publish this report to the Client App?'))return;const host=document.getElementById('page-reports');b.clientReport.visible=document.getElementById('clientReportVisible')?.value==='yes';const mode=document.getElementById('clientReportMode')?.value||b.clientReport.reportMode||'both';b.clientReport.reportMode=mode;b.clientReport.selectedSummaryItems=Array.from(host.querySelectorAll('[data-report-item]:checked')).map(el=>el.dataset.reportItem);const source={...(b.clientReport.content||{})};const selected=new Set(b.clientReport.selectedSummaryItems);const generatedKeys=['period','transactions','cashSales','creditSales','creditTotal','amountReceived','debtorPayments','expenses','highestSellingProduct','lowestSellingProduct','bestCustomer','totalSales','productQuantities','generatedAt'];const publishedContent={...source};if(mode==='written'){generatedKeys.forEach(k=>delete publishedContent[k]);}else{for(const k of generatedKeys){if(k!=='period'&&!selected.has(k))delete publishedContent[k];}if(mode==='generated')publishedContent.writtenReport='';}if(mode==='generated')publishedContent.writtenReport='';if(mode==='written'){for(const k of generatedKeys)delete publishedContent[k];}b.clientReport.publishedContent=publishedContent;b.clientReport.published=true;b.clientReport.publishedAt=new Date().toISOString();auditEvent('Client report published',`Published ${mode} report for ${source.period||'selected period'}; ${b.clientReport.selectedSummaryItems.length} summary items selected`);save();render();return}
    if(action==='new-reconciliation'){const date=prompt('Business date (YYYY-MM-DD)',today);if(!date)return;const type=prompt('Reconciliation type: Cash, Stock or Customer Balances','Cash');if(!type)return;const expected=Number(prompt('Expected amount/value', '0'));if(!Number.isFinite(expected))return;const actual=Number(prompt('Actual counted amount/value','0'));if(!Number.isFinite(actual))return;const difference=actual-expected;const me=db.admins.find(v=>v.id===currentAdminId)||{};const rec={id:id(),businessId:db.activeBusinessId,date,type,expected,actual,difference,actorId:currentAdminId,actorName:me.name||'Unknown',status:Math.abs(difference)>0?'Pending review':'Reconciled',createdAt:new Date().toISOString()};db.reconciliations.push(rec);auditEvent('Daily reconciliation submitted',`${type}; expected ${expected}; actual ${actual}; difference ${difference}`,Math.abs(difference)>0?'sensitive':'normal');save();render();if(Math.abs(difference)>0&&confirm('A difference was found. Does this require a sensitive correction?')){if(requireMajorApproval(`${type} reconciliation difference ${difference}`)){rec.status='Major Admin approved';rec.approvedBy=currentAdminId;rec.approvedAt=new Date().toISOString();save();render()}}return}

    if(action==='remove-sale-item'){readSalePageItems();saleDraftItems.splice(Number(x),1);if(!saleDraftItems.length)saleDraftItems.push({productId:'',itemName:'',qty:1,price:0});render();return}
    if(action==='select-business'){const b=db.businesses.find(b=>b.id===x);if(b?.active&&allowedBusiness(x)){db.activeBusinessId=x;activeBranchId='all';currentPage='dashboard';salesView='list';render()}return}
    const actingAdmin=db.admins.find(v=>v.id===currentAdminId)||{role:'entry_staff'};const actingRole=actingAdmin.role||'entry_staff';const requiredPermission=actionPermission(action);if(requiredPermission&&!hasPermission(requiredPermission,actingAdmin)){alert('Permission denied. Your assigned staff permissions do not allow this action.');auditEvent('Permission denied',`${action}; required ${requiredPermission}`,'security');save();return}
    const destructive=['delete-sale','delete-expense','delete-customer','delete-payment','delete-product','delete-business','clear-data'];
    if(destructive.includes(action)&&actingRole==='entry_staff'){alert('Entry Staff cannot delete or clear records. Ask a Supervisor or Major Admin.');auditEvent('Permission denied',action,'security');save();return}
    if(['delete-business','delete-admin','new-admin','edit-admin','clear-data'].includes(action)&&actingRole!=='major'){alert('Only Major Admin can perform this administrative action.');auditEvent('Permission denied',action,'security');save();return}
    // Fall back to the original handler for all other actions.
    return baseHandle(action,el);
  };

  // Sales list remains the existing visual baseline; New Sale uses the supplied full-page layout.
  let salesView='list';
  let editingSaleId=null;
  let saleDraftItems=null;
  let saleDraftCustomer=null;
  // Preserves the complete sale form while missing products are registered one at a time.
  let pendingSaleFormState=null;
  let pendingSaleSave=null;
  let saleCommitInProgress=false;
  function saleProductOptions(sel='',rowIndex=0){const selected=new Set((saleDraftItems||[]).map((x,i)=>i===rowIndex?'':x.productId).filter(Boolean));const bid=window.getActiveBranchId?.()||'all';return scoped(db.products).filter(p=>(p.id===sel||!selected.has(p.id))&&(p.id===sel||(bid==='all'?productStockAcrossBranches(p)>0:globalProductStockAt(p,bid)>0))).map(p=>`<option value="${esc(p.name)}"></option>`).join('')}
  function findBusinessProductByName(name){const clean=String(name||'').trim().toLowerCase();return clean?scoped(db.products).find(p=>String(p.name||'').trim().toLowerCase()===clean)||null:null}
  function saleProductAvailable(product,branchId){if(!product)return false;const bid=branchId||window.getActiveBranchId?.()||'all';if(bid==='all')return productStockAcrossBranches(product)>0;const oldSale=editingSaleId?db.sales.find(v=>v.id===editingSaleId):null;const prior=oldSale?.branchId===bid?Number(saleQuantityMap(oldSale.items||[])[product.id]||0):0;return globalProductStockAt(product,bid)+prior>0}
  function updateSaleProductRow(index,{resolve=true,alertDuplicate=false}={}){const row=document.querySelector(`.ns-item-row[data-i="${index}"]`);if(!row)return;const input=row.querySelector('.ns-prod-name');const name=(input?.value||'').trim();const existing=findBusinessProductByName(name);const selectedElsewhere=(saleDraftItems||[]).some((it,i)=>i!==index&&existing&&it.productId===existing.id);const saveBtn=row.querySelector('.ns-save-product');if(existing&&selectedElsewhere&&resolve){if(alertDuplicate)alert('This product is already selected in this sale. Choose another product.');input.value='';row.dataset.productId='';const price=row.querySelector('.ns-price');if(price)price.value='0';if(saleDraftItems[index]){saleDraftItems[index].productId='';saleDraftItems[index].itemName='';saleDraftItems[index].price=0;}if(saveBtn)saveBtn.hidden=true;return;}if(resolve&&existing&&saleProductAvailable(existing,(window.getActiveBranchId?.()&&window.getActiveBranchId()!=='all'?window.getActiveBranchId():(editingSaleId?db.sales.find(v=>v.id===editingSaleId)?.branchId:'')))){const previousId=row.dataset.productId||'';row.dataset.productId=existing.id;if(saleDraftItems[index]){saleDraftItems[index].productId=existing.id;saleDraftItems[index].itemName=existing.name;}const price=row.querySelector('.ns-price');if(price&&previousId!==existing.id){price.value=String(Number(existing.sell||0));if(saleDraftItems[index])saleDraftItems[index].price=Number(existing.sell||0);}}else{const previousId=row.dataset.productId||'';row.dataset.productId='';if(previousId){const price=row.querySelector('.ns-price');if(price)price.value='0';if(saleDraftItems[index])saleDraftItems[index].price=0;}if(saleDraftItems[index]){saleDraftItems[index].productId='';saleDraftItems[index].itemName=name;}}if(saveBtn)saveBtn.hidden=!(name&&!existing);}



  function salePageCustomerState(){
    const phone=(document.getElementById('nsPhone')?.value||'').trim();
    const hit=db.customers.find(c=>c.businessId===db.activeBusinessId&&c.phone===phone);
    const note=document.getElementById('nsCustomerNote');
    if(hit){
      const n=document.getElementById('nsName'),a=document.getElementById('nsAddress');
      if(n)n.value=hit.name; if(a)a.value=hit.address||'';
      if(note){note.textContent=`Existing Customer Detected: ${hit.name}`;note.style.display='block'}
      return hit;
    }
    if(note)note.style.display=phone?'block':'none';
    if(note&&phone)note.textContent='New phone number — a customer record will be created after a successful sale.';
    return null;
  }
  function renderSaleRows(){
    const host=document.getElementById('nsItems'); if(!host)return;
    const items=saleDraftItems||[{productId:'',itemName:'',qty:1,price:0}];
    saleDraftItems=items;
    host.innerHTML=items.map((x,i)=>{const selectedProduct=scoped(db.products).find(p=>p.id===x.productId);const itemName=selectedProduct?.name||x.itemName||'';return `<div class="ns-item-row" data-i="${i}" data-product-id="${esc(x.productId||'')}"><input class="ns-prod-name" data-i="${i}" list="nsProducts-${i}" value="${esc(itemName)}" placeholder="Enter or select item" autocomplete="off"><datalist id="nsProducts-${i}">${saleProductOptions(x.productId,i)}</datalist><input class="ns-qty" data-i="${i}" type="number" min="1" value="${x.qty||1}"><input class="ns-price" data-i="${i}" type="number" min="0" value="${x.price||0}"><div class="ns-total">${money((x.qty||0)*(x.price||0))}</div><div class="ns-row-actions"><button type="button" class="btn danger small ns-remove" data-i="${i}" aria-label="Remove item">×</button><button type="button" class="btn secondary small ns-save-product" data-i="${i}" ${itemName&&!selectedProduct?'':'hidden'}>Save Product</button></div></div>`}).join('');
    items.forEach((x,i)=>updateSaleProductRow(i,{resolve:true}));
    updateSalePageTotals();
  }
  function readSalePageItems(){
    saleDraftItems=[...document.querySelectorAll('.ns-item-row')].map(r=>({productId:r.dataset.productId||'',itemName:r.querySelector('.ns-prod-name')?.value.trim()||'',qty:Number(r.querySelector('.ns-qty').value||0),price:Number(r.querySelector('.ns-price').value||0)}));
  }
  function updateSalePageTotals(){
    readSalePageItems();
    const total=saleDraftItems.reduce((a,x)=>a+(x.qty*x.price),0);
    const gt=document.getElementById('nsGrandTotal'),out=document.getElementById('nsOutstanding'),paid=document.getElementById('nsPaid'),full=document.getElementById('nsFull');
    if(gt)gt.textContent=money(total);
    if(full&&full.checked&&paid)paid.value=total;
    const pv=Math.max(0,Math.min(Number(paid?.value||0),total));
    if(out)out.textContent=money(Math.max(0,total-pv));
    const status=document.getElementById('nsPaymentStatus');
    if(status){
      const st=total<=0||pv>=total?'Cash':(pv>0?'Partly Credit':'Credit');
      status.textContent=st;
      status.className='status '+(st==='Cash'?'green-text':(st==='Partly Credit'?'orange-text':'red-text'));
    }
    document.querySelectorAll('.ns-item-row').forEach((r,i)=>{const x=saleDraftItems[i];const t=r.querySelector('.ns-total');if(t)t.textContent=money((x?.qty||0)*(x?.price||0));});
  }
  function salePageTemplate(existing){
    const s=existing||{date:today,type:saleDraftCustomer?.type||'cash',paid:saleDraftCustomer?.paid||0};
    const c=existing?cust(existing.customerId):(saleDraftCustomer||null);
    const st=!existing&&pendingSaleFormState?pendingSaleFormState:{};
    if(existing){saleDraftItems=(existing.items||[]).map(x=>({...x}));}
    else if(!Array.isArray(saleDraftItems)||!saleDraftItems.length){saleDraftItems=[{productId:'',itemName:'',qty:1,price:0}];}
    const field=(key,fallback='')=>st[key]!==undefined?st[key]:fallback;
    const fullChecked=field('full',false)?'checked':'';
    return `<div class="sale-page"><div class="sale-head"><p class="status" style="margin:0">Record a sale for ${esc(biz().name)}</p><button class="btn secondary" data-action="back-sales">↓ Sales List</button></div><div class="section"><div class="section-body"><div class="ns-customer-scroll"><div class="ns-customer-row"><div class="field"><label>Customer Name</label><input id="nsName" value="${esc(field('name',c?.name||'Walk-in Customer'))}" placeholder="Customer"></div><div class="field"><label>Phone</label><input id="nsPhone" value="${esc(field('phone',c?.phone||''))}" placeholder="Phone"></div><div class="field"><label>Address</label><input id="nsAddress" value="${esc(field('address',c?.address||''))}" placeholder="Address"></div><div class="field"><label>Date</label><input id="nsDate" type="date" value="${esc(field('date',s.date||today))}"></div><div class="field"><label>Invoice No.</label><input id="nsInvoiceNo" value="${esc(field('invoiceNo',s.invoiceNo||''))}" placeholder="Invoice"><button type="button" id="confirmInvoiceBtn" class="btn secondary small" style="margin-top:6px;white-space:nowrap">OK — Confirm Invoice</button><div id="invoiceConfirmStatus" class="status" style="padding:4px 0"></div></div></div></div><!-- Payment Status is calculated and stored internally; it is not shown on the New Sale screen. --><div id="nsCustomerNote" class="notice" style="display:none;margin-top:12px"></div></div></div><div class="section" id="nsItemsSection" style="margin-top:14px"><div class="section-head"><h3>Items</h3><button class="btn secondary small" data-action="add-sale-item">+ Add Item</button></div><div class="section-body"><div class="ns-item-head"><div>Item</div><div>Quantity</div><div>Unit Cost</div><div>Total</div><div>Actions</div></div><div id="nsItems"></div><div class="sale-summary-scroll"><div class="sale-summary"><div class="sale-summary-top"><div class="summary-pair grand-total-pair"><span>Grand Total</span><b id="nsGrandTotal">₦0</b></div><div class="summary-pair paid-pair"><label for="nsPaid">Paid Amount</label><input id="nsPaid" type="number" min="0" value="${Number(field('paid',s.paid||0))}"></div><label class="checkline summary-full-check"><input id="nsFull" type="checkbox" ${fullChecked}> Full-Payment</label></div><div class="sale-summary-bottom"><div></div><div class="outstanding"><span>Outstanding Amount</span><b id="nsOutstanding">₦0</b></div><div></div></div></div></div></div></div><div class="actions sale-actions"><button class="btn green" data-action="save-sale-page">Save Sale</button><button class="btn secondary" data-action="save-sale-page-new">Save & New</button></div></div>`;
  }
  function salesListSectionMarkup(searchId='salesSearchBelow',bodyId='salesBodyBelow'){
    const rows=scoped(db.sales).filter(s=>inRange(s.date)).sort((a,b)=>b.date.localeCompare(a.date));
    return `<div class="section sales-list-below" id="salesListBelow" style="margin-top:24px"><div class="section-head"><h3>Sales List</h3><span class="status">${rows.length} sale(s)</span></div><div class="section-body">
      <div class="sales-filter-grid">
        <div class="field"><label>Invoice No. Hierarchy</label><select id="salesInvoiceMode"><option value="all">All</option><option value="starts">Starts With</option><option value="contains">Contains</option><option value="exact">Exact</option></select></div>
        <div class="field"><label>Invoice No.</label><input id="salesInvoiceFilter" placeholder="Filter invoice number"></div>
        <div class="field"><label>Entry Date</label><input id="salesEntryDateFilter" type="date"></div>
        <div class="field"><label>Transaction Date</label><input id="salesTxnDateFilter" type="date"></div>
        <div class="field"><label>Customer</label><input id="${searchId}" class="search" placeholder="Search customer"></div>
      </div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th>Invoice No.</th><th>Transaction Date</th><th>Entry Date</th><th>Payment</th><th>Items</th><th class="right">Sales</th><th class="right">Received</th><th class="right">Credit</th><th>Actions</th></tr></thead>
      <tbody id="${bodyId}">${rows.map(s=>{const st=paymentStatus(s);return `<tr data-customer="${esc(cust(s.customerId).name||'')}" data-invoice="${esc(s.invoiceNo||'')}" data-txn-date="${esc(s.date||'')}" data-entry-date="${esc(s.entryDate||s.createdAt||s.date||'')}"><td><b>${esc(cust(s.customerId).name)}</b></td><td><b>${esc(s.invoiceNo||'—')}</b></td><td>${esc(s.date||'')}</td><td>${esc((s.entryDate||s.createdAt||s.date||'').toString().replace('T',' ').slice(0,19))}</td><td class="${st==='Cash'?'green-text':(st==='Partly Credit'?'orange-text':'red-text')}">${st}</td><td>${s.items.length}</td><td class="right">${money(s.total)}</td><td class="right">${money(s.paid||0)}</td><td class="right">${money(saleOutstanding(s))}</td><td><div class="actions"><button class="btn secondary small" data-action="edit-sale" data-id="${s.id}">Edit</button><button class="btn danger small" data-action="delete-sale" data-id="${s.id}">Delete</button></div></td></tr>`}).join('')||'<tr><td colspan="10" class="empty">No sales in this period.</td></tr>'}</tbody></table></div></div></div>`;
  }
  function bindSalesListSearch(searchId='salesSearchBelow',bodyId='salesBodyBelow'){
    const search=document.getElementById(searchId);if(!search)return;
    search.oninput=e=>document.querySelectorAll(`#${bodyId} tr`).forEach(r=>r.style.display=r.dataset.search?.toLowerCase().includes(e.target.value.toLowerCase())?'':'none');
  }
  function renderNewSalePage(){
    document.getElementById('page-sales').innerHTML=salePageTemplate(editingSaleId?db.sales.find(s=>s.id===editingSaleId):null)+salesListSectionMarkup();
    setTimeout(()=>window.__tbcLockInvoiceItems?.(),0);
    bindSalesListSearch();
    renderSaleRows();
    const phone=document.getElementById('nsPhone'),paid=document.getElementById('nsPaid'),full=document.getElementById('nsFull');
    phone?.addEventListener('input',salePageCustomerState);phone?.addEventListener('blur',salePageCustomerState);
    paid?.addEventListener('input',updateSalePageTotals);full?.addEventListener('change',updateSalePageTotals);
    document.getElementById('nsItems')?.addEventListener('input',e=>{
      if(e.target.matches('.ns-prod-name')){
        const idx=Number(e.target.dataset.i);if(!saleDraftItems[idx])return;saleDraftItems[idx].itemName=e.target.value.trim();
        updateSaleProductRow(idx,{resolve:true});readSalePageItems();updateSalePageTotals();return;
      }
      if(e.target.matches('.ns-qty')){
        const idx=Number(e.target.dataset.i);readSalePageItems();const item=saleDraftItems[idx];
        if(item?.productId){const product=db.products.find(p=>p.id===item.productId&&p.businessId===db.activeBusinessId);const oldSale=editingSaleId?db.sales.find(v=>v.id===editingSaleId):null;const branchId=(window.getActiveBranchId?.()&&window.getActiveBranchId()!=='all'?window.getActiveBranchId():(oldSale?.branchId||''))||(branchesFor(db.activeBusinessId)[0]?.id||'');const prior=oldSale?.branchId===branchId?Number(saleQuantityMap(oldSale.items||[])[item.productId]||0):0;const available=product?Math.max(0,productStockAt(product,branchId)+prior):0;const requested=Number(e.target.value||0);if(requested>available){alert(`Only ${available} ${product?.unit||'units'} of ${product?.name||'this product'} are available in the selected Dashboard branch.`);item.qty=available;e.target.value=String(available);}}
      }
      updateSalePageTotals();
    });
    document.getElementById('nsItems')?.addEventListener('change',e=>{
      if(e.target.matches('.ns-prod-name')){
        const idx=Number(e.target.dataset.i);updateSaleProductRow(idx,{resolve:true,alertDuplicate:true});readSalePageItems();renderSaleRows();return;
      }
      updateSalePageTotals();
    });
    document.getElementById('nsItems')?.addEventListener('click',e=>{
      const btn=e.target.closest('.ns-save-product');if(!btn)return;const idx=Number(btn.dataset.i);const row=btn.closest('.ns-item-row');const name=(row?.querySelector('.ns-prod-name')?.value||'').trim();if(!name)return;
      const existing=findBusinessProductByName(name);if(existing){alert('This product already exists in this business. Select the existing product instead of creating a duplicate.');updateSaleProductRow(idx,{resolve:true,alertDuplicate:true});return;}
      if(!window.getActiveBranchId?.()||window.getActiveBranchId()==='all'){alert('Select a specific branch from the Dashboard before saving a new product.');return;}
      window.newProduct(null,name,idx);
    });
    updateSalePageTotals();
  }
  function renderSalesList(){
    const rows=scoped(db.sales).filter(s=>inRange(s.date)).sort((a,b)=>b.date.localeCompare(a.date));
    document.getElementById('page-sales').innerHTML=`<div class="toolbar"><div class="toolbar-left"><input class="search" id="salesSearch" placeholder="Search customer"></div><button class="btn" data-action="new-sale">+ New Sale</button></div><div class="section"><div class="section-body"><div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th>Invoice No.</th><th>Transaction Date</th><th>Entry Date</th><th>Payment</th><th>Items</th><th class="right">Sales</th><th class="right">Received</th><th class="right">Credit</th><th>Actions</th></tr></thead><tbody id="salesBody">${rows.map(s=>{const st=paymentStatus(s);return `<tr data-search="${esc((cust(s.customerId).name||'')+' '+(s.invoiceNo||''))}"><td><b>${esc(cust(s.customerId).name)}</b></td><td><b>${esc(s.invoiceNo||'—')}</b></td><td>${esc(s.date||'')}</td><td>${esc((s.entryDate||s.createdAt||s.date||'').toString().replace('T',' ').slice(0,19))}</td><td class="${st==='Cash'?'green-text':(st==='Partly Credit'?'orange-text':'red-text')}">${st}</td><td>${s.items.length}</td><td class="right">${money(s.total)}</td><td class="right">${money(s.paid||0)}</td><td class="right">${money(saleOutstanding(s))}</td><td><div class="actions"><button class="btn secondary small" data-action="edit-sale" data-id="${s.id}">Edit</button><button class="btn danger small" data-action="delete-sale" data-id="${s.id}">Delete</button></div></td></tr>`}).join('')||'<tr><td colspan="10" class="empty">No sales in this period.</td></tr>'}</tbody></table></div></div></div>`;
    document.getElementById('salesSearch').oninput=e=>document.querySelectorAll('#salesBody tr').forEach(r=>r.style.display=r.dataset.search?.toLowerCase().includes(e.target.value.toLowerCase())?'':'none');
  }

  function saleQuantityMap(items){const map={};(items||[]).forEach(it=>{const pid=it.productId;if(pid)map[pid]=(map[pid]||0)+Number(it.qty||0)});return map;}
  function branchStockPool(branchId){const br=db.branches.find(x=>x.id===branchId);if(!br)return {mode:'global',id:''};if(br.stockMode==='shared'&&br.stockSharedWith){const source=db.branches.find(x=>x.id===br.stockSharedWith);if(source?.stockMode==='separate')return {mode:'branch',id:source.id};return {mode:'global',id:''}}if(br.stockMode==='separate')return {mode:'branch',id:br.id};return {mode:'global',id:''}}
function productStockAt(product,branchId){const pool=branchStockPool(branchId);if(pool.mode==='branch')return Number(product.branchQty?.[pool.id]??0);return Number(product.qty||0)}
function adjustProductStockAt(product,branchId,delta){const pool=branchStockPool(branchId);if(pool.mode==='branch'){if(!product.branchQty)product.branchQty={};product.branchQty[pool.id]=Number(product.branchQty[pool.id]||0)+Number(delta||0)}else product.qty=Number(product.qty||0)+Number(delta||0)}
function validateSaleStock(items,oldSale,branchId){const next=saleQuantityMap(items),prior=saleQuantityMap(oldSale?.items||[]);for(const pid of Object.keys(next)){const product=db.products.find(p=>p.id===pid&&p.businessId===db.activeBusinessId);if(!product){alert('One of the selected stock items could not be found. Please select the item again.');return false;}const available=productStockAt(product,branchId)+(oldSale?.branchId===branchId?Number(prior[pid]||0):0);if(next[pid]>available){alert(`Insufficient stock for ${product.name}. Available: ${available} ${product.unit||'units'}; requested: ${next[pid]}.`);return false;}}return true;}
  function applySaleStockChange(oldSale,newItems,savedSaleId,branchId){const prior=saleQuantityMap(oldSale?.items||[]),next=saleQuantityMap(newItems||[]),ids=new Set([...Object.keys(prior),...Object.keys(next)]);ids.forEach(pid=>{const product=db.products.find(p=>p.id===pid&&p.businessId===db.activeBusinessId);if(!product)return;const oldBranch=oldSale?.branchId||branchId||'',newBranch=branchId||oldBranch;const oldQty=Number(prior[pid]||0),newQty=Number(next[pid]||0);if(oldSale&&oldBranch!==newBranch){if(oldQty)adjustProductStockAt(product,oldBranch,oldQty);if(newQty)adjustProductStockAt(product,newBranch,-newQty)}else{const delta=oldQty-newQty;if(delta)adjustProductStockAt(product,newBranch,delta)}if(oldQty!==newQty||oldBranch!==newBranch){if(!Array.isArray(db.stockMovements))db.stockMovements=[];db.stockMovements.push({id:id(),businessId:db.activeBusinessId,branchId:newBranch,productId:pid,qty:oldQty-newQty,type:oldSale?'sale_edit':'sale',saleId:savedSaleId,date:today,createdAt:new Date().toISOString()});}})}

  function captureSalePageForm(){
    return {name:document.getElementById('nsName')?.value??'Walk-in Customer',phone:document.getElementById('nsPhone')?.value??'',address:document.getElementById('nsAddress')?.value??'',date:document.getElementById('nsDate')?.value||today,invoiceNo:document.getElementById('nsInvoiceNo')?.value??'',paid:Number(document.getElementById('nsPaid')?.value||0),full:!!document.getElementById('nsFull')?.checked};
  }
  function findFirstMissingSaleProduct(){
    readSalePageItems();
    for(let i=0;i<saleDraftItems.length;i++){
      const item=saleDraftItems[i],name=String(item.itemName||'').trim();
      if(!name)return {invalid:true,index:i,message:`Enter a product name on item row ${i+1}, or remove that row.`};
      const existing=db.products.find(p=>p.businessId===db.activeBusinessId&&String(p.name||'').trim().toLowerCase()===name.toLowerCase());
      if(existing){item.productId=existing.id;item.itemName=existing.name;continue;}
      item.productId='';
      return {index:i,name};
    }
    const ids=saleDraftItems.map(x=>x.productId).filter(Boolean);
    if(new Set(ids).size!==ids.length)return {invalid:true,message:'The same product cannot be added more than once to a sale.'};
    return null;
  }
  function openNextMissingSaleProduct(asNew){
    const missing=findFirstMissingSaleProduct();
    if(!missing)return false;
    if(missing.invalid){if(pendingSaleSave)pendingSaleSave.running=false;alert(missing.message);return true;}
    const branchId=(window.getActiveBranchId?.()&&window.getActiveBranchId()!=='all'?window.getActiveBranchId():(editingSaleId?db.sales.find(v=>v.id===editingSaleId)?.branchId:''));
    if(!branchId){if(pendingSaleSave)pendingSaleSave.running=false;alert('Select a specific branch from the Dashboard before registering missing products or recording the sale. Your pending sale details have been retained.');return true;}
    if(pendingSaleSave){pendingSaleSave.running=true;pendingSaleSave.asNew=asNew;pendingSaleSave.awaitingProduct=missing.name;}
    window.newProduct(null,missing.name,missing.index);
    const cancel=document.getElementById('cancelModal');
    if(cancel&&pendingSaleSave)cancel.addEventListener('click',()=>{if(pendingSaleSave)pendingSaleSave.running=false;},{once:true});
    return true;
  }
  function saveSalePage(asNew){
    if(saleCommitInProgress||pendingSaleSave?.running){alert('This sale is already being processed. Please wait for the current step to finish.');return;}
    readSalePageItems();
    pendingSaleFormState=captureSalePageForm();
    if(!pendingSaleSave)pendingSaleSave={asNew:!!asNew,running:false,startedAt:new Date().toISOString()};
    else pendingSaleSave.asNew=!!asNew;
    pendingSaleSave.running=true;
    if(openNextMissingSaleProduct(!!asNew))return;
    return commitSalePage(!!asNew);
  }
  function commitSalePage(asNew){
    const fail=message=>{if(pendingSaleSave)pendingSaleSave.running=false;alert(message);return false;};
    if(saleCommitInProgress)return fail('This sale is already being saved.');
    saleCommitInProgress=true;
    try{
      readSalePageItems();
      pendingSaleFormState=captureSalePageForm();
      const {name:rawName,phone:rawPhone,address:rawAddress,date,invoiceNo,paid,full}=pendingSaleFormState;
      if(!document.getElementById('nsInvoiceNo')?.dataset.confirmedInvoice)return fail('Enter the Invoice No. and click “OK — Confirm Invoice” before entering or saving items.');
      const name=String(rawName||'').trim(),phone=String(rawPhone||'').trim(),address=String(rawAddress||'').trim();
      const branchId=(window.getActiveBranchId?.()&&window.getActiveBranchId()!=='all'?window.getActiveBranchId():(editingSaleId?db.sales.find(v=>v.id===editingSaleId)?.branchId:''));
      const items=saleDraftItems.filter(x=>x.productId&&Number(x.qty)>0);
      if(!items.length)return fail('Add at least one complete item before saving the sale.');
      if(items.length!==saleDraftItems.length)return fail('Complete every item row or remove any blank rows before saving.');
      if(new Set(items.map(x=>x.productId)).size!==items.length)return fail('The same product cannot be added more than once to a sale.');
      if(items.some(x=>!Number.isFinite(Number(x.qty))||Number(x.qty)<=0||!Number.isFinite(Number(x.price))||Number(x.price)<0))return fail('Check every item quantity and price. Quantity must be greater than zero and price cannot be negative.');
      const total=items.reduce((a,x)=>a+Number(x.qty)*Number(x.price),0);
      const effectivePaid=full?total:Number(paid||0);
      const type=total<=0||effectivePaid>=total?'cash':(effectivePaid>0?'partly_credit':'credit');
      if(effectivePaid<0||effectivePaid>total)return fail('Paid Amount cannot be less than ₦0 or greater than the Grand Total.');
      const hasOutstanding=effectivePaid<total;
      if(hasOutstanding&&(!phone||!name||name==='Walk-in Customer'||!address))return fail('Credit or Partly Credit sales require Customer Name, Phone and Address.');
      if(!phone&&name!=='Walk-in Customer'&&(!name||!address))return fail('Enter the customer Name, Phone and Address, or use Walk-in Customer for a fully paid sale.');
      if(!branchId)return fail('Select a specific branch from the Dashboard before recording the sale.');
      // Final product and stock validation occurs immediately before any sale/customer write.
      const normalizedItems=items.map(x=>({productId:x.productId,qty:Number(x.qty),price:Number(x.price)}));
      const oldRecord=editingSaleId?db.sales.find(v=>v.id===editingSaleId):null;
      const oldSale=oldRecord?{...oldRecord,items:(oldRecord.items||[]).map(item=>({...item}))}:null;
      for(const item of normalizedItems){
        const p=db.products.find(p=>p.id===item.productId&&p.businessId===db.activeBusinessId);
        if(!p)return fail('A product is no longer available in this business. Your pending sale has been retained; check the product list and try again.');
      }
      if(!validateSaleStock(normalizedItems,oldSale,branchId)){if(pendingSaleSave)pendingSaleSave.running=false;return false;}
      if(editingSaleId&&!oldRecord)return fail('The sale being edited could not be found. No new sale was recorded.');
      let customer=db.customers.find(c=>c.businessId===db.activeBusinessId&&c.phone===phone&&phone);
      let newCustomerRecord=null;
      if(customer){
        const sameEntered=customer.name===name&&((customer.address||'')===address);
        if(!sameEntered&&!confirm(`This phone number belongs to ${customer.name}. Use the existing customer details instead?`)){if(pendingSaleSave)pendingSaleSave.running=false;return false;}
      } else if(phone){newCustomerRecord={id:id(),businessId:db.activeBusinessId,branchId,name,phone,address,opening:0};customer=newCustomerRecord;}
      // Prevent a duplicate transaction on retry. Use a unique invoice number when recording a genuinely separate sale with identical details.
      const duplicate=db.sales.find(s=>{if(editingSaleId&&s.id===editingSaleId)return false;if(s.businessId!==db.activeBusinessId||s.date!==date||String(s.invoiceNo||'')!==String(invoiceNo||'')||s.type!==type||Number(s.total)!==Number(total)||Number(s.paid||0)!==Number(effectivePaid)||s.customerId!==(customer?.id||''))return false;return JSON.stringify((s.items||[]).map(x=>({productId:x.productId,qty:Number(x.qty),price:Number(x.price)})))===JSON.stringify(normalizedItems)});
      if(duplicate)return fail('An identical sale is already recorded. The sale was not saved again. If this is a separate transaction, enter a distinct Invoice No. and retry.');
      // Apply the sale and stock movements as one in-memory transaction. Roll back all touched state if any write fails.
      const salesBefore=db.sales.slice(),customersBefore=db.customers.slice(),auditBefore=Array.isArray(db.auditTrail)?db.auditTrail.slice():null,movementsBefore=Array.isArray(db.stockMovements)?db.stockMovements.length:null;
      const stockBefore=db.products.map(p=>({p,qty:p.qty,branchQty:p.branchQty?{...p.branchQty}:null}));
      const priorPending=pendingSaleSave;
      try{
        if(newCustomerRecord)db.customers.push(newCustomerRecord);
        let savedSaleId;
        if(editingSaleId){const s=db.sales.find(v=>v.id===editingSaleId);Object.assign(s,{customerId:customer?.id||'',date,invoiceNo,type,paid:effectivePaid,items:normalizedItems,total,branchId,entryDate:s.entryDate||new Date().toISOString()});savedSaleId=s.id;}
        else {savedSaleId=id();db.sales.push({id:savedSaleId,businessId:db.activeBusinessId,branchId,customerId:customer?.id||'',date,invoiceNo,type,paid:effectivePaid,items:normalizedItems,total,createdBy:currentAdminId,entryDate:new Date().toISOString(),createdAt:new Date().toISOString(),submissionKey:priorPending?.startedAt||new Date().toISOString()});}
        applySaleStockChange(oldSale,normalizedItems,savedSaleId,branchId);
        auditEvent(editingSaleId?'Sale edited':'Sale recorded',`Sale ${savedSaleId}; total ${total}; branch ${branchId}`);
        save();
      }catch(txError){
        db.sales=salesBefore;db.customers=customersBefore;stockBefore.forEach(x=>{x.p.qty=x.qty;if(x.branchQty)x.p.branchQty={...x.branchQty};else delete x.p.branchQty;});
        if(movementsBefore!==null&&Array.isArray(db.stockMovements))db.stockMovements.length=movementsBefore;
        if(auditBefore!==null)db.auditTrail=auditBefore;
        if(pendingSaleSave)pendingSaleSave.running=false;
        throw txError;
      }
      pendingSaleSave=null;pendingSaleFormState=null;saleCommitInProgress=false;
      if(asNew){editingSaleId=null;saleDraftItems=null;saleDraftCustomer=null;salesView='new';render();}else{editingSaleId=null;saleDraftItems=null;saleDraftCustomer=null;pendingSaleFormState=null;salesView='new';render();document.getElementById('salesListBelow')?.scrollIntoView({behavior:'smooth',block:'start'});}
      return true;
    }catch(err){if(pendingSaleSave)pendingSaleSave.running=false;alert('The sale could not be completed. Your pending details have been retained. '+(err?.message||String(err)));return false;}
    finally{saleCommitInProgress=false;}
  }


  async function adminMessagesRequest(path,opts={}){
    const c=onlineConfig();if(!c.url||!c.key)throw new Error('Connect the Admin App to Supabase first.');
    let base=c.url.trim().replace(/\/$/,'').replace(/\/dashboard\/.*$/,'').replace(/\/project\/[^/]+.*$/,'');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
    try{return await fetch(base+path,{...opts,signal:controller.signal,headers:{apikey:c.key.trim(),Authorization:'Bearer '+c.key.trim(),'Content-Type':'application/json',Accept:'application/json',...(opts.headers||{})}})}
    catch(e){if(e.name==='AbortError')throw new Error('Supabase request timed out after 10 seconds. Check the Admin connection settings.');throw e}
    finally{clearTimeout(timer)}
  }
  async function loadAdminMessages(){
    const el=document.getElementById('page-messages');if(!el)return;
    const b=biz();
    try{
      // Fetch the complete message rows first, then normalize/filter locally. This avoids losing messages when an older
      // database row uses client_key/body/sender instead of the newer client_id/message/sender_type names.
      const r=await adminMessagesRequest('/rest/v1/client_messages?select=*&order=created_at.desc');
      if(!r.ok)throw new Error(await r.text());
      const raw=await r.json();
      const normalize=x=>({id:x.id,feed_id:x.feed_id||x.feedId||'',business_id:x.business_id||x.businessId||'',client_id:x.client_id||x.client_key||'',branch_id:x.branch_id||x.branchId||null,sender_type:x.sender_type||(String(x.sender||'').toLowerCase().includes('admin')?'admin':'client'),sender_name:x.sender_name||x.client_name||x.sender||'',message:x.message||x.body||'',created_at:x.created_at,read_at:x.read_at||null,reply_to:x.reply_to||null});
      const all=raw.map(normalize);
      const rows=all.filter(x=>x.feed_id===String(b.clientFeedId)||x.business_id===String(b.id));
      const unread=rows.filter(x=>x.sender_type==='client'&&!x.read_at).length;
      const mismatch=all.length>0&&rows.length===0;
      el.innerHTML=`<div class="toolbar"><div class="statline" style="margin:0"><span class="pill">Messages <b>${rows.length}</b></span><span class="pill">Unread <b>${unread}</b></span></div><button class="btn secondary" data-action="refresh-messages">Refresh</button></div>${mismatch?`<div class="warning">Messages exist in Supabase, but none match this business's Client Feed ID (${esc(b.clientFeedId)}). The Admin App is showing the available diagnostic instead of staying on Loading.</div>`:''}<div class="section"><div class="section-body"><div class="table-wrap"><table class="table"><thead><tr><th>Sender</th><th>Message</th><th>Branch</th><th>Date</th><th>Status</th><th></th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td>${esc(x.sender_type==='client'?'Client':(x.sender_name||'Admin'))}</td><td style="white-space:normal;min-width:220px">${esc(x.message)}</td><td>${esc(branchFor(x.branch_id)?.name||x.branch_id||'All Branches')}</td><td>${x.created_at?new Date(x.created_at).toLocaleString():''}</td><td>${x.sender_type==='client'?(x.read_at?'Read':'<b class="red-text">Unread</b>'):'Sent'}</td><td><button class="btn small" data-action="reply-client-message" data-id="${x.id}">Reply</button>${x.sender_type==='client'&&!x.read_at?` <button class="btn secondary small" data-action="mark-message-read" data-id="${x.id}">Mark Read</button>`:''}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">No client messages for this business.</td></tr>'}</tbody></table></div></div></div>`;
      // Bind Reply buttons directly. This bypasses the global delegated handler so the button
      // remains responsive even when other page-level handlers or dynamic re-renders are involved.
      el.querySelectorAll('button[data-action="reply-client-message"]').forEach(btn=>{
        btn.addEventListener('click',ev=>{
          ev.preventDefault();
          ev.stopPropagation();
          const id=btn.dataset.id;
          openModal('Reply to Client','<div class="status">Loading the client message…</div>',async()=>false);
          replyClientMessage(id).catch(e=>{closeModal();alert('Unable to open reply: '+(e?.message||String(e)))})
        });
      });
    }catch(e){el.innerHTML=`<div class="toolbar"><button class="btn secondary" data-action="refresh-messages">Refresh</button></div><div class="warning">Unable to load Client Messages. ${esc(e.message)}</div>`}
  }
  let adminMessagePoll=null;
  function startAdminMessagePolling(){
    if(adminMessagePoll)clearInterval(adminMessagePoll);
    adminMessagePoll=setInterval(()=>{if(currentPage==='messages')loadAdminMessages()},5000);
  }
  startAdminMessagePolling();

  async function replyClientMessage(id){
    const r0=await adminMessagesRequest('/rest/v1/client_messages?id=eq.'+encodeURIComponent(id)+'&select=*');
    if(!r0.ok)throw new Error(await r0.text());
    const rows=await r0.json();
    const raw=rows[0];
    if(!raw)throw new Error('The selected client message could not be found. Refresh the messages list and try again.');
    const m={
      id:raw.id,
      feed_id:raw.feed_id||raw.feedId||null,
      business_id:raw.business_id||raw.businessId||null,
      client_id:raw.client_id||raw.client_key||null,
      client_key:raw.client_key||raw.client_id||null,
      branch_id:raw.branch_id||raw.branchId||null,
      client_name:raw.client_name||raw.sender_name||raw.sender||'Client',
      message:raw.message||raw.body||''
    };
    openModal('Reply to Client',`<div class="form-grid"><div class="field full"><label>Client Message</label><textarea disabled>${esc(m.message)}</textarea></div><div class="field full"><label>Reply</label><textarea id="adminReply" placeholder="Type your reply…"></textarea></div></div>`,async()=>{
      const text=document.getElementById('adminReply').value.trim();
      if(!text){alert('Please enter a reply.');return false}
      const adminName=db.admins.find(x=>x.id===currentAdminId)?.name||'Admin';
      const payload={
        feed_id:m.feed_id,
        client_id:m.client_id,
        branch_id:m.branch_id,
        sender_type:'admin',
        sender_name:adminName,
        message:text,
        reply_to:m.id
      };
      const r=await adminMessagesRequest('/rest/v1/client_messages',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)});
      if(!r.ok){alert('Unable to send reply: '+await r.text());return false}
      const mark=await adminMessagesRequest('/rest/v1/client_messages?id=eq.'+encodeURIComponent(m.id),{method:'PATCH',body:JSON.stringify({read_at:new Date().toISOString()})});
      if(!mark.ok){alert('Reply sent, but the original message could not be marked as read: '+await mark.text())}
      await loadAdminMessages();
      alert('Reply sent successfully.');
      return true
    });
  }
  // Final render router: keep each requested combined page alive after saves and navigation.
  const baseRender=window.render;
  window.render=function(){
    ensureTopControls();
    if(currentPage==='sales'&&salesView==='new'){
      document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
      document.getElementById('page-sales').classList.add('active');
      document.querySelectorAll('#nav button[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page==='sales'));
      document.getElementById('pageTitle').textContent='Sales';
      document.getElementById('periodText').textContent=`${biz().name} • ${periodLabel()}`;
      renderNewSalePage();
    }else if(currentPage==='customers'){
      document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
      document.getElementById('page-customers').classList.add('active');
      document.querySelectorAll('#nav button[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page==='customers'));
      document.getElementById('pageTitle').textContent='Customers';
      document.getElementById('periodText').textContent=`${biz().name} • ${periodLabel()}`;
      renderCustomers();
    }else if(currentPage==='payments'){
      document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
      document.getElementById('page-payments').classList.add('active');
      document.querySelectorAll('#nav button[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page==='payments'));
      document.getElementById('pageTitle').textContent='Debtors & Payments';
      document.getElementById('periodText').textContent=`${biz().name} • ${periodLabel()}`;
      renderPayments();
    }else if(currentPage==='expenses'){
      document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
      document.getElementById('page-expenses').classList.add('active');
      document.querySelectorAll('#nav button[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page==='expenses'));
      document.getElementById('pageTitle').textContent='Expenses';
      document.getElementById('periodText').textContent=`${biz().name} • ${periodLabel()}`;
      renderExpenses();
    }else{
      baseRender();
    }
    ensureTopControls();
    if(currentPage==='messages')loadAdminMessages();
    const bsel=document.getElementById('branchSelect');if(bsel){const brs=branchesFor(db.activeBusinessId);bsel.innerHTML='<option value="all">All Branches</option>'+brs.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');bsel.value=activeBranchId;}
    const p=document.getElementById('period');if(p)p.value=period;const c=document.getElementById('customDates');if(c)c.style.display=period==='custom'?'inline-flex':'none';
    const title=document.getElementById('pageTitle');if(title&&currentPage==='admins')title.textContent='Staff';
  };

  // Replace date change listener by adding a second listener; the latest state wins.
  const pe=document.getElementById('period');if(pe)pe.addEventListener('change',e=>{period=e.target.value;if(period==='custom'){ensureTopControls();const c=document.getElementById('customDates');if(c)c.style.display='inline-flex'}else render()});

  // Make saves persist and sync the selected business feed when configured.
  const originalSave=window.save;
  window.save=function(){originalSave();if(typeof publishBusiness==='function'){publishBusiness().catch(()=>{})}};


  // Agreed expense structure: no Category field.
  window.renderExpenses=function(){const rows=scoped(db.expenses).filter(e=>inRange(e.date)).sort((a,b)=>b.date.localeCompare(a.date));document.getElementById('page-expenses').innerHTML=`<div class="toolbar"><div class="statline" style="margin:0"><span class="pill">Expenses <b>${rows.length}</b></span><span class="pill">Total <b>${money(rows.reduce((a,e)=>a+e.amount,0))}</b></span></div><button class="btn" data-action="new-expense">+ New Expense</button></div><div class="section"><div class="section-body"><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Paid To</th><th>Payment Method</th><th>Actions</th></tr></thead><tbody>${rows.map(e=>`<tr><td>${e.date}</td><td>${esc(e.description)}</td><td class="right">${money(e.amount)}</td><td>${esc(e.vendor||'')}</td><td>${esc(e.method||'')}</td><td><div class="actions"><button class="btn secondary small" data-action="edit-expense" data-id="${e.id}">Edit</button><button class="btn danger small" data-action="delete-expense" data-id="${e.id}">Delete</button></div></td></tr>`).join('')||'<tr><td colspan="6" class="empty">No expenses in this period.</td></tr>'}</tbody></table></div></div></div>`}
  window.newExpense=function(existing){openModal(existing?'Edit Expense':'New Expense',`<div class="form-grid"><div class="field"><label>Description</label><input id="fDesc" value="${esc(existing?.description||'')}"></div><div class="field"><label>Amount</label><input id="fAmount" type="number" value="${existing?.amount||''}"></div><div class="field"><label>Date</label><input id="fDate" type="date" value="${existing?.date||today}"></div><div class="field"><label>Paid To</label><input id="fVendor" value="${esc(existing?.vendor||'')}"></div><div class="field"><label>Payment Method</label><select id="fMethod"><option ${existing?.method==='Cash'?'selected':''}>Cash</option><option ${existing?.method==='Transfer'?'selected':''}>Transfer</option><option ${existing?.method==='POS'?'selected':''}>POS</option></select></div><div class="field full"><label>Notes</label><textarea id="fNotes">${esc(existing?.notes||'')}</textarea></div></div>`,()=>{const branchId=(window.getActiveBranchId?.()&&window.getActiveBranchId()!=='all'?window.getActiveBranchId():'')||existing?.branchId||'';const o={description:document.getElementById('fDesc').value.trim(),amount:Number(document.getElementById('fAmount').value||0),date:document.getElementById('fDate').value,branchId,vendor:document.getElementById('fVendor').value.trim(),method:document.getElementById('fMethod').value,notes:document.getElementById('fNotes').value};if(!o.description||!o.amount)return false;if(!branchId){alert('Select a specific branch from the Dashboard before recording the expense.');return false}if(existing)Object.assign(existing,o);else db.expenses.push({id:id(),businessId:db.activeBusinessId,...o,createdBy:currentAdminId});save();render();return true})}
  // Branch-aware stock entry: Category is intentionally not part of the New Stock form.
  window.newProduct=function(existing,prefillName='',saleRowIndex=null){const b=biz();if(!Array.isArray(b.productNameList))b.productNameList=[];const branchId=(window.getActiveBranchId?.()&&window.getActiveBranchId()!=='all'?window.getActiveBranchId():'');if(!branchId){alert('Select a specific branch from the Dashboard before creating or adjusting stock.');return}const pool=globalBranchStockPool(branchId);const qtyNow=existing?(pool.mode==='branch'?Number(existing.branchQty?.[pool.id]||0):Number(existing.qty||0)):0;const initialName=existing?.name||prefillName||'';openModal(existing?'Edit Product':'New Product',`<div class="form-grid"><div class="field"><label>Item Name</label><input id="fName" list="businessProductNames" value="${esc(initialName)}" ${prefillName&&!existing?'readonly':''}><datalist id="businessProductNames">${b.productNameList.map(n=>`<option value="${esc(n)}"></option>`).join('')}</datalist></div><div class="field"><label>Unit</label><input id="fUnit" value="${esc(existing?.unit||'Unit')}"></div><div class="field"><label>Cost Price</label><input id="fCost" type="number" min="0" step="0.01" value="${existing?.cost??''}"></div><div class="field"><label>Selling Price *</label><input id="fSell" type="number" min="0.01" step="0.01" value="${existing?.sell??''}" required></div><div class="field"><label>Quantity (${esc(branchesFor(db.activeBusinessId).find(x=>x.id===branchId)?.name||'Main Branch')}) *</label><input id="fQty" type="number" min="0" step="1" value="${existing?qtyNow:''}" required></div><div class="field"><label>Reorder Level</label><input id="fReorder" type="number" min="0" value="${existing?.reorder||0}"></div></div>`,()=>{const name=document.getElementById('fName').value.trim();const unit=document.getElementById('fUnit').value.trim();const costRaw=document.getElementById('fCost').value.trim();const sellRaw=document.getElementById('fSell').value.trim();const qtyRaw=document.getElementById('fQty').value.trim();const cost=Number(costRaw),sell=Number(sellRaw),qty=Number(qtyRaw);if(!name){alert('Item Name is required.');return false}if(!unit){alert('Unit is required.');return false}if(costRaw===''||!Number.isFinite(cost)||cost<0){alert('Enter a valid Cost Price (zero is allowed).');return false}if(sellRaw===''||!Number.isFinite(sell)||sell<=0){alert('Enter a Selling Price greater than zero.');return false}if(qtyRaw===''||!Number.isFinite(qty)||qty<0||(saleRowIndex!==null&&qty<=0)){alert(saleRowIndex!==null?'Enter a Quantity greater than zero when adding a product from New Sale.':'Enter a valid Quantity. Zero is allowed when setting up a product without opening stock.');return false}const duplicate=db.products.find(p=>p.businessId===db.activeBusinessId&&p.id!==existing?.id&&String(p.name||'').trim().toLowerCase()===name.toLowerCase());if(duplicate){alert('This product already exists in this business. Select the existing product instead of creating a duplicate.');return false}const o={name,unit,cost,sell,reorder:Math.max(0,Number(document.getElementById('fReorder').value||0))};const branchRecord=db.branches.find(br=>br.id===branchId);const branchIdsForCurrentStock=[branchId];if(branchRecord?.stockMode==='shared'&&branchRecord.stockSharedWith){const sharedSource=db.branches.find(br=>br.id===branchRecord.stockSharedWith);if(sharedSource?.stockMode==='separate')branchIdsForCurrentStock.push(sharedSource.id)}let savedProduct;if(existing){const assigned=Array.from(new Set([...(Array.isArray(existing.branchIds)?existing.branchIds:[]),...branchIdsForCurrentStock]));Object.assign(existing,o,{branchIds:assigned});if(pool.mode==='branch'){if(!existing.branchQty)existing.branchQty={};existing.branchQty[pool.id]=qty}else existing.qty=qty;savedProduct=existing}else{savedProduct={id:id(),businessId:db.activeBusinessId,branchIds:branchIdsForCurrentStock,...o,qty:pool.mode==='branch'?0:qty,branchQty:{}};if(pool.mode==='branch')savedProduct.branchQty[pool.id]=qty;db.products.push(savedProduct);if(qty>0){if(!Array.isArray(db.stockMovements))db.stockMovements=[];db.stockMovements.push({id:id(),businessId:db.activeBusinessId,branchId,productId:savedProduct.id,qty,type:'opening_stock',notes:'Opening stock entered when product was created',previousQty:0,resultQty:qty,actorName:db.admins.find(a=>a.id===currentAdminId)?.name||'Current Admin',date:today,createdAt:new Date().toISOString()})}}if(!b.productNameList.some(n=>String(n).trim().toLowerCase()===name.toLowerCase()))b.productNameList.push(name);if(saleRowIndex!==null&&Array.isArray(saleDraftItems)&&saleDraftItems[saleRowIndex]){saleDraftItems[saleRowIndex].productId=savedProduct.id;saleDraftItems[saleRowIndex].itemName=savedProduct.name;saleDraftItems[saleRowIndex].price=Number(savedProduct.sell||0)}save();render();if(pendingSaleSave){setTimeout(()=>{if(pendingSaleSave){pendingSaleSave.running=false;saveSalePage(pendingSaleSave.asNew)}},0)}return true})}


  // Sales navigation opens New Sale directly. The sales list remains reachable through Back to Sales.
  document.getElementById('nav')?.addEventListener('click',function(e){const b=e.target.closest('button[data-page="sales"]');if(!b)return;e.stopImmediatePropagation();if(pendingSaleSave){salesView='new';currentPage='sales';document.getElementById('sidebar').classList.remove('open');render();return;}salesView='new';editingSaleId=null;saleDraftItems=null;saleDraftCustomer=null;pendingSaleFormState=null;pendingSaleSave=null;currentPage='sales';document.getElementById('sidebar').classList.remove('open');render()},true);
  document.addEventListener('click',function(e){const r=e.target.closest('.ns-remove');if(r){readSalePageItems();saleDraftItems.splice(Number(r.dataset.i),1);if(!saleDraftItems.length)saleDraftItems.push({productId:'',itemName:'',qty:1,price:0});render();}});


  // === Combined inline forms + filtered sales list (requested UI revision) ===
  let inlineCustomerEditId=null, inlinePaymentEditId=null, inlineExpenseEditId=null;

  function inlineCustomerForm(){
    const c=inlineCustomerEditId?db.customers.find(x=>x.id===inlineCustomerEditId):null;
    return `<div class="section"><div class="section-head"><h3>${c?'Edit Customer':'New Customer'}</h3>${c?'<button class="btn secondary small" data-action="cancel-inline-customer">Cancel</button>':''}</div><div class="section-body">
      <div class="inline-form-row">
        <div class="field"><label>Name *</label><input id="icName" value="${esc(c?.name||'')}"></div>
        <div class="field"><label>Phone</label><input id="icPhone" value="${esc(c?.phone||'')}"></div>
        <div class="field"><label>Address</label><input id="icAddress" value="${esc(c?.address||'')}"></div>
      </div>
      <div class="inline-form-actions customer-save-row"><button class="btn green" data-action="save-inline-customer">Save Customer</button></div>
    </div></div>`;
  }
  function renderCustomers(){
    const t=totals(), rows=scoped(db.customers);
    document.getElementById('page-customers').innerHTML=inlineCustomerForm()+`<div class="section" style="margin-top:14px"><div class="section-head"><h3>Customers</h3><span class="status">${rows.length} customer(s)</span></div><div class="section-body"><div class="toolbar"><input class="search" id="customerSearch" placeholder="Search customer"></div><div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th>Phone</th><th>Address</th><th class="right">Balance</th><th>Actions</th></tr></thead><tbody id="customerBody">${rows.map(c=>{let o=t.owing.find(x=>x.id===c.id)?.balance||0;return `<tr data-search="${esc((c.name||'')+' '+(c.phone||'')+' '+(c.address||''))}"><td><b>${esc(c.name)}</b></td><td>${esc(c.phone)}</td><td>${esc(c.address)}</td><td class="right ${o?'red-text':''}">${money(o)}</td><td><button class="btn secondary small" data-action="edit-inline-customer" data-id="${c.id}">Edit</button></td></tr>`}).join('')||'<tr><td colspan="5" class="empty">No customers yet.</td></tr>'}</tbody></table></div></div></div>`;
    document.getElementById('customerSearch').oninput=e=>document.querySelectorAll('#customerBody tr').forEach(r=>r.style.display=(r.dataset.search||'').toLowerCase().includes(e.target.value.toLowerCase())?'':'none');
  }

  function inlinePaymentForm(){
    const p=inlinePaymentEditId?db.payments.find(x=>x.id===inlinePaymentEditId):null;
    const customerOptionsHtml=customerOptions();
    const selected=p?.customerId||'';
    const opts=customerOptionsHtml.replace(/<option value="([^"]*)"/g,(m,v)=>m+(v===selected?' selected':''));
    return `<div class="section"><div class="section-head"><h3>${p?'Edit Debtor Payment':'Record Debtor Payment'}</h3>${p?'<button class="btn secondary small" data-action="cancel-inline-payment">Cancel</button>':''}</div><div class="section-body">
      <div class="inline-five-row">
        <div class="field"><label>Customer / Debtor *</label><select id="ipCustomer">${opts}</select></div>
        <div class="field"><label>Total Amount Owed</label><input id="ipOwed" value="₦0" disabled></div>
        <div class="field"><label>Date *</label><input id="ipDate" type="date" value="${esc(p?.date||today)}"></div>
        <div class="field"><label>Amount Paid *</label><input id="ipAmount" type="number" min="0" step="0.01" value="${p?.amount??''}"></div>
        <div class="field"><label>Method *</label><select id="ipMethod">${['Cash','Transfer','Bank Transfer'].map(x=>`<option ${p?.method===x?'selected':''}>${x}</option>`).join('')}</select></div>
      </div>
      <div class="inline-note-row"><div class="field"><label>Note</label><input id="ipNote" value="${esc(p?.note||'')}"></div><div></div><div class="inline-form-actions"><button class="btn green" data-action="save-inline-payment">Save Payment</button></div></div>
    </div></div>`;
  }
  function renderPayments(){
    const rows=scoped(db.payments).filter(p=>inRange(p.date)).sort((a,b)=>b.date.localeCompare(a.date));
    document.getElementById('page-payments').innerHTML=inlinePaymentForm()+`<div class="section" style="margin-top:14px"><div class="section-head"><h3>Debtors &amp; Payments</h3><span class="status">${rows.length} payment(s) • ${money(rows.reduce((a,p)=>a+Number(p.amount||0),0))} received</span></div><div class="section-body"><div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th>Date</th><th>Method</th><th>Note</th><th class="right">Amount</th><th>Actions</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(cust(p.customerId).name)}</td><td>${esc(p.date)}</td><td>${esc(p.method||'')}</td><td>${esc(p.note||'')}</td><td class="right">${money(p.amount)}</td><td><button class="btn secondary small" data-action="edit-inline-payment" data-id="${p.id}">Edit</button> <button class="btn danger small" data-action="delete-payment" data-id="${p.id}">Delete</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">No payments in this period.</td></tr>'}</tbody></table></div></div></div>`;
    const sel=document.getElementById('ipCustomer'), owed=document.getElementById('ipOwed');
    const update=()=>{const c=scoped(db.customers).find(v=>v.id===sel?.value);if(owed)owed.value=money(customerOutstanding(c?.id));};
    sel?.addEventListener('change',update); update();
  }

  function inlineExpenseForm(){
    const e=inlineExpenseEditId?db.expenses.find(x=>x.id===inlineExpenseEditId):null;
    return `<div class="section"><div class="section-head"><h3>${e?'Edit Expense':'New Expense'}</h3>${e?'<button class="btn secondary small" data-action="cancel-inline-expense">Cancel</button>':''}</div><div class="section-body">
      <div class="inline-five-row">
        <div class="field"><label>Description *</label><input id="ieDesc" value="${esc(e?.description||'')}"></div>
        <div class="field"><label>Amount *</label><input id="ieAmount" type="number" min="0" step="0.01" value="${e?.amount??''}"></div>
        <div class="field"><label>Date *</label><input id="ieDate" type="date" value="${esc(e?.date||today)}"></div>
        <div class="field"><label>Person / Vendor</label><input id="ieVendor" value="${esc(e?.vendor||'')}"></div>
        <div class="field"><label>Payment Method</label><select id="ieMethod">${['Cash','Transfer','Bank','POS'].map(x=>`<option ${e?.method===x?'selected':''}>${x}</option>`).join('')}</select></div>
      </div>
      <div class="inline-note-row"><div class="field"><label>Note</label><input id="ieNotes" value="${esc(e?.notes||'')}"></div><div></div><div class="inline-form-actions"><button class="btn green" data-action="save-inline-expense">Save Expense</button></div></div>
    </div></div>`;
  }
  function renderExpenses(){
    const rows=scoped(db.expenses).filter(e=>inRange(e.date)).sort((a,b)=>b.date.localeCompare(a.date));
    document.getElementById('page-expenses').innerHTML=inlineExpenseForm()+`<div class="section" style="margin-top:14px"><div class="section-head"><h3>Expenses</h3><span class="status">${rows.length} expense(s) • ${money(rows.reduce((a,e)=>a+Number(e.amount||0),0))}</span></div><div class="section-body"><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Paid To</th><th>Payment Method</th><th>Actions</th></tr></thead><tbody>${rows.map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(e.description)}</td><td class="right">${money(e.amount)}</td><td>${esc(e.vendor||'')}</td><td>${esc(e.method||'')}</td><td><button class="btn secondary small" data-action="edit-inline-expense" data-id="${e.id}">Edit</button> <button class="btn danger small" data-action="delete-expense" data-id="${e.id}">Delete</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">No expenses in this period.</td></tr>'}</tbody></table></div></div></div>`;
  }

  function saveInlineCustomer(){
    const name=document.getElementById('icName')?.value.trim(); if(!name){alert('Customer name is required.');return}
    const phone=document.getElementById('icPhone')?.value.trim()||'',address=document.getElementById('icAddress')?.value.trim()||'';
    if(inlineCustomerEditId){const c=db.customers.find(x=>x.id===inlineCustomerEditId);if(c)Object.assign(c,{name,phone,address});}
    else db.customers.push({id:id(),businessId:db.activeBusinessId,name,phone,address,opening:0});
    save();inlineCustomerEditId=null;render();
  }
  function saveInlinePayment(){
    const customerId=document.getElementById('ipCustomer')?.value||'',date=document.getElementById('ipDate')?.value||today,amount=Number(document.getElementById('ipAmount')?.value||0),method=document.getElementById('ipMethod')?.value||'Cash',note=document.getElementById('ipNote')?.value||'';
    const c=scoped(db.customers).find(x=>x.id===customerId); if(!c){alert('Please select a debtor.');return}
    const branchId=(window.getActiveBranchId?.()&&window.getActiveBranchId()!=='all'?window.getActiveBranchId():(c.branchId||branchesFor(db.activeBusinessId)[0]?.id||''));
    if(!branchId){alert('Select a specific branch from the Dashboard before recording a debtor payment.');return}
    const oldPayment=inlinePaymentEditId?db.payments.find(x=>x.id===inlinePaymentEditId):null;
    const owed=customerOutstanding(c.id)+(oldPayment&&oldPayment.customerId===c.id?Number(oldPayment.amount||0):0);
    if(!Number.isFinite(amount)||amount<=0){alert('Enter a valid Amount Paid.');return}
    if(owed<=0){alert('This customer has no outstanding debt.');return}
    if(amount>owed){alert(`Amount Paid cannot exceed the Total Amount Owed of ${money(owed)}.`);return}
    if(inlinePaymentEditId){const p=oldPayment;if(p)Object.assign(p,{customerId,date,amount,method,note,branchId});}
    else db.payments.push({id:id(),businessId:db.activeBusinessId,branchId,customerId,date,amount,method,note,createdBy:currentAdminId});
    save();inlinePaymentEditId=null;render();
  }
  function saveInlineExpense(){
    const description=document.getElementById('ieDesc')?.value.trim(),amount=Number(document.getElementById('ieAmount')?.value||0),date=document.getElementById('ieDate')?.value||today,vendor=document.getElementById('ieVendor')?.value.trim()||'',method=document.getElementById('ieMethod')?.value||'Cash',notes=document.getElementById('ieNotes')?.value||'';
    if(!description||!Number.isFinite(amount)||amount<=0){alert('Description and a valid Amount are required.');return}
    const active=window.getActiveBranchId?.();const branchId=(active&&active!=='all'?active:(inlineExpenseEditId?db.expenses.find(x=>x.id===inlineExpenseEditId)?.branchId:branchesFor(db.activeBusinessId)[0]?.id||''));if(!branchId){alert('Select a specific branch from the Dashboard before recording the expense.');return}
    const o={description,amount,date,vendor,method,notes,branchId};
    if(inlineExpenseEditId){const e=db.expenses.find(x=>x.id===inlineExpenseEditId);if(e)Object.assign(e,o);}
    else db.expenses.push({id:id(),businessId:db.activeBusinessId,...o,createdBy:currentAdminId});
    save();inlineExpenseEditId=null;render();
  }

  bindSalesListSearch=function(searchId='salesSearchBelow',bodyId='salesBodyBelow'){
    const apply=()=>{
      const q=(document.getElementById(searchId)?.value||'').trim().toLowerCase();
      const inv=(document.getElementById('salesInvoiceFilter')?.value||'').trim().toLowerCase();
      const mode=document.getElementById('salesInvoiceMode')?.value||'all';
      const entry=(document.getElementById('salesEntryDateFilter')?.value||'').trim();
      const txn=(document.getElementById('salesTxnDateFilter')?.value||'').trim();
      document.querySelectorAll(`#${bodyId} tr`).forEach(r=>{
        const customer=(r.dataset.customer||r.dataset.search||'').toLowerCase();
        const invoice=(r.dataset.invoice||'').toLowerCase();
        const entryRaw=r.dataset.entryDate||'';
        const entryDate=entryRaw.slice(0,10);
        const txnDate=r.dataset.txnDate||'';
        let invOk=true;
        if(inv){if(mode==='exact')invOk=invoice===inv;else if(mode==='starts')invOk=invoice.startsWith(inv);else invOk=invoice.includes(inv);}
        const ok=customer.includes(q)&&invOk&&(!entry||entryDate===entry)&&(!txn||txnDate===txn);
        r.style.display=ok?'':'none';
      });
    };
    [searchId,'salesInvoiceFilter','salesInvoiceMode','salesEntryDateFilter','salesTxnDateFilter'].forEach(id=>document.getElementById(id)?.addEventListener(id==='salesInvoiceMode'?'change':'input',apply));
    document.getElementById('salesEntryDateFilter')?.addEventListener('change',apply);
    document.getElementById('salesTxnDateFilter')?.addEventListener('change',apply);
  };
    const baseHandleRequested=handle;
  handle=function(action,el){
    const x=el?.dataset?.id;
    if(action==='edit-inline-customer'){inlineCustomerEditId=x;render();return}
    if(action==='cancel-inline-customer'){inlineCustomerEditId=null;render();return}
    if(action==='save-inline-customer'){saveInlineCustomer();return}
    if(action==='edit-inline-payment'){inlinePaymentEditId=x;render();return}
    if(action==='cancel-inline-payment'){inlinePaymentEditId=null;render();return}
    if(action==='save-inline-payment'){saveInlinePayment();return}
    if(action==='edit-inline-expense'){inlineExpenseEditId=x;render();return}
    if(action==='cancel-inline-expense'){inlineExpenseEditId=null;render();return}
    if(action==='save-inline-expense'){saveInlineExpense();return}
    if(action==='new-customer'){inlineCustomerEditId=null;render();return}
    if(action==='new-payment'){inlinePaymentEditId=null;render();return}
    if(action==='new-expense'){inlineExpenseEditId=null;render();return}
    return baseHandleRequested(action,el);
  };

  // Keep all three management pages on the same combined page after saving.
  document.getElementById('nav')?.addEventListener('click',function(e){
    const b=e.target.closest('button[data-page]');
    if(!b)return;
    if(b.dataset.page==='customers')inlineCustomerEditId=null;
    if(b.dataset.page==='payments')inlinePaymentEditId=null;
    if(b.dataset.page==='expenses')inlineExpenseEditId=null;
  },true);

  // Initialize branch-aware view.
  render();
})();
