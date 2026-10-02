/* No account/session, analytics, local persistence, automatic URL fetches or uploads. */
(() => {
  const config=window.DOJI_SAFETY_CONFIG||{};
  // The intake accepts only the canonical origin. Redirect static hosting aliases
  // before collecting information or loading Turnstile; never forward query data.
  if(config.enabled===true && (location.hostname==='www.dojipro.com'
    || location.hostname==='doji-site.pages.dev' || location.hostname.endsWith('.doji-site.pages.dev'))){
    location.replace('https://dojipro.com/safety-removal/');
    return;
  }
  const byId=id=>document.getElementById(id);
  const catalog=window.DojiReportTaxonomy||[];
  const option=(value,label)=>new Option(label,value);
  const reason=byId('reason'),detail=byId('detail');
  const refreshSelects=()=>document.querySelectorAll('#removalForm select').forEach(select=>window.DojiPortalSelect.refresh(select));
  catalog.forEach(item=>reason.add(option(item.value,item.label)));
  function categoryChanged(resetDetails=false) {
    const category=catalog.find(item=>item.value===reason.value);
    if(resetDetails){
      detail.replaceChildren(option('',category?'Choose a reason':'Choose a category first'));
      category?.details.forEach(item=>detail.add(option(item.value,item.value==='nonconsensual_intimate_images'?'Intimate images shared without consent (including AI-altered images)':item.label)));
      if(category?.details.length===1)detail.value=category.details[0].value;
    }
    const ncii=detail.value==='nonconsensual_intimate_images', witness=byId('relationship').value==='witness';
    byId('nciiNotice').hidden=!!reason.value&&!ncii;
    byId('categoryHelp').textContent=reason.value==='intellectual_property'
      ? 'Describe the work, mark or goods involved and your connection to the rights holder. This is a policy-review request; additional information may be required for a formal legal notice.'
      : ncii?'This includes real or digitally altered intimate imagery. For threats to share content that has not been posted, choose Bullying or unwanted contact → Threatening to share private content.'
      : detail.value==='child_sexual_content'?'Provide only a location and a non-graphic description. Do not download, forward or send suspected child sexual abuse material.'
      : 'Choose the closest match. Staff will assess the information you provide.';
    byId('statementHelp').textContent=ncii
      ? 'Explain why you believe the intimate content was published without consent. If acting for the person depicted, explain your authority. No graphic detail is needed.'
      : 'Explain what happened and why you believe the content or account should be reviewed. If representing someone else, explain your authority. No graphic detail is needed.';
    byId('declarationText').textContent=ncii&&!witness
      ? 'I am the person depicted or their authorized representative, believe in good faith that this intimate content was published without consent, and intend my typed name as my electronic signature.'
      : 'I believe this report is accurate to the best of my knowledge and intend my typed name as my electronic signature.';
    byId('declaration').checked=false;
    refreshSelects();
  }
  reason.onchange=()=>categoryChanged(true);detail.onchange=()=>categoryChanged();byId('relationship').onchange=()=>categoryChanged();
  categoryChanged(true);
  document.querySelectorAll('#removalForm select').forEach(select=>window.DojiPortalSelect.enhance(select,true));
  byId('removalForm').onsubmit=event=>event.preventDefault();
  byId('statusForm').onsubmit=event=>event.preventDefault();
  const feedback=(id,message,error=false)=>{ const node=byId(id); node.textContent=message; node.classList.toggle('error',error); node.focus(); };
  byId('removalForm').addEventListener('invalid',event=>{
    if(event.target.tagName!=='SELECT')return;
    byId('requestFeedback').textContent=event.target===reason?'Choose a category.':'Choose a reason.';
    byId('requestFeedback').classList.add('error');
  },true);
  const labels={received:'Received',reviewing:'Under review',needs_information:'More information needed',removed:'Removal completed',not_actionable:'Review completed'};
  const failureMessage=error=>['AbortError','TimeoutError','TypeError'].includes(error?.name)
    ? 'The response could not be confirmed. Keep this page open and retry unchanged, or contact support@dojipro.com without sending images.'
    : error.message;
  let pending=false, statusPending=false, intent=null, receipt=null;
  const widgets={}; const tokens={};
  const validConfig=config.enabled===true && /^https:\/\//.test(config.endpoint||'') && config.siteKey;
  if (!validConfig) {
    byId('requestFields').disabled=config.preview!==true;
    refreshSelects();
    byId('availability').textContent=config.preview===true
      ? 'Preview only — you can explore the form, but submitting is disabled. Online intake is not available yet.'
      : 'Online intake is unavailable. Contact support@dojipro.com with request details, not images.';
    return;
  }
  byId('availability').textContent='';
  function reset(kind) { tokens[kind]=''; if (widgets[kind]!==undefined) window.turnstile?.reset(widgets[kind]); }
  const script=document.createElement('script');
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.onload=()=>{
    for(const kind of ['request','status']) widgets[kind]=window.turnstile.render(`#${kind}Verification`,{
      sitekey:config.siteKey,action:'safety_removal',
      callback:token=>{tokens[kind]=token;},
      'expired-callback':()=>{tokens[kind]='';},
      'error-callback':()=>{tokens[kind]='';feedback(`${kind}Feedback`,'The security check could not load. Try again or contact support@dojipro.com without sending images.',true);},
    });
    byId('requestFields').disabled=false; byId('submitRequest').disabled=false; byId('checkStatus').disabled=false;
    refreshSelects();
  };
  script.onerror=()=>{byId('availability').textContent='The security check is unavailable. Contact support@dojipro.com without sending images.';};
  document.head.append(script);
  async function send(kind,body) {
    if (!tokens[kind]) throw new Error('Complete the security check first.');
    try {
      const response=await fetch(config.endpoint,{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',
        headers:{'content-type':'application/json'},body:JSON.stringify({...body,verification:tokens[kind]}),signal:AbortSignal.timeout(20000)});
      const value=await response.json();
      if (!response.ok) throw new Error(typeof value.message==='string'?value.message:'Receipt could not be confirmed. Retry unchanged.');
      if (value.id!==body.id || !labels[value.state] || !Number.isFinite(Date.parse(value.received_at))) throw new Error('Receipt could not be verified. Keep this page open and retry unchanged.');
      return value;
    } finally {reset(kind);}
  }
  byId('removalForm').onsubmit=async event=>{
    event.preventDefault(); if(pending) return;
    const form=event.currentTarget;
    const data=Object.fromEntries(new FormData(form)); data.consent=data.consent==='on';
    delete data['cf-turnstile-response'];
    const fingerprint=JSON.stringify(data);
    if (!intent || intent.fingerprint!==fingerprint) intent={fingerprint,id:crypto.randomUUID(),secret:[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('')};
    pending=true; byId('requestFields').disabled=true; byId('submitRequest').disabled=true;
    refreshSelects();
    feedback('requestFeedback','Submitting your request…');
    try {
      const result=await send('request',{action:'submit',id:intent.id,secret:intent.secret,request:data});
      receipt={...result,secret:intent.secret};
      byId('receiptReference').textContent=result.id; byId('receiptSecret').textContent=receipt.secret;
      byId('receiptTime').textContent=new Date(result.received_at).toLocaleString();
      byId('statusReference').value=result.id; byId('statusSecret').value=receipt.secret;
      byId('requestSection').hidden=true; byId('receiptSection').hidden=false; byId('receiptTitle').focus();
      form.reset();
    } catch(error) {feedback('requestFeedback',failureMessage(error),true);}
    finally {pending=false;byId('requestFields').disabled=false;byId('submitRequest').disabled=false;refreshSelects();}
  };
  byId('saveReceipt').onclick=()=>{
    if(!receipt)return;
    const text=`Doji removal request\nReference: ${receipt.id}\nPrivate code: ${receipt.secret}\nReceived: ${receipt.received_at}\nCheck status at https://dojipro.com/safety-removal/\nKeep this code private. No image was uploaded.\n`;
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain'}));const link=document.createElement('a');link.href=url;link.download='doji-removal-receipt.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  byId('statusForm').onsubmit=async event=>{
    event.preventDefault();if(statusPending)return;statusPending=true;byId('checkStatus').disabled=true;byId('statusResult').hidden=true;
    byId('statusReference').disabled=true;byId('statusSecret').disabled=true;
    feedback('statusFeedback','Checking your receipt…');
    try {
      const result=await send('status',{action:'status',id:byId('statusReference').value.trim(),secret:byId('statusSecret').value.trim()});
      byId('statusLabel').textContent=labels[result.state];byId('statusMessage').textContent=result.message;
      byId('statusTime').textContent=`Last updated: ${new Date(result.updated_at).toLocaleString()}`;
      byId('statusResult').hidden=false;feedback('statusFeedback','Status loaded.');
    }catch(error){feedback('statusFeedback',failureMessage(error),true);}finally{statusPending=false;byId('checkStatus').disabled=false;byId('statusReference').disabled=false;byId('statusSecret').disabled=false;}
  };
  window.addEventListener('beforeunload',event=>{if(pending){event.preventDefault();event.returnValue='';}});
})();
