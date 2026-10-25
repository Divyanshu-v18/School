
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const searchInput = document.getElementById("bookSearchInput");
    const genreFilter = document.getElementById("genreFilter");
    const tableBody = document.getElementById("booksTableBody");
    const issueBtn = document.getElementById("openIssueBookBtn");

    function filterBooks() {
        if (!tableBody) return;

        const term = (searchInput?.value || "").toLowerCase().trim();
        const genre = (genreFilter?.value || "").toLowerCase().trim();

        tableBody.querySelectorAll("tr").forEach(row => {
            const text = (row.textContent || "").toLowerCase();
            const matchesSearch = !term || text.includes(term);
            const matchesGenre = !genre || text.includes(genre);

            row.hidden = !(matchesSearch && matchesGenre);
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", filterBooks);
    }

    if (genreFilter) {
        genreFilter.addEventListener("change", filterBooks);
    }

    if (issueBtn) {
        issueBtn.addEventListener("click", () => {
            alert(
                "Book checkout is not implemented yet. " +
                "The checkout flow will need student verification and book availability checks."
            );
        });
    }

    filterBooks();
});
