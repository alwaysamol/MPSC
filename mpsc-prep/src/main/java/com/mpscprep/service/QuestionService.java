package com.mpscprep.service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationOperation;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.mpscprep.model.Question;

@Service
public class QuestionService {

    private final MongoTemplate mongoTemplate;

    public QuestionService(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    /**
     * Search / filter questions. Any argument may be null/blank to skip it.
     *
     * @param search   free text matched (case-insensitive) against the question,
     *                 its options, category and explanation
     * @param level    "basic" or "advanced"
     * @param category category name
     */
    public List<Question> search(String search, String level, String category, int page, int size) {
        Query query = new Query();
        List<Criteria> criteria = new ArrayList<>();

        if (StringUtils.hasText(level)) {
            criteria.add(Criteria.where("level").is(level.toLowerCase()));
        }
        if (StringUtils.hasText(category)) {
            criteria.add(Criteria.where("category").is(category));
        }
        if (StringUtils.hasText(search)) {
            String safe = Pattern.quote(search.trim());
            Criteria text = new Criteria().orOperator(
                    Criteria.where("questionText").regex(safe, "i"),
                    Criteria.where("options").regex(safe, "i"),
                    Criteria.where("category").regex(safe, "i"),
                    Criteria.where("explanation").regex(safe, "i"));
            criteria.add(text);
        }

        if (!criteria.isEmpty()) {
            query.addCriteria(new Criteria().andOperator(criteria.toArray(new Criteria[0])));
        }

        query.with(Sort.by(Sort.Direction.ASC, "category", "level"));
        query.skip((long) Math.max(page, 0) * size).limit(size);

        return mongoTemplate.find(query, Question.class);
    }

    public long count(String search, String level, String category) {
        Query query = new Query();
        List<Criteria> criteria = new ArrayList<>();

        if (StringUtils.hasText(level)) {
            criteria.add(Criteria.where("level").is(level.toLowerCase()));
        }
        if (StringUtils.hasText(category)) {
            criteria.add(Criteria.where("category").is(category));
        }
        if (StringUtils.hasText(search)) {
            String safe = Pattern.quote(search.trim());
            Criteria text = new Criteria().orOperator(
                    Criteria.where("questionText").regex(safe, "i"),
                    Criteria.where("options").regex(safe, "i"),
                    Criteria.where("category").regex(safe, "i"),
                    Criteria.where("explanation").regex(safe, "i"));
            criteria.add(text);
        }

        if (!criteria.isEmpty()) {
            query.addCriteria(new Criteria().andOperator(criteria.toArray(new Criteria[0])));
        }
        return mongoTemplate.count(query, Question.class);
    }

    public List<String> distinctCategories() {
        return mongoTemplate.findDistinct(new Query(), "category", Question.class, String.class);
    }

    /**
     * Returns a random set of questions for a quiz, optionally restricted by
     * level and/or category. Uses MongoDB's $sample aggregation stage.
     */
    public List<Question> randomQuiz(String level, String category, int count) {
        count = Math.min(Math.max(count, 1), 50);

        List<AggregationOperation> ops = new ArrayList<>();
        List<Criteria> criteria = new ArrayList<>();
        if (StringUtils.hasText(level)) {
            criteria.add(Criteria.where("level").is(level.toLowerCase()));
        }
        if (StringUtils.hasText(category)) {
            criteria.add(Criteria.where("category").is(category));
        }
        if (!criteria.isEmpty()) {
            ops.add(Aggregation.match(new Criteria().andOperator(criteria.toArray(new Criteria[0]))));
        }
        ops.add(Aggregation.sample(count));

        Aggregation aggregation = Aggregation.newAggregation(ops);
        return mongoTemplate.aggregate(aggregation, "questions", Question.class).getMappedResults();
    }
}
