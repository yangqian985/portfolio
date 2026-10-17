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

const lightbox = document.querySelector('#lab-lightbox');
if (lightbox && typeof lightbox.showModal === 'function') {
  const image = lightbox.querySelector('img');
  const title = lightbox.querySelector('h2');
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
    title.textContent = thumbnail.alt;
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
