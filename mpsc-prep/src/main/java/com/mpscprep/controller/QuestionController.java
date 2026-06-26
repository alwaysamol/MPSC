package com.mpscprep.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.mpscprep.model.Question;
import com.mpscprep.repository.QuestionRepository;
import com.mpscprep.service.QuestionService;

@RestController
@RequestMapping("/api")
public class QuestionController {

    private final QuestionService questionService;
    private final QuestionRepository questionRepository;

    public QuestionController(QuestionService questionService, QuestionRepository questionRepository) {
        this.questionService = questionService;
        this.questionRepository = questionRepository;
    }

    @GetMapping("/questions")
    public Map<String, Object> questions(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        size = Math.min(Math.max(size, 1), 100);
        List<Question> items = questionService.search(search, level, category, page, size);
        long total = questionService.count(search, level, category);

        Map<String, Object> response = new HashMap<>();
        response.put("items", items);
        response.put("total", total);
        response.put("page", page);
        response.put("size", size);
        return response;
    }

    @GetMapping("/quiz")
    public List<Question> quiz(
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "10") int count) {
        return questionService.randomQuiz(level, category, count);
    }

    @GetMapping("/categories")
    public List<String> categories() {
        List<String> categories = questionService.distinctCategories();
        categories.sort(String::compareToIgnoreCase);
        return categories;
    }

    @GetMapping("/stats")
    public Map<String, Object> stats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("total", questionRepository.count());
        stats.put("basic", questionRepository.countByLevel("basic"));
        stats.put("advanced", questionRepository.countByLevel("advanced"));
        stats.put("categories", questionService.distinctCategories().size());
        return stats;
    }
}
