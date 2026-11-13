
document.addEventListener("DOMContentLoaded", () => {

    const header = document.getElementById("siteHeader");
    const menuToggle = document.getElementById("menuToggle");
    const navMenu = document.getElementById("navMenu");
    const navLinks = document.querySelectorAll(".nav-link");

    // AUTOMATIC FOOTER YEAR
    const currentYear = document.getElementById("currentYear");

    if (currentYear) {
        currentYear.textContent = new Date().getFullYear();
    }

    // MOBILE MENU
    function closeMenu() {
        navMenu?.classList.remove("open");
        menuToggle?.classList.remove("open");
        menuToggle?.setAttribute("aria-expanded", "false");
        menuToggle?.setAttribute("aria-label", "Open navigation");
    }

    menuToggle?.addEventListener("click", () => {
        const isOpen = navMenu.classList.toggle("open");

        menuToggle.classList.toggle("open", isOpen);
        menuToggle.setAttribute("aria-expanded", String(isOpen));
        menuToggle.setAttribute(
            "aria-label",
            isOpen ? "Close navigation" : "Open navigation"
        );
    });

    // CLOSE MENU AFTER NAVIGATION
    navMenu?.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", closeMenu);
    });

    // CLOSE MENU WHEN CLICKING OUTSIDE
    document.addEventListener("click", event => {
        if (
            navMenu?.classList.contains("open") &&
            !navMenu.contains(event.target) &&
            !menuToggle.contains(event.target)
        ) {
            closeMenu();
        }
    });

    // ESCAPE KEY
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeMenu();
            closeLightbox();
        }
    });

    // HEADER SCROLL EFFECT
    function handleScroll() {
        header?.classList.toggle("scrolled", window.scrollY > 30);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    // ACTIVE NAVIGATION
    const sections = document.querySelectorAll("main section[id]");

    if ("IntersectionObserver" in window) {
        const sectionObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;

                navLinks.forEach(link => {
                    link.classList.toggle(
                        "active",
                        link.getAttribute("href") === `#${entry.target.id}`
                    );
                });
            });
        }, {
            rootMargin: "-35% 0px -55% 0px"
        });

        sections.forEach(section => sectionObserver.observe(section));
    }

    // SCROLL REVEAL
    const revealElements = document.querySelectorAll(".reveal");

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

        revealElements.forEach(element => revealObserver.observe(element));
    } else {
        revealElements.forEach(element => element.classList.add("visible"));
    }

    // GALLERY LIGHTBOX
    const lightbox = document.getElementById("lightbox");
    const lightboxImage = document.getElementById("lightboxImage");
    const lightboxClose = document.getElementById("lightboxClose");

    const galleryItems = document.querySelectorAll(".gallery-item");

    function openLightbox(image) {
        if (!image || !lightbox || !lightboxImage) return;

        lightboxImage.src = image.currentSrc || image.src;
        lightboxImage.alt = image.alt || "Gallery preview";

        lightbox.classList.add("active");
        lightbox.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";

        lightboxClose?.focus();
    }

    function closeLightbox() {
        if (!lightbox) return;

        lightbox.classList.remove("active");
        lightbox.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";

        if (lightboxImage) {
            lightboxImage.src = "";
        }
    }

    galleryItems.forEach(item => {
        item.addEventListener("click", () => {
            openLightbox(item.querySelector("img"));
        });
    });

    lightboxClose?.addEventListener("click", closeLightbox);

    lightbox?.addEventListener("click", event => {
        if (event.target === lightbox) {
            closeLightbox();
        }
    });

    // RESPONSIVE MENU
    window.addEventListener("resize", () => {
        if (window.innerWidth > 760) {
            closeMenu();
        }
    });

});
