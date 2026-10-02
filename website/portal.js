(() => {
  const portalType = document.body.dataset.portal;
  if (!portalType) return;

  const byId = (id) => document.getElementById(id);
  const query = (selector, root = document) => root.querySelector(selector);
  const queryAll = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const auth = byId('portalAuth');
  const onboarding = byId('portalOnboarding');
  const app = byId('portalApp');
  const sidebar = byId('portalSidebar');
  const sidebarBackdrop = byId('portalSidebarBackdrop');
  const mobileMenu = byId('mobileMenu');
  const toast = byId('toast');
  let toastTimer;

  document.body.dataset.portalRuntime = '20260925ap';

  function setSidebarOpen(open) {
    sidebar?.classList.toggle('open', open);
    sidebarBackdrop?.classList.toggle('open', open);
    sidebarBackdrop?.setAttribute('aria-hidden', String(!open));
    mobileMenu?.setAttribute('aria-expanded', String(open));
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function enterDemo(initialView = 'overview') {
    auth.hidden = true;
    if (onboarding) onboarding.hidden = true;
    app.hidden = false;
    setView(initialView);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function exitDemo() {
    app.hidden = true;
    if (onboarding) onboarding.hidden = true;
    auth.hidden = false;
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function setView(view) {
    if (query(`.portalNav [data-view="${view}"]`)?.hidden) return;
    queryAll('[data-portal-view]').forEach((section) => { section.hidden = section.dataset.portalView !== view; });
    queryAll('.portalNav [data-view]').forEach((button) => {
      if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const active = query(`.portalNav [data-view="${view}"]`);
    const title = byId('portalPageTitle');
    if (title && active) title.textContent = active.dataset.label || active.textContent.trim();
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.dispatchEvent(new CustomEvent('portal:view', { detail: view }));
  }

  const enhancePortalSelect = window.DojiPortalSelect.enhance;
  const closePortalSelects = window.DojiPortalSelect.close;

  queryAll('.portalNav [data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  queryAll('[data-view-jump]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.viewJump)));
  mobileMenu?.addEventListener('click', () => setSidebarOpen(!sidebar?.classList.contains('open')));
  byId('sidebarClose')?.addEventListener('click', () => setSidebarOpen(false));
  sidebarBackdrop?.addEventListener('click', () => setSidebarOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar?.classList.contains('open')) setSidebarOpen(false);
  });
  queryAll('[data-action="exit-demo"]').forEach((button) => button.addEventListener('click', exitDemo));
  queryAll('[data-action="prototype-only"]').forEach((button) => button.addEventListener('click', () => showToast('This control is mapped, but intentionally not wired to a backend yet.')));

  const themeKey = 'doji-portal-theme';
  function applyTheme(theme) {
    const resolved = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = resolved;
    queryAll('[data-theme-label]').forEach((label) => { label.textContent = resolved === 'light' ? 'Dark mode' : 'Light mode'; });
    queryAll('[data-action="toggle-theme"]').forEach((button) => { button.setAttribute('aria-pressed', String(resolved === 'dark')); });
  }
  applyTheme(localStorage.getItem(themeKey) || 'light');
  queryAll('[data-action="toggle-theme"]').forEach((button) => button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(themeKey, next);
    applyTheme(next);
  }));

  if (portalType === 'business') setupBusinessPortal();
  if (portalType === 'admin') setupAdminPortal();
  queryAll('select').forEach((select) => enhancePortalSelect(select));

  function setupBusinessPortal() {
    const signinForm = byId('signinForm');
    const signupForm = byId('signupForm');
    const authTitle = byId('authTitle');
    const authDescription = byId('authDescription');
    const onboardingBack = byId('onboardingBack');
    const onboardingNext = byId('onboardingNext');
    const campaignModal = byId('campaignModal');
    const campaignForm = byId('campaignForm');
    const dojiModal = byId('dojiModal');
    const dojiForm = byId('dojiForm');
    const campaignDetailModal = byId('campaignDetailModal');
    const dojiDetail = byId('businessDojiDetail');
    let activeDojiId = null;
    let editingDojiId = null;
    const setupDraftKey = 'doji-business-prototype-setup-draft-v1';
    const resumeButton = byId('resumeBusiness');
    campaignDetailModal.classList.add('businessRecordDrawer');
    campaignDetailModal.setAttribute('aria-labelledby', 'campaignDetailTitle');
    campaignModal.setAttribute('aria-label', 'Create a campaign');
    dojiModal.setAttribute('aria-label', 'Sponsored Doji form');
    queryAll('.modalHeader .iconButton').forEach(button=>{button.classList.replace('iconButton','portalButton');button.textContent='Close';});
    queryAll('select').forEach(select => enhancePortalSelect(select, true));
    const feedback = (form, message, control) => {
      let box = form.querySelector('.businessFormError');
      if (!box) { box = document.createElement('p'); box.className = 'businessFormError'; box.setAttribute('role','alert'); form.querySelector('.modalBody')?.prepend(box); if (!box.isConnected) form.prepend(box); }
      box.textContent = message;
      control?.focus();
      return null;
    };
    const clearFeedback = form => { const box = form.querySelector('.businessFormError'); if (box) box.textContent = ''; };
    // Opt-in business-only validation keeps errors visible and focuses shared selects.
    [campaignForm, dojiForm].forEach(form => { form.noValidate = true; });
    function validateForm(form) {
      const invalid = [...form.elements].find(input => input.willValidate && !input.checkValidity());
      if (!invalid) return true;
      feedback(form, `${invalid.labels?.[0]?.textContent || 'Field'}: ${invalid.validationMessage}`,
        invalid.tagName === 'SELECT' ? invalid.closest('.portalSelect')?.querySelector('.portalSelectTrigger') : invalid);
      return false;
    }
    const profileKey = 'doji-business-prototype-profile-v3';
    const accountKey = 'doji-business-prototype-account-v3';
    const campaignKey = 'doji-business-prototype-company-campaigns-v3';
    const sampleDraftKey = 'doji-business-prototype-sample-campaigns-v3';
    const seedCampaigns = [
      { id: 'CAM-102', name: 'Trail personalities', summary: 'Learn what motivates different kinds of outdoor movement.', goal: 'Learn audience preferences', region: 'United States', start: 'Oct 1, 2026', end: 'Oct 31, 2026', startRaw: '2026-10-01', endRaw: '2026-10-31', status: 'review', label: 'In progress', dojis: [
        { id: 'DOJI-102-A', name: 'Trail mood poll', prompt: 'Which trail mood are you today?', format: 'Poll', formatValue: 'poll', liveDate: 'Oct 12, 2026', liveDateRaw: '2026-10-12', status: 'review', reviewState: 'changes_requested', label: 'Changes requested', reviewFeedback: 'Example feedback: make the prompt understandable to people who do not hike.', options: ['Quiet reset', 'Big climb', 'Social miles', 'Fast finish', 'Other'] },
        { id: 'DOJI-102-B', name: 'View from the trail', prompt: 'Show us the view that made you stop.', format: 'Photo idea', formatValue: 'photo_idea', liveDate: 'Oct 19, 2026', status: 'draft', label: 'Draft', options: [] },
      ] },
      { id: 'CAM-099', name: 'Morning movement', summary: 'Build awareness around approachable ways to begin moving.', goal: 'Brand awareness', region: 'United States & Canada', start: 'Oct 1, 2026', end: 'Oct 15, 2026', startRaw: '2026-10-01', endRaw: '2026-10-15', status: 'approved', label: 'Scheduled', dojis: [
        { id: 'DOJI-099-A', name: 'Before eight', prompt: 'Photo something that gets you moving before 8.', format: 'Photo idea', formatValue: 'photo_idea', liveDate: 'Oct 6, 2026', status: 'approved', label: 'Scheduled', options: [] },
      ] },
      { id: 'CAM-094', name: 'Weekend reset', summary: 'Understand the small rituals people use to recharge.', goal: 'Community conversation', region: 'United States', start: 'Sep 1, 2026', end: 'Sep 20, 2026', startRaw: '2026-09-01', endRaw: '2026-09-20', status: 'completed', label: 'Completed', dojis: [
        { id: 'DOJI-094-A', name: 'Weekend reset ritual', prompt: 'How did you reset this weekend?', format: 'Photo idea', formatValue: 'photo_idea', liveDate: 'Sep 7, 2026', status: 'completed', label: 'Completed', options: [], results: { eligible: 9320, opens: 7312, completions: 6588, reactions: 1684, comments: 281 } },
        { id: 'DOJI-094-B', name: 'Sunday recharge poll', prompt: 'What helps you recharge most?', format: 'Poll', formatValue: 'poll', liveDate: 'Sep 14, 2026', status: 'completed', label: 'Completed', options: ['Time outside', 'A quiet night', 'Friends or family', 'Getting organized', 'Other'], results: { eligible: 9100, opens: 6906, completions: 6221, reactions: 1458, comments: 206 } },
      ] },
      { id: 'CAM-NEW', name: 'Product rituals', summary: 'Explore the everyday items people never leave behind.', goal: 'Product launch', region: 'United States', start: 'Nov 1, 2026', end: 'Nov 21, 2026', startRaw: '2026-11-01', endRaw: '2026-11-21', status: 'draft', label: 'Draft', dojis: [] },
    ];
    const sampleProfile = { ownerName: 'Alex', companyName: 'Northstar', legalName: 'Northstar Outdoor Co.', website: 'https://northstar.example', description: 'Outdoor products built to make everyday movement feel more inviting.', industry: 'Sports and wellness', size: '51–250 employees', country: 'United States', goal: 'Brand awareness', markets: ['United States', 'Canada'] };
    let workspaceMode = 'sample';
    let onboardingStep = 1;
    let activeFilter = 'all';
    let uploadedLogoDataUrl = '';
    let activeCampaignId = null;

    function readStorage(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
      catch { return fallback; }
    }

    function getProfile() { return workspaceMode === 'new' ? readStorage(profileKey, sampleProfile) : sampleProfile; }
    function storageKey() { return workspaceMode === 'new' ? campaignKey : sampleDraftKey; }
    function getLocalCampaigns() { return readStorage(storageKey(), []); }
    function getCampaigns() { const local = getLocalCampaigns(); return workspaceMode === 'new' ? local : [...local, ...seedCampaigns.filter(seed => !local.some(item => item.id === seed.id))]; }
    function saveLocalCampaigns(campaigns) { localStorage.setItem(storageKey(), JSON.stringify(campaigns)); }
    function allDojis(campaigns = getCampaigns()) { return campaigns.flatMap((campaign) => campaign.dojis || []); }
    function formatDateRange(campaign) { return `${campaign.start || 'Start pending'} – ${campaign.end || 'End pending'}`; }
    function campaignStatusClass(status) { return ['approved', 'completed'].includes(status) ? 'approved' : status === 'review' ? 'revision' : ''; }

    function campaignMarkup(campaign) {
      const dojis = campaign.dojis || [];
      return `<div class="campaignRow" role="button" tabindex="0" data-campaign-id="${escapeHtml(campaign.id)}">
        <div class="campaignIdentity"><strong>${escapeHtml(campaign.name)}</strong><small>${escapeHtml(campaign.summary)}</small></div>
        <div class="campaignMeta"><span>${dojis.length} ${dojis.length === 1 ? 'Doji' : 'Dojis'}</span><small>${escapeHtml(campaign.region)} · ${escapeHtml(formatDateRange(campaign))}</small></div>
        <span class="statusPill ${campaignStatusClass(campaign.status)}">${escapeHtml(campaign.label)}</span>
        <span class="rowChevron" aria-hidden="true">›</span>
      </div>`;
    }

    function dojiMarkup(doji) {
      return `<button type="button" class="dojiRow" data-business-doji="${escapeHtml(doji.id)}"><span class="dojiFormatMark">${escapeHtml(doji.format.charAt(0))}</span><span><strong>${escapeHtml(doji.name)}</strong><small>${escapeHtml(doji.prompt || 'Prompt not added yet')}</small></span><span class="dojiMeta"><span>${escapeHtml(doji.format)}</span><small>${escapeHtml(doji.liveDate || 'Date not requested')}</small></span><span class="statusPill ${campaignStatusClass(doji.status)}">${escapeHtml(doji.label)}</span></button>`;
    }

    function lifecycleStep(label, done, current = false) { return `<span class="${done ? 'done' : ''} ${current ? 'current' : ''}">${label}</span>`; }
    function editableDoji(doji) { return doji?.status === 'draft' || doji?.reviewState === 'changes_requested'; }

    function openDojiDetail(id) {
      const campaign = findCampaign(activeCampaignId);
      const doji = campaign?.dojis?.find(item => item.id === id);
      if (!doji) return;
      activeDojiId = id;
      campaignDetailModal.close();
      byId('businessDojiTitle').textContent = doji.name;
      byId('businessDojiStatus').textContent = `${doji.label} · Local prototype`;
      const field = (label, value) => `<label class="field full">${escapeHtml(label)}<textarea readonly rows="2">${escapeHtml(value || 'Not supplied')}</textarea></label>`;
      const rule = doji.answer_rule;
      byId('businessDojiBody').innerHTML = `<div class="formGrid">${field('Campaign',campaign.name)}${field('Type',doji.format)}${field('Question / prompt',doji.prompt)}${(doji.options || []).map((choice,index)=>field(`Choice ${index+1}`,choice)).join('')}${doji.formatValue === 'format_question' ? field('Answer format',rule?.type === 'exact_word_count' ? `Exactly ${rule.count} words` : rule?.type === 'starts_with_letter' ? `Starts with ${rule.letter}` : 'Not supplied — requires completion before review') : ''}${field('Requested date (not a confirmed schedule)',doji.liveDate)}${field('Learn more destination',doji.destination || 'No link')}</div><p class="formNotice">Nothing in this preview is sent to Doji or displayed to members. Approved and submitted records are read-only here.</p>`;
      if (doji.reviewFeedback) byId('businessDojiBody').insertAdjacentHTML('afterbegin', `<div class="formNotice"><strong>Review feedback</strong><p>${escapeHtml(doji.reviewFeedback)}</p></div>`);
      byId('editBusinessDoji').hidden = !editableDoji(doji);
      byId('editBusinessDoji').textContent = doji.reviewState === 'changes_requested' ? 'Revise Doji' : 'Edit draft';
      dojiDetail.showModal();
    }
    queryAll('[data-close-business-doji]').forEach(button=>button.addEventListener('click',()=>dojiDetail.close()));
    dojiDetail.addEventListener('close',()=>{
      if (!dojiModal.open) {
        openCampaignDetail(findCampaign(activeCampaignId));
        queryAll('[data-business-doji]',campaignDetailModal).find(button=>button.dataset.businessDoji===activeDojiId)?.focus();
      }
    });
    byId('editBusinessDoji').addEventListener('click',()=>{
      const doji=findCampaign(activeCampaignId)?.dojis?.find(item=>item.id===activeDojiId);
      if (editableDoji(doji)) openDojiModal(activeCampaignId,doji);
    });
    [campaignDetailModal,dojiDetail].forEach(dialog=>dialog.addEventListener('click',event=>{
      if(event.target!==dialog)return;
      const rect=dialog.getBoundingClientRect();
      if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)dialog.close();
    }));

    function openCampaignDetail(campaign) {
      if (!campaign || !campaignDetailModal) return;
      activeCampaignId = campaign.id;
      const dojis = campaign.dojis || [];
      const hasSubmitted = dojis.some((doji) => doji.status !== 'draft');
      const hasApproved = dojis.some((doji) => ['approved', 'completed'].includes(doji.status));
      const hasCompleted = dojis.some((doji) => doji.status === 'completed');
      const completions = dojis.reduce((sum, doji) => sum + (doji.results?.completions || 0), 0);
      byId('campaignDetailEyebrow').textContent = campaign.label;
      byId('campaignDetailTitle').textContent = campaign.name;
      byId('campaignDetailSubtitle').textContent = `${campaign.goal} · ${campaign.region} · ${formatDateRange(campaign)}`;
      const resultBlock = hasCompleted ? `<div class="detailBlock"><label>Campaign results to date</label><div class="detailGrid"><div class="detailTile"><span>Completed Dojis</span><strong>${dojis.filter((item) => item.status === 'completed').length}</strong></div><div class="detailTile"><span>Valid completions</span><strong>${completions.toLocaleString()}</strong></div></div></div>` : '';
      const dojiBlock = dojis.length ? `<div class="detailBlock"><div class="detailSectionHeader"><div><label>Sponsored Dojis</label><p>Each Doji has its own review and schedule.</p></div><button class="portalButton secondary" type="button" data-action="new-doji-inline"><span aria-hidden="true">+</span> Add Doji</button></div><div class="dojiList">${dojis.map(dojiMarkup).join('')}</div></div>` : `<div class="emptyState compact"><strong>No Dojis in this campaign</strong><p>Add the first sponsored Doji when you are ready.</p><button class="portalButton primary" type="button" data-action="new-doji-inline">Add first Doji</button></div>`;
      byId('campaignDetailBody').innerHTML = `<div class="detailGrid campaignSummaryGrid"><div class="detailTile"><span>Goal</span><strong>${escapeHtml(campaign.goal)}</strong></div><div class="detailTile"><span>Audience</span><strong>${escapeHtml(campaign.region)}</strong></div><div class="detailTile"><span>Campaign window</span><strong>${escapeHtml(formatDateRange(campaign))}</strong></div><div class="detailTile"><span>Sponsored Dojis</span><strong>${dojis.length}</strong></div></div><div class="detailBlock"><label>Campaign brief</label><p>${escapeHtml(campaign.summary)}</p></div>${dojiBlock}<div class="detailBlock"><label>Campaign lifecycle</label><div class="campaignTimeline">${lifecycleStep('Campaign created', true)}${lifecycleStep('First Doji submitted for review', hasSubmitted, !hasSubmitted)}${lifecycleStep('At least one Doji approved and scheduled', hasApproved, hasSubmitted && !hasApproved)}${lifecycleStep('Results available for completed Dojis', hasCompleted, hasApproved && !hasCompleted)}</div></div>${resultBlock}<div class="formNotice">A campaign groups the strategy and reporting. Every sponsored Doji is reviewed, approved, and scheduled independently by Doji.</div>`;
      queryAll('[data-action="new-doji-inline"]', byId('campaignDetailBody')).forEach((button) => button.addEventListener('click', () => openDojiModal(campaign.id)));
      queryAll('[data-business-doji]', byId('campaignDetailBody')).forEach(button => button.addEventListener('click', () => openDojiDetail(button.dataset.businessDoji)));
      campaignDetailModal.showModal();
    }

    function bindCampaignRows() {
      const campaigns = getCampaigns();
      queryAll('[data-campaign-id]').forEach((row) => {
        const campaign = campaigns.find((item) => item.id === row.dataset.campaignId);
        const open = () => openCampaignDetail(campaign);
        row.addEventListener('click', open);
        row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
      });
    }

    function renderCampaigns() {
      const campaigns = getCampaigns();
      const dojis = allDojis(campaigns);
      const emptyMarkup = '<div class="emptyState"><strong>No campaigns yet</strong><p>Create a campaign, then add its first sponsored Doji.</p><button class="portalButton primary" type="button" data-action="new-campaign">Create campaign</button></div>';
      byId('overviewCampaigns').innerHTML = campaigns.length ? campaigns.slice(0, 4).map(campaignMarkup).join('') : emptyMarkup;
      const filtered = activeFilter === 'all' ? campaigns : campaigns.filter((item) => item.status === activeFilter);
      byId('allCampaigns').innerHTML = filtered.length ? filtered.map(campaignMarkup).join('') : (campaigns.length ? '<div class="emptyState">No campaigns match this status.</div>' : emptyMarkup);
      byId('activeCampaignMetric').textContent = String(campaigns.filter((item) => item.status !== 'completed').length);
      byId('reviewMetric').textContent = String(dojis.filter((item) => item.status === 'review').length);
      byId('approvedMetric').textContent = String(dojis.filter((item) => item.status === 'approved').length);
      const completionCount = dojis.reduce((sum, item) => sum + (item.results?.completions || 0), 0);
      byId('completionMetric').textContent = completionCount >= 1000 ? `${(completionCount / 1000).toFixed(1)}k` : String(completionCount);
      byId('firstRunPanel').hidden = campaigns.length > 0;
      byId('workspaceMetrics').hidden = campaigns.length === 0;
      bindCampaignRows();
      queryAll('[data-action="new-campaign"]').forEach((button) => {
        if (button.dataset.boundCampaign === 'true') return;
        button.dataset.boundCampaign = 'true';
        button.addEventListener('click', () => campaignModal.showModal());
      });
      renderAnalyticsSelectors();
    }

    function setAuthTab(tab) {
      const isSignup = tab === 'signup';
      signinForm.hidden = isSignup;
      signupForm.hidden = !isSignup;
      authTitle.textContent = isSignup ? 'Preview company setup' : 'Explore the business portal';
      authDescription.textContent = isSignup ? 'Use example details. This creates only a local preview, not an account or application.' : 'Open the example business or resume your browser-only progress.';
      queryAll('[data-auth-tab]').forEach((button) => {
        const selected = button.dataset.authTab === tab;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', String(selected));
      });
    }

    function fillProfileForm(profile) {
      byId('companyName').value = profile.companyName || '';
      byId('companyLegalName').value = profile.legalName || '';
      byId('companyWebsite').value = profile.website || '';
      byId('companyDescription').value = profile.description || '';
      [['companyIndustry', profile.industry], ['companySize', profile.size], ['companyCountry', profile.country], ['companyGoal', profile.goal]].forEach(([id, value]) => {
        byId(id).value = value || '';
        byId(id).dispatchEvent(new Event('change', { bubbles: true }));
      });
      queryAll('[name="companyMarkets"]').forEach((input) => { input.checked = (profile.markets || []).includes(input.value); });
      const initial = (profile.companyName || 'C').trim().charAt(0).toUpperCase();
      uploadedLogoDataUrl = profile.logoDataUrl || '';
      byId('logoPreview').textContent = uploadedLogoDataUrl ? '' : initial;
      byId('logoPreview').style.backgroundImage = uploadedLogoDataUrl ? `url("${uploadedLogoDataUrl}")` : '';
    }

    function showOnboarding(profile = {}) {
      auth.hidden = true;
      app.hidden = true;
      onboarding.hidden = false;
      onboardingStep = 1;
      fillProfileForm(profile);
      renderOnboardingStep();
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    function readProfileForm() {
      const account = readStorage(accountKey, {});
      return { ownerName: account.ownerName || 'Owner', companyName: byId('companyName').value.trim(), legalName: byId('companyLegalName').value.trim(), website: byId('companyWebsite').value.trim(), description: byId('companyDescription').value.trim(), industry: byId('companyIndustry').value, size: byId('companySize').value, country: byId('companyCountry').value, goal: byId('companyGoal').value, markets: queryAll('[name="companyMarkets"]:checked').map((input) => input.value), logoDataUrl: uploadedLogoDataUrl };
    }

    function renderProfileReview() {
      const profile = readProfileForm();
      byId('profileReview').innerHTML = `<div class="profileReviewBrand"><div class="logoPreview small">${escapeHtml(profile.companyName.charAt(0).toUpperCase() || 'C')}</div><div><strong>${escapeHtml(profile.companyName)}</strong><span>${escapeHtml(profile.legalName)}</span></div></div><dl><div><dt>Website</dt><dd>${escapeHtml(profile.website)}</dd></div><div><dt>Industry</dt><dd>${escapeHtml(profile.industry)}</dd></div><div><dt>Headquarters</dt><dd>${escapeHtml(profile.country)}</dd></div><div><dt>Primary goal</dt><dd>${escapeHtml(profile.goal)}</dd></div><div><dt>Markets</dt><dd>${escapeHtml(profile.markets.join(', '))}</dd></div></dl><div class="profileDescription"><span>About the business</span><p>${escapeHtml(profile.description)}</p></div>`;
      const reviewLogo = query('.profileReviewBrand .logoPreview', byId('profileReview'));
      if (reviewLogo && profile.logoDataUrl) { reviewLogo.textContent = ''; reviewLogo.style.backgroundImage = `url("${profile.logoDataUrl}")`; }
    }

    function renderOnboardingStep() {
      queryAll('[data-onboarding-step]').forEach((section) => { section.hidden = Number(section.dataset.onboardingStep) !== onboardingStep; });
      queryAll('[data-onboarding-indicator]').forEach((item) => {
        const step = Number(item.dataset.onboardingIndicator);
        item.classList.toggle('active', step === onboardingStep);
        item.classList.toggle('complete', step < onboardingStep);
      });
      onboardingBack.hidden = onboardingStep === 1;
      onboardingNext.textContent = onboardingStep === 3 ? 'Finish setup' : 'Continue';
      if (onboardingStep === 3) renderProfileReview();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function validateOnboardingStep() {
      const section = query(`[data-onboarding-step="${onboardingStep}"]`);
      for (const input of queryAll('[required]', section)) {
        if (!input.checkValidity()) { input.reportValidity(); return false; }
      }
      if (onboardingStep === 2 && queryAll('[name="companyMarkets"]:checked').length === 0) {
        showToast('Choose at least one market you are interested in.');
        return false;
      }
      return true;
    }

    function applyWorkspaceProfile() {
      const profile = getProfile();
      queryAll('[data-company-name]').forEach((element) => { element.textContent = profile.companyName; });
      queryAll('[data-owner-name]').forEach((element) => { element.textContent = (profile.ownerName || 'Owner').split(' ')[0]; });
      if (byId('organizationDescription')) byId('organizationDescription').textContent = profile.description;
      if (byId('organizationMeta')) byId('organizationMeta').textContent = `${profile.industry} · ${profile.country} · ${(profile.markets || []).join(', ')}`;
      if (byId('verificationStatus')) {
        byId('verificationStatus').textContent = workspaceMode === 'sample' ? 'Verified demo' : 'Pending review';
        byId('verificationStatus').classList.toggle('approved', workspaceMode === 'sample');
      }
      const accountName = query('.portalAccount strong');
      if (accountName) accountName.textContent = profile.companyName;
      const workspaceLogo = byId('workspaceLogo');
      if (workspaceLogo) {
        workspaceLogo.textContent = profile.logoDataUrl ? '' : (profile.companyName || 'C').charAt(0).toUpperCase();
        workspaceLogo.style.backgroundImage = profile.logoDataUrl ? `url("${profile.logoDataUrl}")` : '';
      }
    }

    onboardingNext.addEventListener('click', () => {
      if (!validateOnboardingStep()) return;
      if (onboardingStep < 3) { onboardingStep += 1; renderOnboardingStep(); return; }
      const profile = readProfileForm();
      localStorage.setItem(profileKey, JSON.stringify(profile));
      workspaceMode = 'new';
      applyWorkspaceProfile();
      renderCampaigns();
      enterDemo();
      localStorage.removeItem(setupDraftKey);
      refreshResume();
      showToast('Company profile saved locally. No application was sent.');
    });
    onboardingBack.addEventListener('click', () => { onboardingStep -= 1; renderOnboardingStep(); });
    query('[data-action="back-to-auth"]')?.addEventListener('click', () => {
      try { localStorage.setItem(setupDraftKey, JSON.stringify({profile:readProfileForm(),step:onboardingStep})); }
      catch { feedback(byId('onboardingForm'),'This browser could not save your progress. Keep this page open and try a smaller logo.'); return; }
      onboarding.hidden = true; auth.hidden = false; refreshResume(); setAuthTab('signin');
      showToast('Setup saved in this browser. Use Resume local workspace to continue.');
    });
    function refreshResume() { resumeButton.hidden = !localStorage.getItem(setupDraftKey) && !localStorage.getItem(profileKey); }
    resumeButton.addEventListener('click', () => {
      const draft = readStorage(setupDraftKey, null);
      if (draft) { showOnboarding(draft.profile); onboardingStep = Math.min(3,Math.max(1,Number(draft.step)||1)); renderOnboardingStep(); }
      else { workspaceMode = 'new'; applyWorkspaceProfile(); renderCampaigns(); enterDemo(); }
    });
    refreshResume();
    setAuthTab('signin');
    byId('companyLogo').addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 1500000) { showToast('Choose a logo smaller than 1.5 MB for this browser prototype.'); event.target.value = ''; return; }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        uploadedLogoDataUrl = String(reader.result || '');
        byId('logoPreview').textContent = '';
        byId('logoPreview').style.backgroundImage = `url("${uploadedLogoDataUrl}")`;
      });
      reader.readAsDataURL(file);
    });

    queryAll('[data-auth-tab]').forEach((button) => button.addEventListener('click', () => setAuthTab(button.dataset.authTab)));
    const requestedView = new URLSearchParams(location.search).get('view');
    if (requestedView === 'apply' || requestedView === 'signup') setAuthTab('signup');

    signinForm.addEventListener('submit', (event) => {
      event.preventDefault();
      workspaceMode = 'sample';
      applyWorkspaceProfile();
      renderCampaigns();
      enterDemo();
    });
    signupForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const account = { ownerName: byId('accountName').value.trim(), email: byId('signupEmail').value.trim() };
      localStorage.setItem(accountKey, JSON.stringify(account));
      showOnboarding({ ownerName: account.ownerName, markets: ['United States'] });
    });

    queryAll('[data-campaign-filter]').forEach((button) => button.addEventListener('click', () => {
      activeFilter = button.dataset.campaignFilter;
      queryAll('[data-campaign-filter]').forEach((item) => item.classList.toggle('active', item === button));
      renderCampaigns();
    }));

    function pollOptionValues() {
      return queryAll('.pollOptionInput', byId('campaignOptionsList')).map((input) => input.value.trim());
    }

    function updatePollOptionBuilder() {
      const kind = byId('campaignFormat').value;
      byId('businessAnswerRule').hidden = kind !== 'format_question';
      const words = byId('businessAnswerType').value === 'exact_word_count';
      byId('businessWordCountField').hidden = !words;
      byId('businessLetterField').hidden = words;
      byId('businessWordCount').disabled = kind !== 'format_question' || !words;
      byId('businessStartingLetter').disabled = kind !== 'format_question' || words;
      byId('businessWordCount').required = kind === 'format_question' && words;
      byId('businessStartingLetter').required = kind === 'format_question' && !words;
      const needsOptions = kind === 'poll' || kind === 'wyr';
      byId('campaignOptionsField').hidden = !needsOptions;
      if (!needsOptions) return;
      while (queryAll('.pollOptionRow', byId('campaignOptionsList')).length < 2) addPollOption();
      const rows = queryAll('.pollOptionRow', byId('campaignOptionsList'));
      const isWyr = kind === 'wyr';
      while (isWyr && rows.length > 2) rows.pop()?.remove();
      const currentRows = queryAll('.pollOptionRow', byId('campaignOptionsList'));
      currentRows.forEach((row, index) => {
        row.querySelector('.optionNumber').textContent = String(index + 1);
        row.querySelector('input').setAttribute('aria-label', `Choice ${index + 1}`);
        row.querySelector('.removePollOption').hidden = isWyr || currentRows.length <= 2;
      });
      byId('automaticOtherOption').hidden = isWyr;
      byId('automaticOtherNumber').textContent = String(currentRows.length + 1);
      byId('addPollOption').hidden = isWyr || currentRows.length >= 4;
      byId('pollOptionCount').textContent = isWyr ? '2 required' : `${currentRows.length} of 4 custom choices`;
      byId('pollOptionsHelp').textContent = isWyr
        ? 'Would You Rather uses exactly 2 choices and does not include Other.'
        : 'Add 2–4 custom choices. Doji always adds Other as the final choice, for a maximum of 5 total.';
    }

    function addPollOption(value = '') {
      const list = byId('campaignOptionsList');
      if (queryAll('.pollOptionRow', list).length >= 4) return;
      const row = document.createElement('div');
      row.className = 'pollOptionRow';
      row.innerHTML = '<span class="optionNumber"></span><input class="pollOptionInput" maxlength="100" aria-label="Poll option" placeholder="Add an option"><button class="removePollOption" type="button" aria-label="Remove option"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15"/></svg></button>';
      row.querySelector('input').value = value;
      row.querySelector('.removePollOption').addEventListener('click', () => { row.remove(); updatePollOptionBuilder(); });
      list.appendChild(row);
      updatePollOptionBuilder();
      if (value === '' && dojiModal.open) row.querySelector('input').focus();
    }

    function dateLabel(rawDate) {
      return rawDate ? new Date(`${rawDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not proposed';
    }

    function readCampaign() {
      const name = byId('campaignName').value.trim();
      clearFeedback(campaignForm);
      if (!name) return feedback(campaignForm,'Add a campaign name first.',byId('campaignName'));
      if (!validateForm(campaignForm)) return null;
      const startRaw = byId('campaignStart').value;
      const endRaw = byId('campaignEnd').value;
      if (endRaw < startRaw) return feedback(campaignForm,'Campaign end must be on or after its start date.',byId('campaignEnd'));
      if (!byId('campaignSummary').value.trim()) return feedback(campaignForm,'Add a campaign brief.',byId('campaignSummary'));
      return { id: `LOCAL-CAM-${Date.now()}`, name, summary: byId('campaignSummary').value.trim(), goal: byId('campaignGoal').value, region: byId('campaignRegion').value, start: dateLabel(startRaw), end: dateLabel(endRaw), startRaw, endRaw, status: 'draft', label: 'Draft', dojis: [] };
    }

    function saveCampaign() {
      const campaign = readCampaign();
      if (!campaign) return;
      try { saveLocalCampaigns([campaign, ...getLocalCampaigns()]); }
      catch { feedback(campaignForm,'This browser could not save the campaign. Your form is still here; retry after freeing browser storage.'); return; }
      campaignForm.reset();
      ['campaignGoal', 'campaignRegion'].forEach((id) => byId(id).dispatchEvent(new Event('change', { bubbles: true })));
      campaignModal.close();
      renderCampaigns();
      setView('campaigns');
      showToast('Campaign created. Now add its first sponsored Doji.');
      openDojiModal(campaign.id);
    }

    function findCampaign(id) { return getCampaigns().find((campaign) => campaign.id === id); }

    function updateCampaign(campaign) {
      const local = getLocalCampaigns();
      const localIndex = local.findIndex((item) => item.id === campaign.id);
      if (localIndex >= 0) {
        local[localIndex] = campaign;
        saveLocalCampaigns(local);
        return;
      }
      saveLocalCampaigns([campaign, ...local]);
    }

    function openDojiModal(campaignId, existing = null) {
      const campaign = findCampaign(campaignId);
      if (!campaign) { showToast('Choose a campaign before adding a Doji.'); return; }
      activeCampaignId = campaign.id;
      editingDojiId = existing?.id || null;
      if (campaignDetailModal.open) campaignDetailModal.close();
      if (dojiDetail.open) dojiDetail.close();
      dojiForm.reset();
      clearFeedback(dojiForm);
      dojiForm.querySelector('h2').textContent = existing ? 'Edit sponsored Doji' : 'Create a Doji';
      byId('campaignFormat').value = existing?.formatValue || 'poll';
      byId('campaignFormat').dispatchEvent(new Event('change', { bubbles: true }));
      byId('campaignOptionsList').innerHTML = '';
      const choices = existing?.options ? (existing.formatValue==='poll' ? existing.options.slice(0,-1) : existing.options) : [];
      addPollOption('');
      while (queryAll('.pollOptionRow',byId('campaignOptionsList')).length < choices.length) addPollOption('');
      queryAll('.pollOptionInput',byId('campaignOptionsList')).forEach((input,index)=>{input.value=choices[index]||'';});
      if (existing) {
        byId('dojiName').value = existing.name;
        byId('campaignPrompt').value = existing.prompt === 'Prompt not added yet' ? '' : existing.prompt || '';
        byId('dojiLiveDate').value = existing.liveDateRaw || '';
        byId('campaignDestination').value = existing.destination || '';
        byId('businessAnswerType').value = existing.answer_rule?.type || 'exact_word_count';
        byId('businessWordCount').value = existing.answer_rule?.count || 2;
        byId('businessStartingLetter').value = existing.answer_rule?.letter || 'A';
      }
      window.DojiPortalSelect.refresh(byId('businessAnswerType'));
      updatePollOptionBuilder();
      byId('dojiCampaignContext').textContent = `Add a sponsored Doji to ${campaign.name}.`;
      const liveDate = byId('dojiLiveDate');
      liveDate.min = campaign.startRaw || '';
      liveDate.max = campaign.endRaw || '';
      dojiModal.classList.toggle('businessRecordDrawer', Boolean(existing));
      dojiModal.showModal();
    }

    function readDoji(status) {
      const campaign = findCampaign(activeCampaignId);
      if (!campaign) return null;
      const name = byId('dojiName').value.trim();
      clearFeedback(dojiForm);
      if (!name) return feedback(dojiForm,'Add an internal Doji name first.',byId('dojiName'));
      if (status === 'review' && !validateForm(dojiForm)) return null;
      if (status === 'review' && !byId('campaignPrompt').value.trim()) return feedback(dojiForm,'Add the participant prompt.',byId('campaignPrompt'));
      const formatValue = byId('campaignFormat').value;
      const options = pollOptionValues();
      if (status === 'review' && (formatValue === 'poll' || formatValue === 'wyr')) {
        if (options.some((option) => !option)) return feedback(dojiForm,'Complete every choice before submitting.',query('.pollOptionInput',byId('campaignOptionsList')));
        if (new Set(options.map(option=>option.toLowerCase())).size !== options.length || (formatValue === 'poll' && options.some(option=>option.toLowerCase()==='other'))) return feedback(dojiForm,'Choices must be distinct. For polls, Other is added automatically.');
        if (formatValue === 'poll' && (options.length < 2 || options.length > 4)) { showToast('Add 2–4 custom choices. Doji adds Other automatically.'); return null; }
        if (formatValue === 'wyr' && options.length !== 2) { showToast('Would You Rather requires exactly 2 choices.'); return null; }
      }
      const rawDate = byId('dojiLiveDate').value;
      if (rawDate && campaign.startRaw && rawDate < campaign.startRaw) { showToast('Requested live date must fall inside the campaign.'); return null; }
      if (rawDate && campaign.endRaw && rawDate > campaign.endRaw) { showToast('Requested live date must fall inside the campaign.'); return null; }
      const savedOptions = formatValue === 'poll' ? [...options, 'Other'] : formatValue === 'wyr' ? options : [];
      const destination = byId('campaignDestination').value.trim();
      if (destination) { try { if (new URL(destination).protocol !== 'https:') throw new Error(); } catch { return feedback(dojiForm,'Use a complete HTTPS Learn more link.',byId('campaignDestination')); } }
      const answer_rule = formatValue === 'format_question' ? byId('businessAnswerType').value === 'exact_word_count'
        ? {type:'exact_word_count',count:Number(byId('businessWordCount').value)} : {type:'starts_with_letter',letter:byId('businessStartingLetter').value.toUpperCase()} : null;
      return { id: editingDojiId || `LOCAL-DOJI-${crypto.randomUUID()}`, name, prompt: byId('campaignPrompt').value.trim(), format: byId('campaignFormat').selectedOptions[0]?.textContent || 'Doji', formatValue, options: savedOptions, answer_rule, liveDate: dateLabel(rawDate), liveDateRaw: rawDate, destination, status, label: status === 'review' ? 'In review' : 'Draft' };
    }

    function saveDoji(status) {
      const doji = readDoji(status);
      if (!doji) return;
      const campaign = findCampaign(activeCampaignId);
      const original = campaign.dojis?.find(item=>item.id===doji.id);
      if (editingDojiId && !editableDoji(original)) return feedback(dojiForm,'This record is no longer editable. Close and reopen the campaign.');
      doji.revision = (original?.revision || 0) + (status === 'review' ? 1 : 0);
      doji.previousSubmissions = [...(original?.previousSubmissions || [])];
      if (original?.reviewState === 'changes_requested') {
        const {previousSubmissions, ...priorVersion} = original;
        doji.previousSubmissions.push({...priorVersion,revision:original.revision || 1});
        doji.revision = Math.max(2,doji.revision);
      }
      campaign.dojis = [doji, ...(campaign.dojis || []).filter(item=>item.id !== doji.id)];
      if (status === 'review' && campaign.status === 'draft') { campaign.status = 'review'; campaign.label = 'In progress'; }
      try { updateCampaign(campaign); }
      catch { feedback(dojiForm,'This browser could not save the Doji. Your form is still here; retry after freeing browser storage.'); return; }
      dojiModal.close();
      renderCampaigns();
      setView('campaigns');
      openCampaignDetail(findCampaign(campaign.id));
      showToast(status === 'review' ? 'Review request simulated locally. Nothing was sent or published.' : 'Doji draft saved in this browser.');
    }

    function completedCampaigns() { return getCampaigns().filter((campaign) => (campaign.dojis || []).some((doji) => doji.results)); }

    function renderAnalyticsSelectors() {
      const campaignSelect = byId('analyticsCampaign');
      const dojiSelect = byId('analyticsDoji');
      if (!campaignSelect || !dojiSelect) return;
      const campaigns = completedCampaigns();
      const previousCampaign = campaignSelect.value;
      campaignSelect.innerHTML = campaigns.length ? campaigns.map((campaign) => `<option value="${escapeHtml(campaign.id)}">${escapeHtml(campaign.name)}</option>`).join('') : '<option value="">No completed campaigns</option>';
      campaignSelect.value = campaigns.some((campaign) => campaign.id === previousCampaign) ? previousCampaign : (campaigns[0]?.id || '');
      const selected = campaigns.find((campaign) => campaign.id === campaignSelect.value);
      const completed = (selected?.dojis || []).filter((doji) => doji.results);
      const previousDoji = dojiSelect.value;
      dojiSelect.innerHTML = `<option value="all">All completed Dojis</option>${completed.map((doji) => `<option value="${escapeHtml(doji.id)}">${escapeHtml(doji.name)}</option>`).join('')}`;
      dojiSelect.value = completed.some((doji) => doji.id === previousDoji) ? previousDoji : 'all';
      campaignSelect.dispatchEvent(new Event('change', { bubbles: false }));
      dojiSelect.dispatchEvent(new Event('change', { bubbles: false }));
      renderResults();
    }

    function renderDojiSelector() {
      const campaign = findCampaign(byId('analyticsCampaign').value);
      const dojiSelect = byId('analyticsDoji');
      const completed = (campaign?.dojis || []).filter((doji) => doji.results);
      dojiSelect.innerHTML = `<option value="all">All completed Dojis</option>${completed.map((doji) => `<option value="${escapeHtml(doji.id)}">${escapeHtml(doji.name)}</option>`).join('')}`;
      dojiSelect.value = 'all';
      dojiSelect.dispatchEvent(new Event('change', { bubbles: false }));
      renderResults();
    }

    function renderResults() {
      const campaign = findCampaign(byId('analyticsCampaign').value);
      const selectedId = byId('analyticsDoji').value;
      const completed = (campaign?.dojis || []).filter((doji) => doji.results);
      const selected = selectedId === 'all' ? completed : completed.filter((doji) => doji.id === selectedId);
      const totals = selected.reduce((sum, doji) => ({ eligible: sum.eligible + doji.results.eligible, opens: sum.opens + doji.results.opens, completions: sum.completions + doji.results.completions, reactions: sum.reactions + doji.results.reactions, comments: sum.comments + doji.results.comments }), { eligible: 0, opens: 0, completions: 0, reactions: 0, comments: 0 });
      const rate = totals.opens ? `${((totals.completions / totals.opens) * 100).toFixed(1)}%` : '—';
      const hasResults = selected.length > 0;
      byId('resultsMetrics').hidden = !hasResults;
      query('.analyticsGrid').hidden = !hasResults;
      byId('analyticsSampleBanner').querySelector('strong').textContent = hasResults ? 'Example report' : 'No results yet';
      byId('analyticsSampleBanner').querySelector('span').textContent = hasResults ? 'Sample figures only—not measured campaign delivery.' : 'Results appear after an approved Doji completes. No delivery or participation has been measured for this workspace.';
      byId('analyticsCampaign').disabled = !completedCampaigns().length;
      byId('analyticsDoji').disabled = !hasResults;
      window.DojiPortalSelect.refresh(byId('analyticsCampaign')); window.DojiPortalSelect.refresh(byId('analyticsDoji'));
      const metricValues = [totals.eligible.toLocaleString(), totals.opens.toLocaleString(), totals.completions.toLocaleString(), rate];
      queryAll('.metricCard strong', byId('resultsMetrics')).forEach((element, index) => { element.textContent = metricValues[index]; });
      const outcomeValues = queryAll('.funnelList strong', query('[data-portal-view="analytics"]'));
      [totals.completions.toLocaleString(), totals.reactions.toLocaleString(), totals.comments.toLocaleString(), totals.completions ? '0.08%' : '—'].forEach((value, index) => { if (outcomeValues[index]) outcomeValues[index].textContent = value; });
      const pollPanel = byId('pollResultsPanel');
      const selectedPoll = selected.length === 1 && selected[0].formatValue === 'poll' ? selected[0] : null;
      if (pollPanel) {
        pollPanel.hidden = !selectedPoll;
        if (selectedPoll) {
          const shares = [34, 27, 21, 14, 4];
          byId('pollResultsList').innerHTML = selectedPoll.options.map((option, index) => `<div><span>${escapeHtml(option)}</span><strong>${shares[index] || 0}%</strong><i style="--bar:${shares[index] || 0}%"></i></div>`).join('');
        }
      }
    }

    byId('campaignFormat').addEventListener('change', updatePollOptionBuilder);
    byId('businessAnswerType').addEventListener('change', updatePollOptionBuilder);
    byId('addPollOption').addEventListener('click', () => addPollOption());
    addPollOption('');
    updatePollOptionBuilder();
    queryAll('[data-action="close-campaign"]').forEach((button) => button.addEventListener('click', () => campaignModal.close()));
    queryAll('[data-action="close-doji"]').forEach((button) => button.addEventListener('click', () => dojiModal.close()));
    dojiModal.addEventListener('close',()=>{
      closePortalSelects();
      if (!campaignDetailModal.open && !dojiDetail.open) openCampaignDetail(findCampaign(activeCampaignId));
    });
    query('[data-action="save-doji-draft"]', dojiModal)?.addEventListener('click', () => saveDoji('draft'));
    campaignForm.addEventListener('submit', (event) => { event.preventDefault(); saveCampaign(); });
    dojiForm.addEventListener('submit', (event) => { event.preventDefault(); saveDoji('review'); });
    byId('analyticsCampaign').addEventListener('change', renderDojiSelector);
    byId('analyticsDoji').addEventListener('change', renderResults);
    query('[data-action="new-doji"]')?.addEventListener('click', () => openDojiModal(activeCampaignId));
    queryAll('[data-action="close-campaign-detail"]').forEach((button) => button.addEventListener('click', () => campaignDetailModal.close()));
    query('[data-action="edit-profile"]')?.addEventListener('click', () => showOnboarding(getProfile()));
    query('[data-action="reset-business-demo"]')?.addEventListener('click', () => {
      if (!window.confirm('Reset the browser-only business prototype and onboarding progress?')) return;
      [profileKey, accountKey, campaignKey, sampleDraftKey, setupDraftKey].forEach((key) => localStorage.removeItem(key));
      refreshResume();
      workspaceMode = 'sample';
      exitDemo();
      setAuthTab('signup');
      showToast('Prototype reset. You can test onboarding again.');
    });
    applyWorkspaceProfile();
    renderCampaigns();
  }

  function setupAdminPortal() {
    const adminConfig = window.DOJI_PORTAL_CONFIG || {};
    const liveMode = adminConfig.mode === 'live'
      && Boolean(adminConfig.supabaseUrl && adminConfig.supabaseAnonKey && adminConfig.apiBaseUrl);
    let liveClient = null;
    if (liveMode) {
      try { liveClient = window.DojiAdminPortalClient.create({ ...adminConfig, onAccessInvalidated: (message) => expireLiveSession(message) }); }
      catch (error) { console.error(error); }
    }
    const adminSigninForm = byId('adminSigninForm');
    const employeeMode = liveMode && adminConfig.employeeAccountsEnabled === true;
    const independentEmployeeMode = liveMode && adminConfig.independentEmployeeIdentity === true;
    const employeeRegisterForm = byId('employeeRegisterForm');
    const employeeRegisterToggle = byId('employeeRegisterToggle');
    const adminMfaChallengeForm = byId('adminMfaChallengeForm');
    const adminMfaSetup = byId('adminMfaSetup');
    const adminTotpEnrollment = byId('adminTotpEnrollment');
    const adminTotpVerifyForm = byId('adminTotpVerifyForm');
    const drawer = byId('caseDrawer');
    const drawerBackdrop = byId('drawerBackdrop');
    const drawerContent = byId('drawerContent');
    const drawerActions = byId('drawerActions');
    const announcementModal = byId('announcementModal');
    const announcementForm = byId('announcementForm');
    const globalSearchModal = byId('globalSearchModal');
    byId('auditDetailModal').classList.add('portalDrawer', 'adminDrawer', 'open');
    byId('auditDetailModal').setAttribute('aria-labelledby', 'auditDetailTitle');
    globalSearchModal.setAttribute('aria-label', 'Search loaded work');
    byId('globalSearchInput').setAttribute('aria-label', 'Search loaded work');
    const adminStateKey = 'doji-admin-prototype-state-v1';
    const businessProfileKey = 'doji-business-prototype-profile-v3';
    const businessCampaignKeys = ['doji-business-prototype-company-campaigns-v3', 'doji-business-prototype-sample-campaigns-v3'];
    let currentOperator = 'Demo operator';
    let liveSession = null;
    let liveSnapshot = null;
    let liveWork = [];
    let liveAppeals = [];
    let liveResolvedReports = [];
    let liveAudit = [];
    let livePlatformHealth = null;
    let livePlatformHealthHistory = null;
    let liveOperators = [];
    let liveDataErrors = {};
    let liveLastUpdatedAt = null;
    let resolvedArchiveCursor = null;
    let resolvedArchiveLoading = false;
    let auditCursor = null;
    let auditLoading = false;
    let auditFilter = 'activity';
    let auditSearchTerm = '';
    let auditSearchTimer = null;
    let liveRefreshTimer = null;
    let sessionExpiryTimer = null;
    let lastActivityPersistedAt = 0;
    let workspaceEpoch = 0;
    let activePages = {};
    let queueWindows = {};
    const queuePageSize = 25;
    let queueSearchTimer = null;
    let refreshTask = null;
    let refreshAgain = false;
    let activeItem = null;
    let activeCaseDetail = null;
    let activeAppealDetail = null;
    let caseLoadRevision = 0;
    let caseLoadError = '';
    let evidenceExpiryTimer = null;
    let activeDrawerTab = 'details';
    let pendingModerationAction = null;
    let moderationSubmitting = false;
    let moderationIntent = null;
    let triageSubmitting = false;
    let triageIntent = null;
    let operatorSubmitting = false;
    let operatorIntent = null;
    let auditDetailRevision = 0;
    let auditExporting = false;
    let savedCommandNotice = '';
    const queueFilters = { inbox: 'all', moderation: 'all', safety: 'all', campaigns: 'all', suggestions: 'all' };
    const queueSearch = { inbox: '', moderation: '', safety: '', campaigns: '', suggestions: '' };
    const editorial = liveMode && employeeMode && adminConfig.editorialEnabled === true
      ? window.DojiAdminEditorial.create({ client: liveClient, session: () => liveSession,
        epoch: () => workspaceEpoch, onSaved: () => scheduleLiveRefresh(), campaignsEnabled: adminConfig.campaignsEnabled === true,
        enhanceControls: (root) => queryAll('select', root).forEach((select) => enhancePortalSelect(select, true)) }) : null;
    const safetyModules = liveMode && employeeMode && adminConfig.safetyRemovalEnabled === true
      ? ['safety','moderation'].map(view => window.DojiSafetyRemoval.create({view,client: liveClient, session: () => liveSession, epoch: () => workspaceEpoch,
        openReport: detail => openDrawer(mapLiveWork({id: detail.id, queue: detail.triage_state?.queue === 'restricted_safety' ? 'safety' : 'moderation', subject: detail.subject || 'Content report', secondary: detail.specific_concern || 'External removal request', category: detail.category || 'Report', submitted_at: detail.created_at, deadline_at: detail.triage_state?.deadline_at, status: detail.status, label: titleCase(detail.status), priority: detail.triage_state?.priority || 'normal', summary: 'Review the exact linked content and moderation history.', visibility: contentStateLabel(detail), source: 'External removal request', history: []})),
        enhanceControls: root => queryAll('select', root).forEach(select => enhancePortalSelect(select, true))})) : [];
    const safetyRemoval = {reconcile: () => safetyModules.forEach(module => module.reconcile()), clear: () => safetyModules.forEach(module => module.clear())};
    const businessReviewEnabled = liveMode && employeeMode && adminConfig.businessApplicationsEnabled === true;
    let businessReview = null;
    let businessPrivacy = null;
    const businessPrivacyReady = liveMode && employeeMode && adminConfig.businessPrivacyEnabled === true
      ? import('/admin-portal/business-privacy.js').then(({ createBusinessPrivacy }) => {
        const root = document.createElement('section');
        root.id = 'businessPrivacy';
        byId('businessAdminGrid').after(root);
        businessPrivacy = createBusinessPrivacy({ root, client: liveClient,
          session: () => liveSession, epoch: () => workspaceEpoch });
        return businessPrivacy;
      }).catch(() => null) : Promise.resolve(null);
    const businessReviewReady = businessReviewEnabled
      ? import('/admin-portal/business-applications.js').then(({ createBusinessReview }) => {
        businessReview = createBusinessReview({ enabled: true, root: byId('businessAdminGrid'),
          client: { page: input => liveClient.businessPage(input), detail: id => liveClient.businessItem(id), command: input => liveClient.businessCommand(input) },
          session: () => liveSession, epoch: () => workspaceEpoch, onSaved: () => scheduleLiveRefresh() });
        return businessReview;
      }).catch(() => { byId('businessAdminGrid').textContent = 'Business review could not be loaded. Refresh the page to try again.'; return null; })
      : Promise.resolve(null);
    function reconcileBusinessReview() {
      const privacyEpoch = workspaceEpoch;
      void businessPrivacyReady.then(module => {
        if (privacyEpoch !== workspaceEpoch || !liveSession) return;
        const visible = !query('[data-portal-view="businesses"]').hidden;
        if (visible || module?.isOpen()) void module?.reconcile();
      });
      if (!businessReviewEnabled) return;
      const stamp = workspaceEpoch;
      void businessReviewReady.then(module => {
        if (stamp !== workspaceEpoch || !liveSession?.capabilities?.business_read) return;
        const visible = !query('[data-portal-view="businesses"]').hidden;
        if (visible || module?.isOpen()) void module?.reconcile();
      });
    }

    const seedWork = [
      { id: 'SAFE-208', queue: 'safety', subject: 'TAKE IT DOWN request', secondary: 'Nonconsensual intimate image', category: 'Nonconsensual intimate image', submitted: '31h remaining', deadline: '17h remaining', status: 'urgent', label: 'Urgent', priority: 'critical', summary: 'An external requester submitted a removal request that requires restricted review and a documented deadline response.', visibility: 'Quarantined', owner: 'Demo operator', source: 'Public Safety Center', nextStep: 'Validate the request, preserve only authorized evidence, and record the disposition before the statutory deadline.', history: ['Request received from public intake', 'Public access disabled automatically', 'Restricted operator notified'] },
      { id: 'SAFE-207', queue: 'safety', subject: 'Profile-photo appeal', secondary: 'Appeal of removal decision', category: 'Appeal', submitted: '19h ago', deadline: '5h to internal target', status: 'appeal', label: 'Appeal', priority: 'high', summary: 'A member contests the removal of a profile photo and the associated account warning.', visibility: 'Removed', owner: 'Unassigned', source: 'In-app appeal', nextStep: 'Assign an independent reviewer and confirm whether the original enforcement should stand.', history: ['Appeal submitted', 'Prior case linked', 'Awaiting independent reviewer'] },
      { id: 'MOD-1042', queue: 'moderation', subject: 'Photo post report', secondary: 'Harassment', category: 'Harassment', submitted: '3h 18m ago', deadline: '20h 42m to target', status: 'open', label: 'Open', priority: 'normal', summary: 'The reporter says the caption targets another member. The report is hidden only for the reporter while review is pending.', visibility: 'Hidden for reporter', owner: 'Unassigned', source: 'In-app report', nextStep: 'Review context and prior enforcement history, then restore or remove with a policy reason.', history: ['Report received', 'Reporter-only hide applied'] },
      { id: 'MOD-1041', queue: 'moderation', subject: 'Profile photo report', secondary: 'Explicit sexual content', category: 'Sexual content', submitted: '2h 44m ago', deadline: '21h 16m to target', status: 'urgent', label: 'High risk', priority: 'high', summary: 'An image-based safety report triggered conservative replacement with the default avatar pending review.', visibility: 'Default avatar shown', owner: 'Demo operator', source: 'In-app report', nextStep: 'Confirm categorization, determine account action, and prevent access to removed media if upheld.', history: ['Report received', 'Profile photo replaced pending review', 'Case assigned to Demo operator'] },
      { id: 'MOD-1038', queue: 'moderation', subject: 'Comment report', secondary: 'Spam or scam', category: 'Spam / scam', submitted: '52m ago', deadline: '23h 08m to target', status: 'open', label: 'Open', priority: 'normal', summary: 'Repeated commercial links were reported in one conversation.', visibility: 'Public pending review', owner: 'Unassigned', source: 'In-app report', nextStep: 'Check duplication and account history before deciding whether to remove or warn.', history: ['Report received'] },
      { id: 'SUG-223', queue: 'suggestions', subject: 'Photo something that matches your mood', secondary: 'Photo idea', category: 'Photo idea', submitted: 'Today', deadline: 'Editorial queue', status: 'open', label: 'Pending', priority: 'normal', summary: 'Community-submitted photo prompt for editorial consideration.', visibility: 'Not published', owner: 'Unassigned', source: 'User suggestion', nextStep: 'Review originality, safety, clarity, and participation potential.', history: ['Suggestion submitted'] },
      { id: 'SUG-222', queue: 'suggestions', subject: 'Would you rather relive one day or skip one year?', secondary: 'Would You Rather', category: 'Would You Rather', submitted: 'Today', deadline: 'Editorial queue', status: 'open', label: 'Pending', priority: 'normal', summary: 'Community-submitted Would You Rather prompt with two response options.', visibility: 'Not published', owner: 'Unassigned', source: 'User suggestion', nextStep: 'Review option balance, clarity, duplication, and safety.', history: ['Suggestion submitted'] },
      { id: 'SUG-220', queue: 'suggestions', subject: 'Pick the soundtrack to your morning', secondary: 'Poll', category: 'Poll', submitted: 'Yesterday', deadline: 'Planning pool', status: 'approved', label: 'Accepted', priority: 'low', summary: 'Approved suggestion waiting for normal challenge planning.', visibility: 'Approved idea', owner: 'S. Young', source: 'User suggestion', nextStep: 'No operator action required.', history: ['Suggestion submitted', 'Accepted by S. Young'] },
      { id: 'BIZ-041', queue: 'businesses', subject: 'Lumen Coffee', secondary: 'Business verification', category: 'Business verification', submitted: '4h ago', deadline: '2 business days', status: 'open', label: 'Verification', priority: 'normal', summary: 'New business workspace submitted organization, representative, domain, and brand information.', visibility: 'Business workspace only', owner: 'Unassigned', source: 'Business onboarding', nextStep: 'Verify the representative, domain, legal organization, and approved brand assets.', history: ['Business application submitted'] },
      { id: 'DOJI-102-A', queue: 'campaigns', subject: 'Trail mood poll', secondary: 'Northstar · Trail personalities', category: 'Poll', submitted: 'Oct 12 requested', deadline: 'Review before schedule', status: 'revision', label: 'Changes requested', priority: 'normal', summary: 'The sponsored poll needs claim support and clearer option wording before it can be scheduled.', visibility: 'Business workspace only', owner: 'Demo operator', source: 'Business portal', nextStep: 'Wait for the business to submit a revised immutable version.', history: ['Submitted for review', 'Changes requested: claim support missing'] },
      { id: 'DOJI-101-A', queue: 'campaigns', subject: 'Game-day ritual', secondary: 'Stadium Co. · Fall kickoff', category: 'Poll', submitted: 'Oct 18 requested', deadline: '5 days to requested date', status: 'open', label: 'In review', priority: 'high', summary: 'Review disclosure, destination, poll choices, regional eligibility, and schedule availability.', visibility: 'Business workspace only', owner: 'Unassigned', source: 'Business portal', nextStep: 'Complete commercial and product review, then approve or request changes.', history: ['Submitted for review'] },
      { id: 'DOJI-099-A', queue: 'campaigns', subject: 'Before eight', secondary: 'Northstar · Morning movement', category: 'Photo idea', submitted: 'Oct 6 scheduled', deadline: 'Approved', status: 'approved', label: 'Scheduled', priority: 'low', summary: 'Approved immutable version scheduled through the server-owned challenge plan.', visibility: 'Approved, not active', owner: 'Demo operator', source: 'Business portal', nextStep: 'No operator action required.', history: ['Submitted for review', 'Approved by Demo operator', 'Scheduled for Oct 6'] },
    ];
    const seedBusinesses = [
      { id: 'BIZ-012', name: 'Northstar', legalName: 'Northstar Outdoor Co.', domain: 'northstar.example', industry: 'Sports and wellness', region: 'United States & Canada', status: 'approved', label: 'Verified', campaigns: 3, owner: 'Alex Morgan' },
      { id: 'BIZ-027', name: 'Stadium Co.', legalName: 'Stadium Company LLC', domain: 'stadium.example', industry: 'Entertainment', region: 'United States', status: 'approved', label: 'Verified', campaigns: 1, owner: 'Jamie Chen' },
      { id: 'BIZ-041', name: 'Lumen Coffee', legalName: 'Lumen Coffee Roasters Inc.', domain: 'lumencoffee.example', industry: 'Food and beverage', region: 'United States', status: 'open', label: 'Pending review', campaigns: 0, owner: 'Priya Shah' },
    ];
    const seedAnnouncements = [
      { id: 'ANN-014', title: 'Submit your own Doji', type: 'Participation campaign', audience: 'All eligible users', frequency: 'Once per user', window: 'Sep 22–28', status: 'approved', label: 'Active' },
      { id: 'ANN-013', title: 'What’s new in 1.0.7', type: 'Product announcement', audience: 'Release cohort', frequency: 'Once per release', window: 'Sep 23–30', status: 'open', label: 'Scheduled' },
      { id: 'ANN-012', title: 'Service notice', type: 'Service notice', audience: 'All eligible users', frequency: 'Once per user', window: 'Not scheduled', status: 'revision', label: 'Draft' },
    ];
    const seedAudit = [
      { id: 'AUD-9005', type: 'decision', actor: 'Demo operator', action: 'Requested sponsored Doji changes', entity: 'DOJI-102-A · Trail mood poll', detail: 'Claim support missing', time: 'Today · 10:42 AM' },
      { id: 'AUD-9004', type: 'decision', actor: 'Demo operator', action: 'Quarantined reported media', entity: 'MOD-1041 · Profile photo', detail: 'High-risk image review', time: 'Today · 9:18 AM' },
      { id: 'AUD-9003', type: 'access', actor: 'J. Doji', action: 'Opened restricted case metadata', entity: 'SAFE-208', detail: 'Purpose: removal request review', time: 'Today · 8:56 AM' },
      { id: 'AUD-9002', type: 'system', actor: 'System', action: 'Registered next daily Doji alarm', entity: 'Event 2026-09-23', detail: 'Pre-live, activation, and close armed', time: 'Today · 7:35 AM' },
      { id: 'AUD-9001', type: 'decision', actor: 'S. Young', action: 'Accepted community suggestion', entity: 'SUG-220', detail: 'Moved to editorial planning pool', time: 'Yesterday · 4:12 PM' },
    ];

    function setSigninStatus(message, tone = '') {
      const status = byId('adminSigninStatus');
      if (!status) return;
      status.textContent = message || '';
      status.dataset.tone = tone;
    }

    function initials(value) {
      return String(value || 'DO').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'DO';
    }

    function formatRelative(value) {
      const timestamp = Date.parse(value || '');
      if (!Number.isFinite(timestamp)) return 'Recently';
      const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      return `${Math.floor(hours / 24)}d ago`;
    }

    function formatTimestamp(value, fallback = 'Not available') {
      const timestamp = Date.parse(value || '');
      if (!Number.isFinite(timestamp)) return fallback;
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(timestamp));
    }

    function formatDeadline(value, fallback = 'Editorial queue') {
      const timestamp = Date.parse(value || '');
      if (!Number.isFinite(timestamp)) return fallback;
      const remaining = timestamp - Date.now();
      const minutes = Math.ceil(remaining / 60000);
      if (remaining <= 0) {
        const late = Math.max(1, Math.floor(-remaining / 60000));
        return `Overdue by ${late < 60 ? `${late}m` : `${Math.floor(late / 60)}h ${late % 60}m`}`;
      }
      if (minutes < 60) return `${minutes}m to target`;
      if (minutes < 1440) return `${Math.ceil(minutes / 60)}h to target`;
      return `${Math.ceil(minutes / 1440)}d to target`;
    }

    function mapLiveWork(item) {
      if (item.appeal) return { ...mapLiveAppeal(item.appeal), deadlineAt: item.deadline_at || null, deadline: formatDeadline(item.deadline_at, 'Independent review required') };
      return {
        id: item.id,
        queue: item.queue,
        subject: item.subject,
        secondary: item.secondary,
        category: item.category,
        submitted: formatRelative(item.submitted_at),
        deadline: formatDeadline(item.deadline_at),
        deadlineAt: item.deadline_at || null,
        submittedAt: item.submitted_at || null,
        severity: item.severity || null,
        status: item.status,
        label: item.label,
        priority: item.priority,
        summary: item.summary,
        visibility: item.visibility,
        owner: item.owner,
        source: item.source,
        nextStep: item.next_step,
        history: Array.isArray(item.history) ? item.history : [],
        assignedTo: item.assigned_to || null,
        options: Array.isArray(item.options) ? item.options : [],
        destination: item.destination || '',
        submittedBy: item.submitted_by || null,
      };
    }

    function mapAuditEvent(item) {
      const actor = item.actor || null;
      return {
        id: item.id,
        type: item.category || (item.actor ? 'decision' : 'system'),
        actor: actor ? identityLabel(actor, actorRoleLabel(item.actor_role) || 'Authorized operator') : actorRoleLabel(item.actor_role) || 'System',
        actorRole: item.actor_role || '',
        action: auditActionLabel(item.action),
        actionCode: item.action,
        entity: `${item.entity_type} · ${item.entity_id}`,
        entityType: item.entity_type,
        entityId: item.entity_id,
        detail: item.reason || 'No rationale was recorded for this event.',
        reason: item.reason || '',
        requestId: item.request_id || '',
        metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : {},
        occurredAt: item.occurred_at,
        time: formatRelative(item.occurred_at),
        timestamp: formatTimestamp(item.occurred_at),
      };
    }

    function mapResolvedReport(item) {
      return {
        ...mapLiveWork(item),
        submitted: `Resolved ${formatRelative(item.resolved_at)}`,
        deadline: formatTimestamp(item.resolved_at),
        resolvedAt: item.resolved_at,
        decisionId: item.decision_id || null,
        decisionAction: item.decision_action || null,
        policyCode: item.policy_code || null,
        severity: item.severity || null,
        accountAction: item.account_action || null,
        appealStatus: item.appeal_status || null,
      };
    }

    function mapLiveAppeal(appeal) {
      const person = appeal.user || {};
      const name = person.display_name || person.username || 'Member';
      return {
        id: appeal.id,
        queue: 'safety',
        subject: `${name} appealed a moderation decision`,
        secondary: `${appeal.content_kind || 'content'} · ${String(appeal.policy_code || 'policy review').replaceAll('_', ' ')}`,
        category: 'Appeal',
        submitted: formatRelative(appeal.submitted_at),
        deadline: 'Independent review required',
        status: 'appeal',
        label: 'Appeal',
        priority: appeal.severity === 'level_3' ? 'critical' : 'high',
        summary: appeal.statement,
        visibility: 'Original decision remains active',
        owner: 'Unassigned',
        source: 'In-app appeal',
        nextStep: 'A reviewer other than the original decision-maker must independently uphold or reverse the decision.',
        history: [{ action: 'appeal.submitted', occurred_at: appeal.submitted_at }],
        appeal,
      };
    }

    function applyLiveIdentity() {
      const name = liveSession?.display_name || liveSession?.username || 'Doji operator';
      const roles = Array.isArray(liveSession?.roles) ? liveSession.roles : [];
      currentOperator = name;
      byId('operatorName').textContent = name;
      byId('operatorAvatar').textContent = initials(name);
      byId('operatorRole').textContent = roles.length
        ? roles.map((role) => String(role).replaceAll('_', ' ')).join(' · ')
        : 'Authorized operator';
      const canModerate = liveSession?.capabilities?.moderation_write === true;
      const canReviewRestricted = liveSession?.capabilities?.restricted_review === true;
      byId('operatorSession').innerHTML = `<i></i> ${canReviewRestricted ? 'Restricted review enabled' : canModerate ? 'Moderation enabled' : 'Read only'}`;
      const operatorAccessNav = byId('operatorAccessNav');
      if (operatorAccessNav) operatorAccessNav.hidden = liveSession?.capabilities?.operator_manage !== true;
      const caps = liveSession?.capabilities || {};
      const visibility = { overview: caps.operations_read, operations: caps.operations_read,
        audit: caps.operations_read, announcements: caps.operations_read, suggestions: caps.operations_read,
        moderation: caps.moderation_read, safety: caps.moderation_read,
        campaigns: caps.business_read, businesses: caps.business_read, inbox: true, access: caps.operator_manage };
      queryAll('.portalNav [data-view]').forEach((button) => { button.hidden = visibility[button.dataset.view] !== true; });
    }

    function renderDataHealthBanner() {
      const banner = byId('portalDataBanner');
      if (!banner || !liveMode) return;
      const labels = {
        appeals: 'appeals',
        resolved: 'resolved cases',
        audit: 'audit activity',
        platform: 'platform health',
        history: 'Doji health history',
        operators: 'operator access',
      };
      const failed = Object.keys(liveDataErrors);
      banner.hidden = failed.length === 0 && !savedCommandNotice;
      if (savedCommandNotice) {
        banner.dataset.tone = 'warning';
        banner.textContent = savedCommandNotice;
        return;
      }
      if (!failed.length) {
        banner.textContent = '';
        banner.removeAttribute('data-tone');
        return;
      }
      banner.dataset.tone = 'warning';
      const names = failed.map((key) => labels[key] || key).join(', ');
      const updated = liveLastUpdatedAt ? ` Last complete core refresh: ${formatTimestamp(liveLastUpdatedAt)}.` : '';
      banner.innerHTML = `<strong>Some production data could not be refreshed.</strong><span>${escapeHtml(names)} may be stale or unavailable.${escapeHtml(updated)} No missing result is being shown as zero.</span>`;
    }

    function settledValue(results, index, key, fallback) {
      const result = results[index];
      if (result?.status === 'fulfilled') {
        delete liveDataErrors[key];
        return result.value;
      }
      liveDataErrors[key] = result?.reason instanceof Error ? result.reason.message : 'Unavailable';
      return fallback;
    }

    function refreshLiveData() {
      if (refreshTask) { refreshAgain = true; return refreshTask; }
      refreshTask = performLiveRefresh().finally(() => {
        refreshTask = null;
        if (refreshAgain && liveSession && liveClient.hasSession()) { refreshAgain = false; scheduleLiveRefresh(); }
      });
      return refreshTask;
    }

    async function performLiveRefresh() {
      const epoch = workspaceEpoch;
      if (!liveClient) throw new Error('The live admin portal is not configured.');
      const verifiedSession = await liveClient.session();
      if (epoch !== workspaceEpoch || !liveClient.hasSession()) return;
      liveSession = verifiedSession;
      const canManageOperators = liveSession?.capabilities?.operator_manage === true;
      const canOperate = liveSession?.capabilities?.operations_read === true;
      const canModerate = liveSession?.capabilities?.moderation_read === true;
      const commandCenter = canOperate ? await liveClient.commandCenter(50) : { metrics: {}, work_items: [] };
      const results = await Promise.allSettled([
        Promise.resolve([]), // Appeals are paginated with active work, not truncated at 50.
        canModerate ? liveClient.resolvedReports(25) : Promise.resolve({ items: [] }),
        canOperate ? liveClient.auditEvents(50, null, { category: auditFilter, search: auditSearchTerm }) : Promise.resolve({ items: [] }),
        canOperate ? liveClient.platformHealth() : Promise.resolve(null),
        canOperate ? liveClient.platformHealthHistory(12) : Promise.resolve(null),
        canManageOperators ? liveClient.operators() : Promise.resolve([]),
      ]);
      if (epoch !== workspaceEpoch || !liveClient.hasSession()) return;
      liveSnapshot = commandCenter;
      const appealsPage = settledValue(results, 0, 'appeals', liveAppeals);
      const resolvedPage = settledValue(results, 1, 'resolved', null);
      const auditPage = settledValue(results, 2, 'audit', null);
      livePlatformHealth = settledValue(results, 3, 'platform', livePlatformHealth);
      livePlatformHealthHistory = settledValue(results, 4, 'history', livePlatformHealthHistory);
      liveOperators = settledValue(results, 5, 'operators', liveOperators);
      liveWork = Array.isArray(liveSnapshot?.work_items)
        ? liveSnapshot.work_items.map(mapLiveWork)
        : [];
      liveAppeals = Array.isArray(appealsPage)
        ? appealsPage.map((item) => item?.queue === 'safety' ? item : mapLiveAppeal(item))
        : liveAppeals;
      liveResolvedReports = resolvedPage && Array.isArray(resolvedPage?.items)
        ? resolvedPage.items.map(mapResolvedReport)
        : liveResolvedReports;
      if (resolvedPage) resolvedArchiveCursor = resolvedPage?.next_cursor || null;
      liveAudit = auditPage && Array.isArray(auditPage?.items) ? auditPage.items.map(mapAuditEvent) : liveAudit;
      if (auditPage) auditCursor = auditPage?.next_cursor || null;
      liveLastUpdatedAt = new Date().toISOString();
      applyLiveIdentity();
      activePages = {}; queueWindows = {}; // Do not retain resolved/changed work in another queue's cached page.
      const visible = query('[data-portal-view]:not([hidden])')?.dataset.portalView;
      await loadActiveQueue(['inbox','moderation','safety',...(!editorial?['suggestions']:[])].includes(visible) ? visible : 'inbox');
      if (epoch !== workspaceEpoch || !liveClient.hasSession()) return;
      renderAll();
      savedCommandNotice = '';
      renderDataHealthBanner();
      editorial?.reconcile();
      safetyRemoval?.reconcile();
      reconcileBusinessReview();
      if (activeItem && ['moderation', 'safety'].includes(activeItem.queue) && !moderationSubmitting && !triageSubmitting) {
        await loadLiveReportCase(activeItem.id, { preserveDraft: true });
      }
    }

    async function loadMoreResolvedReports() {
      if (!liveClient || !resolvedArchiveCursor || resolvedArchiveLoading) return;
      const button = byId('loadMoreResolved');
      resolvedArchiveLoading = true;
      renderQueue('moderation'); renderQueue('safety');
      if (button) {
        button.disabled = true;
        button.textContent = 'Loading…';
      }
      try {
        const page = await liveClient.resolvedReports(25, resolvedArchiveCursor);
        const existing = new Set(liveResolvedReports.map((item) => item.id));
        for (const item of Array.isArray(page?.items) ? page.items.map(mapResolvedReport) : []) {
          if (!existing.has(item.id)) {
            liveResolvedReports.push(item);
            existing.add(item.id);
          }
        }
        resolvedArchiveCursor = page?.next_cursor || null;
        renderQueue('moderation');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Resolved cases could not be loaded.';
        for (const type of ['moderation', 'safety']) if (queueWindows[type]) queueWindows[type].error = message;
      } finally {
        resolvedArchiveLoading = false;
        if (button) {
          button.disabled = false;
          button.textContent = 'Load more resolved';
        }
      }
    }

    async function loadMoreAuditEvents() {
      if (!liveClient || !auditCursor || auditLoading) return;
      const button = byId('loadMoreAudit');
      auditLoading = true;
      renderAudit();
      if (button) {
        button.disabled = true;
        button.textContent = 'Loading…';
      }
      try {
        const page = await liveClient.auditEvents(50, auditCursor, { category: auditFilter, search: auditSearchTerm });
        const existing = new Set(liveAudit.map((item) => item.id));
        for (const item of Array.isArray(page?.items) ? page.items.map(mapAuditEvent) : []) {
          if (!existing.has(item.id)) {
            liveAudit.push(item);
            existing.add(item.id);
          }
        }
        auditCursor = page?.next_cursor || null;
        renderAudit();
      } catch (error) {
        if (queueWindows.audit) queueWindows.audit.error = error instanceof Error ? error.message : 'Older audit events could not be loaded.';
      } finally {
        auditLoading = false;
        if (button) {
          button.disabled = false;
          button.textContent = 'Load older events';
        }
      }
    }

    async function reloadAudit() {
      queueWindows.audit = { offset: 0, back: [] };
      if (!liveMode || !liveClient) {
        renderAudit(auditFilter, auditSearchTerm);
        return;
      }
      auditLoading = true;
      liveDataErrors = { ...liveDataErrors };
      try {
        const page = await liveClient.auditEvents(50, null, { category: auditFilter, search: auditSearchTerm });
        liveAudit = Array.isArray(page?.items) ? page.items.map(mapAuditEvent) : [];
        auditCursor = page?.next_cursor || null;
        delete liveDataErrors.audit;
      } catch (error) {
        liveDataErrors.audit = error instanceof Error ? error.message : 'Unavailable';
        showToast(error instanceof Error ? error.message : 'Audit activity could not be refreshed.');
      } finally {
        auditLoading = false;
        renderAudit();
        renderDataHealthBanner();
      }
    }

    function scheduleLiveRefresh() {
      if (liveRefreshTimer) return;
      liveRefreshTimer = setTimeout(() => {
        liveRefreshTimer = null;
        refreshLiveData().catch((error) => {
          if (!liveSession || !liveClient.hasSession()) return;
          console.error('[admin-portal] realtime reconciliation failed', error);
          byId('operatorSession').innerHTML = '<i></i> Live data · reconnecting';
        });
      }, 250 + Math.floor(Math.random() * 250));
    }

    async function startLiveRealtime() {
      if (!liveClient?.startRealtime) return;
      try {
        await liveClient.startRealtime(scheduleLiveRefresh, (state) => {
          if (!liveSession) return;
          const label = state === 'connected'
            ? 'Live updates connected'
            : `Live updates: ${state}`;
          byId('operatorSession').innerHTML = `<i></i> ${escapeHtml(label)}`;
        });
      } catch (error) {
        liveClient.stopRealtime?.();
        console.error('[admin-portal] realtime startup failed', error);
        byId('operatorSession').innerHTML = '<i></i> Live updates unavailable';
      }
    }

    function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
    function readAdminState() { return readStorage(adminStateKey, { overrides: {}, announcements: [], audit: [] }); }
    function saveAdminState(state) { localStorage.setItem(adminStateKey, JSON.stringify(state)); }
    function queueLabel(queue) { return ({ moderation: 'Trust & safety', safety: 'Restricted safety', campaigns: 'Sponsored Dojis', businesses: 'Businesses', suggestions: 'Community ideas' })[queue] || queue; }
    function statusClass(status) { return status === 'approved' || status === 'resolved' ? 'approved' : status === 'urgent' ? 'urgent' : status === 'revision' || status === 'appeal' ? 'revision' : ''; }
    function priorityClass(priority) { return priority === 'critical' ? 'critical' : priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'normal'; }
    function applyOverrides(item) { return { ...item, ...(readAdminState().overrides[item.id] || {}) }; }

    function localBusinessCampaignItems() {
      const profile = readStorage(businessProfileKey, null);
      const businessName = profile?.companyName || 'Local business';
      const items = [];
      businessCampaignKeys.forEach((key) => {
        readStorage(key, []).forEach((campaign) => {
          (campaign.dojis || []).forEach((doji) => {
            if (seedWork.some((item) => item.id === doji.id)) return;
            const status = doji.status === 'approved' || doji.status === 'completed' ? 'approved' : doji.label === 'Changes requested' ? 'revision' : doji.status === 'review' ? 'open' : 'draft';
            items.push({ id: doji.id, queue: 'campaigns', subject: doji.name, secondary: `${businessName} · ${campaign.name}`, category: doji.format, submitted: doji.liveDate || 'Date not requested', deadline: 'Review before schedule', status, label: doji.label || (status === 'open' ? 'In review' : 'Draft'), priority: status === 'open' ? 'normal' : 'low', summary: doji.prompt || 'Sponsored Doji submitted from the local business portal.', visibility: 'Business workspace only', owner: 'Unassigned', source: 'Local business portal', nextStep: status === 'open' ? 'Review the immutable version and record an approval or requested change.' : 'No operator action is required for this state.', options: doji.options || [], destination: doji.destination || '', history: ['Created in local business portal', ...(status === 'open' ? ['Submitted for review'] : [])], businessStorageKey: key, campaignId: campaign.id });
          });
        });
      });
      return items;
    }

    function allWork() {
      if (liveMode) return [...new Map([...liveAppeals, ...liveWork, ...liveResolvedReports,
        ...Object.values(activePages).flatMap((page) => page.items || [])].map((item) => [item.id, item])).values()];
      const localIds = new Set(localBusinessCampaignItems().map((item) => item.id));
      return [...seedWork.filter((item) => !localIds.has(item.id)), ...localBusinessCampaignItems()].map(applyOverrides);
    }
    function getItem(id) { return allWork().find((item) => item.id === id); }
    function itemsFor(queue) { return allWork().filter((item) => item.queue === queue); }

    function queueMatches(item, filter, searchTerm) {
      const term = searchTerm.trim().toLowerCase();
      const text = [item.id, item.subject, item.secondary, item.category, item.owner, item.label].join(' ').toLowerCase();
      if (term && !text.includes(term)) return false;
      if (filter === 'all') return true;
      if (filter === 'unassigned') return item.owner === 'Unassigned';
      if (filter === 'mine') return item.owner === currentOperator;
      return item.status === filter;
    }

    function rowAttributes(item) { return `tabindex="0" class="severity-${priorityClass(item.priority)}" data-work-id="${escapeHtml(item.id)}"`; }
    function caseLabel(item) {
      const concern = item.secondary && item.secondary !== item.subject ? item.secondary : item.category;
      return [item.subject, concern].filter(Boolean).join(' · ');
    }

    function caseReference(item) { return `Case ${String(item.id).slice(0, 8).toUpperCase()}`; }

    function deadlineMarkup(item) {
      const state = window.DojiPortalHealth.reviewDeadline(item).state;
      const overdue = ['overdue', 'critical'].includes(state);
      const severe = state === 'critical';
      return `<span title="${escapeHtml(item.deadlineAt ? `Review target: ${formatTimestamp(item.deadlineAt)}` : item.deadline)}" class="reviewDeadline ${overdue ? severe ? 'breached-critical' : 'breached' : ''}">${overdue ? `<strong>${severe ? 'Urgent review overdue' : 'Review target missed'}</strong><span>${escapeHtml(formatDeadline(item.deadlineAt))}</span>` : escapeHtml(item.deadlineAt && item.status !== 'resolved' ? formatDeadline(item.deadlineAt) : item.deadline)}</span>`;
    }

    function visibleQueueRows(type, items) {
      const window = queueWindows[type] ||= { offset: 0, back: [] };
      if (window.offset >= items.length && items.length) { window.offset = 0; window.back = []; }
      return items.slice(window.offset, window.offset + queuePageSize);
    }

    function renderQueuePager(type, panel, items, hasMore, loadMore, render, busy = false, error = '') {
      if (!panel) return;
      const window = queueWindows[type] ||= { offset: 0, back: [] };
      error ||= window.error || '';
      let footer = panel.querySelector('.workspacePager');
      if (!footer) { footer = document.createElement('div'); footer.className = 'tableFooter workspacePager'; panel.append(footer); }
      footer.dataset.activePaging = type;
      footer.innerHTML = `<span role="status">${error ? escapeHtml(error) : busy ? 'Loading…' : items.length ? `Page ${window.back.length + 1} · ${window.offset + 1}–${Math.min(items.length, window.offset + queuePageSize)} shown` : 'No results'}</span><div><button type="button" class="portalButton compact" data-page="previous" ${busy || !window.back.length ? 'disabled' : ''}>Previous</button><button type="button" class="portalButton compact" data-page="next" ${busy || (!error && !hasMore && window.offset + queuePageSize >= items.length) ? 'disabled' : ''}>${error ? 'Retry' : 'Next'}</button></div>`;
      footer.querySelector('[data-page="previous"]').onclick = () => { window.offset = window.back.pop() || 0; render(); panel.querySelector('.tableWrap, .auditList')?.scrollTo(0, 0); };
      footer.querySelector('[data-page="next"]').onclick = async () => {
        const oldOffset = window.offset;
        if (oldOffset + queuePageSize < items.length) { window.back.push(oldOffset); window.offset += queuePageSize; render(); }
        else if (hasMore || error) {
          const boundary = items.length;
          window.error = '';
          footer.querySelector('[data-page="next"]').disabled = true;
          await loadMore();
          // Failed reads keep the same page; never advance into an empty/error page.
          const updated = type === 'audit' ? groupedAuditRows(audits()) : queueFilters[type] === 'resolved' ? itemsFor(type).filter((x) => x.status === 'resolved') : activePages[type]?.items || [];
          if (queueWindows[type] !== window) return;
          if (updated.length > boundary) { window.back.push(oldOffset); window.offset = boundary; }
          render();
        }
        panel.querySelector('.tableWrap, .auditList')?.scrollTo(0, 0);
      };
    }
    function tableMarkup(type, item) {
      const status = `<span class="statusPill ${statusClass(item.status)}">${escapeHtml(item.label)}</span>`;
      const owner = `<span class="ownerCell">${escapeHtml(item.owner)}</span>`;
      if (type === 'inbox') return `<tr ${rowAttributes(item)}><td><span class="priorityBadge ${priorityClass(item.priority)}">${escapeHtml(item.priority)}</span></td><td><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.secondary)} · ${escapeHtml(caseReference(item))}</small></td><td>${escapeHtml(queueLabel(item.queue))}</td><td class="mutedCell">${escapeHtml(item.submitted)}</td><td>${owner}</td><td>${status}</td></tr>`;
      if (type === 'moderation') return `<tr ${rowAttributes(item)}><td class="subject"><span class="caseCell"><strong>${escapeHtml(caseLabel(item))}</strong><small title="${escapeHtml(item.id)}">${escapeHtml(caseReference(item))}</small><span class="priorityBadge ${priorityClass(item.priority)}">${escapeHtml(item.priority)}</span><span class="mobileReviewDeadline">${deadlineMarkup(item)}</span></span></td><td><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.source)}</small></td><td class="mutedCell">${escapeHtml(item.category)}</td><td>${escapeHtml(item.visibility)}</td><td><strong>${escapeHtml(item.submitted)}</strong>${deadlineMarkup(item)}</td><td>${status}</td></tr>`;
      if (type === 'safety') return `<tr ${rowAttributes(item)}><td class="subject"><span class="caseCell"><strong>${escapeHtml(caseLabel(item))}</strong><small title="${escapeHtml(item.id)}">${escapeHtml(caseReference(item))}</small><span class="priorityBadge ${priorityClass(item.priority)}">${escapeHtml(item.priority)}</span><span class="mobileReviewDeadline">${deadlineMarkup(item)}</span></span></td><td><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.category)}</small></td><td>${escapeHtml(item.visibility)}</td><td class="deadline">${deadlineMarkup(item)}</td><td>${owner}</td><td>${status}</td></tr>`;
      if (type === 'suggestions') return `<tr ${rowAttributes(item)}><td class="subject"><span class="caseCell"><strong>${escapeHtml(caseLabel(item))}</strong><small title="${escapeHtml(item.id)}">${escapeHtml(caseReference(item))}</small><span class="priorityBadge ${priorityClass(item.priority)}">${escapeHtml(item.priority)}</span></span></td><td><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.summary)}</small></td><td>${escapeHtml(item.category)}</td><td class="mutedCell">${escapeHtml(item.submitted)}</td><td>${owner}</td><td>${status}</td></tr>`;
      return `<tr ${rowAttributes(item)}><td><span class="caseCell"><strong>${escapeHtml(item.subject)}</strong><span class="priorityBadge ${priorityClass(item.priority)}">${escapeHtml(item.priority)}</span><small>${escapeHtml(item.id)}</small></span></td><td><strong>${escapeHtml(item.secondary)}</strong><small>${escapeHtml(item.source)}</small></td><td>${escapeHtml(item.category)}</td><td class="mutedCell">${escapeHtml(item.submitted)}</td><td>${owner}</td><td>${status}</td></tr>`;
    }

    function bindWorkRows(root = document) {
      queryAll('[data-work-id]', root).forEach((row) => {
        if (row.dataset.bound === 'true') return;
        row.dataset.bound = 'true';
        const open = () => openDrawer(getItem(row.dataset.workId));
        row.addEventListener('click', open);
        row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
      });
    }

    function renderQueue(type) {
      const body = query(`[data-queue-body="${type}"]`);
      if (!body) return;
      let items = type === 'inbox'
        ? allWork().filter((item) => item.status !== 'resolved')
        : itemsFor(type);
      if (type === 'inbox') {
        const typeFilter = byId('inboxTypeFilter')?.value || 'all';
        if (typeFilter !== 'all') items = items.filter((item) => item.queue === typeFilter);
      }
      items = items.filter((item) => queueMatches(item, queueFilters[type], queueSearch[type]));
      const page = activePages[type];
      const usesPage = liveMode && ['inbox','moderation','safety','suggestions'].includes(type) && queueFilters[type] !== 'resolved';
      if (usesPage) items = page?.items || [];
      const weight = { critical: 0, high: 1, normal: 2, low: 3 };
      if (!usesPage) items.sort((a, b) => {
        const stateDelta = (a.status === 'resolved' ? 1 : 0) - (b.status === 'resolved' ? 1 : 0);
        if (stateDelta !== 0) return stateDelta;
        if (a.status === 'resolved' && b.status === 'resolved') {
          return new Date(b.resolvedAt || 0).getTime() - new Date(a.resolvedAt || 0).getTime();
        }
        return (weight[a.priority] ?? 4) - (weight[b.priority] ?? 4);
      });
      body.innerHTML = items.length ? visibleQueueRows(type, items).map((item) => tableMarkup(type, item)).join('') : `<tr class="emptyTableRow"><td colspan="6">No work matches these filters.</td></tr>`;
      if (usesPage && (page?.loading || page?.error || !liveSession?.capabilities?.moderation_read && !liveSession?.capabilities?.operations_read)) {
        body.innerHTML = `<tr class="emptyTableRow"><td colspan="6">${escapeHtml(page?.loading ? 'Loading authorized work…' : page?.error || 'Your role can sign in, but does not grant moderation or editorial queue access. A super admin can assign the additional role if needed.')}</td></tr>`;
      }
      visibleQueueRows(type, items);
      renderQueuePager(type, body.closest('.queuePanel'), items,
        usesPage ? Boolean(page?.cursor) : Boolean(resolvedArchiveCursor && queueFilters[type] === 'resolved'),
        usesPage ? () => loadActiveQueue(type, true) : loadMoreResolvedReports,
        () => renderQueue(type), usesPage ? page?.loading : resolvedArchiveLoading, usesPage ? page?.error : '');
      if (type === 'inbox') byId('queueResultCount').textContent = `${items.length} ${items.length === 1 ? 'work item' : 'work items'}`;
      if (type === 'moderation') {
        const count = byId('moderationResultCount');
        if (count) count.textContent = `${items.length} ${items.length === 1 ? 'case' : 'cases'}`;
        const loadMore = byId('loadMoreResolved');
        if (loadMore) loadMore.hidden = queueFilters.moderation !== 'resolved' || !resolvedArchiveCursor;
      }
      bindWorkRows(body);
    }

    async function loadActiveQueue(type, more = false) {
      if (!liveMode || !liveSession || !['inbox','moderation','safety','suggestions'].includes(type)) return;
      if (queueFilters[type] === 'resolved') { renderQueue(type); return; }
      const filter = queueFilters[type];
      if (!['all','open','urgent','unassigned','mine','appeal'].includes(filter)) {
        activePages[type] = { items: [], error: 'This view is not available in the active queue. Only pending work is paginated here.' }; renderQueue(type); return;
      }
      const epoch = workspaceEpoch;
      if (!more) queueWindows[type] = { offset: 0, back: [] };
      const previous = activePages[type];
      const state = { items: more ? previous?.items || [] : [], cursor: more ? previous?.cursor : null, loading: true };
      activePages[type] = state;
      renderQueue(type);
      try {
        const page = await liveClient.workQueue({ queue: type === 'inbox' ? byId('inboxTypeFilter').value : type,
          filter, search: queueSearch[type] }, state.cursor);
        if (epoch !== workspaceEpoch || activePages[type] !== state) return;
        state.items = [...new Map([...state.items, ...(page?.items || []).map((item) => item.appeal ? { ...mapLiveAppeal(item.appeal), deadlineAt: item.deadline_at || null, deadline: formatDeadline(item.deadline_at, 'Independent review required') } : mapLiveWork(item))].map((item) => [item.id,item])).values()];
        state.cursor = page?.next_cursor || null;
      } catch (error) {
        if (epoch !== workspaceEpoch || activePages[type] !== state) return;
        state.error = error instanceof Error ? error.message : 'Active work unavailable';
      } finally {
        if (epoch === workspaceEpoch && activePages[type] === state) { state.loading = false; renderQueue(type); renderMetrics(); }
      }
    }

    function queueChanged(type, delayed = false) {
      if (!liveMode) { renderQueue(type); return; }
      if (queueSearchTimer) clearTimeout(queueSearchTimer);
      if (delayed) queueSearchTimer = setTimeout(() => { void loadActiveQueue(type); }, 300);
      else void loadActiveQueue(type);
    }

    function renderPriority() {
      const items = allWork().filter((item) => !['approved', 'resolved', 'draft'].includes(item.status)).sort((a, b) => (({ critical: 0, high: 1, normal: 2, low: 3 }[a.priority] ?? 4) - ({ critical: 0, high: 1, normal: 2, low: 3 }[b.priority] ?? 4)) || ((Date.parse(a.deadlineAt) || Infinity) - (Date.parse(b.deadlineAt) || Infinity))).slice(0, 5);
      byId('priorityQueue').innerHTML = items.map((item) => `<button class="priorityRow" type="button" data-work-id="${escapeHtml(item.id)}"><span class="priorityMark ${priorityClass(item.priority)}"></span><span class="priorityCopy"><strong>${escapeHtml(caseLabel(item))}</strong><small>${escapeHtml(queueLabel(item.queue))} · ${escapeHtml(item.submitted)} · ${escapeHtml(caseReference(item))}</small></span><span class="priorityDue">${deadlineMarkup(item)}<small>Owner: ${escapeHtml(item.owner)}</small></span><span class="rowChevron">›</span></button>`).join('');
      bindWorkRows(byId('priorityQueue'));
    }

    function setLegalUrgentAlert(count) {
      const alert = byId('legalUrgentAlert');
      if (!alert) return;
      const urgentCount = Math.max(0, Number(count) || 0);
      const hasUrgentItems = urgentCount > 0;
      alert.hidden = !hasUrgentItems;
      if (hasUrgentItems) {
        const label = `${urgentCount} urgent restricted-safety ${urgentCount === 1 ? 'item' : 'items'}`;
        alert.setAttribute('aria-label', label);
        alert.setAttribute('title', label);
      } else {
        alert.removeAttribute('aria-label');
        alert.removeAttribute('title');
      }
    }

    function renderMetrics() {
      if (liveMode && liveSnapshot) {
        const metrics = liveSnapshot.metrics || {};
        const urgentCount = Math.max(0, Number(metrics.urgent_deadlines) || 0);
        const restrictedSafetyCount = Object.prototype.hasOwnProperty.call(metrics, 'restricted_safety_open')
          ? Math.max(0, Number(metrics.restricted_safety_open) || 0)
          : liveWork.filter((item) => item.queue === 'safety' && !['approved', 'resolved'].includes(item.status)).length;
        byId('urgentMetric').textContent = String(urgentCount);
        byId('urgentMetric').parentElement.querySelector('small').textContent = 'Reports due within 4 hours or already overdue';
        setLegalUrgentAlert(restrictedSafetyCount);
        byId('unassignedMetric').textContent = String(metrics.unassigned_work || 0);
        byId('campaignMetric').textContent = String(restrictedSafetyCount);
        byId('inboxNavCount').textContent = String(liveWork.length);
        byId('moderationOpenCount').textContent = String(metrics.open_reports || 0);
        byId('moderationHighCount').textContent = String(liveWork.filter((item) => item.queue === 'moderation' && ['high', 'critical'].includes(item.priority)).length);
        byId('moderationUnassignedCount').textContent = String(liveWork.filter((item) => item.queue === 'moderation' && item.owner === 'Unassigned').length);
        byId('safetyOpenCount').textContent = String(liveWork.filter((item) => item.queue === 'safety').length + liveAppeals.length);
        byId('safetyCriticalCount').textContent = String([...liveWork.filter((item) => item.queue === 'safety'), ...liveAppeals].filter((item) => item.priority === 'critical').length);
        byId('safetyUnassignedCount').textContent = String([...liveWork.filter((item) => item.queue === 'safety'), ...liveAppeals].filter((item) => item.owner === 'Unassigned').length);
        // Active pages and dashboard summaries are bounded, not queue totals.
        const inboxPage = activePages.inbox;
        byId('inboxNavCount').textContent = inboxPage?.loading || inboxPage?.error ? '…' : `${inboxPage?.items?.length || 0}${inboxPage?.cursor ? '+' : ''}`;
        for (const type of ['moderation','safety']) {
          const page = activePages[type];
          const items = page?.items || [];
          const stats = type === 'moderation'
            ? [['moderationOpenCount',items.length,' loaded matches'],['moderationHighCount',items.filter((x)=>['high','critical'].includes(x.priority)).length,' high priority loaded'],['moderationUnassignedCount',items.filter((x)=>x.owner==='Unassigned').length,' unassigned loaded']]
            : [['safetyOpenCount',items.length,' loaded matches'],['safetyCriticalCount',items.filter((x)=>x.priority==='critical').length,' critical loaded'],['safetyUnassignedCount',items.filter((x)=>x.owner==='Unassigned').length,' unassigned loaded']];
          for (const [id,count,label] of stats) {
            const element = byId(id); element.textContent = page && !page.loading && !page.error ? String(count) : '—';
            element.parentNode.lastChild.textContent = label;
          }
        }
        byId('sponsoredReviewCount').textContent = '—';
        ['sponsoredChangesCount', 'sponsoredScheduledCount', 'sponsoredConflictCount'].forEach((id) => {
          const element = byId(id);
          if (element) element.textContent = '—';
        });
        const healthStatus = platformHealthStatus();
        byId('platformStatusMetric').textContent = healthStatus.label;
        byId('platformStatusText').textContent = healthStatus.summary;
        const overviewPulse = byId('overviewPlatformPulse');
        if (overviewPulse) {
          overviewPulse.innerHTML = `<span></span>${escapeHtml(healthStatus.title)}`;
          overviewPulse.dataset.tone = healthStatus.state === 'healthy' ? 'healthy' : 'attention';
        }
        const health = Array.isArray(liveSnapshot.queue_health) ? liveSnapshot.queue_health : [];
        byId('queueHealth').innerHTML = health.length
          ? health.map((item) => {
            const key = item.key || ({ 'Trust & safety': 'moderation', 'Restricted safety': 'safety', 'Community ideas': 'suggestions' }[item.label]);
            const total = typeof item.count === 'number' && Number.isInteger(item.count) && item.count >= 0 ? item.count : null;
            // The legacy moderation aggregate includes both routine and restricted reports.
            // Classify only the existing bounded snapshot; never fetch an unbounded queue.
            const items = liveWork.filter((work) => key === 'moderation' ? ['moderation','safety'].includes(work.queue) : work.queue === key);
            const summary = ['moderation','safety'].includes(key)
              ? window.DojiPortalHealth.reviewQueue(items, total)
              : { state: 'empty', note: key === 'suggestions' ? total === 0 ? 'No open ideas' : 'Editorial review · No timed target' : item.note };
            return `<div data-queue-health="${escapeHtml(key || 'other')}" data-tone="${summary.state}"><span><i aria-hidden="true" class="serviceDot"></i><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(summary.note)}</small></span><strong aria-label="${total ?? 'Unknown'} open items">${total ?? '—'}</strong></div>`;
          }).join('')
          : '<div class="emptyState">No active production queues.</div>';
        const event = liveSnapshot.next_event;
        byId('todaysSchedule').innerHTML = event
          ? `<div><time>${new Date(event.fires_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time><span><strong>${escapeHtml(event.title || 'Daily Doji')}</strong><small>10-minute window</small></span><span class="statusPill approved">${event.activated_at ? 'Active or complete' : event.prelive_at ? 'Pre-live' : 'Prepared'}</span></div>`
          : '<div class="emptyState">No current or upcoming Doji is registered.</div>';
        return;
      }
      const work = allWork();
      const active = work.filter((item) => !['approved', 'resolved', 'draft'].includes(item.status));
      const urgentCount = active.filter((item) => item.queue === 'safety').length;
      byId('urgentMetric').textContent = String(urgentCount);
      setLegalUrgentAlert(urgentCount);
      byId('unassignedMetric').textContent = String(active.filter((item) => item.owner === 'Unassigned').length);
      byId('campaignMetric').textContent = String(itemsFor('campaigns').filter((item) => item.status === 'open').length);
      byId('inboxNavCount').textContent = String(active.length);
      byId('moderationOpenCount').textContent = String(itemsFor('moderation').filter((item) => !['approved', 'resolved'].includes(item.status)).length);
      byId('moderationHighCount').textContent = String(itemsFor('moderation').filter((item) => ['high', 'critical'].includes(item.priority) && !['approved', 'resolved'].includes(item.status)).length);
      byId('moderationUnassignedCount').textContent = String(itemsFor('moderation').filter((item) => item.owner === 'Unassigned' && !['approved', 'resolved'].includes(item.status)).length);
      byId('safetyOpenCount').textContent = String(itemsFor('safety').filter((item) => !['approved', 'resolved'].includes(item.status)).length);
      byId('safetyCriticalCount').textContent = String(itemsFor('safety').filter((item) => item.priority === 'critical' && !['approved', 'resolved'].includes(item.status)).length);
      byId('safetyUnassignedCount').textContent = String(itemsFor('safety').filter((item) => item.owner === 'Unassigned' && !['approved', 'resolved'].includes(item.status)).length);
      byId('sponsoredReviewCount').textContent = String(itemsFor('campaigns').filter((item) => item.status === 'open').length);
      const health = [
        { label: 'Legal & urgent safety', count: itemsFor('safety').filter((item) => !['resolved', 'approved'].includes(item.status)).length, note: '1 deadline inside 24 hours', tone: 'urgent' },
        { label: 'Trust & safety', count: itemsFor('moderation').filter((item) => !['resolved', 'approved'].includes(item.status)).length, note: 'All inside internal target', tone: 'healthy' },
        { label: 'Sponsored review', count: itemsFor('campaigns').filter((item) => item.status === 'open').length, note: 'No schedule conflict', tone: 'healthy' },
        { label: 'Business verification', count: itemsFor('businesses').filter((item) => item.status === 'open').length, note: 'Oldest 4 hours', tone: 'healthy' },
      ];
      byId('queueHealth').innerHTML = health.map((item) => `<div><span><i class="serviceDot ${item.tone}"></i><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.note)}</small></span><strong>${item.count}</strong></div>`).join('');
    }

    function platformHealthStatus() {
      return window.DojiPortalHealth.evaluate({
        operational: livePlatformHealth?.operational || {},
        sentry: livePlatformHealth?.sentry || {},
        history: livePlatformHealthHistory?.items || [],
        failed: Boolean(liveDataErrors.platform),
        historyFailed: Boolean(liveDataErrors.history),
        generatedAt: livePlatformHealth?.generated_at,
      });
    }

    function renderOperations() {
      if (!liveMode || !liveSnapshot) return;
      const operational = livePlatformHealth?.operational || {};
      const sentry = livePlatformHealth?.sentry || { configured: false, available: false, issues: [] };
      const issues = Array.isArray(sentry.issues) ? sentry.issues : [];
      const eventHistory = Array.isArray(livePlatformHealthHistory?.items)
        ? livePlatformHealthHistory.items
        : [];
      const healthStatus = platformHealthStatus();
      const operationalUnavailable = healthStatus.stale;
      const historyUnavailable = Boolean(liveDataErrors.history);
      const policies = Array.isArray(liveSnapshot.release_policies)
        ? liveSnapshot.release_policies
        : [];
      const releases = policies.length
        ? policies.map((policy) => `<div><span><strong>${escapeHtml(String(policy.platform || '').toUpperCase())}</strong><small>Minimum ${escapeHtml(policy.minimum_version)} (${Number(policy.minimum_build || 0)})</small></span><strong>${escapeHtml(policy.latest_version)} (${Number(policy.latest_build || 0)})</strong><span class="statusPill ${policy.enabled ? 'approved' : ''}">${policy.enabled ? 'Enforced' : 'Disabled'}</span></div>`).join('')
        : '<div class="emptyState">No release policy rows were returned.</div>';
      const grid = query('[data-portal-view="operations"] .opsGrid');
      if (!grid) return;
      const statusPill = byId('operationsStatusPill');
      if (statusPill) {
        statusPill.textContent = healthStatus.label;
        statusPill.className = 'statusPill healthState';
        statusPill.dataset.state = healthStatus.state;
      }
      const checkedAt = operational.checked_at || livePlatformHealth?.generated_at;
      const event = liveSnapshot.next_event;
      const eventState = event
        ? event.activated_at
          ? (event.closes_at && new Date(event.closes_at).getTime() <= Date.now() ? 'Completed' : 'Live window')
          : event.prelive_at ? 'Pre-live' : 'Prepared'
        : 'No event registered';
      const eventContext = event
        ? `<article class="portalPanel eventHealthContext"><div class="panelHeader"><div><p class="eyebrow">Observed Daily Doji</p><h3>${escapeHtml(event.title || 'Daily Doji')}</h3></div><span class="statusPill approved">${escapeHtml(eventState)}</span></div><div class="healthMetricGrid"><div><span>Scheduled</span><strong>${escapeHtml(new Date(event.fires_at).toLocaleString())}</strong></div><div><span>Participation closes</span><strong>${escapeHtml(event.closes_at ? new Date(event.closes_at).toLocaleString() : 'Not activated')}</strong></div><div><span>Telemetry windows</span><strong>Delivery 5m · Sentry 24h</strong></div></div></article>`
        : `<article class="portalPanel eventHealthContext"><div class="healthEmpty"><strong>No Daily Doji occurrence is currently registered.</strong><span>Operational health remains available, but there is no event window to anchor the review.</span></div></article>`;
      const issueRows = issues.length
        ? issues.map((issue) => {
          const body = `<span class="sentryIssueTone"></span><span class="sentryIssueCopy"><strong>${escapeHtml(issue.title || 'Production issue')}</strong><small>${escapeHtml([issue.short_id, issue.project, issue.culprit].filter(Boolean).join(' · '))}</small><small>First seen ${escapeHtml(formatTimestamp(issue.first_seen, 'unknown'))}</small></span><span class="sentryIssueStat"><strong>${Number(issue.event_count || 0)}</strong><br>events</span><span class="sentryIssueStat"><strong>${Number(issue.affected_users || 0)}</strong><br>users</span><span class="sentryIssueStat">Last seen<br>${escapeHtml(formatRelative(issue.last_seen))}</span><span class="rowChevron">›</span>`;
          return issue.permalink
            ? `<a class="sentryIssueRow" data-level="${escapeHtml(issue.level || 'error')}" href="${escapeHtml(issue.permalink)}" target="_blank" rel="noopener noreferrer">${body}</a>`
            : `<div class="sentryIssueRow" data-level="${escapeHtml(issue.level || 'error')}">${body}</div>`;
        }).join('')
        : sentry.available && !liveDataErrors.platform
          ? '<div class="healthEmpty"><strong>No unresolved production issues returned.</strong><span>This query does not include resolved issues or unreported failures. It cannot verify account loading or comment success.</span></div>'
          : '<div class="healthEmpty healthUnavailable"><strong>Sentry coverage unavailable.</strong><span>No all-clear can be inferred. Check the read-only connection or refresh the portal.</span></div>';
      const historyRows = eventHistory.length
        ? eventHistory.map((history) => {
          const observedFrom = Date.parse(history.observed_from || history.activated_at || history.fires_at);
          const observedThrough = Date.parse(history.observed_through || history.closes_at);
          const eventIssueCount = issues.filter((issue) => {
            const firstSeen = Date.parse(issue.first_seen || issue.last_seen || '');
            const lastSeen = Date.parse(issue.last_seen || issue.first_seen || '');
            return Number.isFinite(firstSeen) && Number.isFinite(lastSeen) &&
              firstSeen <= observedThrough && lastSeen >= observedFrom;
          }).length;
          const settled = Boolean(history.finalized_at);
          const state = window.DojiPortalHealth.eventState(history);
          const value = (key) => Number.isFinite(history[key]) ? Number(history[key]) : '—';
          return `<article class="eventHealthRow" data-tone="${state === 'healthy' ? 'healthy' : 'attention'}"><span class="eventHealthRail"></span><div class="eventHealthTitle"><strong>${escapeHtml(history.title || 'Daily Doji')}</strong><small>${escapeHtml(new Date(history.fires_at).toLocaleString())} · ${settled ? 'Finalized' : 'Settling'}</small><span class="statusPill healthState" data-state="${state}">${window.DojiPortalHealth.labels[state]}</span></div><div><span>Realtime p95 / max</span><strong>${value('realtime_p95_ms')} / ${value('realtime_max_ms')} ms</strong><small>${value('realtime_sample_count')} samples · ${value('realtime_over_5s')} over 5s</small></div><div><span>Outbox</span><strong>${value('outbox_unpublished')} unpublished</strong><small>${value('outbox_exhausted')} exhausted</small></div><div><span>Push</span><strong>${value('push_shards_completed')} / ${value('push_shards_total')}</strong><small>${value('push_shards_expired')} expired · ${value('push_shards_exhausted')} exhausted</small></div><div><span>Participation</span><strong>${value('participant_count')} people · ${value('post_count')} posts</strong></div><div><span>Issue-lifetime overlap</span><strong>${sentry.available && !liveDataErrors.platform ? eventIssueCount + ' groups' : 'Unknown'}</strong><small>Not confirmed events in this window</small></div></article>`;
        }).join('')
        : historyUnavailable
          ? '<div class="healthEmpty healthUnavailable"><strong>Recent Doji health could not be refreshed.</strong><span>The last successful history remains preserved; retry after connectivity is restored.</span></div>'
          : '<div class="healthEmpty"><strong>No completed Doji health summaries yet.</strong><span>The service monitor will add the first summary shortly after a production Doji closes.</span></div>';
      const healthNotice = operationalUnavailable ? '<div class="portalPanel healthUnavailable"><strong>Live operational health is temporarily unavailable.</strong><span>Values below are the last authoritative snapshot and may be stale. No unavailable signal is being treated as healthy.</span></div>' : '';
      const healthSignals = healthStatus.signals.map((item) => `<article class="healthSignal" data-state="${item.state}"><div><h4>${escapeHtml(item.name)}</h4><span class="statusPill healthState" data-state="${item.state}">${item.label}</span></div><p>${escapeHtml(item.detail)}</p></article>`).join('');
      const issueStatus = healthStatus.signals.find((item) => item.name.startsWith('App errors')).state;
      grid.innerHTML = `${healthNotice}
        <article class="portalPanel opsHero" data-tone="${healthStatus.state === 'healthy' ? 'healthy' : 'attention'}">
          <div><p class="eyebrow">Measured platform health</p><h3>${escapeHtml(healthStatus.title)}</h3>
          <p>${escapeHtml(healthStatus.summary)}</p><p>Delivery checked ${escapeHtml(formatTimestamp(checkedAt, 'not available'))}. These are separate observation windows, not a guarantee that every app feature works.</p>
          <button type="button" class="portalButton" id="refreshOperationsHealth">Refresh health</button></div>
          <div class="opsHeroMetric"><strong>${!operationalUnavailable && operational.realtime_sample_count_5m > 0 && Number.isFinite(operational.realtime_p95_ms_5m) ? Number(operational.realtime_p95_ms_5m) + ' ms' : '—'}</strong><span>Realtime p95 · last 5 minutes${operationalUnavailable ? ' · stale / unavailable' : ''}</span></div>
        </article>
        <section class="healthSignalGrid" aria-label="Health signals">${healthSignals}</section>
        <article class="portalPanel healthThresholds" data-help-container><h3 data-help-label>Health coverage</h3>
          <dl data-context-help>
            <div><dt><span class="healthState" data-state="healthy">Healthy</span></dt><dd>Fresh telemetry; at least 20 realtime samples; p95 below 1s, no sample over 5s, and no backlog or provider credential failures.</dd></div>
            <div><dt><span class="healthState" data-state="watch">Watch</span></dt><dd>Realtime p95 reaches 1s, any sample exceeds 5s, or a recent Doji missed a delivery target even if delivery has recovered.</dd></div>
            <div><dt><span class="healthState" data-state="degraded">Degraded</span></dt><dd>Realtime p95 exceeds 5s with at least 20 samples; any overdue outbox / stale push work; server health fails; or Sentry returns unresolved production issues from its 24h window.</dd></div>
            <div><dt><span class="healthState" data-state="critical">Critical</span></dt><dd>Any realtime sample exceeds 30s, work exhausts retries, or APNs credentials fail. A past event also flags expired push shards as critical.</dd></div>
            <div><dt><span class="healthState" data-state="unknown">Needs verification</span></dt><dd>Missing or failed reads, delivery data older than 3 minutes, or insufficient samples. Missing measurements never mean zero failures.</dd></div>
          </dl><p>Not directly measured here: account, feed, comment and reaction request success rates, session continuity, or crash-free sessions. Sentry captures reported errors only. A healthy delivery queue cannot rule out these failures.</p>
        </article>
        <article class="portalPanel sentryPanel"><div class="panelHeader"><div><h3>Crashes and production errors</h3><p>Sentry · up to 25 unresolved production issue groups · last 24 hours. Counts are Sentry group totals, not per-Doji totals.</p></div><span class="statusPill healthState" data-state="${issueStatus}">${issueStatus === 'unknown' ? healthStatus.signals.find((item) => item.name.startsWith('App errors')).label : issues.length + (issues.length >= 25 ? '+' : '') + ' unresolved'}</span></div><div class="sentryIssueList">${issueRows}</div></article>
        <article class="portalPanel"><div class="panelHeader"><div><h3>Release policy</h3></div></div><div class="releaseRows">${releases}</div></article>`;
      byId('refreshOperationsHealth').addEventListener('click', async () => {
        const button = byId('refreshOperationsHealth');
        button.disabled = true;
        button.textContent = 'Refreshing…';
        try { await refreshLiveData(); }
        catch (error) {
          liveDataErrors.platform = 'Health refresh failed';
          renderMetrics(); renderOperations(); renderDataHealthBanner();
          showToast('Health refresh failed. Last values may be stale.');
        }
        finally { button.disabled = false; button.textContent = 'Refresh health'; }
      });
      window.DojiContextualHelp?.enhance(grid);
      grid.insertAdjacentHTML('afterbegin', eventContext);
      grid.insertAdjacentHTML('beforeend', `<article class="portalPanel eventHistoryPanel"><div class="panelHeader"><div><h3>Recent Doji health</h3><p>Finalized event-level delivery summaries · newest first</p></div><span class="statusPill">${eventHistory.length} events</span></div><div class="eventHealthList">${historyRows}</div></article>`);
    }

    function businesses() {
      if (liveMode) return [];
      const profile = readStorage(businessProfileKey, null);
      if (!profile?.companyName) return seedBusinesses.map(applyOverrides);
      const local = { id: 'BIZ-LOCAL', name: profile.companyName, legalName: profile.legalName || 'Not provided', domain: (profile.website || '').replace(/^https?:\/\//, '') || 'Not provided', industry: profile.industry || 'Not provided', region: (profile.markets || [profile.country]).filter(Boolean).join(', '), status: 'open', label: 'Pending review', campaigns: businessCampaignKeys.flatMap((key) => readStorage(key, [])).length, owner: profile.ownerName || 'Workspace owner' };
      return [local, ...seedBusinesses].map(applyOverrides);
    }

    function renderBusinesses() {
      if (businessReviewEnabled) {
        const view = query('[data-portal-view="businesses"]');
        view.querySelector('.viewIntro p:not(.eyebrow)').textContent = 'Review submitted business applications. Approval grants workspace access only; publishing and billing remain disabled.';
        view.querySelector('.viewIntro .statusPill').textContent = liveSession?.capabilities?.operator_manage ? 'Review enabled' : 'Read only';
        byId('businessAdminGrid').classList.remove('businessAdminGrid');
        return;
      }
      const rows = businesses();
      byId('businessAdminGrid').innerHTML = rows.length
        ? rows.map((business) => `<button type="button" class="businessAdminCard" data-business-id="${escapeHtml(business.id)}"><span class="businessAvatar">${escapeHtml(business.name.charAt(0))}</span><span class="businessCardBody"><span class="businessCardHeading"><strong>${escapeHtml(business.name)}</strong><span class="statusPill ${statusClass(business.status)}">${escapeHtml(business.label)}</span></span><small>${escapeHtml(business.legalName)}</small><span class="businessFacts"><span>${escapeHtml(business.domain)}</span><span>${escapeHtml(business.industry)}</span><span>${business.campaigns} campaigns</span></span><span class="businessOwner">Owner contact · ${escapeHtml(business.owner)}</span></span><span class="rowChevron">›</span></button>`).join('')
        : '<div class="emptyState">Business verification is not available yet.</div>';
      queryAll('[data-business-id]').forEach((button) => button.addEventListener('click', () => {
        const business = businesses().find((item) => item.id === button.dataset.businessId);
        openDrawer({ id: business.id, queue: 'businesses', subject: business.name, secondary: business.legalName, category: 'Business verification', submitted: 'Workspace application', deadline: '2 business days', status: business.status, label: business.label, priority: business.status === 'open' ? 'normal' : 'low', summary: `${business.name} operates in ${business.industry} and requested access for ${business.region}.`, visibility: 'Private organization workspace', owner: business.owner, source: business.domain, nextStep: business.status === 'open' ? 'Verify organization, representative, domain, and brand assets.' : 'No verification action required.', history: ['Business workspace created', ...(business.status === 'approved' ? ['Organization verified'] : ['Verification pending'])] });
      }));
    }

    function announcements() {
      if (liveMode) return (liveSnapshot?.announcements || []).map((item) => ({
        id: item.id,
        title: item.title,
        type: 'Server announcement',
        audience: 'Eligible users',
        frequency: `${item.max_impressions_per_user} impression${item.max_impressions_per_user === 1 ? '' : 's'} maximum`,
        window: `${new Date(item.starts_at).toLocaleDateString()} – ${item.ends_at ? new Date(item.ends_at).toLocaleDateString() : 'No end date'}`,
        status: item.enabled ? 'approved' : 'revision',
        label: item.enabled ? 'Active' : 'Draft',
      }));
      const state = readAdminState(); return [...state.announcements, ...seedAnnouncements];
    }
    function renderAnnouncements() {
      const rows = announcements();
      byId('announcementList').innerHTML = rows.length
        ? rows.map((item) => `<article class="announcementCard"><div class="announcementCardTop"><span class="announcementType">${escapeHtml(item.type)}</span><span class="statusPill ${statusClass(item.status)}">${escapeHtml(item.label)}</span></div><h3>${escapeHtml(item.title)}</h3><dl><div><dt>Audience</dt><dd>${escapeHtml(item.audience)}</dd></div><div><dt>Frequency</dt><dd>${escapeHtml(item.frequency)}</dd></div><div><dt>Window</dt><dd>${escapeHtml(item.window)}</dd></div></dl><p class="readOnlyNote">Read-only production record</p></article>`).join('')
        : '<div class="emptyState">No production announcements were returned.</div>';
    }

    function audits() {
      if (liveMode) return liveAudit;
      const state = readAdminState(); return [...state.audit, ...seedAudit];
    }

    function groupedAuditRows(rows) {
      const grouped = [];
      for (const item of rows) {
        const previous = grouped[grouped.length - 1];
        const itemTime = Date.parse(item.occurredAt || '');
        const previousTime = Date.parse(previous?.occurredAt || '');
        const sameBurst = item.type === 'access'
          && previous?.type === 'access'
          && previous.actor === item.actor
          && previous.actionCode === item.actionCode
          && previous.entityType === item.entityType
          && previous.entityId === item.entityId
          && Number.isFinite(itemTime)
          && Number.isFinite(previousTime)
          && Math.abs(previousTime - itemTime) <= 15 * 60 * 1000;
        if (sameBurst) {
          previous.repeatCount = (previous.repeatCount || 1) + 1;
          previous.groupedIds = [...(previous.groupedIds || [previous.id]), item.id];
        } else {
          grouped.push({ ...item, repeatCount: 1, groupedIds: [item.id] });
        }
      }
      return grouped;
    }

    function auditMetadataRows(item) {
      const rows = [
        ['Event ID', item.id],
        ['Occurred', item.timestamp || item.time],
        ['Actor', item.actor],
        ['Actor role', actorRoleLabel(item.actorRole) || 'System'],
        ['Entity', item.entity],
        ['Action code', item.actionCode || item.action],
        ['Request ID', item.requestId || 'Not supplied'],
      ];
      Object.entries(item.metadata || {}).forEach(([key, value]) => {
        const rendered = value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
        rows.push([titleCase(key), rendered || 'Not supplied']);
      });
      if (item.repeatCount > 1) rows.push(['Repeated events', `${item.repeatCount} similar access events within 15 minutes`]);
      return rows;
    }

    function openAuditDetail(item) {
      if (!item) return;
      const revision = ++auditDetailRevision;
      const epoch = workspaceEpoch;
      const current = () => epoch === workspaceEpoch && revision === auditDetailRevision && byId('auditDetailModal').open;
      byId('auditDetailTitle').textContent = item.action;
      byId('auditDetailBody').innerHTML = `<section class="auditDetailLead"><span class="auditType" data-type="${escapeHtml(item.type)}">${escapeHtml(item.type)}</span><strong>${escapeHtml(item.entity)}</strong><p>${escapeHtml(item.detail)}</p></section><dl class="auditMetadata">${auditMetadataRows(item).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
      const related = ['report', 'moderation_appeal'].includes(item.entityType);
      byId('auditDetailActions').innerHTML = related
        ? `<button type="button" class="portalButton primary" data-open-audit-entity="${escapeHtml(item.entityId)}">Open related case</button>`
        : '';
      query('[data-open-audit-entity]', byId('auditDetailActions'))?.addEventListener('click', async (event) => {
        event.currentTarget.disabled = true;
        const loaded = getItem(item.entityId);
        if (loaded) {
          byId('auditDetailModal').close();
          openDrawer(loaded);
          return;
        }
        try {
          if (item.entityType === 'moderation_appeal') {
            const detail = await liveClient.appealCase(item.entityId);
            if (!current()) return;
            if (detail?.appeal?.id !== item.entityId) throw new Error('The related appeal could not be verified.');
            byId('auditDetailModal').close();
            openDrawer(mapLiveAppeal({ ...detail.appeal, ...{
              content_kind: detail.original_decision?.content_kind,
              policy_code: detail.original_decision?.policy_code,
              severity: detail.original_decision?.severity,
            } }));
            return;
          }
          const detail = await liveClient.reportCase(item.entityId);
          if (!current()) return;
          const fallback = mapLiveWork({
            id: detail.id || item.entityId,
            queue: detail.triage_state?.queue === 'restricted_safety' ? 'safety' : 'moderation',
            subject: detail.subject || 'Post report',
            secondary: detail.specific_concern || detail.category || 'Moderation report',
            category: detail.category || 'Report',
            submitted_at: detail.created_at,
            deadline_at: detail.triage_state?.deadline_at,
            status: detail.status || 'resolved',
            label: titleCase(detail.status || 'Resolved'),
            priority: detail.priority || 'normal',
            summary: detail.summary || 'Archived moderation report.',
            visibility: contentStateLabel(detail),
            owner: detail.owner ? identityLabel(detail.owner, 'Assigned') : 'Unassigned',
            source: 'Audit history',
            next_step: 'Review the authoritative case history.',
            history: detail.history || [],
            assigned_to: detail.assigned_to,
          });
          byId('auditDetailModal').close();
          openDrawer(fallback);
        } catch (error) {
          if (!current()) return;
          let status = byId('auditRelatedError');
          if (!status) {
            status = document.createElement('p'); status.id = 'auditRelatedError';
            status.className = 'portalCommandError'; status.setAttribute('role', 'alert');
            byId('auditDetailActions').append(status);
          }
          status.textContent = error instanceof Error ? error.message : 'The related case could not be loaded.';
          query('[data-open-audit-entity]', byId('auditDetailActions')).disabled = false;
        }
      });
      byId('auditDetailModal').showModal();
    }

    function renderAudit(filter = auditFilter, term = auditSearchTerm) {
      const normalized = term.trim().toLowerCase();
      const rawRows = liveMode
        ? audits()
        : audits().filter((item) => (filter === 'all' || filter === 'activity' || item.type === filter) && (!normalized || [item.actor, item.action, item.actionCode, item.entity, item.detail, item.requestId].join(' ').toLowerCase().includes(normalized)));
      const rows = visibleQueueRows('audit', groupedAuditRows(rawRows));
      byId('auditList').innerHTML = rows.length ? rows.map((item) => `<button type="button" class="auditRow" data-audit-id="${escapeHtml(item.id)}"><span class="auditActor">${escapeHtml(item.actor === 'System' ? 'SY' : item.actor.split(' ').map((part) => part[0]).join('').slice(0, 2))}</span><span class="auditEventCopy"><strong>${escapeHtml(item.action)}</strong><p>${escapeHtml(item.entity)} · ${escapeHtml(item.detail)}</p>${item.repeatCount > 1 ? `<span class="auditRepeat">${item.repeatCount} similar views grouped</span>` : ''}</span><time title="${escapeHtml(item.timestamp || item.time)}">${escapeHtml(item.time)}</time><span class="auditType" data-type="${escapeHtml(item.type)}">${escapeHtml(item.type)}</span><span class="auditRowChevron">›</span></button>`).join('') : '<div class="emptyState">No audit events match this server-side view.</div>';
      byId('auditResultCount').textContent = `${rows.length} ${rows.length === 1 ? 'audit event' : 'audit events'}`;
      byId('loadMoreAudit').hidden = true;
      renderQueuePager('audit', byId('auditList').closest('.queuePanel'), groupedAuditRows(rawRows), Boolean(auditCursor), loadMoreAuditEvents, () => renderAudit(), auditLoading);
      queryAll('[data-audit-id]', byId('auditList')).forEach((button) => button.addEventListener('click', () => openAuditDetail(rows.find((item) => item.id === button.dataset.auditId))));
    }

    async function exportAuditView() {
      if (auditExporting || (liveMode && !liveSession)) return;
      const epoch = workspaceEpoch;
      auditExporting = true;
      const button = query('[data-action="export-audit"]');
      button.disabled = true;
      let feedback = byId('auditExportFeedback');
      if (!feedback) {
        feedback = document.createElement('div');
        feedback.id = 'auditExportFeedback';
        feedback.className = 'portalCommandError auditExportFeedback';
        feedback.setAttribute('role', 'status');
        feedback.setAttribute('aria-live', 'polite');
        query('[data-portal-view="audit"] .queuePanel').before(feedback);
      }
      feedback.hidden = false;
      feedback.dataset.tone = 'neutral';
      feedback.textContent = 'Preparing export…';
      try {
      const spreadsheetSafe = (value) => {
        const string = String(value ?? '');
        const safe = /^[=+\-@]/.test(string) ? `'${string}` : string;
        return `"${safe.replaceAll('"', '""')}"`;
      };
      let exportRows = audits();
      let truncated = false;
      if (liveMode) {
        try {
          const result = await liveClient.auditExport({ category: auditFilter, search: auditSearchTerm });
          if (epoch !== workspaceEpoch) return;
          exportRows = Array.isArray(result?.items) ? result.items.map(mapAuditEvent) : [];
          truncated = result?.truncated === true;
        } catch (error) {
          if (epoch !== workspaceEpoch) return;
          feedback.dataset.tone = 'error';
          feedback.textContent = `${error instanceof Error ? error.message : 'The audit export could not be created.'} No file was downloaded. Use Export to retry.`;
          return;
        }
      }
      const rows = exportRows.map((item) => [item.id, item.timestamp || item.time, item.type, item.actor, item.actorRole, item.actionCode || item.action, item.entityType, item.entityId, item.detail, item.requestId]);
      const csv = [['event_id', 'occurred_at', 'category', 'actor', 'actor_role', 'action', 'entity_type', 'entity_id', 'reason', 'request_id'], ...rows]
        .map((row) => row.map(spreadsheetSafe).join(','))
        .join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `doji-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      feedback.textContent = `Exported ${rows.length} matching audit events${truncated ? ' (server limit reached)' : ''}.`;
      } finally {
        if (epoch === workspaceEpoch) { auditExporting = false; button.disabled = false; }
      }
    }

    function renderOperators() {
      const accessView = query('[data-portal-view="access"]');
      if (!accessView) return;
      const allowed = liveMode && liveSession?.capabilities?.operator_manage === true;
      byId('operatorAccessNav').hidden = !allowed;
      if (!allowed) return;
      const rows = Array.isArray(liveOperators?.items) ? liveOperators.items : [];
      byId('operatorList').innerHTML = rows.length
        ? rows.map((operator) => {
          const name = operator.display_name || operator.username || 'Doji member';
          const roles = Array.isArray(operator.roles) ? operator.roles : [];
          const status = employeeMode ? (operator.status === 'pending' ? '<span class="statusPill pending">Pending approval</span>' : operator.status === 'disabled' ? '<span class="statusPill urgent">Disabled</span>' : '<span class="statusPill approved">Active</span>') : (operator.is_banned ? '<span class="statusPill urgent">Banned</span>' : '<span class="statusPill approved">Active</span>');
          return `<article class="operatorRow"><span class="operatorAvatarSmall">${escapeHtml(initials(name))}</span><span class="operatorIdentity"><strong>${escapeHtml(name)}</strong><small>${employeeMode ? '' : '@'}${escapeHtml(operator.username || 'unknown')}</small></span><span class="operatorRoles">${operator.is_founder_admin ? '<span class="roleChip">Founder super admin</span>' : ''}${roles.map((role) => `<span class="roleChip">${escapeHtml(titleCase(role))}</span>`).join('')}</span><span class="operatorChanged">${status}<small>Changed ${escapeHtml(formatRelative(operator.last_changed_at))}</small></span></article>`;
        }).join('')
        : liveDataErrors.operators
          ? '<div class="healthEmpty healthUnavailable"><strong>Operator access could not be loaded.</strong><span>Retry after connectivity is restored.</span></div>'
          : '<div class="healthEmpty"><strong>No delegated operators.</strong><span>The founder retains super admin access.</span></div>';
    }

    function renderAll() {
      ['inbox', 'moderation', 'safety', 'campaigns', 'suggestions'].forEach(renderQueue);
      renderPriority(); renderMetrics(); renderBusinesses(); renderAnnouncements(); renderAudit(); renderOperations(); renderOperators(); renderDataHealthBanner();
    }

    function identityLabel(person, fallback) {
      if (!person) return fallback;
      const name = person.display_name || person.username || fallback;
      return person.username && person.username !== name ? `${name} · @${person.username}` : name;
    }

    function contentStateLabel(detail) {
      const context = detail?.case_context || {};
      const state = String(context.content_state || '').toLowerCase();
      if (detail?.evidence?.exists === false) return 'Content unavailable';
      if (state === 'visible') return 'Visible in app';
      if (state === 'quarantined') return 'Quarantined from members';
      if (state === 'removed') return 'Removed from members';
      if (state === 'banned') return 'Account suspended';
      if (state === 'active') return 'Account active';
      return 'Pending verification';
    }

    function isLiveReportItem(item) {
      return liveMode
        && Boolean(item)
        && !item.appeal
        && ['moderation', 'safety'].includes(item.queue);
    }

    function caseContextMarkup(detail) {
      const context = detail?.case_context || {};
      const evidence = detail?.evidence || {};
      const rows = [
        ['Report submitted', formatTimestamp(detail?.created_at)],
        ['Content posted', formatTimestamp(context.content_created_at)],
        ['Daily Doji', context.challenge_title || 'Not tied to a Daily Doji'],
        ['Audience', context.audience_label || context.audience || 'Not applicable'],
        ['Content reference', evidence.content_id || 'Not available'],
      ];
      return `<div class="detailBlock"><label>Case context</label><div class="caseMetadata">${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div></div>`;
    }

    function evidenceMarkup(detail, includePreserved = true) {
      const evidence = detail?.evidence;
      if (!evidence) return '';
      const label = ({ post: 'Reported post', comment: 'Reported comment', poll_response: 'Reported poll response', profile_photo: 'Reported profile photo', account: 'Reported account', account_profile: 'Reported profile' })[evidence.kind] || 'Reported content';
      const text = evidence.kind === 'post'
        ? evidence.caption
        : evidence.kind === 'comment'
          ? evidence.body
          : evidence.kind === 'poll_response'
            ? evidence.custom_text
            : evidence.kind === 'account'
              ? 'This report concerns account-level behavior rather than one content item.'
              : evidence.has_profile_photo ? 'Profile photo attached to this report.' : 'No profile photo is currently attached.';
      const image = mediaManifestMarkup(detail.media_manifest);
      return `<div class="detailBlock"><label>${escapeHtml(label)}</label><div class="moderationEvidence ${evidence.exists === false ? 'removed' : ''}">${image}<p>${escapeHtml(text || 'No text accompanied this content.')}</p>${evidence.exists === false ? '<small>The referenced content is no longer available.</small>' : ''}</div></div>${includePreserved ? preservedEvidenceMarkup(detail.preserved_media_manifest) : ''}`;
    }

    function preservedEvidenceMarkup(manifest) {
      if (!manifest?.items?.length && !manifest?.access_gaps) return '';
      const statuses = { pending: 'Preservation queued', archived: 'Evidence preserved; removal pending', origin_removed: 'Origin removed; access checks pending', revoked: 'Observed media access revoked', restored: 'Restoration verified', needs_attention: 'Media verification needs staff attention' };
      const progress = (manifest.items || []).map(asset => `<p>${escapeHtml(titleCase(asset.slot))}: ${escapeHtml(asset.desired === 'restored' && asset.phase !== 'restored' ? 'Restoration checks pending' : statuses[asset.phase] || 'Verification status unavailable')}</p>`).join('');
      return `<div class="detailBlock evidenceProvenance"><label>Preserved decision media</label><p>Files retained for this specific decision. Current content and text may differ; this is not a complete historical content snapshot.</p>${manifest.access_gaps ? '<p role="status">A media reference could not be preserved or verified. Keep the removal request open for staff follow-up.</p>' : ''}${progress}${mediaManifestMarkup(manifest)}</div>`;
    }

    function mediaManifestMarkup(manifest) {
      const labels = { photo: 'Main photo', front_photo: 'Front photo', video: 'Video', profile_photo: 'Profile photo', original_profile_photo: 'Original profile photo' };
      const unavailable = {
        archive_pending: 'Preservation is not yet verified. Do not treat this file as retained evidence.',
        object_missing: 'This media object is no longer available.',
        invalid_reference: 'The saved media reference cannot be opened.',
        staff_storage_not_authorized: 'Secure staff access to this image is not available. Do not use a public URL to bypass it.',
        expired: 'This protected preview expired. Refresh evidence to authorize it again.',
        preview_failed: 'This preview could not be loaded. Refresh evidence to try again.',
      };
      const items = Array.isArray(manifest?.items) ? manifest.items.slice(0, 3) : [];
      return items.length ? `<div class="evidenceGallery">${items.map((asset) => {
        const label = labels[asset.slot] || 'Evidence';
        const playable = asset.availability === 'available' && asset.url && Date.now() < asset.expiresAt;
        const content = playable
          ? asset.kind === 'video'
            ? `<video class="moderationEvidenceVideo" controls playsinline preload="none" aria-label="${escapeHtml(label)} evidence" src="${escapeHtml(asset.url)}"></video>`
            : `<img class="moderationEvidenceImage" src="${escapeHtml(asset.url)}" alt="${escapeHtml(label)} evidence" referrerpolicy="no-referrer">`
          : `<div class="moderationEvidenceUnavailable" role="status"><strong>${escapeHtml(label)} unavailable</strong><span>${escapeHtml(unavailable[asset.availability] || unavailable.preview_failed)}</span></div>`;
        return `<figure class="evidenceAsset" data-evidence-slot="${escapeHtml(asset.slot)}"><figcaption>${escapeHtml(label)}</figcaption>${content}</figure>`;
      }).join('')}</div><button type="button" class="portalButton compact" data-action="refresh-case-evidence">Refresh evidence</button>` : '';
    }

    function appealDetailMarkup() {
      const detail = activeAppealDetail;
      if (!detail) return '';
      const appeal = detail.appeal;
      const decision = detail.original_decision;
      const original = detail.original_evidence || {};
      const facts = [
        ['Original outcome', titleCase(decision.action)], ['Policy', titleCase(decision.policy_code)],
        ['Severity', titleCase(decision.severity)], ['Decision state', titleCase(decision.state)],
        ['Account action', titleCase(decision.account_action || 'none')], ['Account action state', titleCase(decision.account_action_state || 'not applicable')],
        ['Decided by', identityLabel(decision.decided_by, decision.decider_deleted ? 'Deleted operator' : 'Unavailable')],
        ['Decided', formatTimestamp(decision.decided_at)],
      ];
      if (decision.restriction_ends_at) facts.push(['Restriction ends', formatTimestamp(decision.restriction_ends_at)]);
      return `<div class="detailBlock"><label>Member appeal</label><p>${escapeHtml(appeal.statement)}</p><small>Submitted ${escapeHtml(formatTimestamp(appeal.submitted_at))} · ${escapeHtml(titleCase(appeal.status))}</small>${appeal.review_reason ? `<p><strong>Review outcome</strong> ${escapeHtml(appeal.review_reason)}</p>` : ''}</div>
        <div class="detailBlock"><label>Original decision</label><div class="decisionSummary"><div class="decisionSummaryGrid">${facts.map(([label,value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div><div class="decisionCopy"><span>Internal rationale</span><p>${escapeHtml(decision.rationale)}</p><span>Member notice</span><p>${escapeHtml(decision.member_notice)}</p></div></div></div>
        <div class="detailBlock evidenceProvenance"><label>Evidence record</label><p>Current content below may differ from what was reviewed originally. A complete historical content snapshot was not retained.</p>${original.avatar_reference_retained ? `<p>The original profile-photo reference was preserved; the stored file is not an immutable snapshot.</p>${mediaManifestMarkup(original.media_manifest) || '<p>Its secure preview is not available.</p>'}` : ''}</div>
        ${preservedEvidenceMarkup(original.preserved_media_manifest)}
        ${caseContextMarkup(detail.report_case)}${evidenceMarkup(detail.report_case, false)}`;
    }

    function decisionSummaryMarkup(detail) {
      const decision = detail?.decision_summary;
      if (!decision) return '';
      const action = decision.action === 'no_violation'
        ? 'No violation'
        : decision.action === 'remove_profile_photo'
          ? 'Profile photo removed'
          : decision.action === 'remove_content'
            ? 'Content removed'
            : titleCase(decision.action);
      const accountOutcome = decision.account_action
        ? titleCase(decision.account_action === 'permanent_ban' ? 'permanent suspension' : decision.account_action)
        : 'No account action';
      const restriction = decision.restriction_ends_at
        ? `<small>Ends ${escapeHtml(formatTimestamp(decision.restriction_ends_at))}</small>`
        : '';
      const operator = identityLabel(decision.decided_by, 'Authorized operator');
      const deliveryRows = [
        ['Account Status', decision.notice_status || 'not_requested'],
        ['Push', decision.push_status || 'not_requested'],
        ['Email', decision.email_status || 'not_requested'],
        ['Appeal', decision.appeal_status || (decision.appeal_eligible ? 'available' : 'not_available')],
      ];
      return `<div class="detailBlock"><label>Final decision</label><div class="decisionSummary"><div class="decisionSummaryGrid"><div><span>Outcome</span><strong>${escapeHtml(action)}</strong></div><div><span>Policy</span><strong>${escapeHtml(titleCase(decision.policy_code || 'Not recorded'))}</strong></div><div><span>Severity</span><strong>${escapeHtml(titleCase(decision.severity || 'Not recorded'))}</strong></div><div><span>Account outcome</span><strong>${escapeHtml(accountOutcome)}</strong>${restriction}</div><div><span>Decision state</span><strong>${escapeHtml(titleCase(decision.state || 'Not recorded'))}</strong></div><div><span>Decided by</span><strong>${escapeHtml(operator)}</strong><small>${escapeHtml(formatTimestamp(decision.decided_at))}</small></div></div><div class="decisionCopy"><span>Internal rationale</span><p>${escapeHtml(decision.rationale || 'Not recorded')}</p><span>Member notice</span><p>${escapeHtml(decision.member_notice || 'Not sent')}</p></div><div class="deliveryStatusGrid">${deliveryRows.map(([label, status]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(titleCase(status))}</strong></div>`).join('')}</div></div></div>`;
    }

    function queueSpecificDetailMarkup(item) {
      if (item.queue === 'suggestions') {
        return `<div class="detailBlock"><label>Submitted idea</label><div class="caseMetadata"><div><span>Prompt</span><strong>${escapeHtml(item.subject)}</strong></div><div><span>Format</span><strong>${escapeHtml(item.category)}</strong></div><div><span>Submitted by</span><strong>${escapeHtml(identityLabel(item.submittedBy, 'Member identity unavailable'))}</strong></div><div><span>Submitted</span><strong>${escapeHtml(item.submitted)}</strong></div><div><span>Publication state</span><strong>${escapeHtml(item.visibility)}</strong></div></div></div>`;
      }
      if (item.queue === 'campaigns') {
        return `<div class="detailBlock"><label>Sponsored Doji submission</label><div class="caseMetadata"><div><span>Business / campaign</span><strong>${escapeHtml(item.secondary)}</strong></div><div><span>Format</span><strong>${escapeHtml(item.category)}</strong></div><div><span>Requested schedule</span><strong>${escapeHtml(item.submitted)}</strong></div><div><span>Review state</span><strong>${escapeHtml(item.label)}</strong></div><div><span>Destination</span><strong>${escapeHtml(item.destination || 'No Learn more destination')}</strong></div></div></div>`;
      }
      if (item.queue === 'businesses') {
        return `<div class="detailBlock"><label>Business verification record</label><div class="caseMetadata"><div><span>Organization</span><strong>${escapeHtml(item.subject)}</strong></div><div><span>Legal name</span><strong>${escapeHtml(item.secondary)}</strong></div><div><span>Domain</span><strong>${escapeHtml(item.source)}</strong></div><div><span>Verification state</span><strong>${escapeHtml(item.label)}</strong></div></div></div>`;
      }
      return '';
    }

    function detailMarkup(item) {
      const liveReportItem = isLiveReportItem(item);
      if ((liveReportItem || (liveMode && item.appeal)) && caseLoadError) {
        return `<div class="drawerError" role="alert"><strong>Case details could not be loaded.</strong><p>${escapeHtml(caseLoadError)}</p><button class="portalButton" type="button" data-action="refresh-case-evidence">Try again</button></div>`;
      }
      if ((liveReportItem || (liveMode && item.appeal)) && !activeCaseDetail) {
        return '<div class="drawerLoading" aria-live="polite"><span></span><strong>Loading report details…</strong></div>';
      }
      if (liveMode && item.appeal) return appealDetailMarkup();
      const optionBlock = item.options?.length ? `<div class="detailBlock"><label>Response options</label><div class="reviewOptionList">${item.options.map((option, index) => `<span><i>${index + 1}</i>${escapeHtml(option)}</span>`).join('')}</div></div>` : '';
      const destinationBlock = item.destination ? `<div class="detailBlock"><label>Learn more destination</label><p>${escapeHtml(item.destination)}</p></div>` : '';
      const moderationPeople = activeCaseDetail && liveReportItem
        ? `<div class="detailBlock"><label>People</label><div class="moderationPeople"><div><span>Reporter</span><strong>${escapeHtml(identityLabel(activeCaseDetail.reporter, 'Unavailable'))}</strong></div><div><span>Reported account</span><strong>${escapeHtml(identityLabel(activeCaseDetail.reported_user, 'Unavailable'))}</strong><small>${activeCaseDetail.reported_user?.is_banned ? 'Account suspended' : 'Account active'}</small></div></div></div>`
        : '';
      const evidence = activeCaseDetail && liveReportItem ? evidenceMarkup(activeCaseDetail) : '';
      const reportClassification = activeCaseDetail && liveReportItem
        ? `<div class="detailTile"><span>Reported category</span><strong>${escapeHtml(activeCaseDetail.reason_label || String(activeCaseDetail.reason || 'Not provided').replaceAll('_', ' '))}</strong></div><div class="detailTile"><span>Specific concern</span><strong>${escapeHtml(activeCaseDetail.reason_detail_label || String(activeCaseDetail.reason_detail || 'Legacy report').replaceAll('_', ' '))}</strong></div>`
        : '';
      const reporterContext = activeCaseDetail?.notes
        ? `<div class="detailBlock"><label>Reporter context</label><p>${escapeHtml(activeCaseDetail.notes)}</p></div>`
        : '';
      const caseContext = activeCaseDetail && liveReportItem ? caseContextMarkup(activeCaseDetail) : '';
      const decisionSummary = activeCaseDetail && liveReportItem ? decisionSummaryMarkup(activeCaseDetail) : '';
      const queueSpecific = !liveReportItem ? queueSpecificDetailMarkup(item) : '';
      const appeal = item.appeal
        ? `<div class="detailBlock"><label>Member appeal</label><p>${escapeHtml(item.appeal.statement)}</p></div><div class="detailGrid"><div class="detailTile"><span>Policy</span><strong>${escapeHtml(String(item.appeal.policy_code || 'Not recorded').replaceAll('_', ' '))}</strong></div><div class="detailTile"><span>Original severity</span><strong>${escapeHtml(String(item.appeal.severity || 'Not recorded').replaceAll('_', ' '))}</strong></div></div>`
        : '';
      const timingLabel = item.status === 'resolved' ? 'Resolved' : 'Review target';
      return `<div class="detailGrid caseFactsGrid"><div class="detailTile"><span>Status</span><strong>${escapeHtml(item.label)}</strong></div><div class="detailTile"><span>Owner</span><strong>${escapeHtml(item.owner)}</strong></div><div class="detailTile"><span>Content state</span><strong>${escapeHtml(item.visibility)}</strong></div><div class="detailTile"><span>${escapeHtml(timingLabel)}</span>${deadlineMarkup(item)}</div>${reportClassification}</div>${!liveReportItem ? `<div class="detailBlock"><label>Case summary</label><p>${escapeHtml(item.summary)}</p></div>` : ''}${queueSpecific}${reporterContext}${appeal}${moderationPeople}${caseContext}${evidence}${decisionSummary}${optionBlock}${destinationBlock}${!liveMode ? '<div class="prototypeBoundary"><strong>Demo only</strong><p>No production actions are taken.</p></div>' : !liveReportItem && !item.appeal ? '<div class="detailBlock"><p>Read only—actions are not available for this item.</p></div>' : ''}`;
    }

    function auditActionLabel(action) {
      const labels = {
        'report.received': 'Report received',
        'report.claim': 'Case claimed',
        'report.release': 'Returned to queue',
        'report.set_priority': 'Priority changed',
        'report.escalate': 'Escalated for urgent review',
        'report.no_violation': 'No violation recorded',
        'report.remove_content': 'Content removed and warning issued',
        'report.remove_profile_photo': 'Profile photo removed and warning issued',
        'report.escalate_restricted': 'Escalated to restricted review',
        'report.triaged': 'Case triaged',
        'report.claimed': 'Case claimed',
        'report.released': 'Returned to queue',
        'report.decided': 'Decision recorded',
        'report.escalated': 'Case escalated',
        'report.reopened': 'Case reopened for follow-up review',
        'report.reclosed': 'Follow-up review completed',
      };
      const normalized = String(action || 'Report activity');
      return labels[normalized] || normalized.replaceAll('.', ' ').replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
    }

    function actorRoleLabel(role) {
      if (!role) return '';
      return String(role).replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
    }

    function titleCase(value) {
      return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
    }

    function workflowActorLabel(entry) {
      return entry?.actor ? identityLabel(entry.actor, actorRoleLabel(entry.actor_role) || 'Authorized operator') : actorRoleLabel(entry?.actor_role);
    }

    function workflowEntryDetail(entry) {
      const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
      const actor = workflowActorLabel(entry);
      const details = [];
      if (actor) details.push(actor);
      if (entry?.action === 'report.set_priority' && metadata.priority) details.push(`Priority: ${titleCase(metadata.priority)}`);
      if (entry?.action === 'report.claim' && metadata.priority) details.push(`${titleCase(metadata.priority)} priority`);
      if (entry?.action?.startsWith('report.') && metadata.policyCode) details.push(`Policy: ${titleCase(metadata.policyCode)}`);
      if (metadata.severity) details.push(`Severity: ${titleCase(metadata.severity)}`);
      if (entry?.reason) details.push(entry.reason);
      if (entry?.occurred_at) details.push(formatRelative(entry.occurred_at));
      return details.join(' · ');
    }

    function triageStatusCopy(detail, item) {
      const state = detail?.triage_state || {};
      const status = state.report_status || detail?.status || item.status;
      const queue = state.queue || 'moderation';
      const owner = state.owner || detail?.owner;
      if (status === 'dismissed') return { label: 'Closed — no violation', note: 'The report was reviewed and closed without enforcement.' };
      if (status === 'actioned') return { label: 'Closed — action taken', note: 'A moderation decision was recorded and applied.' };
      if (queue === 'restricted_safety') return { label: 'Restricted review', note: 'The case is quarantined for a specially authorized reviewer.' };
      if (owner || state.assigned_to || detail?.assigned_to) return { label: 'In review', note: `${identityLabel(owner, item.owner || 'An authorized operator')} owns the next decision.` };
      return { label: 'Awaiting assignment', note: 'No operator has claimed this report yet.' };
    }

    function moderationHistoryMarkup(item) {
      const detail = activeCaseDetail || {};
      const state = detail.triage_state || {};
      const status = triageStatusCopy(detail, item);
      const workflow = Array.isArray(detail.workflow_history)
        ? detail.workflow_history
        : (Array.isArray(detail.history) ? detail.history.filter((entry) => entry?.action !== 'report.evidence_viewed') : []);
      const received = detail.created_at && !workflow.some((entry) => entry?.action === 'report.received')
        ? [{ action: 'report.received', occurred_at: detail.created_at, actor_role: '' }]
        : [];
      const rows = [...workflow, ...received]
        .sort((a, b) => new Date(b.occurred_at || 0).getTime() - new Date(a.occurred_at || 0).getTime())
        .map((entry) => ({ title: auditActionLabel(entry.action), detail: workflowEntryDetail(entry) }));
      const owner = state.owner || detail.owner;
      const priority = state.priority || detail.priority || item.priority || 'normal';
      const queue = state.queue === 'restricted_safety' ? 'Restricted safety' : 'Trust & safety';
      const access = detail.evidence_access || {};
      const fallbackAccess = Array.isArray(detail.history) ? detail.history.filter((entry) => entry?.action === 'report.evidence_viewed') : [];
      const accessCount = Number(access.view_count ?? fallbackAccess.length ?? 0);
      const lastViewedAt = access.last_viewed_at || fallbackAccess[0]?.occurred_at;
      const lastViewer = access.last_viewer;
      const accessWho = lastViewer ? identityLabel(lastViewer, actorRoleLabel(lastViewer.role) || 'Authorized operator') : '';
      const accessCopy = accessCount > 0
        ? `Opened ${accessCount} ${accessCount === 1 ? 'time' : 'times'}${lastViewedAt ? ` · Last opened ${formatRelative(lastViewedAt)}` : ''}${accessWho ? ` by ${accessWho}` : ''}.`
        : 'No authorized evidence access has been recorded.';
      return `<section class="triageStateCard"><div><span>Current triage state</span><strong>${escapeHtml(status.label)}</strong><small>${escapeHtml(status.note)}</small></div><dl><div><dt>Owner</dt><dd>${escapeHtml(owner ? identityLabel(owner, item.owner || 'Assigned') : 'Unassigned')}</dd></div><div><dt>Priority</dt><dd>${escapeHtml(titleCase(priority))}</dd></div><div><dt>Queue</dt><dd>${escapeHtml(queue)}</dd></div><div><dt>Review target</dt><dd>${escapeHtml(item.deadline)}</dd></div></dl></section><div class="historySectionLabel">Case workflow</div><div class="drawerTimeline">${rows.map((entry) => `<div><span></span><p><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.detail)}</small></p></div>`).join('') || '<div class="emptyState">No workflow activity has been recorded.</div>'}</div><aside class="historyAccessSummary"><span class="historyAccessIcon" aria-hidden="true">↗</span><div><strong>Evidence access</strong><p>${escapeHtml(accessCopy)} Full immutable access history remains available in Audit Log.</p></div></aside>`;
    }

    function historyMarkup(item) {
      if (activeAppealDetail && item.appeal) {
        const { appeal, original_decision: decision } = activeAppealDetail;
        const rows = [
          { title: 'Original decision recorded', at: decision.decided_at, detail: `${identityLabel(decision.decided_by, 'Original reviewer unavailable')} · ${decision.rationale || 'Rationale unavailable'}` },
          { title: 'Appeal submitted', at: appeal.submitted_at, detail: appeal.statement },
          ...(appeal.reviewed_at ? [{ title: `Appeal ${titleCase(appeal.status)}`, at: appeal.reviewed_at, detail: `${identityLabel(appeal.reviewed_by, 'Reviewer unavailable')} · ${appeal.review_reason || 'Review reason unavailable'}` }] : []),
        ].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
        return `<div class="historySectionLabel">Appeal history</div><div class="drawerTimeline">${rows.map((entry) => `<div><span></span><p><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.detail || '')}</small><small>${escapeHtml(entry.at ? formatTimestamp(entry.at) : 'Time not recorded')}</small></p></div>`).join('')}</div><div class="historySectionLabel">Linked report workflow</div>${moderationHistoryMarkup({ ...item, deadline: 'See report review target' })}`;
      }
      if (activeCaseDetail && isLiveReportItem(item)) return moderationHistoryMarkup(item);
      const rows = (item.history || []).map((entry) => typeof entry === 'string'
        ? { title: entry, detail: '' }
        : {
          title: auditActionLabel(entry.action),
          detail: [actorRoleLabel(entry.actor_role), entry.reason || '', entry.occurred_at ? formatRelative(entry.occurred_at) : ''].filter(Boolean).join(' · '),
        });
      return `<div class="drawerTimeline">${rows.map((entry, index) => `<div><span></span><p><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.detail || (index === 0 ? 'Most recent' : `${index} step${index === 1 ? '' : 's'} earlier`))}</small></p></div>`).join('') || '<div class="emptyState">No audited case activity yet.</div>'}</div>`;
    }
    function relatedMarkup(item) {
      const people = activeCaseDetail && isLiveReportItem(item)
        ? `<div><span>Reporter</span><strong>${escapeHtml(identityLabel(activeCaseDetail.reporter, 'Unavailable'))}</strong></div><div><span>Reported account</span><strong>${escapeHtml(identityLabel(activeCaseDetail.reported_user, 'Unavailable'))}</strong></div>`
        : '';
      const context = activeCaseDetail?.related_context;
      const related = context
        ? `<div><span>Prior reports on this account</span><strong>${Number(context.prior_reports || 0)}</strong></div><div><span>Other open reports</span><strong>${Number(context.open_reports || 0)}</strong></div><div><span>Prior active enforcement</span><strong>${Number(context.prior_enforcements || 0)}</strong></div>`
        : `<div><span>Related history</span><strong>${item.history?.length || 0} recorded events</strong></div>`;
      return `<div class="relatedList"><div><span>Source</span><strong>${escapeHtml(item.source)}</strong></div><div><span>Queue</span><strong>${escapeHtml(queueLabel(item.queue))}</strong></div>${people}${related}<div><span>Evidence access</span><strong>${item.queue === 'safety' ? 'Restricted · elevated authorization required' : 'Authorized reviewers only'}</strong></div></div>`;
    }

    function renderDrawerTab() {
      if (!activeItem) return;
      clearRenderedEvidence();
      queryAll('[data-drawer-tab]').forEach((button) => {
        const selected = button.dataset.drawerTab === activeDrawerTab;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
      drawerContent.setAttribute('aria-labelledby', `case-tab-${activeDrawerTab}`);
      drawerContent.innerHTML = activeDrawerTab === 'history' ? historyMarkup(activeItem) : activeDrawerTab === 'related' ? relatedMarkup(activeItem) : detailMarkup(activeItem);
      const followupAction = reportFollowupAction(activeItem);
      const decisionEligible = Boolean(followupAction) || (activeItem.status !== 'resolved'
        && (!liveMode || ['moderation', 'safety'].includes(activeItem.queue) || Boolean(activeItem.appeal)));
      byId('decisionPanel').hidden = activeDrawerTab !== 'details' || !decisionEligible;
      queryAll('[data-action="refresh-case-evidence"]', drawerContent).forEach((button) => button.addEventListener('click', () => {
        if (!moderationSubmitting && activeItem) void loadLiveReportCase(activeItem.id, { preserveDraft: true });
      }));
      queryAll('.moderationEvidenceImage, .moderationEvidenceVideo', drawerContent).forEach((evidenceImage) => evidenceImage.addEventListener('error', () => {
        if (!evidenceImage.isConnected) return;
        const unavailable = document.createElement('div');
        unavailable.className = 'moderationEvidenceUnavailable';
        const title = document.createElement('strong');
        title.textContent = 'Protected preview could not be displayed';
        const copy = document.createElement('span');
        copy.textContent = 'Use Refresh evidence to request a fresh authorized preview.';
        unavailable.append(title, copy);
        evidenceImage.replaceWith(unavailable);
      }, { once: true }));
    }

    function clearRenderedEvidence() {
      queryAll('video', drawerContent).forEach((video) => { video.pause(); video.removeAttribute('src'); video.load(); });
      queryAll('img', drawerContent).forEach((img) => img.removeAttribute('src'));
    }

    async function authorizeManifest(manifest) {
      if (!manifest || !Array.isArray(manifest.items) || manifest.items.length > 3) throw new Error('The evidence manifest is incomplete.');
      await Promise.all(manifest.items.map(async (asset) => {
        // URLs are minted locally and never accepted from a queue/JSON payload.
        delete asset.url; delete asset.expiresAt;
        if (asset.availability !== 'available') return;
        if (!['image', 'video'].includes(asset.kind) || !['post-media', 'avatars', 'moderation-evidence'].includes(asset.bucket) || !asset.path) {
          asset.availability = 'invalid_reference'; return;
        }
        const requestedAt = Date.now();
        try { asset.url = await liveClient.signEvidence(asset.bucket, asset.path); asset.expiresAt = requestedAt + 240_000; }
        catch { asset.availability = 'preview_failed'; }
      }));
    }

    function scheduleEvidenceExpiry(revision) {
      clearTimeout(evidenceExpiryTimer);
      const preserved = activeAppealDetail ? activeAppealDetail.original_evidence?.preserved_media_manifest : activeCaseDetail?.preserved_media_manifest;
      const assets = [...(activeCaseDetail?.media_manifest?.items || []), ...(activeAppealDetail?.original_evidence?.media_manifest?.items || []), ...(preserved?.items || [])];
      const expires = assets.filter((item) => item.url).map((item) => item.expiresAt);
      if (!expires.length) return;
      evidenceExpiryTimer = setTimeout(() => {
        if (revision !== caseLoadRevision) return;
        assets.forEach((item) => { if (item.url) { delete item.url; item.availability = 'expired'; } });
        renderDrawerTab();
      }, Math.max(0, Math.min(...expires) - Date.now()));
    }

    function actionConfig(item) {
      if (liveMode) {
        if (item.appeal) {
          if (appealActionBlocker(item)) return [];
          if (liveSession?.capabilities?.moderation_write !== true) return [];
          if (['temporary_restriction', 'permanent_ban'].includes(item.appeal.account_action)
              && liveSession?.capabilities?.restricted_review !== true) return [];
          const isSuperAdmin = Array.isArray(liveSession?.roles) && liveSession.roles.includes('super_admin');
          if (item.appeal.original_decider_id === liveSession?.user_id && !isSuperAdmin) return [];
          return [['uphold_appeal', 'Uphold decision', 'action-warning'], ['reverse_appeal', 'Reverse & restore', 'action-positive']];
        }
        const followupAction = reportFollowupAction(item);
        if (followupAction === 'reopen_case') return [['reopen_case', 'Reopen case', 'action-positive']];
        if (followupAction === 'reclose_case') return [['reclose_case', 'Return to resolved', 'action-positive']];
        const ordinaryReview = item.queue === 'moderation' && liveSession?.capabilities?.moderation_write === true;
        const restrictedReview = item.queue === 'safety' && liveSession?.capabilities?.restricted_review === true;
        if ((!ordinaryReview && !restrictedReview) || !activeCaseDetail) return [];
        const assignedTo = activeCaseDetail.assigned_to || item.assignedTo;
        const isSupervisor = Array.isArray(liveSession?.roles) && liveSession.roles.includes('super_admin');
        if (assignedTo && assignedTo !== liveSession?.user_id && !isSupervisor) return [];
        const evidence = activeCaseDetail.evidence || {};
        const actions = [['no_violation', 'No violation', 'action-positive']];
        if (restrictedReview) {
          const removable = evidence.exists !== false && (
            ['post', 'comment', 'poll_response'].includes(evidence.kind)
            || ((evidence.kind === 'profile_photo' || evidence.kind === 'account_profile') && evidence.has_profile_photo)
          );
          if (removable) actions.push(['confirm_restricted', 'Confirm violation', 'action-critical']);
          return actions;
        }
        if ((evidence.kind === 'profile_photo' || evidence.kind === 'account_profile') && evidence.has_profile_photo) {
          actions.push(['remove_profile_photo', 'Remove photo & warn', 'action-warning']);
        } else if (evidence.exists !== false && ['post', 'comment', 'poll_response'].includes(evidence.kind)) {
          actions.push(['remove_content', 'Remove content & warn', 'action-warning']);
        }
        actions.push(['escalate_restricted', 'Quarantine & escalate', 'action-critical']);
        return actions;
      }
      if (item.queue === 'campaigns') return [['revision', 'Request changes', 'action-neutral'], ['reject', 'Decline', 'action-warning'], ['approve', 'Approve & schedule', 'action-positive']];
      if (item.queue === 'businesses') return [['revision', 'Request information', 'action-neutral'], ['reject', 'Decline access', 'action-warning'], ['approve', 'Verify business', 'action-positive']];
      if (item.queue === 'suggestions') return [['reject', 'Decline', 'action-warning'], ['approve', 'Accept idea', 'action-positive']];
      if (item.queue === 'safety') return [['escalate', 'Escalate', 'action-critical'], ['revision', 'Request information', 'action-neutral'], ['resolve', 'Record resolution', 'action-positive']];
      return [['restore', 'No violation / restore', 'action-positive'], ['escalate', 'Escalate', 'action-critical'], ['resolve', 'Confirm enforcement', 'action-warning']];
    }

    function appealActionBlocker(item) {
      if (!liveMode || !item?.appeal) return null;
      if (!activeAppealDetail || caseLoadError) return { title: 'Verified appeal details required', copy: 'Load the original decision and account consequence before reviewing this appeal.' };
      if (activeAppealDetail.review_eligibility?.can_review !== true) {
        const independent = activeAppealDetail.review_eligibility?.blocked_reason === 'independent_reviewer_required';
        return { title: independent ? 'Independent reviewer required' : 'Appeal cannot be reviewed', copy: independent ? 'You recorded the original decision. Another authorized reviewer must decide this appeal.' : 'This appeal is closed or your current permissions do not allow a decision. Refresh the case to verify its status.' };
      }
      if (liveSession?.capabilities?.moderation_write !== true) {
        return {
          title: 'Moderation access required',
          copy: 'This admin account can view the appeal but cannot decide it. Sign in as a moderator with multi-factor authentication.',
        };
      }
      if (['temporary_restriction', 'permanent_ban'].includes(item.appeal.account_action)
          && liveSession?.capabilities?.restricted_review !== true) {
        return {
          title: 'Restricted reviewer required',
          copy: 'This appeal includes an account restriction. A different Doji admin with MFA and restricted-review access must uphold or reverse it.',
        };
      }
      const isSuperAdmin = Array.isArray(liveSession?.roles) && liveSession.roles.includes('super_admin');
      if (item.appeal.original_decider_id === liveSession?.user_id && !isSuperAdmin) {
        return {
          title: 'Independent reviewer required',
          copy: 'You recorded the original decision, so you cannot decide this appeal. A different Doji admin with MFA and moderation access must sign in, open Legal requests, and choose Uphold decision or Reverse & restore.',
        };
      }
      return null;
    }

    function appealActionNotice(item) {
      const isSuperAdmin = Array.isArray(liveSession?.roles) && liveSession.roles.includes('super_admin');
      if (!liveMode || !item?.appeal || !isSuperAdmin
          || item.appeal.original_decider_id !== liveSession?.user_id) return null;
      return {
        title: 'Super admin authority',
        copy: 'You made the original decision. As Doji super admin, you may still uphold or reverse this appeal. Your fresh rationale and this override are recorded in the immutable audit log.',
      };
    }

    function updateDrawerHeader() {
      if (!activeItem) return;
      byId('drawerHeaderMeta').innerHTML = `<button type="button" class="caseReferenceButton" id="copyCaseReference" title="Copy full reference: ${escapeHtml(activeItem.id)}">${escapeHtml(caseReference(activeItem))} · Copy reference</button><span class="priorityBadge ${priorityClass(activeItem.priority)}">${escapeHtml(activeItem.priority)}</span><span class="statusPill ${statusClass(activeItem.status)}">${escapeHtml(activeItem.label)}</span>`;
      byId('copyCaseReference').onclick = async () => {
        const id = activeItem.id;
        const button = byId('copyCaseReference');
        try { await navigator.clipboard.writeText(id); if (activeItem?.id === id && button.isConnected) button.textContent = 'Reference copied'; }
        catch { if (activeItem?.id === id && button.isConnected) button.textContent = id; }
      };
    }

    function reportFollowupAction(item = activeItem) {
      if (!liveMode || !item || item.appeal || !activeCaseDetail) return null;
      const decision = activeCaseDetail.decision_summary;
      const triage = activeCaseDetail.triage_state || {};
      if (!decision || decision.state !== 'active' || decision.action === 'quarantine' || decision.appeal_status) return null;
      const restricted = triage.queue === 'restricted_safety';
      const canWrite = restricted
        ? liveSession?.capabilities?.restricted_review === true
        : liveSession?.capabilities?.moderation_write === true;
      if (!canWrite) return null;
      if (item.status === 'resolved' && ['dismissed', 'actioned'].includes(triage.report_status || activeCaseDetail.status)) {
        return 'reopen_case';
      }
      if (item.status !== 'resolved' && (triage.report_status || activeCaseDetail.status) === 'pending') {
        const history = Array.isArray(activeCaseDetail.workflow_history) ? activeCaseDetail.workflow_history : [];
        const reopenedAt = history.find((entry) => entry?.action === 'report.reopened')?.occurred_at;
        const reclosedAt = history.find((entry) => entry?.action === 'report.reclosed')?.occurred_at;
        if (reopenedAt && (!reclosedAt || new Date(reopenedAt).getTime() > new Date(reclosedAt).getTime())) return 'reclose_case';
      }
      return null;
    }

    function renderDrawerActions() {
      if (!activeItem) return;
      const moderationControls = byId('moderationTriage');
      const liveModeration = liveMode && activeItem.queue === 'moderation' && !activeItem.appeal && activeItem.status !== 'resolved';
      const liveRestricted = liveMode && activeItem.queue === 'safety' && !activeItem.appeal && activeItem.status !== 'resolved';
      const followupAction = reportFollowupAction(activeItem);
      const liveFollowupReview = followupAction === 'reclose_case';
      const liveReport = (liveModeration || liveRestricted) && !liveFollowupReview;
      const liveAppeal = liveMode && Boolean(activeItem.appeal);
      const appealBlocker = appealActionBlocker(activeItem);
      const appealNotice = appealActionNotice(activeItem);
      byId('decisionPanel').hidden = liveMode && !liveReport && !liveAppeal && !followupAction;
      const actionStatus = byId('moderationActionStatus');
      const actionMessage = appealBlocker || appealNotice;
      actionStatus.hidden = !actionMessage;
      actionStatus.innerHTML = actionMessage
        ? `<strong>${escapeHtml(actionMessage.title)}</strong><p>${escapeHtml(actionMessage.copy)}</p>`
        : '';
      moderationControls.hidden = !liveReport && !liveFollowupReview;
      byId('moderationClassification').hidden = !liveReport;
      byId('moderationNoticeField').hidden = !liveReport;
      byId('moderationAccountOutcomeField').hidden = !liveRestricted;
      byId('moderationRestrictionDaysField').hidden = !liveRestricted
        || byId('moderationAccountOutcome').value !== 'temporary_restriction';
      const reasonLabel = document.querySelector('label[for="decisionReason"]');
      const reasonField = byId('decisionReason');
      byId('decisionReasonField').hidden = Boolean(appealBlocker);
      if (followupAction === 'reopen_case') {
        if (reasonLabel) reasonLabel.textContent = 'Reason for reopening';
        reasonField.placeholder = 'Briefly explain what needs another review, such as new context, a possible error, or a required follow-up.';
      } else if (followupAction === 'reclose_case') {
        if (reasonLabel) reasonLabel.textContent = 'Follow-up summary';
        reasonField.placeholder = 'Summarize what was checked and why the existing decision remains appropriate.';
      } else {
        if (reasonLabel) reasonLabel.textContent = 'Internal rationale';
        reasonField.placeholder = 'Record the policy rule, evidence considered, context, and why this outcome is proportionate.';
      }
      byId('decisionReasonHint').textContent = followupAction
        ? 'Required. Explain why this case needs another review or why the follow-up is complete. Existing enforcement is not changed.'
        : liveAppeal
          ? 'Required. Explain the independent review and the evidence supporting this outcome.'
          : 'Required. This stays in the operator audit record.';
      if (liveReport || liveFollowupReview) {
        const priority = byId('moderationPriority');
        priority.value = activeItem.priority || 'normal';
        priority.dispatchEvent(new Event('change', { bubbles: false }));
        const restrictedFollowup = activeCaseDetail?.triage_state?.queue === 'restricted_safety';
        const canWrite = (liveRestricted || restrictedFollowup)
          ? liveSession?.capabilities?.restricted_review === true
          : liveSession?.capabilities?.moderation_write === true;
        priority.disabled = !activeCaseDetail || !canWrite;
        const claimButton = byId('claimReportButton');
        const assignedTo = activeCaseDetail?.assigned_to || activeItem.assignedTo;
        const isMine = assignedTo && assignedTo === liveSession?.user_id;
        claimButton.textContent = isMine ? 'Release case' : assignedTo ? `Assigned to ${activeItem.owner}` : 'Claim case';
        claimButton.dataset.action = isMine ? 'release-report' : 'claim-report';
        claimButton.disabled = !activeCaseDetail || (Boolean(assignedTo) && !isMine) || !canWrite;
      }
      window.DojiContextualHelp?.enhance(byId('decisionPanel'));
      drawerActions.innerHTML = appealBlocker ? '' : actionConfig(activeItem).map(([action, label, className]) => `<button type="button" class="portalButton ${className}" data-admin-decision="${action}">${label}</button>`).join('');
      queryAll('[data-admin-decision]', drawerActions).forEach((button) => button.addEventListener('click', () => recordDecision(button.dataset.adminDecision)));
    }

    async function loadLiveReportCase(reportId, { preserveDraft = false } = {}) {
      const epoch = workspaceEpoch;
      const revision = ++caseLoadRevision;
      const isAppeal = Boolean(activeItem?.appeal);
      const current = () => epoch === workspaceEpoch && revision === caseLoadRevision && activeItem?.id === reportId;
      clearTimeout(evidenceExpiryTimer);
      activeCaseDetail = null; activeAppealDetail = null; caseLoadError = '';
      if (!moderationSubmitting) { byId('moderationConfirmModal').close(); pendingModerationAction = null; }
      renderDrawerActions(); renderDrawerTab();
      try {
        const response = await (isAppeal ? liveClient.appealCase(reportId) : liveClient.reportCase(reportId));
        if (!current()) return;
        const detail = isAppeal ? response.report_case : response;
        if (detail?.case_contract_version !== 3 || !detail.media_manifest || (!isAppeal && detail.id !== reportId)
          || (isAppeal && (response.case_contract_version !== 1 || response.appeal?.id !== reportId
            || response.appeal.decision_id !== response.original_decision?.id || response.appeal.report_id !== detail.id || !response.review_eligibility))) {
          throw new Error('The complete case service is not available. No decision can be made from an incomplete record.');
        }
        await authorizeManifest(detail.media_manifest);
        if (isAppeal && response.original_evidence?.media_manifest) await authorizeManifest(response.original_evidence.media_manifest);
        const preserved = isAppeal ? response.original_evidence?.preserved_media_manifest : detail.preserved_media_manifest;
        if (preserved) {
          const decisionId = isAppeal ? response.original_decision.id : detail.current_decision?.id;
          if (preserved.source !== 'preserved_decision_media' || preserved.decision_id !== (decisionId || null)) {
            throw new Error('The preserved evidence does not match this decision. Refresh the case before reviewing.');
          }
          await authorizeManifest(preserved);
        }
        if (!current()) return;
        activeCaseDetail = detail;
        if (isAppeal) {
          activeAppealDetail = response;
          activeItem = { ...activeItem, appeal: { ...response.appeal,
            account_action: response.original_decision.account_action,
            original_decider_id: response.original_decision.original_decider_id },
            label: titleCase(response.appeal.status), visibility: `Original decision: ${titleCase(response.original_decision.state)}` };
          updateDrawerHeader(); renderDrawerActions(); renderDrawerTab(); scheduleEvidenceExpiry(revision);
          return;
        }
        const policy = byId('moderationPolicy');
        const previousPolicy = policy.value;
        const catalog = Array.isArray(detail.policy_catalog) ? detail.policy_catalog : [];
        policy.innerHTML = `<option value="">Choose a policy</option>${catalog.map((entry) => `<option value="${escapeHtml(entry.code)}">${escapeHtml(entry.label)}</option>`).join('')}`;
        const policyLabel = document.querySelector('label[for="moderationPolicy"]');
        if (policyLabel) policyLabel.textContent = 'Policy decision';
        let policyHint = byId('moderationPolicyHint');
        if (!policyHint) {
          policyHint = document.createElement('small');
          policyHint.id = 'moderationPolicyHint';
          policyHint.setAttribute('data-context-help', '');
          policy.insertAdjacentElement('afterend', policyHint);
        }
        const suggestedPolicy = String(detail.suggested_policy_code || '');
        const suggestionExists = catalog.some((entry) => entry.code === suggestedPolicy);
        policy.value = preserveDraft ? previousPolicy : suggestionExists ? suggestedPolicy : '';
        policy.dispatchEvent(new Event('change', { bubbles: false }));
        policyHint.textContent = suggestionExists
          ? 'Suggested from the member report. Confirm independently after reviewing the evidence.'
          : 'Confirm the applicable policy after reviewing the evidence.';
        activeItem = {
          ...activeItem,
          priority: detail.priority || activeItem.priority,
          owner: detail.owner ? identityLabel(detail.owner, 'Assigned') : 'Unassigned',
          visibility: contentStateLabel(detail),
          assignedTo: detail.assigned_to || null,
          queue: detail.queue === 'restricted_safety' ? 'safety' : 'moderation',
          status: detail.status === 'pending' ? (detail.queue === 'restricted_safety' ? 'urgent' : 'open') : 'resolved',
          label: detail.status === 'pending' ? (detail.queue === 'restricted_safety' ? 'Restricted' : 'Pending') : titleCase(detail.status),
          history: Array.isArray(detail.history) ? detail.history : [],
        };
        updateDrawerHeader();
        renderDrawerActions();
        renderDrawerTab();
        scheduleEvidenceExpiry(revision);
      } catch (error) {
        if (!current()) return;
        activeCaseDetail = null; activeAppealDetail = null;
        caseLoadError = error instanceof Error ? error.message : 'Try again.';
        activeDrawerTab = 'details';
        renderDrawerActions(); renderDrawerTab();
      }
    }

    function openDrawer(item) {
      setDecisionError('');
      if (!item) return;
      if (editorial && item.queue === 'suggestions') return editorial.open('suggestions', item.id);
      activeItem = applyOverrides(item);
      ++caseLoadRevision; clearTimeout(evidenceExpiryTimer);
      activeCaseDetail = null; activeAppealDetail = null; caseLoadError = '';
      activeDrawerTab = 'details';
      byId('drawerEyebrow').textContent = queueLabel(activeItem.queue);
      byId('drawerTitle').textContent = caseLabel(activeItem);
      updateDrawerHeader();
      byId('decisionReason').value = '';
      byId('moderationUserNotice').value = '';
      byId('moderationPolicy').value = '';
      byId('moderationPolicy').dispatchEvent(new Event('change', { bubbles: false }));
      if (byId('moderationPolicyHint')) byId('moderationPolicyHint').textContent = 'Confirm the applicable policy after reviewing the evidence.';
      byId('moderationSeverity').value = '';
      byId('moderationSeverity').dispatchEvent(new Event('change', { bubbles: false }));
      byId('moderationAccountOutcome').value = 'warning';
      byId('moderationRestrictionDays').value = '7';
      renderDrawerActions();
      renderDrawerTab();
      drawer.classList.add('open'); drawerBackdrop.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
      if (liveMode && ['moderation', 'safety'].includes(activeItem.queue)) {
        return loadLiveReportCase(activeItem.id);
      }
    }
    function closeDrawer() { window.DojiContextualHelp?.close(); ++caseLoadRevision; clearTimeout(evidenceExpiryTimer); clearRenderedEvidence(); drawerContent.textContent = ''; drawer.classList.remove('open'); drawerBackdrop.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); activeItem = null; activeCaseDetail = null; activeAppealDetail = null; caseLoadError = ''; }

    function writeBusinessDecision(item, action) {
      if (item.queue !== 'campaigns' || !item.businessStorageKey) return;
      const campaigns = readStorage(item.businessStorageKey, []);
      const campaign = campaigns.find((entry) => entry.id === item.campaignId);
      const doji = campaign?.dojis?.find((entry) => entry.id === item.id);
      if (!doji) return;
      if (action === 'approve') { doji.status = 'approved'; doji.label = 'Scheduled'; }
      if (action === 'revision') { doji.status = 'review'; doji.label = 'Changes requested'; }
      if (action === 'reject') { doji.status = 'rejected'; doji.label = 'Declined'; }
      localStorage.setItem(item.businessStorageKey, JSON.stringify(campaigns));
    }

    function commandKey(scope, entityId) {
      const randomPart = typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return `admin:${scope}:${entityId}:${randomPart}`;
    }

    function setDecisionError(message, confirmation = false) {
      const id = confirmation ? 'moderationConfirmError' : 'decisionError';
      let element = byId(id);
      if (!element) {
        element = document.createElement('div');
        element.id = id;
        element.className = 'portalCommandError';
        element.setAttribute('role', 'alert');
        element.setAttribute('aria-atomic', 'true');
        if (confirmation) byId('moderationConfirmModal').querySelector('.modalBody').append(element);
        else drawerActions.before(element);
      }
      element.hidden = !message;
      element.textContent = message;
      if (message) element.scrollIntoView({ block: 'nearest' });
    }

    function decisionCommandKey(scope, entityId) {
      const values = ['decisionReason','moderationPolicy','moderationSeverity','moderationUserNotice','moderationAccountOutcome','moderationRestrictionDays']
        .map((id) => byId(id).value.trim());
      const fingerprint = JSON.stringify([scope, entityId, ...values]);
      if (moderationIntent?.fingerprint !== fingerprint) moderationIntent = { fingerprint, key: commandKey(scope, entityId) };
      return moderationIntent.key;
    }

    function commandFailureMessage(error, fallback) {
      if (['TimeoutError', 'AbortError', 'TypeError'].includes(error?.name)) {
        return 'We could not confirm whether this action was saved. Retry the unchanged action to check its outcome safely.';
      }
      return error instanceof Error ? error.message : fallback;
    }

    async function runLiveTriage(action, priority = null) {
      if (triageSubmitting) return;
      if (!activeItem || !activeCaseDetail || !['moderation', 'safety'].includes(activeItem.queue)) return;
      const epoch = workspaceEpoch;
      triageSubmitting = true;
      setDecisionError('');
      const reportId = activeItem.id;
      const note = byId('decisionReason').value.trim();
      const fingerprint = JSON.stringify([reportId, action, priority, note]);
      if (triageIntent?.fingerprint !== fingerprint) triageIntent = { fingerprint, key: commandKey(`triage:${action}`, reportId) };
      let committed = false;
      const controls = [byId('claimReportButton'), byId('moderationPriority')];
      controls.forEach((control) => { control.disabled = true; });
      try {
        await liveClient.triageReport({
          reportId,
          action,
          priority,
          note: note || null,
          idempotencyKey: triageIntent.key,
        });
        if (epoch !== workspaceEpoch) return;
        committed = true;
        triageIntent = null;
        await refreshLiveData();
        if (epoch !== workspaceEpoch || !activeItem || activeItem.id !== reportId) return;
        const refreshedItem = getItem(reportId);
        if (refreshedItem) activeItem = refreshedItem;
        activeCaseDetail = null;
        updateDrawerHeader();
        renderDrawerActions();
        renderDrawerTab();
        await loadLiveReportCase(reportId);
        if (epoch !== workspaceEpoch) return;
        showToast(action === 'claim' ? 'Case assigned to you.' : action === 'release' ? 'Case returned to the unassigned queue.' : 'Case priority updated.');
      } catch (error) {
        if (epoch !== workspaceEpoch) return;
        setDecisionError(committed ? 'The case update was saved, but its refreshed state is unavailable. Close and reopen this case before taking another action.' : commandFailureMessage(error, 'The case could not be updated.'));
        if (committed) activeCaseDetail = null;
        renderDrawerActions();
      } finally {
        if (epoch === workspaceEpoch) triageSubmitting = false;
      }
    }

    function moderationActionCopy(action) {
      if (action === 'reopen_case') {
        return ['Reopen case for follow-up review', 'The case will return to active work and be assigned to you. The existing content removal, warning, notices, and appeal eligibility stay unchanged.'];
      }
      if (action === 'reclose_case') {
        return ['Complete follow-up review', 'The case will return to the resolved archive with its existing moderation decision unchanged.'];
      }
      if (activeItem?.queue === 'safety' && ['remove_content', 'remove_profile_photo'].includes(action)) {
        const accountOutcome = byId('moderationAccountOutcome').value;
        if (accountOutcome === 'permanent_ban') {
          return ['Remove content and permanently suspend account', 'The reported content and the member’s other public content will be hidden without deletion. Account access remains suspended unless an independent appeal reverses this decision.'];
        }
        if (accountOutcome === 'temporary_restriction') {
          const days = byId('moderationRestrictionDays').value;
          return ['Remove content and temporarily restrict account', `The reported content will be removed and account writes will be blocked for ${days} day${days === '1' ? '' : 's'}. Access returns automatically using server time.`];
        }
        return ['Remove content and issue warning', 'The reported content will be removed, the account will remain active, and the member can appeal the warning.'];
      }
      return ({
        no_violation: ['Record no violation', 'The report will be dismissed. If restricted review had quarantined this item, that item will be restored.'],
        remove_content: ['Remove content and issue warning', 'The item will be hidden everywhere but retained for audit and appeal. The account stays active and receives a warning and notice.'],
        remove_profile_photo: ['Remove profile photo and issue warning', 'The public avatar will return to the default while the original remains preserved for an eligible appeal.'],
        escalate_restricted: ['Quarantine and escalate', 'The item will be hidden immediately and the open case will move to restricted safety review. This is not a final violation decision.'],
        uphold_appeal: ['Uphold original decision', 'The original action will remain in place after this independent review.'],
        reverse_appeal: ['Reverse decision and restore', 'The decision and warning will be reversed, and the affected content will be restored when restoration is possible.'],
      })[action] || ['Confirm decision', 'This moderation decision will be recorded.'];
    }

    async function executeLiveDecision() {
      if (!pendingModerationAction || !activeItem || moderationSubmitting) return;
      if (activeItem.appeal && appealActionBlocker(activeItem)) { setDecisionError('Refresh the appeal details before deciding it.', true); return; }
      const epoch = workspaceEpoch;
      moderationSubmitting = true;
      setDecisionError('', true);
      const reportId = activeItem.id;
      const action = pendingModerationAction;
      const wasAppeal = Boolean(activeItem.appeal);
      const reason = byId('decisionReason').value.trim();
      const submit = byId('moderationConfirmSubmit');
      submit.disabled = true;
      submit.textContent = 'Recording…';
      queryAll('[data-action="cancel-moderation-confirm"]').forEach((button) => { button.disabled = true; });
      byId('moderationConfirmForm').setAttribute('aria-busy', 'true');
      let committed = false;
      try {
        if (action === 'reopen_case' || action === 'reclose_case') {
          await liveClient.setReportReviewState({
            reportId,
            action: action === 'reopen_case' ? 'reopen' : 'reclose',
            reason,
            idempotencyKey: decisionCommandKey(`review-state:${action}`, reportId),
          });
        } else if (activeItem.appeal) {
          await liveClient.decideAppeal({
            appealId: activeItem.appeal.id,
            outcome: action === 'reverse_appeal' ? 'reverse' : 'uphold',
            reason,
            idempotencyKey: decisionCommandKey(`appeal:${action}`, activeItem.appeal.id),
          });
        } else {
          const noViolation = action === 'no_violation';
          const restrictedReview = activeItem.queue === 'safety';
          const accountAction = restrictedReview && !noViolation
            ? byId('moderationAccountOutcome').value
            : null;
          await liveClient.decideReport({
            reportId,
            action,
            policyCode: noViolation ? 'no_violation' : byId('moderationPolicy').value,
            severity: noViolation ? 'none' : byId('moderationSeverity').value,
            reason,
            userNotice: noViolation
              ? 'We reviewed this report and found no policy violation.'
              : byId('moderationUserNotice').value.trim(),
            accountAction,
            restrictionDays: accountAction === 'temporary_restriction'
              ? Number(byId('moderationRestrictionDays').value)
              : null,
            idempotencyKey: decisionCommandKey(`decision:${action}`, reportId),
          });
        }
        if (epoch !== workspaceEpoch) return;
        committed = true;
        moderationIntent = null;
        byId('moderationConfirmModal').close();
        pendingModerationAction = null;
        closeDrawer();
        await refreshLiveData();
        if (epoch !== workspaceEpoch) return;
        showToast(action === 'reopen_case'
          ? 'Case reopened for follow-up review. Existing enforcement is unchanged.'
          : action === 'reclose_case'
            ? 'Follow-up review completed. Existing enforcement is unchanged.'
            : wasAppeal ? 'Appeal decision recorded.' : 'Moderation decision recorded and the queue is up to date.');
      } catch (error) {
        if (epoch !== workspaceEpoch) return;
        if (committed) {
          savedCommandNotice = 'Decision saved. The queue could not be refreshed. Do not submit it again; reopen the portal to load the latest state.';
          renderDataHealthBanner();
        } else {
          setDecisionError(commandFailureMessage(error, 'The moderation decision could not be recorded. Retry the same decision to safely check its outcome.'), true);
        }
      } finally {
        if (epoch === workspaceEpoch) {
          moderationSubmitting = false;
          submit.disabled = false;
          submit.textContent = 'Confirm decision';
          queryAll('[data-action="cancel-moderation-confirm"]').forEach((button) => { button.disabled = false; });
          byId('moderationConfirmForm').removeAttribute('aria-busy');
        }
      }
    }

    function recordDecision(action) {
      if (!activeItem) return;
      if (moderationSubmitting) return;
      setDecisionError('');
      setDecisionError('', true);
      const note = byId('decisionReason').value.trim();
      if (liveMode) {
        if (action === 'reopen_case' || action === 'reclose_case') {
          if (reportFollowupAction(activeItem) !== action) {
            setDecisionError('This case is no longer eligible for that review action.');
            return;
          }
          if (note.length < 10) {
            setDecisionError('Add a review reason of at least 10 characters.');
            byId('decisionReason').focus();
            return;
          }
          pendingModerationAction = action;
          const [title, copy] = moderationActionCopy(action);
          byId('moderationConfirmTitle').textContent = title;
          byId('moderationConfirmCopy').textContent = copy;
          byId('moderationConfirmSummary').innerHTML = `<span><strong>Case</strong>${escapeHtml(activeItem.id)}</span><span><strong>Review reason</strong>${escapeHtml(note)}</span><span><strong>Enforcement</strong>Unchanged</span>`;
          byId('moderationConfirmSubmit').classList.remove('danger');
          byId('moderationConfirmSubmit').classList.add('primary');
          byId('moderationConfirmModal').showModal();
          return;
        }
        const ordinaryReview = activeItem.queue === 'moderation'
          && liveSession?.capabilities?.moderation_write === true;
        const restrictedReview = activeItem.queue === 'safety'
          && liveSession?.capabilities?.restricted_review === true;
        if (!activeItem.appeal && !ordinaryReview && !restrictedReview) {
          setDecisionError('This operational area remains read only.');
          return;
        }
        if (activeItem.appeal && liveSession?.capabilities?.moderation_write !== true) {
          setDecisionError('This operational area remains read only.');
          return;
        }
        if (activeItem.appeal
            && ['temporary_restriction', 'permanent_ban'].includes(activeItem.appeal.account_action)
            && liveSession?.capabilities?.restricted_review !== true) {
          setDecisionError('Restricted safety authorization is required for this appeal.');
          return;
        }
        if (note.length < 10) {
          setDecisionError('Add a decision reason of at least 10 characters.');
          byId('decisionReason').focus();
          return;
        }
        if (!activeItem.appeal && action !== 'no_violation') {
          if (!byId('moderationPolicy').value) {
            setDecisionError('Choose the policy area before recording this action.');
            byId('moderationPolicy').focus();
            return;
          }
          if (!byId('moderationSeverity').value) {
            setDecisionError('Choose a severity before recording this action.');
            byId('moderationSeverity').focus();
            return;
          }
          const notice = byId('moderationUserNotice').value.trim();
          if (notice.length < 10) {
            setDecisionError('Add the plain-language notice the member will receive.');
            byId('moderationUserNotice').focus();
            return;
          }
          if (ordinaryReview && action !== 'escalate_restricted' && byId('moderationSeverity').value === 'level_3') {
            setDecisionError('Level 3 cases must be quarantined and escalated for restricted review.');
            return;
          }
          if (restrictedReview && byId('moderationSeverity').value === 'level_1') {
            setDecisionError('Restricted review requires a Level 2 or Level 3 classification.');
            return;
          }
        }
        let commandAction = action;
        if (action === 'confirm_restricted') {
          const evidence = activeCaseDetail?.evidence || {};
          commandAction = evidence.kind === 'profile_photo' || evidence.kind === 'account_profile'
            ? 'remove_profile_photo'
            : 'remove_content';
        }
        pendingModerationAction = commandAction;
        const [title, copy] = moderationActionCopy(commandAction);
        byId('moderationConfirmTitle').textContent = title;
        byId('moderationConfirmCopy').textContent = copy;
        const classification = activeItem.appeal || action === 'no_violation'
          ? ''
          : `<span><strong>Classification</strong>${escapeHtml(byId('moderationPolicy').selectedOptions[0]?.textContent || '')} · ${escapeHtml(byId('moderationSeverity').selectedOptions[0]?.textContent || '')}</span>`;
        const accountOutcome = restrictedReview && commandAction !== 'no_violation'
          ? `<span><strong>Account outcome</strong>${escapeHtml(byId('moderationAccountOutcome').selectedOptions[0]?.textContent || '')}</span>`
          : '';
        const superAdminOverride = activeItem.appeal
          && activeItem.appeal.original_decider_id === liveSession?.user_id
          && Array.isArray(liveSession?.roles) && liveSession.roles.includes('super_admin')
          ? '<span><strong>Review authority</strong>Super admin override · fully audited</span>'
          : '';
        byId('moderationConfirmSummary').innerHTML = `<span><strong>Case</strong>${escapeHtml(activeItem.id)}</span>${classification}${accountOutcome}${superAdminOverride}<span><strong>Decision reason</strong>${escapeHtml(note)}</span>`;
        byId('moderationConfirmSubmit').classList.toggle('danger', ['remove_content', 'remove_profile_photo', 'escalate_restricted'].includes(commandAction));
        byId('moderationConfirmSubmit').classList.toggle('primary', !['remove_content', 'remove_profile_photo', 'escalate_restricted'].includes(commandAction));
        byId('moderationConfirmModal').showModal();
        return;
      }
      if (!note && ['revision', 'reject', 'resolve', 'escalate'].includes(action)) { showToast('Add an internal decision note before recording this action.'); byId('decisionReason').focus(); return; }
      const outcome = {
        approve: { status: 'approved', label: activeItem.queue === 'suggestions' ? 'Accepted' : activeItem.queue === 'businesses' ? 'Verified' : 'Scheduled', owner: currentOperator },
        revision: { status: 'revision', label: activeItem.queue === 'businesses' ? 'Information requested' : 'Changes requested', owner: currentOperator },
        reject: { status: 'resolved', label: activeItem.queue === 'suggestions' ? 'Declined' : 'Declined', owner: currentOperator },
        resolve: { status: 'resolved', label: 'Resolved', owner: currentOperator },
        restore: { status: 'resolved', label: 'Restored', visibility: 'Restored', owner: currentOperator },
        escalate: { status: 'urgent', label: 'Escalated', priority: 'critical', owner: currentOperator },
      }[action];
      if (!outcome) return;
      const state = readAdminState();
      state.overrides[activeItem.id] = { ...(state.overrides[activeItem.id] || {}), ...outcome, history: [`${outcome.label} by ${currentOperator}${note ? `: ${note}` : ''}`, ...(activeItem.history || [])] };
      state.audit.unshift({ id: `AUD-${Date.now()}`, type: 'decision', actor: currentOperator, action: outcome.label, entity: `${activeItem.id} · ${activeItem.subject}`, detail: note || 'Prototype decision recorded', time: 'Just now' });
      saveAdminState(state);
      writeBusinessDecision(activeItem, action);
      closeDrawer(); renderAll(); showToast(`${outcome.label} recorded locally and added to the audit log.`);
    }

    function renderGlobalSearch(term = '') {
      const normalized = term.trim().toLowerCase();
      const results = normalized ? allWork().filter((item) => [item.id, item.subject, item.secondary, item.category].join(' ').toLowerCase().includes(normalized)).slice(0, 8) : allWork().filter((item) => ['critical', 'high'].includes(item.priority)).slice(0, 5);
      byId('globalSearchResults').innerHTML = `<p class="searchSectionLabel">${normalized ? 'Matching work' : 'Suggested priority work'}</p>${results.map((item) => `<button type="button" data-global-work-id="${escapeHtml(item.id)}"><span class="searchResultIcon">${escapeHtml(queueLabel(item.queue).charAt(0))}</span><span><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.id)} · ${escapeHtml(queueLabel(item.queue))}</small></span><span class="statusPill ${statusClass(item.status)}">${escapeHtml(item.label)}</span></button>`).join('') || '<div class="emptyState">No matching work found.</div>'}`;
      queryAll('[data-global-work-id]').forEach((button) => button.addEventListener('click', () => { globalSearchModal.close(); openDrawer(getItem(button.dataset.globalWorkId)); }));
    }

    function openGlobalSearch() {
      if (liveMode && (!liveSession || !liveClient?.hasSession() || app.hidden)) return;
      renderGlobalSearch(); globalSearchModal.showModal(); setTimeout(() => byId('globalSearchInput').focus(), 0);
    }

    async function completeLiveSignin() {
      const epoch = workspaceEpoch;
      try {
        await refreshLiveData();
      } catch (error) {
        // MFA has consumed its enrollment; never offer the completed QR form again.
        resetAdminAuth();
        throw new Error(`Sign-in verified, but portal access could not be loaded. ${error instanceof Error ? error.message : 'Please sign in again.'}`);
      }
      if (epoch !== workspaceEpoch || !liveSession || !liveClient.hasSession()) return;
      void startLiveRealtime();
      startSessionGuard();
      setSigninStatus('');
      enterDemo(liveSession.capabilities?.operations_read ? 'overview' : 'inbox');
    }

    function clearProtectedWorkspace() {
      workspaceEpoch += 1;
      editorial?.clear();
      safetyRemoval?.clear();
      businessReview?.clear();
      businessPrivacy?.clear();
      if (liveRefreshTimer) clearTimeout(liveRefreshTimer);
      if (auditSearchTimer) clearTimeout(auditSearchTimer);
      if (queueSearchTimer) clearTimeout(queueSearchTimer);
      if (sessionExpiryTimer) clearInterval(sessionExpiryTimer);
      liveRefreshTimer = null; auditSearchTimer = null;
      sessionExpiryTimer = null;
      closeDrawer();
      queryAll('dialog[open]').forEach((dialog) => dialog.close());
      pendingModerationAction = null;
      moderationSubmitting = false; triageSubmitting = false;
      moderationIntent = null; triageIntent = null; savedCommandNotice = '';
      operatorSubmitting = false; operatorIntent = null; auditExporting = false; ++auditDetailRevision;
      queryAll('#operatorRoleForm input, #operatorRoleForm select, #operatorRoleForm textarea, #operatorRoleForm button, [data-action="export-audit"], [data-action="claim-next"]').forEach((control) => { control.disabled = false; });
      byId('operatorRoleStatus').textContent = '';
      byId('operatorRoleForm').removeAttribute('aria-busy');
      queryAll('.portalCommandError').forEach((element) => { element.textContent = ''; element.hidden = true; });
      queryAll('#moderationConfirmModal button').forEach((button) => { button.disabled = false; });
      byId('moderationConfirmForm').removeAttribute('aria-busy');
      byId('moderationConfirmSubmit').textContent = 'Confirm decision';
      activePages = {}; queueWindows = {}; refreshAgain = false;
      liveSession = null; liveSnapshot = null; liveWork = []; liveAppeals = [];
      liveResolvedReports = []; resolvedArchiveCursor = null;
      liveAudit = []; auditCursor = null; livePlatformHealth = null; livePlatformHealthHistory = null;
      liveOperators = []; liveDataErrors = {}; liveLastUpdatedAt = null;
      queryAll('[data-queue-body]').forEach((element) => { element.textContent = ''; });
      ['drawerContent', 'drawerActions', 'drawerTitle', 'drawerHeaderMeta', 'auditList', 'globalSearchResults', 'priorityQueue', 'operatorList', 'announcementList', 'queueHealth', 'todaysSchedule'].forEach((id) => { if (byId(id)) byId(id).textContent = ''; });
      queryAll('.opsGrid, #auditDetailBody').forEach((element) => { element.textContent = ''; });
      ['auditDetailTitle','auditDetailActions','moderationConfirmSummary','moderationConfirmCopy','drawerEyebrow'].forEach((id) => { if (byId(id)) byId(id).textContent = ''; });
      queryAll('[data-active-paging]').forEach((element) => element.remove());
      queryAll('#caseDrawer input, #caseDrawer textarea, #globalSearchInput, #auditSearch').forEach((element) => { element.value = ''; });
      queryAll('dialog form, #operatorRoleForm').forEach((form) => form.reset());
      for (const key of Object.keys(queueSearch)) queueSearch[key] = '';
      auditSearchTerm = ''; currentOperator = 'Signed out';
      byId('operatorName').textContent = ''; byId('operatorRole').textContent = '';
      exitDemo();
    }

    function expireLiveSession(message = 'Your protected admin session expired. Sign in again to continue.') {
      if (!liveMode) return;
      liveClient?.clearSession();
      clearProtectedWorkspace();
      showAdminAuthStep('credentials');
      setSigninStatus(message, 'error');
    }

    function startSessionGuard() {
      if (!liveMode || !liveClient) return;
      if (sessionExpiryTimer) clearInterval(sessionExpiryTimer);
      const healthSignature = () => JSON.stringify(platformHealthStatus());
      let lastHealthSignature = healthSignature();
      sessionExpiryTimer = setInterval(() => {
        if (!liveClient.hasSession()) expireLiveSession();
        else if (lastHealthSignature !== healthSignature()) {
          lastHealthSignature = healthSignature();
          renderMetrics();
          renderOperations();
        }
      }, 60_000);
    }

    function recordAdminActivity() {
      if (!liveMode || !liveSession || app.hidden) return;
      const now = Date.now();
      if (now - lastActivityPersistedAt < 30_000) return;
      lastActivityPersistedAt = now;
      liveClient.noteActivity?.();
    }

    function showAdminAuthStep(step) {
      employeeRegisterForm.hidden = !employeeMode || independentEmployeeMode || step !== 'register';
      employeeRegisterToggle.hidden = !employeeMode || independentEmployeeMode || step !== 'credentials';
      byId('employeeResendVerification').hidden = !employeeMode || independentEmployeeMode || step !== 'credentials';
      adminSigninForm.hidden = step !== 'credentials';
      adminMfaChallengeForm.hidden = step !== 'challenge';
      adminMfaSetup.hidden = step !== 'enrollment';
    }

    function resetAdminAuth() {
      liveClient?.clearSession();
      clearProtectedWorkspace();
      showAdminAuthStep('credentials');
      adminMfaChallengeForm.reset();
      adminTotpVerifyForm.reset();
      adminTotpEnrollment.hidden = true;
      byId('adminTotpQr').removeAttribute('src');
      byId('adminTotpSecret').textContent = '';
      setSigninStatus('');
      setTimeout(() => { if (!adminSigninForm.hidden) byId('adminEmail').focus(); }, 0);
    }

    employeeRegisterToggle.addEventListener('click', () => {
      window.location.assign('/employee-setup/');
    });
    byId('employeeResendVerification').addEventListener('click', async (event) => {
      if (!employeeMode || !liveClient) return;
      const email = byId('adminEmail');
      if (!email.reportValidity()) { email.focus(); return; }
      const button = event.currentTarget;
      button.disabled = true;
      setSigninStatus('Requesting a verification email…');
      try {
        const result = await liveClient.resendEmployeeVerification(email.value.trim());
        setSigninStatus(result.message);
      } catch (error) {
        setSigninStatus(error instanceof Error ? error.message : 'Employee verification is unavailable.', 'error');
      } finally { button.disabled = false; }
    });
    employeeRegisterForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!employeeMode || !liveClient) return;
      const submit = employeeRegisterForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      setSigninStatus('Creating your employee account…');
      try {
        await liveClient.registerEmployee(byId('employeeDisplayName').value.trim(), byId('employeeEmail').value.trim(), byId('employeePassword').value);
        employeeRegisterForm.reset();
        showAdminAuthStep('credentials');
        setSigninStatus('If this is a new work email, check it for a verification link. Then sign in here to request administrator approval. Existing personal accounts are not changed.');
      } catch (error) {
        setSigninStatus(error instanceof Error ? error.message : 'Registration could not be completed.', 'error');
      } finally {
        byId('employeePassword').value = '';
        submit.disabled = false;
      }
    });
    adminSigninForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!liveMode) { renderAll(); enterDemo(); return; }
      if (!liveClient) { setSigninStatus('The production portal configuration is incomplete.', 'error'); return; }
      const submit = adminSigninForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      setSigninStatus(employeeMode ? 'Verifying your employee account…' : 'Verifying your Doji account…');
      try {
        const result = await liveClient.signIn(byId('adminEmail').value.trim(), byId('adminPassword').value);
        if (result.authenticated) {
          await completeLiveSignin();
        } else if (result.requiresEnrollment) {
          showAdminAuthStep('enrollment');
          setSigninStatus('Creating your secure authenticator QR code…');
          const enrollment = await liveClient.enrollTotp();
          if (!enrollment.qrCode || !enrollment.secret) throw new Error('Doji authentication did not return a complete setup code. Try again.');
          byId('adminTotpQr').src = enrollment.qrCode;
          byId('adminTotpSecret').textContent = enrollment.secret;
          adminTotpEnrollment.hidden = false;
          setSigninStatus('');
          setTimeout(() => byId('adminTotpCode').focus(), 0);
        } else if (result.requiresChallenge) {
          showAdminAuthStep('challenge');
          byId('adminMfaChallengeDescription').textContent = result.method === 'phone'
            ? 'Enter the six-digit code sent to your verified phone.'
            : 'Enter the current six-digit code from your authenticator app.';
          setSigninStatus('');
          setTimeout(() => byId('adminChallengeCode').focus(), 0);
        }
      } catch (error) {
        liveClient.clearSession();
        showAdminAuthStep('credentials');
        setSigninStatus(error instanceof Error ? error.message : 'Sign in failed.', 'error');
      } finally {
        submit.disabled = false;
      }
    });
    adminMfaChallengeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = adminMfaChallengeForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      setSigninStatus('Verifying your code…');
      try {
        await liveClient.verifyPendingChallenge(byId('adminChallengeCode').value);
        await completeLiveSignin();
      } catch (error) {
        setSigninStatus(error instanceof Error ? error.message : 'The verification code could not be confirmed.', 'error');
      } finally {
        submit.disabled = false;
      }
    });
    adminTotpVerifyForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = adminTotpVerifyForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      setSigninStatus('Finishing authenticator setup…');
      try {
        await liveClient.verifyTotpEnrollment(byId('adminTotpCode').value);
        await completeLiveSignin();
      } catch (error) {
        setSigninStatus(error instanceof Error ? error.message : 'The authenticator code could not be verified.', 'error');
      } finally {
        submit.disabled = false;
      }
    });
    queryAll('[data-action="admin-auth-back"]').forEach((button) => button.addEventListener('click', resetAdminAuth));
    queryAll('[data-queue-filters]').forEach((container) => container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-queue-filter]'); if (!button) return;
      queryAll('[data-queue-filter]', container).forEach((item) => item.classList.toggle('active', item === button));
      queueWindows[container.dataset.queueFilters] = { offset: 0, back: [] };
      queueFilters[container.dataset.queueFilters] = button.dataset.queueFilter; queueChanged(container.dataset.queueFilters);
    }));
    queryAll('[data-queue-search]').forEach((input) => input.addEventListener('input', () => { queueSearch[input.dataset.queueSearch] = input.value; queueChanged(input.dataset.queueSearch, true); }));
    byId('globalQueueSearch').addEventListener('input', (event) => { queueSearch.inbox = event.target.value; queueChanged('inbox', true); });
    byId('inboxTypeFilter').addEventListener('change', () => queueChanged('inbox'));
    document.addEventListener('portal:view', (event) => {
      if (event.detail === 'businesses' && (businessReviewEnabled || adminConfig.businessPrivacyEnabled === true)) { reconcileBusinessReview(); return; }
      if (liveMode && liveSession && !(editorial && event.detail === 'suggestions')) void loadActiveQueue(event.detail);
    });
    byId('loadMoreResolved')?.addEventListener('click', () => { void loadMoreResolvedReports(); });
    byId('loadMoreAudit')?.addEventListener('click', () => { void loadMoreAuditEvents(); });
    query('[data-action="claim-next"]')?.addEventListener('click', async () => {
      if (liveMode) {
        if (triageSubmitting || !liveSession?.capabilities?.moderation_write) return;
        const button = query('[data-action="claim-next"]');
        if (button.disabled) return;
        const epoch = workspaceEpoch;
        const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
        const next = allWork()
          .filter((item) => item.queue === 'moderation' && item.owner === 'Unassigned')
          .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])[0];
        if (!next) { showToast('There are no unassigned reports in this page.'); return; }
        button.disabled = true;
        try {
          await openDrawer(next);
          if (epoch !== workspaceEpoch || activeItem?.id !== next.id || !activeCaseDetail) return;
          if (activeCaseDetail.assigned_to || activeItem.assignedTo || activeItem.status === 'resolved') {
            setDecisionError('This report is no longer unassigned open work. Review its current state.');
            return;
          }
          await runLiveTriage('claim');
        } finally {
          if (epoch === workspaceEpoch) button.disabled = false;
        }
        return;
      }
      const next = allWork().filter((item) => item.owner === 'Unassigned' && !['approved', 'resolved', 'draft'].includes(item.status)).sort((a, b) => (({ critical: 0, high: 1, normal: 2, low: 3 }[a.priority] ?? 4) - ({ critical: 0, high: 1, normal: 2, low: 3 }[b.priority] ?? 4)) || ((Date.parse(a.deadlineAt) || Infinity) - (Date.parse(b.deadlineAt) || Infinity)))[0];
      if (!next) { showToast('There is no unassigned work in the current prototype.'); return; }
      const state = readAdminState(); state.overrides[next.id] = { ...(state.overrides[next.id] || {}), owner: currentOperator }; saveAdminState(state); renderAll(); openDrawer(getItem(next.id)); showToast(`${next.id} assigned to you.`);
    });
    byId('claimReportButton')?.addEventListener('click', () => {
      void runLiveTriage(byId('claimReportButton').dataset.action === 'release-report' ? 'release' : 'claim');
    });
    byId('moderationPriority')?.addEventListener('change', (event) => {
      if (!liveMode || !activeCaseDetail || event.target.value === activeItem?.priority) return;
      void runLiveTriage('set_priority', event.target.value);
    });
    byId('moderationAccountOutcome')?.addEventListener('change', () => {
      byId('moderationRestrictionDaysField').hidden = activeItem?.queue !== 'safety'
        || byId('moderationAccountOutcome').value !== 'temporary_restriction';
    });
    byId('moderationConfirmForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void executeLiveDecision();
    });
    queryAll('[data-action="cancel-moderation-confirm"]').forEach((button) => button.addEventListener('click', () => {
      if (moderationSubmitting) return;
      byId('moderationConfirmModal').close();
    }));
    byId('moderationConfirmModal')?.addEventListener('cancel', (event) => { if (moderationSubmitting) event.preventDefault(); });
    byId('moderationConfirmModal')?.addEventListener('close', () => { pendingModerationAction = null; });
    const caseTabs = queryAll('[data-drawer-tab]');
    drawer.querySelector('.drawerTabs').setAttribute('aria-label', 'Case sections');
    drawerContent.setAttribute('role', 'tabpanel');
    drawerContent.tabIndex = 0;
    caseTabs.forEach((button, index) => {
      button.id = `case-tab-${button.dataset.drawerTab}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'drawerContent');
      button.addEventListener('click', () => { activeDrawerTab = button.dataset.drawerTab; renderDrawerTab(); });
      button.addEventListener('keydown', event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % caseTabs.length
          : event.key === 'ArrowLeft' ? (index + caseTabs.length - 1) % caseTabs.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? caseTabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        caseTabs[next].focus(); caseTabs[next].click();
      });
    });
    query('[data-action="close-drawer"]')?.addEventListener('click', closeDrawer);
    drawerBackdrop?.addEventListener('click', closeDrawer);
    query('[data-action="new-announcement"]')?.addEventListener('click', () => announcementModal.showModal());
    announcementForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (liveMode) { showToast('Announcement writes remain disabled during the read-only rollout.'); return; }
      const state = readAdminState();
      state.announcements.unshift({ id: `ANN-${Date.now()}`, title: byId('announcementTitle').value.trim(), type: byId('announcementType').selectedOptions[0].textContent, audience: byId('announcementAudience').value, frequency: byId('announcementFrequency').value, window: `${byId('announcementStart').value || 'Start pending'} – ${byId('announcementEnd').value || 'End pending'}`, status: 'revision', label: 'Draft' });
      state.audit.unshift({ id: `AUD-${Date.now()}`, type: 'decision', actor: currentOperator, action: 'Created announcement draft', entity: byId('announcementTitle').value.trim(), detail: byId('announcementAudience').value, time: 'Just now' });
      saveAdminState(state); announcementModal.close(); announcementForm.reset(); renderAnnouncements(); renderAudit(); showToast('Announcement draft saved locally.');
    });
    queryAll('[data-action="focus-global-search"]').forEach((button) => button.addEventListener('click', openGlobalSearch));
    byId('globalSearchInput').addEventListener('input', (event) => renderGlobalSearch(event.target.value));
    queryAll('[data-audit-filter]').forEach((button) => button.addEventListener('click', () => {
      queryAll('[data-audit-filter]').forEach((item) => item.classList.toggle('active', item === button));
      auditFilter = button.dataset.auditFilter || 'activity';
      void reloadAudit();
    }));
    byId('auditSearch').addEventListener('input', () => {
      auditSearchTerm = byId('auditSearch').value.trim();
      if (auditSearchTimer) clearTimeout(auditSearchTimer);
      auditSearchTimer = setTimeout(() => { void reloadAudit(); }, 300);
    });
    query('[data-action="export-audit"]')?.addEventListener('click', () => { void exportAuditView(); });
    byId('operatorRoleForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (operatorSubmitting || !liveMode || !liveSession?.capabilities?.operator_manage) return;
      const epoch = workspaceEpoch;
      const form = event.currentTarget;
      const controls = queryAll('input, select, textarea, button', form);
      const status = byId('operatorRoleStatus');
      const username = byId('operatorUsername').value.trim().replace(/^@/, '');
      const role = byId('operatorRoleSelect').value;
      const active = byId('operatorRoleAction').value === 'grant';
      const reason = byId('operatorRoleReason').value.trim();
      const fingerprint = JSON.stringify([username, role, active, reason]);
      if (operatorIntent?.fingerprint !== fingerprint) operatorIntent = { fingerprint, key: commandKey('operator-role', `${username}:${role}:${active}`) };
      operatorSubmitting = true;
      controls.forEach((control) => { control.disabled = true; });
      form.setAttribute('aria-busy', 'true');
      status.textContent = 'Recording audited access change…';
      status.dataset.tone = '';
      let committed = false;
      try {
        await liveClient.setOperatorRole({ username, role, active, reason, idempotencyKey: operatorIntent.key });
        if (epoch !== workspaceEpoch) return;
        committed = true; operatorIntent = null;
        form.reset();
        await refreshLiveData();
        if (epoch !== workspaceEpoch) return;
        status.textContent = liveDataErrors.operators
          ? 'Access change saved. The staff directory could not refresh. Do not submit it again; refresh the portal to verify the directory.'
          : `${active ? 'Granted' : 'Revoked'} ${titleCase(role)} for ${employeeMode ? '' : '@'}${username}.`;
        status.dataset.tone = liveDataErrors.operators ? 'error' : 'success';
      } catch (error) {
        if (epoch !== workspaceEpoch) return;
        status.textContent = committed ? 'Access change saved. The workspace could not refresh. Do not submit it again; refresh the portal to verify access.' : commandFailureMessage(error, 'The access change could not be recorded.');
        status.dataset.tone = 'error';
      } finally {
        if (epoch === workspaceEpoch) {
          operatorSubmitting = false;
          controls.forEach((control) => { control.disabled = false; });
          form.removeAttribute('aria-busy');
        }
      }
    });
    document.addEventListener('keydown', (event) => {
      recordAdminActivity();
      if (event.key === 'Escape' && !byId('moderationConfirmModal')?.open) closeDrawer();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openGlobalSearch(); }
    });
    document.addEventListener('pointerdown', recordAdminActivity, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        recordAdminActivity();
        if (liveMode && liveSession && liveClient?.hasSession()) scheduleLiveRefresh();
      }
    });
    window.addEventListener('storage', (event) => { if ([businessProfileKey, ...businessCampaignKeys].includes(event.key)) renderAll(); });
    if (liveMode) {
      queryAll('[data-queue-filters="suggestions"] [data-queue-filter]').forEach((button) => {
        button.hidden = !['all', 'open'].includes(button.dataset.queueFilter);
      });
      byId('adminEnvironmentBar').hidden = true;
      byId('adminAuthDescription').textContent = employeeMode ? 'Sign in with your separate Doji employee account.' : 'Sign in with your normal authorized Doji account.';
      employeeRegisterToggle.hidden = !employeeMode;
      byId('employeeResendVerification').hidden = !employeeMode;
      if (employeeMode) {
        const employeeInput = byId('operatorUsername');
        if (employeeInput) {
          employeeInput.type = 'email'; employeeInput.maxLength = 254; employeeInput.placeholder = 'employee@company.com';
          const label = query('label[for="operatorUsername"]');
          if (label) label.textContent = 'Verified employee email';
          const help = employeeInput.closest('.field')?.querySelector('[data-context-help]');
          if (help) help.textContent = 'The employee must verify their separate work email and sign in once to request approval.';
          window.DojiContextualHelp?.enhance();
        }
      }
      byId('adminEmail').value = '';
      byId('adminPassword').value = '';
      adminSigninForm.querySelector('button[type="submit"]').textContent = 'Sign in';
      byId('adminAuthHint').textContent = 'Your password is sent only to Doji authentication. No administrator data loads until your identity and security requirements are verified.';
      if (employeeMode) byId('adminAuthHint').textContent = 'Employee access requires administrator approval and an authenticator. Your personal app account remains separate.';
      showAdminAuthStep('credentials');
      const claimNext = query('[data-action="claim-next"]');
      if (claimNext) claimNext.textContent = 'Claim next report';
      query('[data-action="new-announcement"]')?.setAttribute('hidden', '');
      queryAll('[data-action="exit-demo"]').forEach((button) => button.addEventListener('click', () => {
        void liveClient?.signOut().catch(() => setSigninStatus('Workspace locked. Server sign-out could not be confirmed; reconnect and sign out again.', 'error'));
        clearProtectedWorkspace();
      }));
      renderAll();
      if (liveClient && (independentEmployeeMode || liveClient.hasSession())) {
        setSigninStatus('Restoring your protected session…');
        refreshLiveData().then(() => { if (!liveClient.hasSession() || !liveSession) return; setSigninStatus(''); enterDemo(liveSession.capabilities?.operations_read ? 'overview' : 'inbox'); void startLiveRealtime(); startSessionGuard(); }).catch((error) => {
          liveClient.clearSession();
          clearProtectedWorkspace();
          if (independentEmployeeMode && error.status === 401) setSigninStatus('');
          else setSigninStatus(error instanceof Error ? error.message : 'Sign in again to continue.', 'error');
        });
      }
    } else {
      renderAll();
    }
  }
})();
