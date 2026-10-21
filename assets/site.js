// All content and navigation remain available without JavaScript.
document.querySelectorAll('.sidenav, .case-index').forEach(navigation => {
  const links = [...navigation.querySelectorAll('a[href^="#"]')];
  const sections = links.map(link => document.querySelector(link.hash)).filter(Boolean);
  const setCurrent = id => {
    links.forEach(link => {
      if (link.hash === `#${id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  setCurrent(sections[0]?.id);
  links.forEach(link => link.addEventListener('click', () => setCurrent(link.hash.slice(1))));
  if ('IntersectionObserver' in window) {
    const visible = new Set();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      });
      // Prefer the new chapter in the reading band when two sections overlap it.
      const current = [...sections].reverse().find(section => visible.has(section));
      if (current) setCurrent(current.id);
    }, { rootMargin: '-15% 0px -60% 0px', threshold: 0 });
    sections.forEach(section => observer.observe(section));
  }
});

document.querySelectorAll('[data-copy-text]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', async () => {
      const status = document.querySelector('[data-copy-status]');
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(button.dataset.copyText);
        } else if (!copySelectedEmail(button)) {
          if (status) status.textContent = '邮箱已选中，可手动复制。';
          return;
        }
        if (status) status.textContent = '邮箱已复制，可粘贴到邮件或聊天中。';
      } catch {
        const copied = copySelectedEmail(button);
        if (status) status.textContent = copied ? '邮箱已复制，可粘贴到邮件或聊天中。' : '邮箱已选中，可手动复制。';
      } finally {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    });
});

function copySelectedEmail(button) {
  const link = button.parentElement.querySelector('a');
  const selection = window.getSelection();
  if (!link || !selection) return false;
  const range = document.createRange();
  range.selectNodeContents(link);
  selection.removeAllRanges();
  selection.addRange(range);
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { /* Keep the email selected for manual copying. */ }
  if (copied) selection.removeAllRanges();
  return copied;
}

const lightbox = document.querySelector('#lab-lightbox');
if (lightbox && typeof lightbox.showModal === 'function') {
  const image = lightbox.querySelector('img');
  const title = lightbox.querySelector('h2');
  const description = lightbox.querySelector('[data-lightbox-description]');
  const previous = lightbox.querySelector('[data-image-prev]');
  const next = lightbox.querySelector('[data-image-next]');
  const counter = lightbox.querySelector('[data-image-counter]');
  const buttons = [...document.querySelectorAll('[data-lightbox]')];
  let trigger;
  let active = 0;
  const showImage = index => {
    active = Math.max(0, Math.min(buttons.length - 1, index));
    const button = buttons[active];
    const thumbnail = button.querySelector('img');
    image.src = button.dataset.fullImage || thumbnail.src;
    image.alt = thumbnail.alt;
    title.textContent = button.dataset.lightboxTitle || thumbnail.alt;
    if (description) {
      description.textContent = button.dataset.lightboxDescription || '';
      description.hidden = !description.textContent;
      if (description.textContent) lightbox.setAttribute('aria-describedby', description.id);
      else lightbox.removeAttribute('aria-describedby');
    }
    if (counter) counter.textContent = `${active + 1} / ${buttons.length}`;
    if (previous) previous.disabled = active === 0;
    if (next) next.disabled = active === buttons.length - 1;
  };
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => {
      trigger = button;
      showImage(index);
      lightbox.showModal();
      document.body.classList.add('lightbox-open');
    });
  });
  previous?.addEventListener('click', () => showImage(active - 1));
  next?.addEventListener('click', () => showImage(active + 1));
  lightbox.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showImage(active + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  lightbox.querySelector('.lightbox-close').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', event => {
    const rect = lightbox.getBoundingClientRect();
    if (event.target === lightbox && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) lightbox.close();
  });
  lightbox.addEventListener('close', () => {
    document.body.classList.remove('lightbox-open');
    trigger?.focus();
  });
}
