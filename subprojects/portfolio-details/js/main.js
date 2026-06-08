function initCaseNav() {
  const nav = document.querySelector(".case-nav__links");
  if (!nav) return;

  const links = [...nav.querySelectorAll("a")];
  const sections = links
    .map((link) => {
      const id = link.getAttribute("href")?.replace("#", "");
      const el = id ? document.getElementById(id) : null;
      return el ? { link, el } : null;
    })
    .filter(Boolean);

  if (!sections.length) return;

  const setActive = (id) => {
    links.forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === `#${id}`);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.id) setActive(visible.target.id);
    },
    { rootMargin: "-20% 0px -60% 0px", threshold: [0, 0.25, 0.5] }
  );

  sections.forEach(({ el }) => observer.observe(el));
}

document.addEventListener("DOMContentLoaded", initCaseNav);
