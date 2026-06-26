package com.mpscprep.repository;

import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import com.mpscprep.model.Question;

public interface QuestionRepository extends MongoRepository<Question, String> {

    List<Question> findByLevel(String level, Pageable pageable);

    List<Question> findByCategory(String category, Pageable pageable);

    List<Question> findByLevelAndCategory(String level, String category, Pageable pageable);

    long countByLevel(String level);

    long countByCategory(String category);
}
