
/* ==========================================================================
   COMMON LAYOUT & UTILITY SCRIPTS
   Provides shared configuration, navbar/sidebar interactions, and modals.
   ========================================================================== */

// Global API Base URL (defaults to local FastAPI server).
// Configure this for your deployed backend when hosting the application.
// api.js resolves local development hosts and requires an explicit production
// API_BASE_URL. Do not replace an invalid/missing configuration with a fallback.
if (typeof window.API_BASE_URL === "undefined") {
    window.API_BASE_URL = null;
}


/* ========================================
   COMMON NAVBAR NOTIFICATIONS
======================================== */

const notificationBtn = document.getElementById("notificationBtn");

if (notificationBtn) {
    notificationBtn.addEventListener("click", () => {
        alert("No new notifications.");
    });
}


/* ========================================
   AUTHENTICATION & SESSION SECURITY GUARD
======================================== */

(async function checkAuthGuard() {
    const pathname = window.location.pathname.toLowerCase();

    const isLoginPage =
        pathname.endsWith("login.html") ||
        pathname.endsWith("/login") ||
        pathname === "/" ||
        pathname.endsWith("/html/");

    // Login page must remain accessible without an existing session.
    if (isLoginPage) return;

    try {
        if (typeof window.authenticatedFetch !== "function") {
            throw new Error("Authenticated API client is unavailable.");
        }

        const response = await window.authenticatedFetch("/api/auth/verify");
        if (!response.ok) {
            throw new Error("Session verification failed.");
        }

        const payload = await response.json();
        const user = payload?.user;
        const role = user?.role;
        const file = pathname.split("/").pop();
        const pageRoles = {
            "dashboard.html": ["admin"], "settings.html": ["admin"],
            "add_student.html": ["admin"], "edit_student.html": ["admin"],
            "add_teacher.html": ["admin"], "edit_teacher.html": ["admin"],
            "fees.html": ["admin", "staff"], "transport.html": ["admin", "staff"],
            "attendance.html": ["admin", "teacher"], "student.html": ["admin", "teacher", "staff"],
            "teacher.html": ["admin", "teacher", "staff"], "subject.html": ["admin", "teacher", "staff"],
            "timetable.html": ["admin", "teacher", "staff"], "calendar.html": ["admin", "teacher", "staff"],
            "notice.html": ["admin", "teacher", "staff"], "exam.html": ["admin", "teacher"]
            ,"help.html": ["admin", "teacher", "staff"]
        };
        const allowedRoles = pageRoles[file] || ["admin"];

        if (
            payload?.valid !== true ||
            !user ||
            !["admin", "teacher", "staff"].includes(role) ||
            !allowedRoles.includes(role)
        ) {
            sessionStorage.removeItem("abc_school_session");
            window.location.replace("login.html");
            return;
        }

        // This data drives only UI display. The server-side cookie/session is
        // authoritative for authentication, expiry, and authorization.
        sessionStorage.setItem(
            "abc_school_session",
            JSON.stringify({
                authenticated: true,
                user,
                loginTime: new Date().toISOString()
            })
        );
    } catch (error) {
        sessionStorage.removeItem("abc_school_session");
        window.location.replace("login.html");
    }
})();


/* ========================================
   GLOBAL LOGOUT FUNCTION
======================================== */

window.performAppLogout = async function () {
    try {
        if (window.api && typeof window.api.logout === "function") {
            await window.api.logout();
        }
    } catch (error) {
        // Local logout still proceeds if the backend is unreachable.
    }

    // Always clear the browser-side session.
    sessionStorage.removeItem("abc_school_session");

    // Return to the login page.
    window.location.replace("login.html");
};


/* ========================================
   LOGOUT CONFIRMATION MODAL
======================================== */

