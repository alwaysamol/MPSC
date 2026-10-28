import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, getToken, clearToken } from "./api.js";
import Login from "./Login.jsx";

const PAGE_SIZE = 10;
const LEARN_ICONS = {
  History: "bi-hourglass-split",
  Polity: "bi-bank",
  Geography: "bi-globe-americas",
  Economics: "bi-graph-up-arrow",
  Science: "bi-rocket-takeoff",
  Maharashtra: "bi-geo-alt",
  "General Knowledge": "bi-lightbulb",
};
const EXTRA_LEARN = [
  { title: "MPSC Exam Strategy", desc: "Preparation tips, timetable and strategy.", query: "MPSC exam preparation strategy" },
  { title: "Current Affairs", desc: "Daily and monthly current affairs for MPSC.", query: "MPSC current affairs" },
  { title: "CSAT / Aptitude", desc: "Reasoning, maths and comprehension.", query: "MPSC CSAT aptitude reasoning" },
];
const AI_SUGGESTIONS = [
  "Explain the Preamble of the Indian Constitution",
  "Important rivers of Maharashtra",
  "Causes of the Revolt of 1857",
  "What is fiscal deficit?",
];

function letterFor(i) {
  return String.fromCharCode(65 + i);
}

function highlight(text, search) {
  const safe = String(text == null ? "" : text);
  if (!search) return safe;
  const term = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!term) return safe;
  const re = new RegExp(`(${term})`, "gi");
  const parts = safe.split(re);
  return parts.map((part, i) =>
    i % 2 === 1 ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>
  );
}

