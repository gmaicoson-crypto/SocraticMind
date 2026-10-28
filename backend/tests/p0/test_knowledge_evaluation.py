from scripts.evaluate_knowledge_retrieval import score_cases


def test_evaluation_distinguishes_recall_evidence_precision_and_abstention():
    cases = [
        {
            "expected": ["a", "b"],
            "retrieved": ["a", "noise"],
            "latency_ms": 20,
            "query_input_tokens": 4,
        },
        {"expected": [], "retrieved": [], "latency_ms": 5, "query_input_tokens": None},
    ]
    result = score_cases(cases, 2)
    assert result["recall_at_k"] == 0.5
    assert result["labelled_evidence_precision_at_k"] == 0.5
    assert result["no_answer_abstention_rate"] == 1
    assert result["query_known_input_tokens"] == 4


def test_embedding_failure_does_not_disappear_from_unknown_usage_after_fallback():
    cases = [
        {
            "expected": ["a"],
            "retrieved": ["a"],
            "latency_ms": 10,
            "query_input_tokens": None,
            "query_attempted": True,
            "method": "lexical",
        },
        {
            "expected": [],
            "retrieved": [],
            "latency_ms": 1,
            "query_input_tokens": None,
            "query_attempted": False,
            "method": "lexical",
        },
    ]
    result = score_cases(cases, 5)
    assert result["unknown_query_usage_calls"] == 1
    assert result["query_known_input_tokens"] == 0
