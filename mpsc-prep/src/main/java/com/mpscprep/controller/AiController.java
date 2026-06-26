package com.mpscprep.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.mpscprep.model.Question;
import com.mpscprep.repository.QuestionRepository;
import com.mpscprep.service.GrokService;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final GrokService grokService;
    private final QuestionRepository questionRepository;

    public AiController(GrokService grokService, QuestionRepository questionRepository) {
        this.grokService = grokService;
        this.questionRepository = questionRepository;
    }

    /** Lets the front-end know whether AI features are usable. */
    @GetMapping("/status")
    public Map<String, Object> status() {
        return Map.of("configured", grokService.isConfigured());
    }

    /**
     * Generate fresh MCQs on demand. If {@code save} is true the questions are
     * also stored in MongoDB so they show up in Practice/Quiz afterwards.
     */
    @PostMapping("/generate-mcqs")
    public Map<String, Object> generateMcqs(@RequestBody GenerateRequest req) {
        List<Question> questions = grokService.generateMcqs(
                req.topic(), req.level(), req.category(), req.count() <= 0 ? 5 : req.count());

        boolean saved = false;
        if (req.save()) {
            questionRepository.saveAll(questions);
            saved = true;
        }

        Map<String, Object> response = new HashMap<>();
        response.put("items", questions);
        response.put("count", questions.size());
        response.put("saved", saved);
        return response;
    }

    /** AI tutor answer for a free-text query. */
    @PostMapping("/search")
    public Map<String, Object> search(@RequestBody SearchRequest req) {
        String answer = grokService.search(req.query());
        Map<String, Object> response = new HashMap<>();
        response.put("query", req.query());
        response.put("answer", answer);
        return response;
    }

    // ------------------------------------------------------------------
    // Error handling
    // ------------------------------------------------------------------

    @ExceptionHandler(GrokService.GrokException.class)
    public ResponseEntity<Map<String, Object>> handleGrok(GrokService.GrokException e) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(Map.of("error", e.getMessage()));
    }

    // ------------------------------------------------------------------
    // Request bodies
    // ------------------------------------------------------------------

    public record GenerateRequest(String topic, String level, String category, int count, boolean save) {
    }

    public record SearchRequest(String query) {
    }
}
