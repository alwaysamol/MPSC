# MPSC Prep — MCQ Practice App

A web application for **MPSC (Maharashtra Public Service Commission)** exam preparation.
It serves **basic** and **advanced** multiple-choice questions across subjects (History,
Polity, Geography, Economics, Science, Maharashtra, General Knowledge), with **search**
and **filters**. Click an option to instantly see the correct answer and an explanation.

## Tech stack

| Layer     | Technology                                              |
|-----------|---------------------------------------------------------|
| Backend   | Java 17, Spring Boot 3.3 (Spring Web)                   |
| Database  | MongoDB (via Spring Data MongoDB)                       |
| Frontend  | HTML, CSS, JavaScript, Bootstrap 5                       |
| Build     | Maven                                                   |

> **No MongoDB install needed for development.** The app uses an **embedded MongoDB**
> (Flapdoodle) that starts automatically. On the *first* run it downloads a small MongoDB
> binary (needs an internet connection); later runs are fast. See "Use your own MongoDB"
> below to switch to a real server.

## Project structure

```
mpsc-prep/
├── pom.xml
└── src/main/
    ├── java/com/mpscprep/
    │   ├── MpscPrepApplication.java      # entry point
    │   ├── model/Question.java           # MCQ document
    │   ├── repository/QuestionRepository.java
    │   ├── service/QuestionService.java  # search & filtering
    │   ├── controller/QuestionController.java  # REST API
    │   └── config/DataSeeder.java        # loads questions on first run
    └── resources/
        ├── application.properties
        ├── data/questions.json           # seed MCQs (edit/add your own)
        └── static/                       # Bootstrap frontend (index.html, css, js)
```

## How to run

### Option A — use the bundled scripts (Windows)

From the `mpsc-prep` folder:

```bat
build.cmd      :: compiles and packages the app
run.cmd        :: builds (if needed) and starts the server
```

### Option B — manual

If you have Maven installed:

```bash
mvn clean package
java -jar target/mpsc-prep.jar
```

If you do **not** have Maven, this project was built with the copy downloaded to
`../.tools/apache-maven-3.9.9`. You can use it directly:

```bat
..\.tools\apache-maven-3.9.9\bin\mvn.cmd clean package
java -jar target\mpsc-prep.jar
```

Then open **http://localhost:8080** in your browser.

## Features

The app has four sections (top navigation):

- **Practice** — search questions by any keyword (matches question text, options, subject,
  explanation), filter by level (Basic / Advanced) and subject, and click an option to
  instantly reveal the correct answer + explanation. Live stats and "Load more" pagination.
- **Take Quiz** — choose how many questions (5/10/15/20), optionally a level and subject,
  then attempt them. Click **Submit Quiz** to get your **score**: how many correct, how many
  wrong, and how many skipped — plus a full **review** showing the correct answer and an
  explanation for every question.
- **Learn More** — subject-wise cards linking to **YouTube** lectures so students can learn
  more through videos.
- **About** — what the app does, subjects covered, and how scoring works.

## REST API

| Method | Endpoint            | Query params                                  | Description                       |
|--------|---------------------|-----------------------------------------------|-----------------------------------|
| GET    | `/api/questions`    | `search`, `level`, `category`, `page`, `size` | Search / filter questions         |
| GET    | `/api/quiz`         | `count`, `level`, `category`                  | Random set of questions for a quiz|
| GET    | `/api/categories`   | —                                             | List all subjects                 |
| GET    | `/api/stats`        | —                                             | Counts (total/basic/advanced)     |

Examples:
- `GET /api/questions?search=Constitution&level=advanced&category=Polity`
- `GET /api/quiz?count=10&level=basic`

## Adding more questions

Edit `src/main/resources/data/questions.json` and add objects in this shape:

```json
{
  "questionText": "Your question?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctIndex": 0,
  "explanation": "Why the answer is correct.",
  "level": "basic",
  "category": "Polity"
}
```

`correctIndex` is 0-based (0 = first option). `level` is `"basic"` or `"advanced"`.

> The seeder only loads data when the collection is **empty**. To re-seed after editing,
> clear the `questions` collection (or, with the embedded DB, delete the local data folder
> created at startup) and restart.

## Use your own MongoDB

In `src/main/resources/application.properties`:

1. Comment out `de.flapdoodle.mongodb.embedded.version=...`
2. Uncomment and set `spring.data.mongodb.uri=mongodb://localhost:27017/mpsc`
3. (Optional) remove the `de.flapdoodle.embed.mongo.spring3x` dependency from `pom.xml`.
