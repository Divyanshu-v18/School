document.addEventListener("DOMContentLoaded", () => {

  // ELEMENTS
  const header = document.getElementById("siteHeader");
  const menuToggle = document.getElementById("menuToggle");
  const navMenu = document.getElementById("navMenu");
  const navLinks = [...document.querySelectorAll(".nav-link")];

  const year = document.getElementById("currentYear");

  const lightbox = document.getElementById("lightbox");
  const lightboxImage = document.getElementById("lightboxImage");
  const lightboxClose = document.getElementById("lightboxClose");


  // CURRENT YEAR
  if (year) {
    year.textContent = new Date().getFullYear();
  }


  // MOBILE NAVIGATION
  const closeMenu = () => {
    if (!menuToggle || !navMenu) return;

    menuToggle.classList.remove("open");
    navMenu.classList.remove("open");

    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation");

    document.body.classList.remove("no-scroll");
  };

  if (menuToggle && navMenu) {

    menuToggle.addEventListener("click", () => {

      const isOpen =
        menuToggle.getAttribute("aria-expanded") === "true";

      menuToggle.classList.toggle("open", !isOpen);
      navMenu.classList.toggle("open", !isOpen);

      menuToggle.setAttribute(
        "aria-expanded",
        String(!isOpen)
      );

      menuToggle.setAttribute(
        "aria-label",
        isOpen ? "Open navigation" : "Close navigation"
      );

      document.body.classList.toggle(
        "no-scroll",
        !isOpen && window.innerWidth <= 760
      );

    });

    navLinks.forEach(link => {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeMenu();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 760) {
        closeMenu();
      }
    });

  }


  // HEADER SCROLL EFFECT
  const updateHeader = () => {
    if (!header) return;

    header.classList.toggle(
      "scrolled",
      window.scrollY > 12
    );
  };

  updateHeader();

  window.addEventListener(
    "scroll",
    updateHeader,
    { passive: true }
  );


  // SCROLL REVEAL ANIMATION
  const revealItems = document.querySelectorAll(".reveal");

  if ("IntersectionObserver" in window) {

    const revealObserver = new IntersectionObserver(
      (entries, observer) => {

        entries.forEach(entry => {

          if (entry.isIntersecting) {

            entry.target.classList.add("visible");

            observer.unobserve(entry.target);

          }

        });

      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -35px 0px"
      }
    );

    revealItems.forEach(item => {
      revealObserver.observe(item);
    });

  } else {

    revealItems.forEach(item => {
      item.classList.add("visible");
    });

  }


  // ACTIVE NAVIGATION
  const sections = [
    ...document.querySelectorAll("main section[id]")
  ];

  if (
    "IntersectionObserver" in window &&
    sections.length
  ) {

    const sectionObserver = new IntersectionObserver(
      entries => {

        entries.forEach(entry => {

          if (!entry.isIntersecting) return;

          const activeId = entry.target.id;

          navLinks.forEach(link => {

            link.classList.toggle(
              "active",
              link.getAttribute("href") === `#${activeId}`
            );

          });

        });

      },
      {
        rootMargin: "-35% 0px -55% 0px"
      }
    );

    sections.forEach(section => {
      sectionObserver.observe(section);
    });

  }


  // GALLERY LIGHTBOX
  const openLightbox = image => {

    if (!lightbox || !lightboxImage || !image) {
      return;
    }

    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt || "Gallery preview";

    lightbox.classList.add("open");

    lightbox.setAttribute("aria-hidden", "false");

    document.body.classList.add("no-scroll");

    if (lightboxClose) {
      lightboxClose.focus();
    }

  };


  const closeLightbox = () => {

    if (!lightbox || !lightboxImage) {
      return;
    }

    lightbox.classList.remove("open");

    lightbox.setAttribute("aria-hidden", "true");

    lightboxImage.src = "";

    document.body.classList.remove("no-scroll");

  };


  // OPEN IMAGE WHEN GALLERY ITEM IS CLICKED
  document.querySelectorAll(".gallery-item").forEach(button => {

    button.addEventListener("click", () => {

      const image = button.querySelector("img");

      openLightbox(image);

    });

  });


  // CLOSE BUTTON
  if (lightboxClose) {

    lightboxClose.addEventListener(
      "click",
      closeLightbox
    );

  }


  // CLOSE WHEN BACKGROUND IS CLICKED
  if (lightbox) {

    lightbox.addEventListener("click", event => {

      if (event.target === lightbox) {
        closeLightbox();
      }

    });

  }


  // CLOSE WITH ESCAPE KEY
  document.addEventListener("keydown", event => {

    if (
      event.key === "Escape" &&
      lightbox?.classList.contains("open")
    ) {
      closeLightbox();
    }

  });

});