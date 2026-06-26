(function () {
    "use strict";

    const PAGE_SIZE = 10;

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------
    function $(id) { return document.getElementById(id); }

    function debounce(fn, delay) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function letterFor(i) { return String.fromCharCode(65 + i); }

    // ---------------------------------------------------------------------
    // View switching
    // ---------------------------------------------------------------------
    const sections = document.querySelectorAll("[data-section]");
    const navLinks = document.querySelectorAll("[data-view]");

    function showView(view) {
        sections.forEach(s => s.classList.toggle("d-none", s.dataset.section !== view));
        document.querySelectorAll(".navbar-nav .nav-link").forEach(l => {
            l.classList.toggle("active", l.dataset.view === view);
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            showView(link.dataset.view);
        });
    });

    // ---------------------------------------------------------------------
    // Stats + categories (shared)
    // ---------------------------------------------------------------------
    async function loadStats() {
        try {
            const data = await (await fetch("/api/stats")).json();
            const map = { statTotal: data.total, statBasic: data.basic, statAdvanced: data.advanced, statCategories: data.categories };
            Object.keys(map).forEach(id => { const el = $(id); if (el) el.textContent = map[id]; });
        } catch (e) { console.error("stats", e); }
    }

    async function loadCategories() {
        try {
            const categories = await (await fetch("/api/categories")).json();
            const targets = [$("categorySelect"), $("quizCategory"), $("aiCategory")];
            categories.forEach(c => {
                targets.forEach(sel => {
                    const opt = document.createElement("option");
                    opt.value = c; opt.textContent = c;
                    sel.appendChild(opt);
                });
            });
            // About page subject pills
            const pills = $("aboutSubjects");
            categories.forEach(c => {
                const span = document.createElement("span");
                span.className = "subject-pill";
                span.textContent = c;
                pills.appendChild(span);
            });
            buildLearnGrid(categories);
        } catch (e) { console.error("categories", e); }
    }

    // ---------------------------------------------------------------------
    // PRACTICE view
    // ---------------------------------------------------------------------
    const practice = {
        search: "", level: "", category: "", page: 0, total: 0, loaded: 0
    };
    const els = {
        list: $("questionList"),
        searchInput: $("searchInput"),
        clearSearch: $("clearSearch"),
        levelSelect: $("levelSelect"),
        categorySelect: $("categorySelect"),
        resetBtn: $("resetBtn"),
        resultCount: $("resultCount"),
        activeFilters: $("activeFilters"),
        loadMoreBtn: $("loadMoreBtn"),
        emptyState: $("emptyState"),
        template: $("questionTemplate")
    };

    function highlight(text) {
        const safe = escapeHtml(text);
        if (!practice.search) return safe;
        const term = practice.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!term) return safe;
        return safe.replace(new RegExp("(" + term + ")", "gi"), "<mark>$1</mark>");
    }

    function renderPracticeQuestion(q, indexLabel) {
        const node = els.template.content.cloneNode(true);
        const levelBadge = node.querySelector(".level-badge");
        levelBadge.textContent = q.level === "advanced" ? "Advanced" : "Basic";
        levelBadge.classList.add(q.level === "advanced" ? "advanced" : "basic");
        node.querySelector(".category-badge").textContent = q.category;
        node.querySelector(".q-index").textContent = "Q" + indexLabel;
        node.querySelector(".question-text").innerHTML = highlight(q.questionText);

        const optionsEl = node.querySelector(".options");
        const explanationEl = node.querySelector(".explanation");
        node.querySelector(".explanation-text").innerHTML = highlight(q.explanation || "");

        let answered = false;
        q.options.forEach((optText, i) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "list-group-item list-group-item-action d-flex align-items-center";
            item.innerHTML = '<span class="opt-letter">' + letterFor(i) + "</span><span>" + highlight(optText) + "</span>";
            item.addEventListener("click", () => {
                if (answered) return;
                answered = true;
                const all = optionsEl.querySelectorAll(".list-group-item");
                all.forEach(el => el.classList.add("disabled-opt"));
                if (all[q.correctIndex]) all[q.correctIndex].classList.add("correct");
                if (i !== q.correctIndex) item.classList.add("wrong");
                if (q.explanation) explanationEl.classList.remove("d-none");
            });
            optionsEl.appendChild(item);
        });
        els.list.appendChild(node);
    }

    function practiceQuery() {
        const p = new URLSearchParams();
        if (practice.search) p.set("search", practice.search);
        if (practice.level) p.set("level", practice.level);
        if (practice.category) p.set("category", practice.category);
        p.set("page", practice.page);
        p.set("size", PAGE_SIZE);
        return p.toString();
    }

    function updateActiveFilters() {
        const parts = [];
        if (practice.level) parts.push(practice.level === "advanced" ? "Advanced" : "Basic");
        if (practice.category) parts.push(practice.category);
        if (practice.search) parts.push('"' + practice.search + '"');
        els.activeFilters.textContent = parts.join(" \u00b7 ");
        els.activeFilters.classList.toggle("d-none", parts.length === 0);
    }

    async function fetchPracticePage(append) {
        try {
            const data = await (await fetch("/api/questions?" + practiceQuery())).json();
            if (!append) { els.list.innerHTML = ""; practice.loaded = 0; }
            practice.total = data.total;
            (data.items || []).forEach(q => { practice.loaded += 1; renderPracticeQuestion(q, practice.loaded); });
            els.emptyState.classList.toggle("d-none", practice.total !== 0);
            els.resultCount.textContent = practice.total === 0
                ? "No questions found"
                : "Showing " + practice.loaded + " of " + practice.total + " question" + (practice.total === 1 ? "" : "s");
            els.loadMoreBtn.classList.toggle("d-none", practice.loaded >= practice.total);
            updateActiveFilters();
        } catch (e) {
            console.error("questions", e);
            els.resultCount.textContent = "Error loading questions";
        }
    }

    function reloadPractice() { practice.page = 0; fetchPracticePage(false); }

    els.searchInput.addEventListener("input", debounce(() => {
        practice.search = els.searchInput.value.trim();
        reloadPractice();
    }, 300));
    els.clearSearch.addEventListener("click", () => { els.searchInput.value = ""; practice.search = ""; reloadPractice(); });
    els.levelSelect.addEventListener("change", () => { practice.level = els.levelSelect.value; reloadPractice(); });
    els.categorySelect.addEventListener("change", () => { practice.category = els.categorySelect.value; reloadPractice(); });
    els.resetBtn.addEventListener("click", () => {
        els.searchInput.value = ""; els.levelSelect.value = ""; els.categorySelect.value = "";
        practice.search = ""; practice.level = ""; practice.category = ""; reloadPractice();
    });
    els.loadMoreBtn.addEventListener("click", () => { practice.page += 1; fetchPracticePage(true); });

    // ---------------------------------------------------------------------
    // QUIZ view
    // ---------------------------------------------------------------------
    const quiz = { questions: [], answers: [] };
    const quizEls = {
        setup: $("quizSetup"),
        active: $("quizActive"),
        result: $("quizResult"),
        count: $("quizCount"),
        level: $("quizLevel"),
        category: $("quizCategory"),
        startBtn: $("startQuizBtn"),
        questions: $("quizQuestions"),
        submitBtn: $("submitQuizBtn"),
        progress: $("quizProgress"),
        progressBar: $("quizProgressBar"),
        answeredBadge: $("quizAnsweredBadge"),
        retakeBtn: $("retakeBtn"),
        review: $("quizReview")
    };

    function updateQuizProgress() {
        const answered = quiz.answers.filter(a => a !== null && a !== undefined).length;
        const total = quiz.questions.length;
        quizEls.progress.textContent = "Answered " + answered + " of " + total;
        quizEls.answeredBadge.textContent = answered + " / " + total;
        quizEls.progressBar.style.width = (total ? (answered / total) * 100 : 0) + "%";
    }

    function renderQuizQuestion(q, idx) {
        const col = document.createElement("div");
        col.className = "col-12";
        const card = document.createElement("div");
        card.className = "card question-card shadow-sm";
        const body = document.createElement("div");
        body.className = "card-body";

        body.innerHTML =
            '<div class="d-flex justify-content-between align-items-start mb-2">' +
                '<div class="d-flex gap-2 flex-wrap">' +
                    '<span class="badge level-badge ' + (q.level === "advanced" ? "advanced" : "basic") + '">' +
                        (q.level === "advanced" ? "Advanced" : "Basic") + '</span>' +
                    '<span class="badge text-bg-light border">' + escapeHtml(q.category) + '</span>' +
                '</div>' +
                '<span class="text-muted small">Q' + (idx + 1) + '</span>' +
            '</div>' +
            '<p class="question-text fw-semibold mb-3">' + escapeHtml(q.questionText) + '</p>';

        const optionsEl = document.createElement("div");
        optionsEl.className = "options list-group";

        q.options.forEach((optText, i) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "list-group-item list-group-item-action d-flex align-items-center";
            item.innerHTML = '<span class="opt-letter">' + letterFor(i) + "</span><span>" + escapeHtml(optText) + "</span>";
            item.addEventListener("click", () => {
                quiz.answers[idx] = i;
                optionsEl.querySelectorAll(".list-group-item").forEach(el => el.classList.remove("selected"));
                item.classList.add("selected");
                updateQuizProgress();
            });
            optionsEl.appendChild(item);
        });

        body.appendChild(optionsEl);
        card.appendChild(body);
        col.appendChild(card);
        quizEls.questions.appendChild(col);
    }

    async function startQuiz() {
        const params = new URLSearchParams();
        params.set("count", quizEls.count.value);
        if (quizEls.level.value) params.set("level", quizEls.level.value);
        if (quizEls.category.value) params.set("category", quizEls.category.value);

        quizEls.startBtn.disabled = true;
        quizEls.startBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Loading...';
        try {
            const questions = await (await fetch("/api/quiz?" + params.toString())).json();
            quizEls.startBtn.disabled = false;
            quizEls.startBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Start Quiz';

            if (!questions.length) {
                alert("No questions found for that combination. Try different options.");
                return;
            }
            quiz.questions = questions;
            quiz.answers = new Array(questions.length).fill(null);
            quizEls.questions.innerHTML = "";
            questions.forEach((q, i) => renderQuizQuestion(q, i));

            quizEls.setup.classList.add("d-none");
            quizEls.result.classList.add("d-none");
            quizEls.active.classList.remove("d-none");
            updateQuizProgress();
            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (e) {
            console.error("quiz", e);
            quizEls.startBtn.disabled = false;
            quizEls.startBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Start Quiz';
            alert("Could not load the quiz. Please try again.");
        }
    }

    function reviewTag(type) {
        if (type === "correct") return '<span class="badge text-bg-success review-tag">Correct</span>';
        if (type === "wrong") return '<span class="badge text-bg-danger review-tag">Wrong</span>';
        return '<span class="badge text-bg-secondary review-tag">Skipped</span>';
    }

    function renderReviewQuestion(q, idx, userAnswer) {
        const correct = userAnswer === q.correctIndex;
        const skipped = userAnswer === null || userAnswer === undefined;
        const type = skipped ? "skipped" : (correct ? "correct" : "wrong");

        const col = document.createElement("div");
        col.className = "col-12";
        const card = document.createElement("div");
        card.className = "card question-card shadow-sm";
        const body = document.createElement("div");
        body.className = "card-body";

        body.innerHTML =
            '<div class="d-flex justify-content-between align-items-start mb-2">' +
                '<div class="d-flex gap-2 flex-wrap">' + reviewTag(type) +
                    '<span class="badge text-bg-light border">' + escapeHtml(q.category) + '</span>' +
                '</div>' +
                '<span class="text-muted small">Q' + (idx + 1) + '</span>' +
            '</div>' +
            '<p class="question-text fw-semibold mb-3">' + escapeHtml(q.questionText) + '</p>';

        const optionsEl = document.createElement("div");
        optionsEl.className = "options list-group";
        q.options.forEach((optText, i) => {
            const item = document.createElement("div");
            item.className = "list-group-item d-flex align-items-center disabled-opt";
            let suffix = "";
            if (i === q.correctIndex) {
                item.classList.add("reveal-correct");
                suffix = ' <i class="bi bi-check-circle-fill text-success ms-2"></i>';
            }
            if (!skipped && i === userAnswer && i !== q.correctIndex) {
                item.classList.add("user-wrong");
                suffix = ' <i class="bi bi-x-circle-fill text-danger ms-2"></i> <span class="small text-muted">your answer</span>';
            }
            if (!skipped && i === userAnswer && i === q.correctIndex) {
                suffix = ' <span class="small text-muted ms-2">your answer</span>';
            }
            item.innerHTML = '<span class="opt-letter">' + letterFor(i) + "</span><span>" + escapeHtml(optText) + "</span>" + suffix;
            optionsEl.appendChild(item);
        });
        body.appendChild(optionsEl);

        if (q.explanation) {
            const exp = document.createElement("div");
            exp.className = "alert alert-success mt-3 mb-0";
            exp.innerHTML = '<i class="bi bi-lightbulb-fill me-1"></i>' + escapeHtml(q.explanation);
            body.appendChild(exp);
        }

        card.appendChild(body);
        col.appendChild(card);
        quizEls.review.appendChild(col);
    }

    function submitQuiz() {
        const total = quiz.questions.length;
        let correct = 0, wrong = 0, skipped = 0;
        quiz.questions.forEach((q, i) => {
            const a = quiz.answers[i];
            if (a === null || a === undefined) skipped += 1;
            else if (a === q.correctIndex) correct += 1;
            else wrong += 1;
        });

        const unanswered = skipped;
        if (unanswered > 0) {
            if (!confirm("You have " + unanswered + " unanswered question(s). Submit anyway?")) return;
        }

        const percent = total ? Math.round((correct / total) * 100) : 0;
        $("scorePercent").textContent = percent + "%";
        $("scoreLine").textContent = correct + " out of " + total + " correct";
        $("correctCount").textContent = correct;
        $("wrongCount").textContent = wrong;
        $("skipCount").textContent = skipped;

        const circle = $("scoreCircle");
        circle.classList.remove("good", "ok", "poor");
        const headline = $("scoreHeadline");
        if (percent >= 70) { circle.classList.add("good"); headline.textContent = "Excellent work!"; }
        else if (percent >= 40) { circle.classList.add("ok"); headline.textContent = "Good effort \u2014 keep practising!"; }
        else { circle.classList.add("poor"); headline.textContent = "Keep going, you'll improve!"; }

        quizEls.review.innerHTML = "";
        quiz.questions.forEach((q, i) => renderReviewQuestion(q, i, quiz.answers[i]));

        quizEls.active.classList.add("d-none");
        quizEls.result.classList.remove("d-none");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function resetQuiz() {
        quizEls.result.classList.add("d-none");
        quizEls.active.classList.add("d-none");
        quizEls.setup.classList.remove("d-none");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    quizEls.startBtn.addEventListener("click", startQuiz);
    quizEls.submitBtn.addEventListener("click", submitQuiz);
    quizEls.retakeBtn.addEventListener("click", resetQuiz);

    // ---------------------------------------------------------------------
    // LEARN MORE view
    // ---------------------------------------------------------------------
    const LEARN_ICONS = {
        "History": "bi-hourglass-split",
        "Polity": "bi-bank",
        "Geography": "bi-globe-americas",
        "Economics": "bi-graph-up-arrow",
        "Science": "bi-rocket-takeoff",
        "Maharashtra": "bi-geo-alt",
        "General Knowledge": "bi-lightbulb"
    };

    const EXTRA_LEARN = [
        { title: "MPSC Exam Strategy", desc: "Preparation tips, timetable and strategy.", query: "MPSC exam preparation strategy" },
        { title: "Current Affairs", desc: "Daily and monthly current affairs for MPSC.", query: "MPSC current affairs" },
        { title: "CSAT / Aptitude", desc: "Reasoning, maths and comprehension.", query: "MPSC CSAT aptitude reasoning" }
    ];

    function ytUrl(query) {
        return "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);
    }

    function learnCard(title, desc, query, icon) {
        const col = document.createElement("div");
        col.className = "col-12 col-sm-6 col-lg-4";
        const a = document.createElement("a");
        a.href = ytUrl(query);
        a.target = "_blank";
        a.rel = "noopener";
        a.className = "card learn-card shadow-sm";
        a.innerHTML =
            '<div class="card-body d-flex gap-3 align-items-start">' +
                '<span class="learn-icon"><i class="bi ' + (icon || "bi-play-btn") + '"></i></span>' +
                '<div>' +
                    '<h6 class="fw-bold mb-1">' + escapeHtml(title) + '</h6>' +
                    '<p class="text-muted small mb-2">' + escapeHtml(desc) + '</p>' +
                    '<span class="small text-danger fw-semibold"><i class="bi bi-youtube me-1"></i>Watch on YouTube <i class="bi bi-box-arrow-up-right ms-1"></i></span>' +
                '</div>' +
            '</div>';
        col.appendChild(a);
        return col;
    }

    function buildLearnGrid(categories) {
        const grid = $("learnGrid");
        if (!grid) return;
        grid.innerHTML = "";
        categories.forEach(cat => {
            grid.appendChild(learnCard(
                cat + " for MPSC",
                "Video lectures and concepts on " + cat + ".",
                "MPSC " + cat + " lecture in Marathi",
                LEARN_ICONS[cat]
            ));
        });
        EXTRA_LEARN.forEach(item => {
            grid.appendChild(learnCard(item.title, item.desc, item.query, "bi-mortarboard"));
        });
    }

    // ---------------------------------------------------------------------
    // AI MCQ GENERATOR view
    // ---------------------------------------------------------------------
    const aiEls = {
        topic: $("aiTopic"),
        level: $("aiLevel"),
        category: $("aiCategory"),
        count: $("aiCount"),
        save: $("aiSave"),
        generateBtn: $("aiGenerateBtn"),
        status: $("aiStatus"),
        list: $("aiQuestionList"),
        notConfigured: $("aiNotConfigured"),
        template: $("questionTemplate")
    };

    function renderAiQuestion(q, indexLabel) {
        const node = aiEls.template.content.cloneNode(true);
        const levelBadge = node.querySelector(".level-badge");
        levelBadge.textContent = q.level === "advanced" ? "Advanced" : "Basic";
        levelBadge.classList.add(q.level === "advanced" ? "advanced" : "basic");
        node.querySelector(".category-badge").textContent = q.category;
        node.querySelector(".q-index").textContent = "Q" + indexLabel;
        node.querySelector(".question-text").textContent = q.questionText;

        const optionsEl = node.querySelector(".options");
        const explanationEl = node.querySelector(".explanation");
        node.querySelector(".explanation-text").textContent = q.explanation || "";

        let answered = false;
        (q.options || []).forEach((optText, i) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "list-group-item list-group-item-action d-flex align-items-center";
            item.innerHTML = '<span class="opt-letter">' + letterFor(i) + "</span><span>" + escapeHtml(optText) + "</span>";
            item.addEventListener("click", () => {
                if (answered) return;
                answered = true;
                const all = optionsEl.querySelectorAll(".list-group-item");
                all.forEach(el => el.classList.add("disabled-opt"));
                if (all[q.correctIndex]) all[q.correctIndex].classList.add("correct");
                if (i !== q.correctIndex) item.classList.add("wrong");
                if (q.explanation) explanationEl.classList.remove("d-none");
            });
            optionsEl.appendChild(item);
        });
        aiEls.list.appendChild(node);
    }

    async function generateAiMcqs() {
        aiEls.generateBtn.disabled = true;
        aiEls.generateBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generating...';
        aiEls.status.classList.remove("d-none");
        aiEls.status.innerHTML = '<i class="bi bi-stars me-1"></i>Asking Grok to create your questions...';
        aiEls.list.innerHTML = "";

        try {
            const res = await fetch("/api/ai/generate-mcqs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    topic: aiEls.topic.value.trim(),
                    level: aiEls.level.value,
                    category: aiEls.category.value,
                    count: parseInt(aiEls.count.value, 10),
                    save: aiEls.save.checked
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Generation failed");

            (data.items || []).forEach((q, i) => renderAiQuestion(q, i + 1));
            aiEls.status.innerHTML = "Generated " + data.count + " question" + (data.count === 1 ? "" : "s") +
                (data.saved ? ' &middot; <span class="text-success">saved to your bank</span>' : "");
            if (data.saved) { loadStats(); }
        } catch (e) {
            console.error("ai generate", e);
            aiEls.status.innerHTML = '<span class="text-danger"><i class="bi bi-exclamation-circle me-1"></i>' +
                escapeHtml(e.message) + '</span>';
        } finally {
            aiEls.generateBtn.disabled = false;
            aiEls.generateBtn.innerHTML = '<i class="bi bi-magic me-1"></i>Generate MCQs';
        }
    }

    aiEls.generateBtn.addEventListener("click", generateAiMcqs);

    // ---------------------------------------------------------------------
    // AI SEARCH view
    // ---------------------------------------------------------------------
    const aiSearchEls = {
        input: $("aiSearchInput"),
        btn: $("aiSearchBtn"),
        status: $("aiSearchStatus"),
        card: $("aiAnswerCard"),
        answer: $("aiAnswer"),
        notConfigured: $("aiSearchNotConfigured"),
        suggestions: $("aiSuggestions")
    };

    const AI_SUGGESTIONS = [
        "Explain the Preamble of the Indian Constitution",
        "Important rivers of Maharashtra",
        "Causes of the Revolt of 1857",
        "What is fiscal deficit?"
    ];

    function formatAnswer(text) {
        return escapeHtml(text)
            .replace(/\n{2,}/g, "</p><p>")
            .replace(/\n/g, "<br>");
    }

    async function runAiSearch(queryOverride) {
        const query = (queryOverride != null ? queryOverride : aiSearchEls.input.value).trim();
        if (!query) return;
        aiSearchEls.input.value = query;
        aiSearchEls.btn.disabled = true;
        aiSearchEls.btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Asking...';
        aiSearchEls.status.classList.remove("d-none");
        aiSearchEls.status.innerHTML = '<i class="bi bi-robot me-1"></i>Grok is thinking...';
        aiSearchEls.card.classList.add("d-none");

        try {
            const res = await fetch("/api/ai/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: query })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Search failed");

            aiSearchEls.answer.innerHTML = "<p>" + formatAnswer(data.answer || "") + "</p>";
            aiSearchEls.card.classList.remove("d-none");
            aiSearchEls.status.classList.add("d-none");
        } catch (e) {
            console.error("ai search", e);
            aiSearchEls.status.innerHTML = '<span class="text-danger"><i class="bi bi-exclamation-circle me-1"></i>' +
                escapeHtml(e.message) + '</span>';
        } finally {
            aiSearchEls.btn.disabled = false;
            aiSearchEls.btn.innerHTML = '<i class="bi bi-send me-1"></i>Ask';
        }
    }

    aiSearchEls.btn.addEventListener("click", () => runAiSearch());
    aiSearchEls.input.addEventListener("keydown", (e) => { if (e.key === "Enter") runAiSearch(); });

    function buildAiSuggestions() {
        if (!aiSearchEls.suggestions) return;
        AI_SUGGESTIONS.forEach(text => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "btn btn-sm btn-outline-secondary";
            chip.textContent = text;
            chip.addEventListener("click", () => runAiSearch(text));
            aiSearchEls.suggestions.appendChild(chip);
        });
    }

    async function loadAiStatus() {
        try {
            const data = await (await fetch("/api/ai/status")).json();
            const configured = !!data.configured;
            [aiEls.notConfigured, aiSearchEls.notConfigured].forEach(el => {
                if (el) el.classList.toggle("d-none", configured);
            });
            aiEls.generateBtn.disabled = !configured;
            aiSearchEls.btn.disabled = !configured;
        } catch (e) { console.error("ai status", e); }
    }

    // ---------------------------------------------------------------------
    // Init
    // ---------------------------------------------------------------------
    loadStats();
    loadCategories();
    fetchPracticePage(false);
    buildAiSuggestions();
    loadAiStatus();
})();
