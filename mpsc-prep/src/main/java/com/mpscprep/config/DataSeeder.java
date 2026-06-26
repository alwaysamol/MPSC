package com.mpscprep.config;

import java.io.InputStream;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mpscprep.model.Question;
import com.mpscprep.repository.QuestionRepository;

@Component
public class DataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private final QuestionRepository repository;
    private final ObjectMapper objectMapper;

    public DataSeeder(QuestionRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(String... args) throws Exception {
        long existing = repository.count();
        if (existing > 0) {
            log.info("Questions already present ({}). Skipping seed.", existing);
            return;
        }

        ClassPathResource resource = new ClassPathResource("data/questions.json");
        try (InputStream in = resource.getInputStream()) {
            List<Question> questions = objectMapper.readValue(in,
                    objectMapper.getTypeFactory().constructCollectionType(List.class, Question.class));
            repository.saveAll(questions);
            log.info("Seeded {} MPSC questions into MongoDB.", questions.size());
        }
    }
}
