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

  document.body.dataset.portalRuntime = '20260924o';

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

  function enterDemo() {
    auth.hidden = true;
    if (onboarding) onboarding.hidden = true;
    app.hidden = false;
    setView('overview');
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
  }

  function closePortalSelects(except = null) {
    queryAll('.portalSelect.open').forEach((wrapper) => {
      if (wrapper === except) return;
      wrapper.classList.remove('open');
      wrapper.querySelector('.portalSelectTrigger')?.setAttribute('aria-expanded', 'false');
    });
  }

  function enhancePortalSelect(select) {
    if (select.dataset.enhanced === 'true') return;
    select.dataset.enhanced = 'true';
    select.classList.add('portalSelectNative');
    const wrapper = document.createElement('div');
    wrapper.className = 'portalSelect';
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'portalSelectTrigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<span></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg>';
    const menu = document.createElement('div');
    menu.className = 'portalSelectMenu';
    menu.setAttribute('role', 'listbox');
    const renderOptions = () => {
      menu.innerHTML = '';
      [...select.options].forEach((option) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'portalSelectOption';
        item.setAttribute('role', 'option');
        item.dataset.value = option.value;
        item.textContent = option.textContent;
        item.addEventListener('click', () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          wrapper.classList.remove('open');
          trigger.setAttribute('aria-expanded', 'false');
        });
        menu.appendChild(item);
      });
    };
    renderOptions();
    wrapper.append(trigger, menu);
    const sync = () => {
      trigger.querySelector('span').textContent = select.selectedOptions[0]?.textContent || 'Choose an option';
      queryAll('.portalSelectOption', menu).forEach((item) => {
        const selected = item.dataset.value === select.value;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-selected', String(selected));
      });
    };
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      renderOptions();
      sync();
      const opening = !wrapper.classList.contains('open');
      closePortalSelects(wrapper);
      wrapper.classList.toggle('open', opening);
      trigger.setAttribute('aria-expanded', String(opening));
    });
    select.addEventListener('change', sync);
    sync();
  }

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
  queryAll('select').forEach(enhancePortalSelect);
  document.addEventListener('click', () => closePortalSelects());

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
    const profileKey = 'doji-business-prototype-profile-v3';
    const accountKey = 'doji-business-prototype-account-v3';
    const campaignKey = 'doji-business-prototype-company-campaigns-v3';
    const sampleDraftKey = 'doji-business-prototype-sample-campaigns-v3';
    const seedCampaigns = [
      { id: 'CAM-102', name: 'Trail personalities', summary: 'Learn what motivates different kinds of outdoor movement.', goal: 'Learn audience preferences', region: 'United States', start: 'Oct 1, 2026', end: 'Oct 31, 2026', startRaw: '2026-10-01', endRaw: '2026-10-31', status: 'review', label: 'In progress', dojis: [
        { id: 'DOJI-102-A', name: 'Trail mood poll', prompt: 'Which trail mood are you today?', format: 'Poll', formatValue: 'poll', liveDate: 'Oct 12, 2026', status: 'review', label: 'Changes requested', options: ['Quiet reset', 'Big climb', 'Social miles', 'Fast finish', 'Other'] },
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
    function getCampaigns() { return workspaceMode === 'new' ? getLocalCampaigns() : [...getLocalCampaigns(), ...seedCampaigns]; }
    function saveLocalCampaigns(campaigns) { localStorage.setItem(storageKey(), JSON.stringify(campaigns)); }
    function allDojis(campaigns = getCampaigns()) { return campaigns.flatMap((campaign) => campaign.dojis || []); }
    function formatDateRange(campaign) { return `${campaign.start || 'Start pending'} – ${campaign.end || 'End pending'}`; }
    function campaignStatusClass(status) { return ['approved', 'completed'].includes(status) ? 'approved' : status === 'review' ? 'revision' : ''; }

    function campaignMarkup(campaign) {
      const dojis = campaign.dojis || [];
      return `<div class="campaignRow" tabindex="0" data-campaign-id="${escapeHtml(campaign.id)}">
        <div class="campaignIdentity"><strong>${escapeHtml(campaign.name)}</strong><small>${escapeHtml(campaign.summary)}</small></div>
        <div class="campaignMeta"><span>${dojis.length} ${dojis.length === 1 ? 'Doji' : 'Dojis'}</span><small>${escapeHtml(campaign.region)} · ${escapeHtml(formatDateRange(campaign))}</small></div>
        <span class="statusPill ${campaignStatusClass(campaign.status)}">${escapeHtml(campaign.label)}</span>
        <span class="rowChevron" aria-hidden="true">›</span>
      </div>`;
    }

    function dojiMarkup(doji) {
      return `<div class="dojiRow"><span class="dojiFormatMark">${escapeHtml(doji.format.charAt(0))}</span><div><strong>${escapeHtml(doji.name)}</strong><small>${escapeHtml(doji.prompt || 'Prompt not added yet')}</small></div><div class="dojiMeta"><span>${escapeHtml(doji.format)}</span><small>${escapeHtml(doji.liveDate || 'Date not requested')}</small></div><span class="statusPill ${campaignStatusClass(doji.status)}">${escapeHtml(doji.label)}</span></div>`;
    }

    function lifecycleStep(label, done, current = false) { return `<span class="${done ? 'done' : ''} ${current ? 'current' : ''}">${label}</span>`; }

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
      authTitle.textContent = isSignup ? 'Create your business account' : 'Business sign in';
      authDescription.textContent = isSignup ? 'Start with the basics. We will guide you through company setup next.' : 'Welcome back. Sign in to manage your company workspace.';
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
      showToast('Company setup complete. Your private workspace is ready.');
    });
    onboardingBack.addEventListener('click', () => { onboardingStep -= 1; renderOnboardingStep(); });
    query('[data-action="back-to-auth"]')?.addEventListener('click', () => { onboarding.hidden = true; auth.hidden = false; });
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
      if (!name) { showToast('Add a campaign name first.'); return null; }
      if (!campaignForm.reportValidity()) return null;
      const startRaw = byId('campaignStart').value;
      const endRaw = byId('campaignEnd').value;
      if (endRaw < startRaw) { showToast('Campaign end must be on or after its start date.'); return null; }
      return { id: `LOCAL-CAM-${Date.now()}`, name, summary: byId('campaignSummary').value.trim(), goal: byId('campaignGoal').value, region: byId('campaignRegion').value, start: dateLabel(startRaw), end: dateLabel(endRaw), startRaw, endRaw, status: 'draft', label: 'Draft', dojis: [] };
    }

    function saveCampaign() {
      const campaign = readCampaign();
      if (!campaign) return;
      saveLocalCampaigns([campaign, ...getLocalCampaigns()]);
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
      const seedIndex = seedCampaigns.findIndex((item) => item.id === campaign.id);
      if (seedIndex >= 0) seedCampaigns[seedIndex] = campaign;
    }

    function openDojiModal(campaignId) {
      const campaign = findCampaign(campaignId);
      if (!campaign) { showToast('Choose a campaign before adding a Doji.'); return; }
      activeCampaignId = campaign.id;
      if (campaignDetailModal.open) campaignDetailModal.close();
      dojiForm.reset();
      byId('campaignFormat').dispatchEvent(new Event('change', { bubbles: true }));
      byId('campaignOptionsList').innerHTML = '';
      addPollOption('');
      updatePollOptionBuilder();
      byId('dojiCampaignContext').textContent = `Add a sponsored Doji to ${campaign.name}.`;
      const liveDate = byId('dojiLiveDate');
      liveDate.min = campaign.startRaw || '';
      liveDate.max = campaign.endRaw || '';
      dojiModal.showModal();
    }

    function readDoji(status) {
      const campaign = findCampaign(activeCampaignId);
      if (!campaign) return null;
      const name = byId('dojiName').value.trim();
      if (!name) { showToast('Add an internal Doji name first.'); return null; }
      if (status === 'review' && !dojiForm.reportValidity()) return null;
      const formatValue = byId('campaignFormat').value;
      const options = pollOptionValues();
      if (status === 'review' && (formatValue === 'poll' || formatValue === 'wyr')) {
        if (options.some((option) => !option)) { showToast('Complete every poll option before submitting.'); return null; }
        if (formatValue === 'poll' && (options.length < 2 || options.length > 4)) { showToast('Add 2–4 custom choices. Doji adds Other automatically.'); return null; }
        if (formatValue === 'wyr' && options.length !== 2) { showToast('Would You Rather requires exactly 2 choices.'); return null; }
      }
      const rawDate = byId('dojiLiveDate').value;
      if (rawDate && campaign.startRaw && rawDate < campaign.startRaw) { showToast('Requested live date must fall inside the campaign.'); return null; }
      if (rawDate && campaign.endRaw && rawDate > campaign.endRaw) { showToast('Requested live date must fall inside the campaign.'); return null; }
      const savedOptions = formatValue === 'poll' ? [...options, 'Other'] : formatValue === 'wyr' ? options : [];
      return { id: `LOCAL-DOJI-${Date.now()}`, name, prompt: byId('campaignPrompt').value.trim() || 'Prompt not added yet', format: byId('campaignFormat').selectedOptions[0]?.textContent || 'Doji', formatValue, options: savedOptions, liveDate: dateLabel(rawDate), liveDateRaw: rawDate, destination: byId('campaignDestination').value.trim(), status, label: status === 'review' ? 'In review' : 'Draft' };
    }

    function saveDoji(status) {
      const doji = readDoji(status);
      if (!doji) return;
      const campaign = findCampaign(activeCampaignId);
      campaign.dojis = [doji, ...(campaign.dojis || [])];
      if (status === 'review' && campaign.status === 'draft') { campaign.status = 'review'; campaign.label = 'In progress'; }
      updateCampaign(campaign);
      dojiModal.close();
      renderCampaigns();
      setView('campaigns');
      openCampaignDetail(findCampaign(campaign.id));
      showToast(status === 'review' ? 'Doji submitted for review. Nothing was published.' : 'Doji draft saved inside the campaign.');
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
    byId('addPollOption').addEventListener('click', () => addPollOption());
    addPollOption('');
    updatePollOptionBuilder();
    queryAll('[data-action="close-campaign"]').forEach((button) => button.addEventListener('click', () => campaignModal.close()));
    queryAll('[data-action="close-doji"]').forEach((button) => button.addEventListener('click', () => dojiModal.close()));
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
      [profileKey, accountKey, campaignKey, sampleDraftKey].forEach((key) => localStorage.removeItem(key));
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
      try { liveClient = window.DojiAdminPortalClient.create(adminConfig); }
      catch (error) { console.error(error); }
    }
    const adminSigninForm = byId('adminSigninForm');
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
    const adminStateKey = 'doji-admin-prototype-state-v1';
    const businessProfileKey = 'doji-business-prototype-profile-v3';
    const businessCampaignKeys = ['doji-business-prototype-company-campaigns-v3', 'doji-business-prototype-sample-campaigns-v3'];
    let currentOperator = 'Demo operator';
    let liveSession = null;
    let liveSnapshot = null;
    let liveWork = [];
    let liveAppeals = [];
    let liveRefreshTimer = null;
    let activeItem = null;
    let activeCaseDetail = null;
    let activeDrawerTab = 'details';
    let pendingModerationAction = null;
    const queueFilters = { inbox: 'all', moderation: 'all', safety: 'all', campaigns: 'all', suggestions: 'all' };
    const queueSearch = { inbox: '', moderation: '', safety: '', campaigns: '', suggestions: '' };

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

    function formatDeadline(value, fallback = 'Editorial queue') {
      const timestamp = Date.parse(value || '');
      if (!Number.isFinite(timestamp)) return fallback;
      const minutes = Math.ceil((timestamp - Date.now()) / 60000);
      if (minutes <= 0) return 'Target exceeded';
      if (minutes < 60) return `${minutes}m to target`;
      if (minutes < 1440) return `${Math.ceil(minutes / 60)}h to target`;
      return `${Math.ceil(minutes / 1440)}d to target`;
    }

    function mapLiveWork(item) {
      return {
        id: item.id,
        queue: item.queue,
        subject: item.subject,
        secondary: item.secondary,
        category: item.category,
        submitted: formatRelative(item.submitted_at),
        deadline: formatDeadline(item.deadline_at),
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
      byId('operatorSession').innerHTML = `<i></i> AAL2 · ${canModerate ? 'moderation enabled' : 'read only'}`;
    }

    async function refreshLiveData() {
      if (!liveClient) throw new Error('The live admin portal is not configured.');
      if (liveSession) {
        [liveSnapshot, liveAppeals] = await Promise.all([
          liveClient.commandCenter(50),
          liveClient.appeals(50),
        ]);
      } else {
        [liveSession, liveSnapshot, liveAppeals] = await Promise.all([
          liveClient.session(),
          liveClient.commandCenter(50),
          liveClient.appeals(50),
        ]);
      }
      liveWork = Array.isArray(liveSnapshot?.work_items)
        ? liveSnapshot.work_items.map(mapLiveWork)
        : [];
      liveAppeals = Array.isArray(liveAppeals) ? liveAppeals.map(mapLiveAppeal) : [];
      applyLiveIdentity();
      renderAll();
    }

    function scheduleLiveRefresh() {
      if (liveRefreshTimer) return;
      liveRefreshTimer = setTimeout(() => {
        liveRefreshTimer = null;
        refreshLiveData().catch((error) => {
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
            ? 'AAL2 · realtime connected'
            : `AAL2 · realtime ${state}`;
          byId('operatorSession').innerHTML = `<i></i> ${escapeHtml(label)}`;
        });
      } catch (error) {
        liveClient.stopRealtime?.();
        console.error('[admin-portal] realtime startup failed', error);
        byId('operatorSession').innerHTML = '<i></i> AAL2 · authoritative refresh only';
      }
    }

    function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
    function readAdminState() { return readStorage(adminStateKey, { overrides: {}, announcements: [], audit: [] }); }
    function saveAdminState(state) { localStorage.setItem(adminStateKey, JSON.stringify(state)); }
    function queueLabel(queue) { return ({ moderation: 'Trust & safety', safety: 'Legal requests', campaigns: 'Sponsored Dojis', businesses: 'Businesses', suggestions: 'Community ideas' })[queue] || queue; }
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
      if (liveMode) return [...liveAppeals, ...liveWork];
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

    function rowAttributes(item) { return `tabindex="0" data-work-id="${escapeHtml(item.id)}"`; }
    function tableMarkup(type, item) {
      const status = `<span class="statusPill ${statusClass(item.status)}">${escapeHtml(item.label)}</span>`;
      const owner = `<span class="ownerCell">${escapeHtml(item.owner)}</span>`;
      if (type === 'inbox') return `<tr ${rowAttributes(item)}><td><span class="priorityBadge ${priorityClass(item.priority)}">${escapeHtml(item.priority)}</span></td><td><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.id)} · ${escapeHtml(item.secondary)}</small></td><td>${escapeHtml(queueLabel(item.queue))}</td><td class="mutedCell">${escapeHtml(item.submitted)}</td><td>${owner}</td><td>${status}</td></tr>`;
      if (type === 'moderation') return `<tr ${rowAttributes(item)}><td class="subject">${escapeHtml(item.id)}</td><td><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.source)}</small></td><td class="mutedCell">${escapeHtml(item.category)}</td><td>${escapeHtml(item.visibility)}</td><td>${escapeHtml(item.submitted)}</td><td>${status}</td></tr>`;
      if (type === 'safety') return `<tr ${rowAttributes(item)}><td class="subject">${escapeHtml(item.id)}</td><td><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.category)}</small></td><td>${escapeHtml(item.visibility)}</td><td class="deadline">${escapeHtml(item.deadline)}</td><td>${owner}</td><td>${status}</td></tr>`;
      if (type === 'suggestions') return `<tr ${rowAttributes(item)}><td class="subject">${escapeHtml(item.id)}</td><td><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.summary)}</small></td><td>${escapeHtml(item.category)}</td><td class="mutedCell">${escapeHtml(item.submitted)}</td><td>${owner}</td><td>${status}</td></tr>`;
      return `<tr ${rowAttributes(item)}><td><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.id)}</small></td><td><strong>${escapeHtml(item.secondary)}</strong><small>${escapeHtml(item.source)}</small></td><td>${escapeHtml(item.category)}</td><td class="mutedCell">${escapeHtml(item.submitted)}</td><td>${owner}</td><td>${status}</td></tr>`;
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
      let items = type === 'inbox' ? allWork() : itemsFor(type);
      if (type === 'inbox') {
        const typeFilter = byId('inboxTypeFilter')?.value || 'all';
        if (typeFilter !== 'all') items = items.filter((item) => item.queue === typeFilter);
      }
      items = items.filter((item) => queueMatches(item, queueFilters[type], queueSearch[type]));
      const weight = { critical: 0, high: 1, normal: 2, low: 3 };
      items.sort((a, b) => (weight[a.priority] ?? 4) - (weight[b.priority] ?? 4));
      body.innerHTML = items.length ? items.map((item) => tableMarkup(type, item)).join('') : `<tr class="emptyTableRow"><td colspan="6">No work matches these filters.</td></tr>`;
      if (type === 'inbox') byId('queueResultCount').textContent = `${items.length} ${items.length === 1 ? 'work item' : 'work items'}`;
      bindWorkRows(body);
    }

    function renderPriority() {
      const items = allWork().filter((item) => !['approved', 'resolved', 'draft'].includes(item.status)).sort((a, b) => ({ critical: 0, high: 1, normal: 2, low: 3 }[a.priority] - ({ critical: 0, high: 1, normal: 2, low: 3 }[b.priority]))).slice(0, 5);
      byId('priorityQueue').innerHTML = items.map((item) => `<button class="priorityRow" type="button" data-work-id="${escapeHtml(item.id)}"><span class="priorityMark ${priorityClass(item.priority)}"></span><span class="priorityCopy"><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(queueLabel(item.queue))} · ${escapeHtml(item.id)}</small></span><span class="priorityDue"><strong>${escapeHtml(item.deadline)}</strong><small>${escapeHtml(item.owner)}</small></span><span class="rowChevron">›</span></button>`).join('');
      bindWorkRows(byId('priorityQueue'));
    }

    function setLegalUrgentAlert(count) {
      const alert = byId('legalUrgentAlert');
      if (!alert) return;
      const urgentCount = Math.max(0, Number(count) || 0);
      const hasUrgentItems = urgentCount > 0;
      alert.hidden = !hasUrgentItems;
      if (hasUrgentItems) {
        const label = `${urgentCount} urgent legal ${urgentCount === 1 ? 'item' : 'items'}`;
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
        byId('urgentMetric').textContent = String(urgentCount);
        setLegalUrgentAlert(urgentCount);
        byId('unassignedMetric').textContent = String(metrics.unassigned_work || 0);
        byId('campaignMetric').textContent = String(metrics.sponsored_reviews || 0);
        byId('inboxNavCount').textContent = String(liveWork.length);
        byId('moderationOpenCount').textContent = String(metrics.open_reports || 0);
        byId('moderationHighCount').textContent = String(liveWork.filter((item) => item.queue === 'moderation' && ['high', 'critical'].includes(item.priority)).length);
        byId('moderationUnassignedCount').textContent = String(liveWork.filter((item) => item.queue === 'moderation' && item.owner === 'Unassigned').length);
        byId('sponsoredReviewCount').textContent = String(metrics.sponsored_reviews || 0);
        const platform = liveSnapshot.platform || {};
        byId('platformStatusMetric').textContent = platform.healthy ? 'Healthy' : 'Attention';
        byId('platformStatusText').textContent = platform.healthy
          ? `Realtime p95 ${Number(platform.realtime_p95_ms_5m || 0)} ms`
          : `${Number(platform.outbox_overdue || 0)} overdue events · ${Number(platform.push_stale_shards || 0)} stale push shards`;
        const overviewPulse = byId('overviewPlatformPulse');
        if (overviewPulse) {
          overviewPulse.innerHTML = `<span></span>${platform.healthy ? 'All critical systems operational' : 'Platform attention required'}`;
          overviewPulse.dataset.tone = platform.healthy ? 'healthy' : 'attention';
        }
        const health = Array.isArray(liveSnapshot.queue_health) ? liveSnapshot.queue_health : [];
        byId('queueHealth').innerHTML = health.length
          ? health.map((item) => `<div><span><i class="serviceDot ${item.count > 0 ? 'healthy' : ''}"></i><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.note)}</small></span><strong>${Number(item.count || 0)}</strong></div>`).join('')
          : '<div class="emptyState">No active production queues.</div>';
        const event = liveSnapshot.next_event;
        byId('todaysSchedule').innerHTML = event
          ? `<div><time>${new Date(event.fires_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time><span><strong>${escapeHtml(event.title || 'Daily Doji')}</strong><small>Server-owned · 10-minute window</small></span><span class="statusPill approved">${event.activated_at ? 'Active or complete' : event.prelive_at ? 'Pre-live' : 'Prepared'}</span></div>`
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
      byId('sponsoredReviewCount').textContent = String(itemsFor('campaigns').filter((item) => item.status === 'open').length);
      const health = [
        { label: 'Legal & urgent safety', count: itemsFor('safety').filter((item) => !['resolved', 'approved'].includes(item.status)).length, note: '1 deadline inside 24 hours', tone: 'urgent' },
        { label: 'Trust & safety', count: itemsFor('moderation').filter((item) => !['resolved', 'approved'].includes(item.status)).length, note: 'All inside internal target', tone: 'healthy' },
        { label: 'Sponsored review', count: itemsFor('campaigns').filter((item) => item.status === 'open').length, note: 'No schedule conflict', tone: 'healthy' },
        { label: 'Business verification', count: itemsFor('businesses').filter((item) => item.status === 'open').length, note: 'Oldest 4 hours', tone: 'healthy' },
      ];
      byId('queueHealth').innerHTML = health.map((item) => `<div><span><i class="serviceDot ${item.tone}"></i><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.note)}</small></span><strong>${item.count}</strong></div>`).join('');
    }

    function renderOperations() {
      if (!liveMode || !liveSnapshot) return;
      const platform = liveSnapshot.platform || {};
      const policies = Array.isArray(liveSnapshot.release_policies)
        ? liveSnapshot.release_policies
        : [];
      const releases = policies.length
        ? policies.map((policy) => `<div><span><strong>${escapeHtml(String(policy.platform || '').toUpperCase())}</strong><small>Minimum ${escapeHtml(policy.minimum_version)} (${Number(policy.minimum_build || 0)})</small></span><strong>${escapeHtml(policy.latest_version)} (${Number(policy.latest_build || 0)})</strong><span class="statusPill ${policy.enabled ? 'approved' : ''}">${policy.enabled ? 'Enforced' : 'Disabled'}</span></div>`).join('')
        : '<div class="emptyState">No release policy rows were returned.</div>';
      const grid = query('[data-portal-view="operations"] .opsGrid');
      if (!grid) return;
      grid.innerHTML = `<article class="portalPanel opsHero"><div><span class="healthPulse"></span><p class="eyebrow">Overall status</p><h3>${platform.healthy ? 'Critical delivery systems healthy' : 'Operational attention required'}</h3><p>This view reports bounded Postgres-owned delivery signals. It does not depend on push delivery for correctness.</p></div><div class="opsHeroMetric"><strong>${Number(platform.realtime_p95_ms_5m || 0)} ms</strong><span>Realtime p95 · 5 minutes</span></div></article><article class="portalPanel"><div class="panelHeader"><div><h3>Delivery guardrails</h3><p>Current authoritative backlog signals</p></div></div><div class="serviceList"><div><span><i class="serviceDot ${Number(platform.outbox_overdue || 0) === 0 ? 'healthy' : 'urgent'}"></i><strong>Realtime outbox</strong></span><small>${Number(platform.outbox_overdue || 0)} overdue</small></div><div><span><i class="serviceDot ${Number(platform.push_stale_shards || 0) === 0 ? 'healthy' : 'urgent'}"></i><strong>Native push fanout</strong></span><small>${Number(platform.push_stale_shards || 0)} stale shards</small></div></div></article><article class="portalPanel"><div class="panelHeader"><div><h3>Release policy</h3><p>Current production minimums</p></div></div><div class="releaseRows">${releases}</div></article><article class="portalPanel"><div class="panelHeader"><div><h3>Production boundary</h3><p>Current live controls</p></div></div><div class="guardrailList"><label><input type="checkbox" checked disabled><span>AAL2 admin authentication</span></label><label><input type="checkbox" checked disabled><span>Role-scoped, bounded reads</span></label><label><input type="checkbox" checked disabled><span>No service-role key in the portal gateway</span></label><label><input type="checkbox" checked disabled><span>Atomic, idempotent Trust & Safety commands</span></label><label><input type="checkbox" disabled><span>Other operational mutations remain disabled</span></label></div></article>`;
    }

    function businesses() {
      if (liveMode) return [];
      const profile = readStorage(businessProfileKey, null);
      if (!profile?.companyName) return seedBusinesses.map(applyOverrides);
      const local = { id: 'BIZ-LOCAL', name: profile.companyName, legalName: profile.legalName || 'Not provided', domain: (profile.website || '').replace(/^https?:\/\//, '') || 'Not provided', industry: profile.industry || 'Not provided', region: (profile.markets || [profile.country]).filter(Boolean).join(', '), status: 'open', label: 'Pending review', campaigns: businessCampaignKeys.flatMap((key) => readStorage(key, [])).length, owner: profile.ownerName || 'Workspace owner' };
      return [local, ...seedBusinesses].map(applyOverrides);
    }

    function renderBusinesses() {
      const rows = businesses();
      byId('businessAdminGrid').innerHTML = rows.length
        ? rows.map((business) => `<button type="button" class="businessAdminCard" data-business-id="${escapeHtml(business.id)}"><span class="businessAvatar">${escapeHtml(business.name.charAt(0))}</span><span class="businessCardBody"><span class="businessCardHeading"><strong>${escapeHtml(business.name)}</strong><span class="statusPill ${statusClass(business.status)}">${escapeHtml(business.label)}</span></span><small>${escapeHtml(business.legalName)}</small><span class="businessFacts"><span>${escapeHtml(business.domain)}</span><span>${escapeHtml(business.industry)}</span><span>${business.campaigns} campaigns</span></span><span class="businessOwner">Owner contact · ${escapeHtml(business.owner)}</span></span><span class="rowChevron">›</span></button>`).join('')
        : '<div class="emptyState">Business verification remains unavailable until its approved production contract is deployed.</div>';
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
      byId('announcementList').innerHTML = announcements().map((item) => `<article class="announcementCard"><div class="announcementCardTop"><span class="announcementType">${escapeHtml(item.type)}</span><span class="statusPill ${statusClass(item.status)}">${escapeHtml(item.label)}</span></div><h3>${escapeHtml(item.title)}</h3><dl><div><dt>Audience</dt><dd>${escapeHtml(item.audience)}</dd></div><div><dt>Frequency</dt><dd>${escapeHtml(item.frequency)}</dd></div><div><dt>Window</dt><dd>${escapeHtml(item.window)}</dd></div></dl><button class="portalButton fullButton" type="button" data-action="prototype-only">Review message</button></article>`).join('');
      queryAll('[data-action="prototype-only"]', byId('announcementList')).forEach((button) => button.addEventListener('click', () => showToast('This control is mapped, but intentionally not wired to a backend yet.')));
    }

    function audits() {
      if (liveMode) return (liveSnapshot?.recent_audit || []).map((item) => ({
        id: item.id,
        type: 'decision',
        actor: item.actor_role || 'Authorized operator',
        action: item.action,
        entity: `${item.entity_type} · ${item.entity_id}`,
        detail: item.reason || 'Audited action',
        time: formatRelative(item.occurred_at),
      }));
      const state = readAdminState(); return [...state.audit, ...seedAudit];
    }
    function renderAudit(filter = 'all', term = '') {
      const normalized = term.trim().toLowerCase();
      const rows = audits().filter((item) => (filter === 'all' || item.type === filter) && (!normalized || [item.actor, item.action, item.entity, item.detail].join(' ').toLowerCase().includes(normalized)));
      byId('auditList').innerHTML = rows.length ? rows.map((item) => `<div class="auditRow"><span class="auditActor">${escapeHtml(item.actor === 'System' ? 'SY' : item.actor.split(' ').map((part) => part[0]).join('').slice(0, 2))}</span><div><strong>${escapeHtml(item.action)}</strong><p>${escapeHtml(item.entity)} · ${escapeHtml(item.detail)}</p></div><time>${escapeHtml(item.time)}</time><span class="auditType">${escapeHtml(item.type)}</span></div>`).join('') : '<div class="emptyState">No audit events match this view.</div>';
    }

    function renderAll() {
      ['inbox', 'moderation', 'safety', 'campaigns', 'suggestions'].forEach(renderQueue);
      renderPriority(); renderMetrics(); renderBusinesses(); renderAnnouncements(); renderAudit(); renderOperations();
    }

    function identityLabel(person, fallback) {
      if (!person) return fallback;
      const name = person.display_name || person.username || fallback;
      return person.username && person.username !== name ? `${name} · @${person.username}` : name;
    }

    function evidenceMarkup(detail) {
      const evidence = detail?.evidence;
      if (!evidence) return '';
      const label = ({ post: 'Reported post', comment: 'Reported comment', poll_response: 'Reported poll response', account_profile: 'Reported profile' })[evidence.kind] || 'Reported content';
      const text = evidence.kind === 'post'
        ? evidence.caption
        : evidence.kind === 'comment'
          ? evidence.body
          : evidence.kind === 'poll_response'
            ? evidence.custom_text
            : evidence.has_profile_photo ? 'Profile photo attached to this report.' : 'No profile photo is currently attached.';
      const image = detail.evidenceUrl
        ? `<img class="moderationEvidenceImage" src="${escapeHtml(detail.evidenceUrl)}" alt="Authorized ${escapeHtml(label.toLowerCase())} evidence">`
        : evidence.has_media || evidence.has_profile_photo
          ? `<div class="moderationEvidenceUnavailable"><strong>Media evidence is attached</strong><span>${escapeHtml(detail.evidenceError || 'The protected preview is not currently available.')}</span></div>`
          : '';
      return `<div class="detailBlock"><label>${escapeHtml(label)}</label><div class="moderationEvidence ${evidence.exists === false ? 'removed' : ''}">${image}<p>${escapeHtml(text || 'No text accompanied this content.')}</p><small>${evidence.exists === false ? 'The referenced content is no longer available.' : 'Authorized evidence · decision access is audited'}</small></div></div>`;
    }

    function detailMarkup(item) {
      if (liveMode && item.queue === 'moderation' && !activeCaseDetail) {
        return '<div class="drawerLoading" aria-live="polite"><span></span><strong>Loading authorized report evidence…</strong><small>Identity, content, and prior decisions remain protected until this read completes.</small></div>';
      }
      const optionBlock = item.options?.length ? `<div class="detailBlock"><label>Response options</label><div class="reviewOptionList">${item.options.map((option, index) => `<span><i>${index + 1}</i>${escapeHtml(option)}</span>`).join('')}</div></div>` : '';
      const destinationBlock = item.destination ? `<div class="detailBlock"><label>Learn more destination</label><p>${escapeHtml(item.destination)}</p></div>` : '';
      const moderationPeople = activeCaseDetail && item.queue === 'moderation'
        ? `<div class="detailBlock"><label>People</label><div class="moderationPeople"><div><span>Reporter</span><strong>${escapeHtml(identityLabel(activeCaseDetail.reporter, 'Unavailable'))}</strong></div><div><span>Reported account</span><strong>${escapeHtml(identityLabel(activeCaseDetail.reported_user, 'Unavailable'))}</strong><small>${activeCaseDetail.reported_user?.is_banned ? 'Account suspended' : 'Account active'}</small></div></div></div>`
        : '';
      const evidence = activeCaseDetail && item.queue === 'moderation' ? evidenceMarkup(activeCaseDetail) : '';
      const appeal = item.appeal
        ? `<div class="detailBlock"><label>Member appeal</label><p>${escapeHtml(item.appeal.statement)}</p></div><div class="detailGrid"><div class="detailTile"><span>Policy</span><strong>${escapeHtml(String(item.appeal.policy_code || 'Not recorded').replaceAll('_', ' '))}</strong></div><div class="detailTile"><span>Original severity</span><strong>${escapeHtml(String(item.appeal.severity || 'Not recorded').replaceAll('_', ' '))}</strong></div></div>`
        : '';
      const boundary = liveMode && item.queue === 'moderation'
        ? 'Report reads and decisions require AAL2. Routine action is limited to the violating item, preserves evidence, warns the member, and remains appealable. Serious or emergency cases move to restricted review.'
        : liveMode && item.appeal
          ? 'Appeals require an AAL2 reviewer who did not make the original decision. Reversal restores the affected content when restoration is possible and is permanently audited.'
        : liveMode
          ? 'This operational area remains read-only until it receives a separate authorized, atomic, idempotent, audited command.'
        : 'This prototype records local workflow only. Production uses an authorized snapshot and one narrow, atomic, idempotent, audited command for every decision.';
      return `<div class="detailGrid"><div class="detailTile"><span>Status</span><strong>${escapeHtml(item.label)}</strong></div><div class="detailTile"><span>Owner</span><strong>${escapeHtml(item.owner)}</strong></div><div class="detailTile"><span>Visibility</span><strong>${escapeHtml(item.visibility)}</strong></div><div class="detailTile"><span>Deadline / target</span><strong>${escapeHtml(item.deadline)}</strong></div></div><div class="detailBlock"><label>Summary</label><p>${escapeHtml(item.summary)}</p></div>${appeal}${moderationPeople}${evidence}${optionBlock}${destinationBlock}<div class="detailBlock"><label>Next required step</label><p>${escapeHtml(item.nextStep)}</p></div><div class="prototypeBoundary"><strong>Production boundary</strong><p>${escapeHtml(boundary)}</p></div>`;
    }
    function historyMarkup(item) {
      const rows = (item.history || []).map((entry) => typeof entry === 'string'
        ? { title: entry, detail: '' }
        : {
          title: String(entry.action || 'Report activity').replaceAll('.', ' ').replace(/\b\w/g, (character) => character.toUpperCase()),
          detail: [entry.actor_role ? String(entry.actor_role).replaceAll('_', ' ') : '', entry.reason || '', entry.occurred_at ? formatRelative(entry.occurred_at) : ''].filter(Boolean).join(' · '),
        });
      return `<div class="drawerTimeline">${rows.map((entry, index) => `<div><span></span><p><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.detail || (index === 0 ? 'Most recent' : `${index} step${index === 1 ? '' : 's'} earlier`))}</small></p></div>`).join('') || '<div class="emptyState">No audited case activity yet.</div>'}</div>`;
    }
    function relatedMarkup(item) {
      const people = activeCaseDetail && item.queue === 'moderation'
        ? `<div><span>Reporter</span><strong>${escapeHtml(identityLabel(activeCaseDetail.reporter, 'Unavailable'))}</strong></div><div><span>Reported account</span><strong>${escapeHtml(identityLabel(activeCaseDetail.reported_user, 'Unavailable'))}</strong></div>`
        : '';
      return `<div class="relatedList"><div><span>Source</span><strong>${escapeHtml(item.source)}</strong></div><div><span>Queue</span><strong>${escapeHtml(queueLabel(item.queue))}</strong></div>${people}<div><span>Related history</span><strong>${item.history?.length || 0} recorded events</strong></div><div><span>Evidence access</span><strong>${item.queue === 'safety' ? 'Restricted · elevated authorization required' : 'AAL2 · authorized case only'}</strong></div></div>`;
    }

    function renderDrawerTab() {
      if (!activeItem) return;
      queryAll('[data-drawer-tab]').forEach((button) => button.classList.toggle('active', button.dataset.drawerTab === activeDrawerTab));
      drawerContent.innerHTML = activeDrawerTab === 'history' ? historyMarkup(activeItem) : activeDrawerTab === 'related' ? relatedMarkup(activeItem) : detailMarkup(activeItem);
    }

    function actionConfig(item) {
      if (liveMode) {
        if (item.appeal) {
          if (liveSession?.capabilities?.moderation_write !== true) return [];
          if (item.appeal.original_decider_id === liveSession?.user_id) return [];
          return [['uphold_appeal', 'Uphold decision', ''], ['reverse_appeal', 'Reverse & restore', 'primary']];
        }
        if (item.queue !== 'moderation' || liveSession?.capabilities?.moderation_write !== true || !activeCaseDetail) return [];
        const assignedTo = activeCaseDetail.assigned_to || item.assignedTo;
        const isSupervisor = Array.isArray(liveSession?.roles) && liveSession.roles.includes('super_admin');
        if (assignedTo && assignedTo !== liveSession?.user_id && !isSupervisor) return [];
        const evidence = activeCaseDetail.evidence || {};
        const actions = [['no_violation', 'No violation', '']];
        if (evidence.kind === 'account_profile' && evidence.has_profile_photo) {
          actions.push(['remove_profile_photo', 'Remove photo & warn', 'danger']);
        } else if (evidence.exists !== false && ['post', 'comment', 'poll_response'].includes(evidence.kind)) {
          actions.push(['remove_content', 'Remove content & warn', 'danger']);
        }
        actions.push(['escalate_restricted', 'Quarantine & escalate', 'danger']);
        return actions;
      }
      if (item.queue === 'campaigns') return [['revision', 'Request changes', ''], ['reject', 'Decline', 'danger'], ['approve', 'Approve & schedule', 'primary']];
      if (item.queue === 'businesses') return [['revision', 'Request information', ''], ['reject', 'Decline access', 'danger'], ['approve', 'Verify business', 'primary']];
      if (item.queue === 'suggestions') return [['reject', 'Decline', 'danger'], ['approve', 'Accept idea', 'primary']];
      if (item.queue === 'safety') return [['escalate', 'Escalate', ''], ['revision', 'Request information', ''], ['resolve', 'Record resolution', 'primary']];
      return [['restore', 'No violation / restore', ''], ['escalate', 'Escalate', ''], ['resolve', 'Confirm enforcement', 'primary']];
    }

    function updateDrawerHeader() {
      if (!activeItem) return;
      byId('drawerHeaderMeta').innerHTML = `<span>${escapeHtml(activeItem.id)}</span><span class="priorityBadge ${priorityClass(activeItem.priority)}">${escapeHtml(activeItem.priority)}</span><span class="statusPill ${statusClass(activeItem.status)}">${escapeHtml(activeItem.label)}</span>`;
    }

    function renderDrawerActions() {
      if (!activeItem) return;
      const moderationControls = byId('moderationTriage');
      const liveModeration = liveMode && activeItem.queue === 'moderation';
      const liveAppeal = liveMode && Boolean(activeItem.appeal);
      byId('decisionPanel').hidden = liveMode && !liveModeration && !liveAppeal;
      moderationControls.hidden = !liveModeration;
      byId('moderationClassification').hidden = !liveModeration;
      byId('moderationNoticeField').hidden = !liveModeration;
      byId('decisionReasonHint').textContent = liveAppeal
        ? 'Required. Explain the independent review and the evidence supporting this outcome.'
        : 'Required. This stays in the operator audit record.';
      if (liveModeration) {
        const priority = byId('moderationPriority');
        priority.value = activeItem.priority || 'normal';
        priority.disabled = !activeCaseDetail || liveSession?.capabilities?.moderation_write !== true;
        const claimButton = byId('claimReportButton');
        const assignedTo = activeCaseDetail?.assigned_to || activeItem.assignedTo;
        const isMine = assignedTo && assignedTo === liveSession?.user_id;
        claimButton.textContent = isMine ? 'Release case' : assignedTo ? `Assigned to ${activeItem.owner}` : 'Claim case';
        claimButton.dataset.action = isMine ? 'release-report' : 'claim-report';
        claimButton.disabled = !activeCaseDetail || (Boolean(assignedTo) && !isMine) || liveSession?.capabilities?.moderation_write !== true;
      }
      drawerActions.innerHTML = actionConfig(activeItem).map(([action, label, className]) => `<button type="button" class="portalButton ${className}" data-admin-decision="${action}">${label}</button>`).join('');
      queryAll('[data-admin-decision]', drawerActions).forEach((button) => button.addEventListener('click', () => recordDecision(button.dataset.adminDecision)));
    }

    async function loadLiveReportCase(reportId) {
      try {
        const detail = await liveClient.reportCase(reportId);
        if (!activeItem || activeItem.id !== reportId) return;
        if (detail.evidence?.media_bucket && detail.evidence?.media_path) {
          try {
            detail.evidenceUrl = await liveClient.signEvidence(detail.evidence.media_bucket, detail.evidence.media_path);
          } catch (error) {
            detail.evidenceError = error instanceof Error ? error.message : 'The protected preview could not be loaded.';
          }
        } else if (detail.evidence?.profile_photo_url) {
          detail.evidenceUrl = detail.evidence.profile_photo_url;
        }
        if (!activeItem || activeItem.id !== reportId) return;
        activeCaseDetail = detail;
        const policy = byId('moderationPolicy');
        const catalog = Array.isArray(detail.policy_catalog) ? detail.policy_catalog : [];
        policy.innerHTML = `<option value="">Choose a policy</option>${catalog.map((entry) => `<option value="${escapeHtml(entry.code)}">${escapeHtml(entry.label)}</option>`).join('')}`;
        activeItem = {
          ...activeItem,
          priority: detail.priority || activeItem.priority,
          owner: detail.owner ? identityLabel(detail.owner, 'Assigned') : 'Unassigned',
          assignedTo: detail.assigned_to || null,
          history: [...(Array.isArray(detail.history) ? detail.history : []), { action: 'Report received', occurred_at: detail.created_at }],
        };
        updateDrawerHeader();
        renderDrawerActions();
        renderDrawerTab();
      } catch (error) {
        if (!activeItem || activeItem.id !== reportId) return;
        drawerContent.innerHTML = `<div class="drawerError"><strong>Report details could not be loaded.</strong><p>${escapeHtml(error instanceof Error ? error.message : 'Try again.')}</p><button class="portalButton" type="button" data-action="retry-report-detail">Try again</button></div>`;
        query('[data-action="retry-report-detail"]', drawerContent)?.addEventListener('click', () => {
          activeCaseDetail = null;
          renderDrawerTab();
          void loadLiveReportCase(reportId);
        });
      }
    }

    function openDrawer(item) {
      if (!item) return;
      activeItem = applyOverrides(item);
      activeCaseDetail = null;
      activeDrawerTab = 'details';
      byId('drawerEyebrow').textContent = queueLabel(activeItem.queue);
      byId('drawerTitle').textContent = activeItem.subject;
      updateDrawerHeader();
      byId('decisionReason').value = '';
      byId('moderationUserNotice').value = '';
      byId('moderationPolicy').value = '';
      byId('moderationSeverity').value = '';
      renderDrawerActions();
      renderDrawerTab();
      drawer.classList.add('open'); drawerBackdrop.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
      if (liveMode && activeItem.queue === 'moderation') void loadLiveReportCase(activeItem.id);
    }
    function closeDrawer() { drawer.classList.remove('open'); drawerBackdrop.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); activeItem = null; activeCaseDetail = null; }

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

    async function runLiveTriage(action, priority = null) {
      if (!activeItem || !activeCaseDetail || activeItem.queue !== 'moderation') return;
      const reportId = activeItem.id;
      const note = byId('decisionReason').value.trim();
      const controls = [byId('claimReportButton'), byId('moderationPriority')];
      controls.forEach((control) => { control.disabled = true; });
      try {
        await liveClient.triageReport({
          reportId,
          action,
          priority,
          note: note || null,
          idempotencyKey: commandKey(`triage:${action}`, reportId),
        });
        await refreshLiveData();
        if (!activeItem || activeItem.id !== reportId) return;
        const refreshedItem = getItem(reportId);
        if (refreshedItem) activeItem = refreshedItem;
        activeCaseDetail = null;
        updateDrawerHeader();
        renderDrawerActions();
        renderDrawerTab();
        await loadLiveReportCase(reportId);
        showToast(action === 'claim' ? 'Case assigned to you.' : action === 'release' ? 'Case returned to the unassigned queue.' : 'Case priority updated.');
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'The case could not be updated.');
        renderDrawerActions();
      }
    }

    function moderationActionCopy(action) {
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
      if (!pendingModerationAction || !activeItem) return;
      const reportId = activeItem.id;
      const action = pendingModerationAction;
      const wasAppeal = Boolean(activeItem.appeal);
      const reason = byId('decisionReason').value.trim();
      const submit = byId('moderationConfirmSubmit');
      submit.disabled = true;
      submit.textContent = 'Recording…';
      try {
        if (activeItem.appeal) {
          await liveClient.decideAppeal({
            appealId: activeItem.appeal.id,
            outcome: action === 'reverse_appeal' ? 'reverse' : 'uphold',
            reason,
            idempotencyKey: commandKey(`appeal:${action}`, activeItem.appeal.id),
          });
        } else {
          const noViolation = action === 'no_violation';
          await liveClient.decideReport({
            reportId,
            action,
            policyCode: noViolation ? 'no_violation' : byId('moderationPolicy').value,
            severity: noViolation ? 'none' : byId('moderationSeverity').value,
            reason,
            userNotice: noViolation
              ? 'We reviewed this report and found no policy violation.'
              : byId('moderationUserNotice').value.trim(),
            idempotencyKey: commandKey(`decision:${action}`, reportId),
          });
        }
        byId('moderationConfirmModal').close();
        pendingModerationAction = null;
        closeDrawer();
        await refreshLiveData();
        showToast(wasAppeal ? 'Appeal decision recorded.' : 'Moderation decision recorded and the queue is up to date.');
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'The moderation decision could not be recorded.');
      } finally {
        submit.disabled = false;
        submit.textContent = 'Confirm decision';
      }
    }

    function recordDecision(action) {
      if (!activeItem) return;
      const note = byId('decisionReason').value.trim();
      if (liveMode) {
        if ((!activeItem.appeal && activeItem.queue !== 'moderation') || liveSession?.capabilities?.moderation_write !== true) {
          showToast('This operational area remains read only.');
          return;
        }
        if (note.length < 10) {
          showToast('Add a decision reason of at least 10 characters.');
          byId('decisionReason').focus();
          return;
        }
        if (!activeItem.appeal && action !== 'no_violation') {
          if (!byId('moderationPolicy').value) {
            showToast('Choose the policy area before recording this action.');
            byId('moderationPolicy').focus();
            return;
          }
          if (!byId('moderationSeverity').value) {
            showToast('Choose a severity before recording this action.');
            byId('moderationSeverity').focus();
            return;
          }
          const notice = byId('moderationUserNotice').value.trim();
          if (notice.length < 10) {
            showToast('Add the plain-language notice the member will receive.');
            byId('moderationUserNotice').focus();
            return;
          }
          if (action !== 'escalate_restricted' && byId('moderationSeverity').value === 'level_3') {
            showToast('Level 3 cases must be quarantined and escalated for restricted review.');
            return;
          }
        }
        pendingModerationAction = action;
        const [title, copy] = moderationActionCopy(action);
        byId('moderationConfirmTitle').textContent = title;
        byId('moderationConfirmCopy').textContent = copy;
        const classification = activeItem.appeal || action === 'no_violation'
          ? ''
          : `<span><strong>Classification</strong>${escapeHtml(byId('moderationPolicy').selectedOptions[0]?.textContent || '')} · ${escapeHtml(byId('moderationSeverity').selectedOptions[0]?.textContent || '')}</span>`;
        byId('moderationConfirmSummary').innerHTML = `<span><strong>Case</strong>${escapeHtml(activeItem.id)}</span>${classification}<span><strong>Decision reason</strong>${escapeHtml(note)}</span>`;
        byId('moderationConfirmSubmit').classList.toggle('danger', ['remove_content', 'remove_profile_photo', 'escalate_restricted'].includes(action));
        byId('moderationConfirmSubmit').classList.toggle('primary', !['remove_content', 'remove_profile_photo', 'escalate_restricted'].includes(action));
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

    function openGlobalSearch() { renderGlobalSearch(); globalSearchModal.showModal(); setTimeout(() => byId('globalSearchInput').focus(), 0); }

    async function completeLiveSignin() {
      await refreshLiveData();
      void startLiveRealtime();
      setSigninStatus('');
      enterDemo();
    }

    function showAdminAuthStep(step) {
      adminSigninForm.hidden = step !== 'credentials';
      adminMfaChallengeForm.hidden = step !== 'challenge';
      adminMfaSetup.hidden = step !== 'enrollment';
    }

    function resetAdminAuth() {
      liveClient?.clearSession();
      showAdminAuthStep('credentials');
      adminMfaChallengeForm.reset();
      adminTotpVerifyForm.reset();
      adminTotpEnrollment.hidden = true;
      byId('adminTotpQr').removeAttribute('src');
      byId('adminTotpSecret').textContent = '';
      setSigninStatus('');
      setTimeout(() => byId('adminEmail').focus(), 0);
    }

    adminSigninForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!liveMode) { renderAll(); enterDemo(); return; }
      if (!liveClient) { setSigninStatus('The production portal configuration is incomplete.', 'error'); return; }
      const submit = adminSigninForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      setSigninStatus('Verifying your Doji account…');
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
      queueFilters[container.dataset.queueFilters] = button.dataset.queueFilter; renderQueue(container.dataset.queueFilters);
    }));
    queryAll('[data-queue-search]').forEach((input) => input.addEventListener('input', () => { queueSearch[input.dataset.queueSearch] = input.value; renderQueue(input.dataset.queueSearch); }));
    byId('globalQueueSearch').addEventListener('input', (event) => { queueSearch.inbox = event.target.value; renderQueue('inbox'); });
    byId('inboxTypeFilter').addEventListener('change', () => renderQueue('inbox'));
    query('[data-action="claim-next"]')?.addEventListener('click', async () => {
      if (liveMode) {
        const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
        const next = allWork()
          .filter((item) => item.queue === 'moderation' && item.owner === 'Unassigned')
          .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])[0];
        if (!next) { showToast('There are no unassigned reports in this page.'); return; }
        openDrawer(next);
        try {
          await liveClient.triageReport({ reportId: next.id, action: 'claim', priority: null, note: null, idempotencyKey: commandKey('triage:claim', next.id) });
          await refreshLiveData();
          if (activeItem?.id === next.id) {
            activeCaseDetail = null;
            activeItem = getItem(next.id) || activeItem;
            renderDrawerActions(); renderDrawerTab();
            await loadLiveReportCase(next.id);
          }
          showToast(`${next.id} assigned to you.`);
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'The case could not be claimed.');
        }
        return;
      }
      const next = allWork().filter((item) => item.owner === 'Unassigned' && !['approved', 'resolved', 'draft'].includes(item.status)).sort((a, b) => ({ critical: 0, high: 1, normal: 2, low: 3 }[a.priority] - ({ critical: 0, high: 1, normal: 2, low: 3 }[b.priority])))[0];
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
    byId('moderationConfirmForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void executeLiveDecision();
    });
    queryAll('[data-action="cancel-moderation-confirm"]').forEach((button) => button.addEventListener('click', () => {
      byId('moderationConfirmModal').close();
    }));
    byId('moderationConfirmModal')?.addEventListener('close', () => { pendingModerationAction = null; });
    queryAll('[data-drawer-tab]').forEach((button) => button.addEventListener('click', () => { activeDrawerTab = button.dataset.drawerTab; renderDrawerTab(); }));
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
    queryAll('[data-audit-filter]').forEach((button) => button.addEventListener('click', () => { queryAll('[data-audit-filter]').forEach((item) => item.classList.toggle('active', item === button)); renderAudit(button.dataset.auditFilter, byId('auditSearch').value); }));
    byId('auditSearch').addEventListener('input', () => renderAudit(query('[data-audit-filter].active')?.dataset.auditFilter || 'all', byId('auditSearch').value));
    query('[data-action="export-audit"]')?.addEventListener('click', () => showToast('Production export will require a reason, permission check, and audited export record.'));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !byId('moderationConfirmModal')?.open) closeDrawer();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openGlobalSearch(); }
    });
    window.addEventListener('storage', (event) => { if ([businessProfileKey, ...businessCampaignKeys].includes(event.key)) renderAll(); });
    if (liveMode) {
      byId('adminEnvironmentBar').innerHTML = '<strong>Production controls</strong><span>Live authorized data</span><span>Trust &amp; Safety actions audited</span>';
      byId('adminAuthDescription').textContent = 'Sign in with your normal authorized Doji account.';
      byId('adminEmail').value = '';
      byId('adminPassword').value = '';
      adminSigninForm.querySelector('button[type="submit"]').textContent = 'Sign in';
      byId('adminAuthHint').textContent = 'Your password is sent only to Doji authentication. No administrator data loads until your identity and security requirements are verified.';
      const claimNext = query('[data-action="claim-next"]');
      if (claimNext) claimNext.textContent = 'Claim next report';
      query('[data-action="new-announcement"]')?.setAttribute('hidden', '');
      queryAll('[data-action="exit-demo"]').forEach((button) => button.addEventListener('click', () => {
        liveClient?.signOut();
        if (liveRefreshTimer) clearTimeout(liveRefreshTimer);
        liveRefreshTimer = null;
        liveSession = null; liveSnapshot = null; liveWork = []; liveAppeals = [];
      }));
      renderAll();
      if (liveClient?.hasSession()) {
        setSigninStatus('Restoring your protected session…');
        refreshLiveData().then(() => { setSigninStatus(''); enterDemo(); void startLiveRealtime(); }).catch((error) => {
          liveClient.clearSession();
          setSigninStatus(error instanceof Error ? error.message : 'Sign in again to continue.', 'error');
        });
      }
    } else {
      renderAll();
    }
  }
})();
