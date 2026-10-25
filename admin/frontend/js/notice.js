
/* ==========================================================================
   NOTICE MANAGEMENT
   Safe notice rendering, category filtering, publishing, and deletion.
   Requires api.js with authenticatedFetch().
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);
    let allNotices = [];
    let selectedCategory = "";

    const container = $("noticesContainer");
    const searchInput = $("noticeSearchInput");
    const catPills = document.querySelectorAll(".cat-pill");
    const modal = $("publishNoticeModal");
    const openBtn = $("openPublishNoticeBtn");
    const closeBtn = $("closePublishNoticeBtn");
    const cancelBtn = $("cancelPublishNoticeBtn");
    const form = $("publishNoticeForm");

    const apiBase = () =>
        (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

    function request(url, options) {
        if (typeof window.authenticatedFetch !== "function") {
            throw new Error("Authentication helper unavailable. Check api.js.");
        }
        return window.authenticatedFetch(url, options);
    }

    function validId(id) {
        return /^\d+$/.test(String(id ?? "")) && Number(id) > 0;
    }

    function safeClass(value) {
        const normalized = String(value || "General").toLowerCase();
        return /^[a-z0-9_-]+$/.test(normalized) ? normalized : "general";
    }

    async function loadNotices() {
        try {
            const response = await request(`${apiBase()}/notices`);
            if (!response.ok) throw new Error(`Failed to load notices (HTTP ${response.status}).`);

            const data = await response.json();
            if (!Array.isArray(data)) throw new Error("Unexpected notices response.");

            allNotices = data;
            renderNotices();
        } catch (error) {
            console.error("Notice load error:", error);
            if (container) {
                container.replaceChildren();
                const message = document.createElement("p");
                message.className = "muted-loading";
                message.textContent = "Failed to load notices. Please check your session and backend.";
                container.appendChild(message);
            }
        }
    }

    function renderNotices() {
        if (!container) return;
        container.replaceChildren();

        const term = (searchInput?.value || "").toLowerCase().trim();
        const filtered = allNotices.filter((notice) => {
            const category = String(notice.category || "General");
            const matchesCategory = !selectedCategory ||
                category.toLowerCase() === selectedCategory.toLowerCase();
            const matchesSearch =
                String(notice.title || "").toLowerCase().includes(term) ||
                String(notice.content || "").toLowerCase().includes(term);

            return matchesCategory && matchesSearch;
        });

        if (!filtered.length) {
            const message = document.createElement("p");
            message.className = "muted-loading";
            message.textContent = "No announcements found matching selected criteria.";
            container.appendChild(message);
            return;
        }

        filtered.forEach((notice) => {
            const card = document.createElement("div");
            const category = String(notice.category || "General");
            const categoryClass = safeClass(category);
            card.className = `notice-card ${categoryClass}`;

            const top = document.createElement("div");
            top.className = "notice-top";

            const title = document.createElement("h4");
            title.className = "notice-title";
            title.textContent = String(notice.title || "Untitled notice");

            const badge = document.createElement("span");
            badge.className = `badge-cat ${categoryClass}`;
            badge.textContent = category;

            top.append(title, badge);
            card.appendChild(top);

            const body = document.createElement("div");
            body.className = "notice-body";
            body.textContent = String(notice.content || "");
            card.appendChild(body);

            const footer = document.createElement("div");
            footer.className = "notice-footer";

            const published = document.createElement("span");
            const date = typeof notice.created_at === "string"
                ? notice.created_at.split("T")[0]
                : "";
            published.textContent = `📅 Published: ${date || "Recent"}`;

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "delete-notice-btn";
            deleteBtn.textContent = "Delete Notice";
            deleteBtn.addEventListener("click", () => deleteNotice(notice.notice_id));

            footer.append(published, deleteBtn);
            card.append(top, body, footer);
            container.appendChild(card);
        });
    }

    catPills.forEach((pill) => {
        pill.addEventListener("click", () => {
            catPills.forEach((item) => item.classList.remove("active"));
            pill.classList.add("active");
            selectedCategory = pill.getAttribute("data-category") || "";
            renderNotices();
        });
    });

    openBtn?.addEventListener("click", () => {
        form?.reset();
        if (modal) modal.style.display = "flex";
    });

    function closeModal() {
        if (modal) modal.style.display = "none";
    }
    closeBtn?.addEventListener("click", closeModal);
    cancelBtn?.addEventListener("click", closeModal);

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        const titleField = $("notTitle");
        const categoryField = $("notCat");
        const contentField = $("notContent");

        if (!titleField || !categoryField || !contentField) {
            alert("The notice form is missing required fields.");
            return;
        }

        const payload = {
            title: titleField.value.trim(),
            category: categoryField.value,
            content: contentField.value.trim(),
            is_active: true
        };

        if (!payload.title || !payload.content) {
            alert("Enter both a notice title and its content.");
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const response = await request(`${apiBase()}/notices`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                let message = `Failed to publish notice (HTTP ${response.status}).`;
                try {
                    const result = await response.json();
                    if (typeof result.detail === "string") message = result.detail;
                } catch (_) {}
                throw new Error(message);
            }

            closeModal();
            await loadNotices();
        } catch (error) {
            alert(`Unable to publish notice: ${error.message}`);
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    async function deleteNotice(id) {
        if (!validId(id)) return alert("Invalid notice ID.");
        if (!confirm("Are you sure you want to remove this notice?")) return;

        try {
            const response = await request(
                `${apiBase()}/notices/${encodeURIComponent(id)}`,
                { method: "DELETE" }
            );

            if (!response.ok) {
                let msg = `Failed to delete notice (HTTP ${response.status}).`;
                try {
                    const result = await response.json();
                    if (typeof result.detail === "string") msg = result.detail;
                } catch (_) {}
                throw new Error(msg);
            }

            await loadNotices();
        } catch (error) {
            alert(`Unable to delete notice: ${error.message}`);
        }
    }

    window.deleteNotice = deleteNotice;
    searchInput?.addEventListener("input", renderNotices);

    loadNotices();
});
