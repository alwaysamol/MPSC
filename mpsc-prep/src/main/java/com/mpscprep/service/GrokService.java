package com.mpscprep.service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mpscprep.model.Question;

/**
 * Thin client around the Grok (xAI) chat-completions API. The xAI API is
 * OpenAI-compatible, so we POST to {base-url}/chat/completions.
 *
 * Powers two features:
 *   - {@link #generateMcqs} : unlimited, on-demand AI generated MCQs.
 *   - {@link #search}       : an AI tutor that answers free-text questions.
 */
@Service
public class GrokService {

    private static final Logger log = LoggerFactory.getLogger(GrokService.class);

    private final RestClient restClient;
    private final ObjectMapper mapper;
    private final String model;
    private final boolean configured;

    public GrokService(
            @Value("${grok.api-key:}") String apiKey,
            @Value("${grok.base-url:https://api.x.ai/v1}") String baseUrl,
            @Value("${grok.model:grok-3}") String model,
            @Value("${grok.timeout-seconds:60}") int timeoutSeconds,
            ObjectMapper mapper) {

        this.mapper = mapper;
        this.model = model;
        this.configured = StringUtils.hasText(apiKey);

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(timeoutSeconds).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(timeoutSeconds).toMillis());

        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .defaultHeader("Authorization", "Bearer " + apiKey)
                .defaultHeader("Content-Type", "application/json")
                .build();
    }

    public boolean isConfigured() {
        return configured;
    }

    // ------------------------------------------------------------------
    // Public features
    // ------------------------------------------------------------------

    /**
     * Generate a fresh batch of MCQs via Grok. Nothing is persisted here;
     * the caller decides whether to save them.
     */
    public List<Question> generateMcqs(String topic, String level, String category, int count) {
        ensureConfigured();
        count = Math.min(Math.max(count, 1), 20);

        String lvl = StringUtils.hasText(level) ? level.toLowerCase() : "basic";
        String subject = StringUtils.hasText(category) ? category : "General Knowledge";
        String about = StringUtils.hasText(topic) ? topic : subject;

        String system = "You are an expert question setter for the Maharashtra Public Service "
                + "Commission (MPSC) examinations. You create accurate, exam-relevant multiple "
                + "choice questions. Always respond with strictly valid JSON and nothing else.";

        String user = "Generate exactly " + count + " " + lvl + "-level multiple choice questions "
                + "about \"" + about + "\" for the subject \"" + subject + "\". "
                + "Each question must have exactly 4 distinct options and exactly one correct answer. "
                + "Keep questions factually correct and suitable for Indian competitive exams. "
                + "Respond ONLY with a JSON object of this exact shape:\n"
                + "{\"questions\":[{"
                + "\"questionText\":\"...\","
                + "\"options\":[\"..\",\"..\",\"..\",\"..\"],"
                + "\"correctIndex\":0,"
                + "\"explanation\":\"a short explanation of why the answer is correct\","
                + "\"level\":\"" + lvl + "\","
                + "\"category\":\"" + subject + "\"}]}";

        // Models occasionally emit malformed JSON; one retry makes this robust.
        GrokException last = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                String content = chat(system, user, true);
                return parseQuestions(content, lvl, subject);
            } catch (GrokException e) {
                last = e;
                log.warn("MCQ generation attempt {} failed: {}", attempt + 1, e.getMessage());
            }
        }
        throw last != null ? last : new GrokException("Could not generate questions. Please try again.");
    }

    /**
     * Answer a free-text question as an MPSC tutor. Returns the model's answer text.
     */
    public String search(String query) {
        ensureConfigured();
        if (!StringUtils.hasText(query)) {
            return "Please enter a question.";
        }
        String system = "You are a knowledgeable, concise tutor for MPSC and other Indian "
                + "competitive-exam aspirants. Answer accurately and to the point. Prefer facts "
                + "relevant to India and Maharashtra. Use short paragraphs or bullet points. "
                + "If you are unsure, say so rather than inventing facts.";
        return chat(system, query.trim(), false);
    }

    // ------------------------------------------------------------------
    // Low-level chat call
    // ------------------------------------------------------------------

    private String chat(String systemPrompt, String userPrompt, boolean jsonMode) {
        List<Map<String, String>> messages = List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt));

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("model", model);
        body.put("messages", messages);
        // Lower temperature for JSON generation => more reliable, well-formed output.
        // We intentionally do NOT send response_format=json_object: Groq's strict
        // server-side JSON validation returns a 400 whenever the model's JSON is
        // slightly off. We instead parse the JSON ourselves (see parseQuestions),
        // which is far more forgiving.
        body.put("temperature", jsonMode ? 0.3 : 0.4);

        try {
            String raw = restClient.post()
                    .uri("/chat/completions")
                    .body(body)
                    .retrieve()
                    .body(String.class);

            JsonNode root = mapper.readTree(raw);
            JsonNode choices = root.path("choices");
            if (choices.isArray() && choices.size() > 0) {
                return choices.get(0).path("message").path("content").asText("");
            }
            log.warn("Grok response had no choices: {}", raw);
            throw new GrokException("The AI service returned an empty response.");
        } catch (GrokException e) {
            throw e;
        } catch (Exception e) {
            log.error("Grok API call failed", e);
            throw new GrokException("AI request failed: " + e.getMessage());
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private List<Question> parseQuestions(String content, String defaultLevel, String defaultCategory) {
        try {
            JsonNode root = mapper.readTree(extractJson(content));
            JsonNode arr = root.has("questions") ? root.get("questions") : root;

            List<Question> result = new ArrayList<>();
            if (arr != null && arr.isArray()) {
                for (JsonNode n : arr) {
                    List<String> options = new ArrayList<>();
                    n.path("options").forEach(o -> options.add(o.asText()));
                    if (options.size() < 2) {
                        continue;
                    }
                    int correct = n.path("correctIndex").asInt(0);
                    if (correct < 0 || correct >= options.size()) {
                        correct = 0;
                    }
                    Question q = new Question(
                            n.path("questionText").asText(""),
                            options,
                            correct,
                            n.path("explanation").asText(""),
                            n.path("level").asText(defaultLevel),
                            n.path("category").asText(defaultCategory));
                    if (StringUtils.hasText(q.getQuestionText())) {
                        result.add(q);
                    }
                }
            }
            if (result.isEmpty()) {
                throw new GrokException("The AI did not return any valid questions. Please try again.");
            }
            return result;
        } catch (GrokException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to parse Grok MCQ JSON: {}", content, e);
            throw new GrokException("Could not understand the AI response. Please try again.");
        }
    }

    /**
     * Pull the JSON object out of the model's reply. Models sometimes wrap JSON
     * in markdown code fences or add a sentence before/after it, so we slice from
     * the first '{' to the last '}'.
     */
    private String extractJson(String content) {
        if (content == null) {
            return "{}";
        }
        String trimmed = content.trim();
        int firstBrace = trimmed.indexOf('{');
        int lastBrace = trimmed.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return trimmed.substring(firstBrace, lastBrace + 1);
        }
        return trimmed;
    }

    private void ensureConfigured() {
        if (!configured) {
            throw new GrokException("Grok API key is not configured. Set the GROK_API_KEY "
                    + "environment variable (or grok.api-key in application.properties) and restart.");
        }
    }

    /** Runtime exception surfaced to the controller with a user-friendly message. */
    public static class GrokException extends RuntimeException {
        public GrokException(String message) {
            super(message);
        }
    }
}