window.confirmAndLogout = function () {
    // Avoid creating duplicate confirmation dialogs.
    if (document.querySelector(".logout-modal-overlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "logout-modal-overlay";

    // This markup is static; no user-controlled values are interpolated.
    overlay.innerHTML = `
        <div class="logout-modal-card"
             role="dialog"
             aria-modal="true"
             aria-labelledby="logoutModalTitle">

            <div class="logout-modal-icon" aria-hidden="true">↪</div>

            <h3 id="logoutModalTitle">Confirm Sign Out</h3>

            <p>
                Are you sure you want to log out from ABC Public School
                portal? You will need to re-authenticate to access
                administrative features.
            </p>

            <div class="logout-modal-actions">
                <button type="button"
                        class="logout-modal-btn logout-btn-cancel"
                        id="cancelLogoutModalBtn">
                    Stay Logged In
                </button>

                <button type="button"
                        class="logout-modal-btn logout-btn-confirm"
                        id="confirmLogoutModalBtn">
                    Log Out
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const cancelBtn = overlay.querySelector("#cancelLogoutModalBtn");
    const confirmBtn = overlay.querySelector("#confirmLogoutModalBtn");

    const cleanup = () => {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
    };

    const onKey = (event) => {
        if (event.key === "Escape") {
            cleanup();
        }
    };

    document.addEventListener("keydown", onKey);

    cancelBtn.addEventListener("click", cleanup);

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            cleanup();
        }
    });

    confirmBtn.addEventListener("click", async () => {
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        confirmBtn.textContent = "Logging out...";

        await window.performAppLogout();
    });

    cancelBtn.focus();
};


/* ========================================
   GLOBAL DELEGATED LOGOUT EVENT LISTENER
======================================== */

document.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const logoutTarget = target.closest(
        "#logoutBtn, .logout-btn, .top-logout-btn"
    );

    if (logoutTarget) {
        event.preventDefault();
        event.stopPropagation();
        window.confirmAndLogout();
    }
});


/* ========================================
   SYNC USER PROFILE IN NAVBAR / TOPBAR
======================================== */

function syncTopbarUserProfile() {
    try {
        const raw = sessionStorage.getItem("abc_school_session");

        if (!raw) return;

        const session = JSON.parse(raw);

        if (!session || !session.user) return;

        const userName =
            session.user.name ||
            session.user.username ||
            "Admin";

        const userRole = session.user.role
            ? session.user.role.charAt(0).toUpperCase() +
              session.user.role.slice(1)
            : "Administrator";

        const initials = userName
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((part) => part[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();

        const userAvatar = session.user.avatar || initials || "AS";

        document.querySelectorAll(".top-profile").forEach((profile) => {
            const avatarEl = profile.querySelector(".profile-avatar");
            const nameEl = profile.querySelector(
                ".top-profile-info strong"
            );
            const roleEl = profile.querySelector(
                ".top-profile-info span"
            );

            // textContent safely displays dynamic profile information.
            if (avatarEl) avatarEl.textContent = userAvatar;
            if (nameEl) nameEl.textContent = userName;
            if (roleEl) roleEl.textContent = userRole;

            const parent = profile.parentElement;

            if (
                parent &&
                !parent.querySelector(".top-logout-btn")
            ) {
                const topLogout = document.createElement("button");

                topLogout.type = "button";
                topLogout.className = "top-logout-btn";
                topLogout.title = "Logout from portal";

                const icon = document.createElement("span");
                icon.className = "top-logout-icon";
                icon.textContent = "↪";

                const label = document.createElement("span");
                label.textContent = "Logout";

                topLogout.append(icon, label);
                parent.appendChild(topLogout);
            }
        });
    } catch (error) {
        // Do not break page initialization if profile data is unavailable.
    }
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        syncTopbarUserProfile
    );
} else {
    syncTopbarUserProfile();
}


/* ========================================
   REUSABLE DELETE COUNTDOWN MODAL
======================================== */

/**
 * Displays a standardized delete confirmation modal.
 *
 * Supported options:
 * - title
 * - initialMessage
 * - confirmMessage
 * - countdownSeconds
 * - onConfirm
 */
window.showDeleteConfirmationModal = function ({
    title = "Confirm Deletion",
    initialMessage = "Please wait before confirmation.",
    confirmMessage =
        "Are you sure you want to permanently delete this record?",
    countdownSeconds = 5,
    onConfirm
} = {}) {
    // Validate the callback before creating a modal.
    if (typeof onConfirm !== "function") {
        console.error(
            "Delete confirmation requires a valid onConfirm function."
        );
        return;
    }

    // Prevent duplicate delete dialogs.
    if (document.querySelector(".delete-modal-overlay")) return;

    // Restrict countdown to a safe, reasonable integer.
    const secondsToWait = Number.isFinite(Number(countdownSeconds))
        ? Math.min(Math.max(Math.floor(Number(countdownSeconds)), 0), 60)
        : 5;

    const modal = document.createElement("div");
    modal.className = "delete-modal-overlay";

    // Static markup only. Dynamic text is added using textContent below.
    modal.innerHTML = `
        <div class="delete-modal"
             role="dialog"
             aria-modal="true"
             aria-labelledby="deleteModalTitle">

            <h3 id="deleteModalTitle"></h3>

            <p id="deleteMessage"></p>

            <div class="delete-countdown" id="deleteCountdown"></div>

            <div class="delete-actions">
                <button type="button"
                        class="delete-cancel-btn"
                        id="deleteCancelBtn">
                    Cancel
                </button>

                <button type="button"
                        class="delete-confirm-btn"
                        id="deleteConfirmBtn"
                        disabled>
                    Confirm Delete
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const titleEl = modal.querySelector("#deleteModalTitle");
    const messageEl = modal.querySelector("#deleteMessage");
    const countdownEl = modal.querySelector("#deleteCountdown");
    const cancelBtn = modal.querySelector("#deleteCancelBtn");
    const confirmBtn = modal.querySelector("#deleteConfirmBtn");

    // Safely display supplied text; HTML is not interpreted.
    titleEl.textContent = String(title);
    messageEl.textContent = String(initialMessage);
    countdownEl.textContent = String(secondsToWait);

    let seconds = secondsToWait;
    let timer = null;
    let isFinished = false;

    const cleanup = () => {
        if (timer !== null) {
            clearInterval(timer);
            timer = null;
        }

        modal.remove();
    };

    const enableConfirmation = () => {
        if (countdownEl) countdownEl.textContent = "✓";

        if (messageEl) {
            messageEl.textContent = String(confirmMessage);
        }

        confirmBtn.disabled = false;
        confirmBtn.classList.add("active");
    };

    if (seconds <= 0) {
        enableConfirmation();
    } else {
        timer = setInterval(() => {
            seconds -= 1;

            if (countdownEl) {
                countdownEl.textContent = String(seconds);
            }

            if (seconds <= 0) {
                clearInterval(timer);
                timer = null;
                enableConfirmation();
            }
        }, 1000);
    }

    cancelBtn.addEventListener("click", cleanup);

    confirmBtn.addEventListener("click", async () => {
        if (confirmBtn.disabled || isFinished) return;

        isFinished = true;
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        confirmBtn.textContent = "Deleting...";

        try {
            await onConfirm();
        } catch (error) {
            console.error("Delete operation failed:", error);
            alert(
                "The record could not be deleted. Please try again."
            );
        } finally {
            cleanup();
        }
    });

    // Allow Escape to cancel the pending confirmation.
    const onKey = (event) => {
        if (event.key === "Escape" && document.body.contains(modal)) {
            cleanup();
            document.removeEventListener("keydown", onKey);
        }
    };

    document.addEventListener("keydown", onKey);

    // Remove the keyboard listener when the modal is removed.
    const observer = new MutationObserver(() => {
        if (!document.body.contains(modal)) {
            document.removeEventListener("keydown", onKey);
            observer.disconnect();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
};