function PracticeCard({ q, indexLabel, search }) {
  const [picked, setPicked] = useState(null);
  const answered = picked !== null;
  return (
    <div className="col-12">
      <div className="card question-card shadow-sm">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start mb-2">
            <div className="d-flex gap-2 flex-wrap">
              <span className={`badge level-badge ${q.level === "advanced" ? "advanced" : "basic"}`}>
                {q.level === "advanced" ? "Advanced" : "Basic"}
              </span>
              <span className="badge text-bg-light border">{q.category}</span>
            </div>
            <span className="text-muted small">Q{indexLabel}</span>
          </div>
          <p className="question-text fw-semibold mb-3">{highlight(q.questionText, search)}</p>
          <div className="options list-group">
            {(q.options || []).map((opt, i) => {
              let cls = "list-group-item list-group-item-action d-flex align-items-center";
              if (answered) {
                cls += " disabled-opt";
                if (i === q.correctIndex) cls += " correct";
                if (i === picked && i !== q.correctIndex) cls += " wrong";
              }
              return (
                <button key={i} type="button" className={cls} onClick={() => !answered && setPicked(i)}>
                  <span className="opt-letter">{letterFor(i)}</span>
                  <span>{highlight(opt, search)}</span>
                </button>
              );
            })}
          </div>
          {answered && q.explanation && (
            <div className="explanation alert alert-success mt-3 mb-0">
              <i className="bi bi-lightbulb-fill me-1" />
              {highlight(q.explanation, search)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MainApp({ user, onLogout }) {
  const [view, setView] = useState("practice");
  const [stats, setStats] = useState({ total: 0, basic: 0, advanced: 0, categories: 0 });
  const [categories, setCategories] = useState([]);
  const [aiOk, setAiOk] = useState(false);

  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [resultCount, setResultCount] = useState("Loading questions...");
  const [searchBoxKey, setSearchBoxKey] = useState(0);

  const [quizCount, setQuizCount] = useState("10");
  const [quizLevel, setQuizLevel] = useState("");
  const [quizCategory, setQuizCategory] = useState("");
  const [quizPhase, setQuizPhase] = useState("setup");
  const [quizQs, setQuizQs] = useState([]);
  const [quizAnswers, setQuizAnswers] = useState([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [score, setScore] = useState(null);

  const [aiTopic, setAiTopic] = useState("");
  const [aiLevel, setAiLevel] = useState("basic");
  const [aiCategory, setAiCategory] = useState("");
  const [aiCount, setAiCount] = useState("5");
  const [aiSave, setAiSave] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [aiItems, setAiItems] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);

  const [ask, setAsk] = useState("");
  const [askStatus, setAskStatus] = useState("");
  const [askAnswer, setAskAnswer] = useState("");
  const [askBusy, setAskBusy] = useState(false);

  const loadMeta = useCallback(async () => {
    try {
      const s = await apiGet("/api/stats");
      setStats(s);
    } catch (e) {
      console.error(e);
    }
    try {
      setCategories(await apiGet("/api/categories"));
    } catch (e) {
      console.error(e);
    }
    try {
      const st = await apiGet("/api/ai/status");
      setAiOk(!!st.configured);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadPractice = useCallback(
    async (nextPage, append) => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (level) p.set("level", level);
      if (category) p.set("category", category);
      p.set("page", String(nextPage));
      p.set("size", String(PAGE_SIZE));
      try {
        const data = await apiGet("/api/questions?" + p.toString());
        const batch = data.items || [];
        setTotal(data.total);
        setItems((prev) => (append ? [...prev, ...batch] : batch));
        const n = append ? loaded + batch.length : batch.length;
        setLoaded(n);
        setResultCount(
          data.total === 0
            ? "No questions found"
            : `Showing ${n} of ${data.total} question${data.total === 1 ? "" : "s"}`
        );
      } catch {
        setResultCount("Error loading questions");
      }
    },
    [search, level, category, loaded]
  );

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    setPage(0);
    setLoaded(0);
    loadPractice(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, level, category]);

  const debounceSearch = useMemo(() => {
    let h;
    return (value) => {
      clearTimeout(h);
      h = setTimeout(() => setSearch(value.trim()), 300);
    };
  }, []);

  const activeFilters = [
    level === "advanced" ? "Advanced" : level === "basic" ? "Basic" : "",
    category,
    search ? `"${search}"` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  function show(v) {
    setView(v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function startQuiz() {
    setQuizLoading(true);
    try {
      const p = new URLSearchParams({ count: quizCount });
      if (quizLevel) p.set("level", quizLevel);
      if (quizCategory) p.set("category", quizCategory);
      const questions = await apiGet("/api/quiz?" + p.toString());
      if (!questions.length) {
        alert("No questions found for that combination. Try different options.");
        return;
      }
      setQuizQs(questions);
      setQuizAnswers(Array(questions.length).fill(null));
      setQuizPhase("active");
      setScore(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      alert("Could not load the quiz. Please try again.");
    } finally {
      setQuizLoading(false);
    }
  }

  function submitQuiz() {
    const unanswered = quizAnswers.filter((a) => a === null).length;
    if (unanswered > 0 && !confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
    let correct = 0,
      wrong = 0,
      skipped = 0;
    quizQs.forEach((q, i) => {
      const a = quizAnswers[i];
      if (a === null) skipped += 1;
      else if (a === q.correctIndex) correct += 1;
      else wrong += 1;
    });
    const percent = quizQs.length ? Math.round((correct / quizQs.length) * 100) : 0;
    setScore({ correct, wrong, skipped, percent, total: quizQs.length });
    setQuizPhase("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function generateAi() {
    setAiBusy(true);
    setAiStatus("Asking Gemini to create your questions...");
    setAiItems([]);
    try {
      const data = await apiPost("/api/ai/generate-mcqs", {
        topic: aiTopic.trim(),
        level: aiLevel,
        category: aiCategory,
        count: parseInt(aiCount, 10),
        save: aiSave,
      });
      setAiItems(data.items || []);
      setAiStatus(
        `Generated ${data.count} question${data.count === 1 ? "" : "s"}` +
          (data.saved ? " · saved to your bank" : "")
      );
      if (data.saved) loadMeta();
    } catch (e) {
      setAiStatus(e.message);
    } finally {
      setAiBusy(false);
    }
  }

  async function runAsk(q) {
    const query = (q != null ? q : ask).trim();
    if (!query) return;
    setAsk(query);
    setAskBusy(true);
    setAskStatus("Gemini is thinking...");
    setAskAnswer("");
    try {
      const data = await apiPost("/api/ai/search", { query });
      setAskAnswer(data.answer || "");
      setAskStatus("");
    } catch (e) {
      setAskStatus(e.message);
    } finally {
      setAskBusy(false);
    }
  }

  const answeredQuiz = quizAnswers.filter((a) => a !== null).length;

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-dark app-navbar sticky-top">
        <div className="container">
          <a className="navbar-brand fw-bold" href="#practice" onClick={(e) => { e.preventDefault(); show("practice"); }}>
            <i className="bi bi-mortarboard-fill me-2" />MPSC Prep
          </a>
          <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navItems">
            <span className="navbar-toggler-icon" />
          </button>
          <div className="collapse navbar-collapse" id="navItems">
            <ul className="navbar-nav ms-auto">
              {[
                ["practice", "bi-journal-text", "Practice"],
                ["quiz", "bi-patch-question", "Take Quiz"],
                ["ai", "bi-stars", "AI MCQs"],
                ["aisearch", "bi-robot", "AI Search"],
                ["learn", "bi-youtube", "Learn More"],
                ["about", "bi-info-circle", "About"],
              ].map(([id, icon, label]) => (
                <li className="nav-item" key={id}>
                  <a
                    className={`nav-link ${view === id ? "active" : ""}`}
                    href={"#" + id}
                    onClick={(e) => {
                      e.preventDefault();
                      show(id);
                    }}
                  >
                    <i className={`bi ${icon} me-1`} />
                    {label}
                  </a>
                </li>
              ))}
              <li className="nav-item d-flex align-items-center">
                <span className="navbar-text small me-2 ms-lg-3">
                  <i className="bi bi-person-circle me-1" />{user.username}
                </span>
                <button type="button" className="btn btn-sm btn-outline-light" onClick={onLogout}>
                  <i className="bi bi-box-arrow-right me-1" />Logout
                </button>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      <header className="hero py-5">
        <div className="container text-center text-white">
          <h1 className="display-5 fw-bold mb-2">Crack the MPSC Exam</h1>
          <p className="lead mb-0">Practice MCQs, take quizzes, and learn from curated videos.</p>
        </div>
      </header>

      <main className="container py-4">
        {view === "practice" && (
          <section>
            <div className="card shadow-sm controls-card mb-4">
              <div className="card-body">
                <div className="row g-3 align-items-end">
                  <div className="col-12 col-lg-5">
                    <label className="form-label small fw-semibold text-muted">Search questions</label>
                    <div className="input-group">
                      <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
                      <input
                        key={searchBoxKey}
                        className="form-control"
                        defaultValue={search}
                        placeholder="Search by keyword, e.g. Constitution, Godavari, RBI..."
                        onChange={(e) => debounceSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-6 col-lg-3">
                    <label className="form-label small fw-semibold text-muted">Level</label>
                    <select className="form-select" value={level} onChange={(e) => setLevel(e.target.value)}>
                      <option value="">All levels</option>
                      <option value="basic">Basic</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                  <div className="col-6 col-lg-3">
                    <label className="form-label small fw-semibold text-muted">Subject</label>
                    <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="">All subjects</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-lg-1 d-grid">
                    <button
                      className="btn btn-primary"
                      type="button"
                      title="Reset filters"
                      onClick={() => {
                        setSearch("");
                        setLevel("");
                        setCategory("");
                        setSearchBoxKey((k) => k + 1);
                      }}
                    >
                      <i className="bi bi-arrow-counterclockwise" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0 text-muted">{resultCount}</h5>
              {activeFilters && <span className="badge text-bg-light border">{activeFilters}</span>}
            </div>
            <div className="row g-3">
              {items.map((q, i) => (
                <PracticeCard key={q.id || i} q={q} indexLabel={i + 1} search={search} />
              ))}
            </div>
            {total === 0 && (
              <div className="text-center text-muted py-5">
                <i className="bi bi-inboxes display-4 d-block mb-3" />
                <p className="mb-0">No questions match your search. Try different keywords or filters.</p>
              </div>
            )}
            {loaded < total && (
              <div className="text-center mt-4">
                <button
                  className="btn btn-outline-primary px-4"
                  onClick={() => {
                    const next = page + 1;
                    setPage(next);
                    loadPractice(next, true);
                  }}
                >
                  <i className="bi bi-plus-circle me-1" />Load more
                </button>
              </div>
            )}
          </section>
        )}

        {view === "quiz" && (
          <section>
            {quizPhase === "setup" && (
              <div className="card shadow-sm controls-card mb-4">
                <div className="card-body">
                  <h4 className="fw-bold mb-1"><i className="bi bi-patch-question me-2 text-primary" />Start a Quiz</h4>
                  <p className="text-muted">Answer the questions, then submit to see your score and the correct answers.</p>
                  <div className="row g-3 align-items-end">
                    <div className="col-6 col-md-4">
                      <label className="form-label small fw-semibold text-muted">Number of questions</label>
                      <select className="form-select" value={quizCount} onChange={(e) => setQuizCount(e.target.value)}>
                        <option value="5">5 questions</option>
                        <option value="10">10 questions</option>
                        <option value="15">15 questions</option>
                        <option value="20">20 questions</option>
                      </select>
                    </div>
                    <div className="col-6 col-md-4">
                      <label className="form-label small fw-semibold text-muted">Level</label>
                      <select className="form-select" value={quizLevel} onChange={(e) => setQuizLevel(e.target.value)}>
                        <option value="">All levels</option>
                        <option value="basic">Basic</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </div>
                    <div className="col-12 col-md-4">
                      <label className="form-label small fw-semibold text-muted">Subject</label>
                      <select className="form-select" value={quizCategory} onChange={(e) => setQuizCategory(e.target.value)}>
                        <option value="">All subjects</option>
                        {categories.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12">
                      <button className="btn btn-primary px-4" disabled={quizLoading} onClick={startQuiz}>
                        {quizLoading ? "Loading..." : <><i className="bi bi-play-fill me-1" />Start Quiz</>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {quizPhase === "active" && (
              <>
                <div className="d-flex justify-content-between align-items-center mb-3 sticky-progress">
                  <h5 className="mb-0">Answered {answeredQuiz} of {quizQs.length}</h5>
                  <span className="badge text-bg-primary fs-6">{answeredQuiz} / {quizQs.length}</span>
                </div>
                <div className="progress mb-4" style={{ height: 8 }}>
                  <div className="progress-bar" style={{ width: `${quizQs.length ? (answeredQuiz / quizQs.length) * 100 : 0}%` }} />
                </div>
                <div className="row g-3">
                  {quizQs.map((q, idx) => (
                    <div className="col-12" key={q.id || idx}>
                      <div className="card question-card shadow-sm">
                        <div className="card-body">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <div className="d-flex gap-2 flex-wrap">
                              <span className={`badge level-badge ${q.level === "advanced" ? "advanced" : "basic"}`}>
                                {q.level === "advanced" ? "Advanced" : "Basic"}
                              </span>
                              <span className="badge text-bg-light border">{q.category}</span>
                            </div>
                            <span className="text-muted small">Q{idx + 1}</span>
                          </div>
                          <p className="question-text fw-semibold mb-3">{q.questionText}</p>
                          <div className="options list-group">
                            {(q.options || []).map((opt, i) => (
                              <button
                                key={i}
                                type="button"
                                className={`list-group-item list-group-item-action d-flex align-items-center ${quizAnswers[idx] === i ? "selected" : ""}`}
                                onClick={() => {
                                  const next = [...quizAnswers];
                                  next[idx] = i;
                                  setQuizAnswers(next);
                                }}
                              >
                                <span className="opt-letter">{letterFor(i)}</span>
                                <span>{opt}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-center mt-4">
                  <button className="btn btn-success btn-lg px-5" onClick={submitQuiz}>
                    <i className="bi bi-check2-circle me-1" />Submit Quiz
                  </button>
                </div>
              </>
            )}

            {quizPhase === "result" && score && (
              <>
                <div className="card shadow-sm result-card mb-4 text-center">
                  <div className="card-body py-4">
                    <div className={`score-circle mx-auto mb-3 ${score.percent >= 70 ? "good" : score.percent >= 40 ? "ok" : "poor"}`}>
                      <span>{score.percent}%</span>
                    </div>
                    <h3 className="fw-bold mb-1">
                      {score.percent >= 70 ? "Excellent work!" : score.percent >= 40 ? "Good effort — keep practising!" : "Keep going, you'll improve!"}
                    </h3>
                    <p className="lead mb-3">{score.correct} out of {score.total} correct</p>
                    <div className="row g-3 justify-content-center mb-3">
                      <div className="col-4 col-md-3"><div className="mini-stat correct-stat"><div className="fs-4 fw-bold">{score.correct}</div><div className="small">Correct</div></div></div>
                      <div className="col-4 col-md-3"><div className="mini-stat wrong-stat"><div className="fs-4 fw-bold">{score.wrong}</div><div className="small">Wrong</div></div></div>
                      <div className="col-4 col-md-3"><div className="mini-stat skip-stat"><div className="fs-4 fw-bold">{score.skipped}</div><div className="small">Skipped</div></div></div>
                    </div>
                    <button className="btn btn-primary px-4" onClick={() => setQuizPhase("setup")}>
                      <i className="bi bi-arrow-repeat me-1" />Take Another Quiz
                    </button>
                  </div>
                </div>
                <h5 className="text-muted mb-3"><i className="bi bi-list-check me-1" />Review your answers</h5>
                <div className="row g-3">
                  {quizQs.map((q, idx) => {
                    const userAnswer = quizAnswers[idx];
                    const skipped = userAnswer === null;
                    const type = skipped ? "skipped" : userAnswer === q.correctIndex ? "correct" : "wrong";
                    return (
                      <div className="col-12" key={q.id || idx}>
                        <div className="card question-card shadow-sm">
                          <div className="card-body">
                            <div className="d-flex justify-content-between align-items-start mb-2">
                              <div className="d-flex gap-2 flex-wrap">
                                <span className={`badge review-tag ${type === "correct" ? "text-bg-success" : type === "wrong" ? "text-bg-danger" : "text-bg-secondary"}`}>
                                  {type === "correct" ? "Correct" : type === "wrong" ? "Wrong" : "Skipped"}
                                </span>
                                <span className="badge text-bg-light border">{q.category}</span>
                              </div>
                              <span className="text-muted small">Q{idx + 1}</span>
                            </div>
                            <p className="question-text fw-semibold mb-3">{q.questionText}</p>
                            <div className="options list-group">
                              {(q.options || []).map((opt, i) => {
                                let cls = "list-group-item d-flex align-items-center disabled-opt";
                                if (i === q.correctIndex) cls += " reveal-correct";
                                if (!skipped && i === userAnswer && i !== q.correctIndex) cls += " user-wrong";
                                return (
                                  <div key={i} className={cls}>
                                    <span className="opt-letter">{letterFor(i)}</span>
                                    <span>{opt}</span>
                                    {i === q.correctIndex && <i className="bi bi-check-circle-fill text-success ms-2" />}
                                    {!skipped && i === userAnswer && (
                                      <span className="small text-muted ms-2">your answer</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {q.explanation && (
                              <div className="alert alert-success mt-3 mb-0">
                                <i className="bi bi-lightbulb-fill me-1" />{q.explanation}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}

        {view === "ai" && (
          <section>
            <div className="card shadow-sm controls-card mb-4">
              <div className="card-body">
                <h4 className="fw-bold mb-1"><i className="bi bi-stars me-2 text-primary" />AI MCQ Generator</h4>
                <p className="text-muted">Generate unlimited fresh MCQs on any topic using Gemini AI. Optionally save them to your question bank.</p>
                {!aiOk && (
                  <div className="alert alert-warning">
                    <i className="bi bi-exclamation-triangle me-1" />
                    AI features are not configured. Set <code>GEMINI_API_KEY</code> in the .env file and restart the server.
                  </div>
                )}
                <div className="row g-3 align-items-end">
                  <div className="col-12 col-lg-5">
                    <label className="form-label small fw-semibold text-muted">Topic (optional)</label>
                    <input className="form-control" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="e.g. Indian Constitution" />
                  </div>
                  <div className="col-6 col-lg-2">
                    <label className="form-label small fw-semibold text-muted">Level</label>
                    <select className="form-select" value={aiLevel} onChange={(e) => setAiLevel(e.target.value)}>
                      <option value="basic">Basic</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                  <div className="col-6 col-lg-3">
                    <label className="form-label small fw-semibold text-muted">Subject</label>
                    <select className="form-select" value={aiCategory} onChange={(e) => setAiCategory(e.target.value)}>
                      <option value="">General Knowledge</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-6 col-lg-2">
                    <label className="form-label small fw-semibold text-muted">How many</label>
                    <select className="form-select" value={aiCount} onChange={(e) => setAiCount(e.target.value)}>
                      <option value="3">3</option>
                      <option value="5">5</option>
                      <option value="10">10</option>
                      <option value="15">15</option>
                    </select>
                  </div>
                  <div className="col-12 d-flex flex-wrap gap-3 align-items-center">
                    <button className="btn btn-primary px-4" disabled={!aiOk || aiBusy} onClick={generateAi}>
                      {aiBusy ? "Generating..." : <><i className="bi bi-magic me-1" />Generate MCQs</>}
                    </button>
                    <div className="form-check">
                      <input className="form-check-input" type="checkbox" checked={aiSave} onChange={(e) => setAiSave(e.target.checked)} id="aiSave" />
                      <label className="form-check-label small text-muted" htmlFor="aiSave">Save to question bank</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {aiStatus && <div className="text-center text-muted py-3">{aiStatus}</div>}
            <div className="row g-3">
              {aiItems.map((q, i) => (
                <PracticeCard key={i} q={q} indexLabel={i + 1} search="" />
              ))}
            </div>
          </section>
        )}

        {view === "aisearch" && (
          <section>
            <div className="card shadow-sm controls-card mb-4">
              <div className="card-body">
                <h4 className="fw-bold mb-1"><i className="bi bi-robot me-2 text-primary" />AI Search</h4>
                <p className="text-muted">Ask anything about MPSC topics. Powered by Gemini AI.</p>
                {!aiOk && (
                  <div className="alert alert-warning">
                    Set <code>GEMINI_API_KEY</code> in .env and restart the server.
                  </div>
                )}
                <div className="input-group input-group-lg">
                  <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
                  <input
                    className="form-control"
                    value={ask}
                    onChange={(e) => setAsk(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runAsk()}
                    placeholder="e.g. Explain the Directive Principles of State Policy"
                  />
                  <button className="btn btn-primary px-4" disabled={!aiOk || askBusy} onClick={() => runAsk()}>
                    {askBusy ? "Asking..." : <><i className="bi bi-send me-1" />Ask</>}
                  </button>
                </div>
                <div className="mt-2 d-flex flex-wrap gap-2">
                  {AI_SUGGESTIONS.map((t) => (
                    <button key={t} type="button" className="btn btn-sm btn-outline-secondary" onClick={() => runAsk(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {askStatus && <div className="text-center text-muted py-3">{askStatus}</div>}
            {askAnswer && (
              <div className="card shadow-sm">
                <div className="card-body">
                  <h6 className="fw-bold text-primary mb-2"><i className="bi bi-robot me-1" />Gemini says</h6>
                  <div className="ai-answer">
                    {askAnswer.split(/\n{2,}/).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {view === "learn" && (
          <section>
            <h2 className="fw-bold mb-1"><i className="bi bi-youtube text-danger me-2" />Learn More</h2>
            <p className="text-muted mb-4">Curated YouTube resources by subject.</p>
            <div className="row g-3">
              {categories.map((cat) => (
                <div className="col-12 col-sm-6 col-lg-4" key={cat}>
                  <a
                    className="card learn-card shadow-sm"
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent("MPSC " + cat + " lecture in Marathi")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="card-body d-flex gap-3 align-items-start">
                      <span className="learn-icon"><i className={`bi ${LEARN_ICONS[cat] || "bi-play-btn"}`} /></span>
                      <div>
                        <h6 className="fw-bold mb-1">{cat} for MPSC</h6>
                        <p className="text-muted small mb-2">Video lectures and concepts on {cat}.</p>
                        <span className="small text-danger fw-semibold"><i className="bi bi-youtube me-1" />Watch on YouTube</span>
                      </div>
                    </div>
                  </a>
                </div>
              ))}
              {EXTRA_LEARN.map((item) => (
                <div className="col-12 col-sm-6 col-lg-4" key={item.title}>
                  <a
                    className="card learn-card shadow-sm"
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(item.query)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="card-body d-flex gap-3 align-items-start">
                      <span className="learn-icon"><i className="bi bi-mortarboard" /></span>
                      <div>
                        <h6 className="fw-bold mb-1">{item.title}</h6>
                        <p className="text-muted small mb-2">{item.desc}</p>
                        <span className="small text-danger fw-semibold"><i className="bi bi-youtube me-1" />Watch on YouTube</span>
                      </div>
                    </div>
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        {view === "about" && (
          <section>
            <div className="card shadow-sm controls-card about-card">
              <div className="card-body p-4 p-md-5">
                <h2 className="fw-bold mb-3"><i className="bi bi-mortarboard-fill text-primary me-2" />About MPSC Prep</h2>
                <p>
                  MPSC Prep is a free practice application for aspirants of the <strong>Maharashtra Public
                  Service Commission (MPSC)</strong> examinations. It helps you revise key concepts through
                  multiple-choice questions, test yourself with quizzes, and explore curated learning videos.
                </p>
                <h5 className="fw-semibold mt-4">What you can do</h5>
                <ul className="feature-list">
                  <li><i className="bi bi-search text-primary me-2" /><strong>Practice:</strong> browse and search questions, filter by level and subject, and reveal answers with explanations.</li>
                  <li><i className="bi bi-patch-question text-primary me-2" /><strong>Take Quizzes:</strong> attempt a set of questions, submit, and get instant marks with correct answers.</li>
                  <li><i className="bi bi-youtube text-primary me-2" /><strong>Learn More:</strong> jump to YouTube lectures for every subject.</li>
                </ul>
                <h5 className="fw-semibold mt-4">Subjects covered</h5>
                <div className="d-flex flex-wrap gap-2 mb-3">
                  {categories.map((c) => (
                    <span className="subject-pill" key={c}>{c}</span>
                  ))}
                </div>
                <h5 className="fw-semibold mt-4">How scoring works</h5>
                <p className="mb-2">Each correct answer earns 1 mark. After you submit a quiz you will see correct, wrong, and skipped counts plus explanations.</p>
                <h5 className="fw-semibold mt-4">Built with</h5>
                <p className="mb-0">React, Node.js (Express), MySQL, and Gemini AI. This is a study aid; always cross-check facts with official MPSC sources.</p>
                <p className="text-muted small mt-3 mb-0">Bank size: {stats.total} questions ({stats.basic} basic, {stats.advanced} advanced).</p>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="text-center text-muted py-4 small border-top">
        MPSC Prep · Built with React, Node.js, MySQL & Gemini · For study practice
      </footer>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    apiGet("/api/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener("auth:logout", handler);
    return () => window.removeEventListener("auth:logout", handler);
  }, []);

  if (checking) {
    return <div className="text-center text-muted py-5">Loading...</div>;
  }
  if (!user) {
    return <Login onAuthed={setUser} />;
  }
  return (
    <MainApp
      user={user}
      onLogout={() => {
        clearToken();
        setUser(null);
      }}
    />
  );
}