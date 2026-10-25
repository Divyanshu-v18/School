
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const faqItems = document.querySelectorAll(".faq-item");

    faqItems.forEach(item => {
        const questionBtn = item.querySelector(".faq-question");
        if (!questionBtn) return;

        questionBtn.setAttribute(
            "aria-expanded",
            item.classList.contains("open") ? "true" : "false"
        );

        questionBtn.addEventListener("click", () => {
            const wasOpen = item.classList.contains("open");

            faqItems.forEach(otherItem => {
                otherItem.classList.remove("open");

                const otherButton = otherItem.querySelector(".faq-question");
                if (otherButton) {
                    otherButton.setAttribute("aria-expanded", "false");
                }
            });

            if (!wasOpen) {
                item.classList.add("open");
                questionBtn.setAttribute("aria-expanded", "true");
            }
        });
    });

    if (faqItems.length > 0) {
        faqItems[0].classList.add("open");

        const firstButton = faqItems[0].querySelector(".faq-question");
        if (firstButton) {
            firstButton.setAttribute("aria-expanded", "true");
        }
    }
});
