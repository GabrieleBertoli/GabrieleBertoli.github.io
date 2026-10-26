(() => {
  'use strict';

  // Navigation stays visible when JavaScript is unavailable.
  const menuButton = document.getElementById('menuToggle');
  const menuLabel = document.getElementById('menuLabel');
  const nav = document.getElementById('primaryNav');
  const mobile = window.matchMedia('(max-width: 760px)');

  const setMenu = (open, returnFocus = false) => {
    nav.hidden = mobile.matches && !open;
    menuButton.setAttribute('aria-expanded', String(mobile.matches && open));
    menuLabel.textContent = open && mobile.matches ? 'Close' : 'Menu';
    if (returnFocus) menuButton.focus();
  };

  setMenu(false);
  menuButton.addEventListener('click', () => {
    setMenu(menuButton.getAttribute('aria-expanded') !== 'true');
  });
  mobile.addEventListener('change', () => setMenu(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      setMenu(false, true);
    }
  });
  document.addEventListener('click', (event) => {
    if (mobile.matches && !event.target.closest('.site-header')) setMenu(false);
  });
  nav.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link || !mobile.matches) return;
    setMenu(false);
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });

  // Highlight the parent topic while reading its related sections.
  const sectionGroups = {
    research: 'research', projects: 'research', publications: 'publications',
    about: 'about', experience: 'about', teaching: 'about', contact: 'contact'
  };
  const sections = Array.from(document.querySelectorAll('main > section[id]'));
  const navLinks = Array.from(nav.querySelectorAll('a'));
  const updateActiveSection = () => {
    let active = '';
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= 165) active = sectionGroups[section.id] || '';
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      active = 'contact';
    }
    navLinks.forEach((link) => {
      if (link.hash === '#' + active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  let scrollPending = false;
  window.addEventListener('scroll', () => {
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => {
      updateActiveSection();
      scrollPending = false;
    });
  }, { passive: true });
  window.addEventListener('resize', updateActiveSection);
  updateActiveSection();

  document.getElementById('currentYear').textContent = new Date().getFullYear();
  const copyButton = document.getElementById('copyEmail');
  const copyStatus = document.getElementById('copyStatus');
  const email = document.getElementById('emailLink').getAttribute('href').slice('mailto:'.length);
  let copyReset;
  copyButton.addEventListener('click', async () => {
    clearTimeout(copyReset);
    try {
      await navigator.clipboard.writeText(email);
      copyButton.textContent = 'Copied ✓';
      copyStatus.textContent = 'Email address copied to the clipboard.';
      copyReset = setTimeout(() => { copyButton.textContent = 'Copy email'; }, 2000);
    } catch {
      copyButton.textContent = 'Copy email';
      copyStatus.textContent = 'Copy is unavailable. Select the email address to copy it, or follow the link to send an email.';
    }
  });

  const orcidId = '0000-0001-8686-5563';
  const orcidUrl = 'https://orcid.org/' + orcidId;
  const publicationsList = document.getElementById('publicationsList');
  const publicationStatus = document.getElementById('publicationStatus');

  const publicationLink = (summary) => {
    const identifiers = summary['external-ids']?.['external-id'] || [];
    const doi = identifiers.find((id) => id['external-id-type']?.toLowerCase() === 'doi');
    const doiValue = String(doi?.['external-id-value'] || '').trim();
    if (doiValue) {
      const cleanDoi = doiValue.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
      return 'https://doi.org/' + cleanDoi;
    }
    const urlId = identifiers.find((id) => id['external-id-type']?.toLowerCase() === 'url');
    try {
      const url = new URL(urlId?.['external-id-value'] || '');
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    } catch { /* The public profile remains a useful fallback. */ }
    return orcidUrl;
  };

  const renderPublication = (publication) => {
    const article = document.createElement('article');
    article.className = 'publication';
    const year = document.createElement('span');
    year.className = 'publication-year';
    year.textContent = publication.year || '—';
    const body = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = publication.title;
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = [publication.venue, publication.type.replaceAll('-', ' ')].filter(Boolean).join(' · ') || 'ORCID public record';
    body.append(title, meta);
    const link = document.createElement('a');
    link.className = 'text-link';
    link.href = publication.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = publication.url === orcidUrl ? 'ORCID record' : 'Read publication';
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    link.append(arrow);
    article.append(year, body, link);
    return article;
  };

  const loadPublications = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    publicationsList.setAttribute('aria-busy', 'true');
    publicationStatus.textContent = 'Checking ORCID for recent works…';
    try {
      const response = await fetch('https://pub.orcid.org/v3.0/' + orcidId + '/works', {
        headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response.ok) throw new Error('Publication feed unavailable');
      const data = await response.json();
      const groups = Array.isArray(data.group) ? data.group : [];
      const publications = groups.map((group) => {
        const summary = group['work-summary']?.[0];
        if (!summary) return null;
        const date = summary['publication-date'] || {};
        return {
          title: String(summary.title?.title?.value || '').trim(),
          venue: String(summary['journal-title']?.value || '').trim(),
          type: String(summary.type || ''),
          year: Number.parseInt(date.year?.value, 10) || 0,
          month: Number.parseInt(date.month?.value, 10) || 0,
          day: Number.parseInt(date.day?.value, 10) || 0,
          url: publicationLink(summary)
        };
      }).filter((publication) => publication?.title);
      publications.sort((a, b) => b.year - a.year || b.month - a.month || b.day - a.day || a.title.localeCompare(b.title));
      if (!publications.length) throw new Error('No public works');
      publicationsList.replaceChildren(...publications.slice(0, 4).map(renderPublication));
      publicationStatus.textContent = 'Latest works · ORCID public record';
    } catch {
      // Preserve useful, working profile links if offline or the API is unavailable.
      publicationStatus.textContent = 'For the full publication list, visit ORCID or Google Scholar.';
    } finally {
      clearTimeout(timeout);
      publicationsList.setAttribute('aria-busy', 'false');
    }
  };
  loadPublications();
})();
